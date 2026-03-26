import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.use(cors());
app.use(express.json());

// --- KONFIGURACJA BAZY DANYCH ---
const poolConfig = {
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "spotted",
  password: process.env.DB_PASSWORD || "postgres",
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
  // Timeout połączenia - ważne na VPS
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
};

// SSL: włącz jeśli DB_SSL=true w .env (np. dla zewnętrznych baz danych)
if (process.env.DB_SSL === "true") {
  poolConfig.ssl = {
    rejectUnauthorized: false,
  };
}

console.log("[DB] Łączę z bazą danych:", {
  host: poolConfig.host,
  port: poolConfig.port,
  database: poolConfig.database,
  user: poolConfig.user,
  ssl: poolConfig.ssl ? "TAK" : "NIE",
});

const pool = new Pool(poolConfig);

// Sprawdź połączenie przy starcie
pool.connect((err, client, release) => {
  if (err) {
    console.error("[DB] BŁĄD połączenia z bazą danych!");
    console.error("[DB] Szczegóły:", err.message);
    console.error("[DB] Wskazówki:");
    console.error("  1. Sprawdź czy PostgreSQL działa: sudo systemctl status postgresql");
    console.error("  2. Sprawdź dane w pliku .env (DB_USER, DB_PASSWORD, DB_HOST, DB_NAME)");
    console.error("  3. Sprawdź czy użytkownik ma uprawnienia: sudo -u postgres psql -c \"\\du\"");
    console.error("  4. Sprawdź pg_hba.conf: sudo cat /etc/postgresql/*/main/pg_hba.conf");
    process.exit(1); // Zatrzymaj serwer przy błędzie bazy
  } else {
    release();
    console.log("[DB] Połączenie z bazą danych: OK");
  }
});

// --- SOCKET.IO ---

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// --- DATABASE INIT (simple schema for MVP) ---

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      nickname TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      text TEXT NOT NULL,
      image_url TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      value BOOLEAN NOT NULL,
      UNIQUE(post_id, user_id)
    );
  `);

  console.log("[DB] Tabele zainicjalizowane");
};

// --- HEALTH CHECK ---
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", database: "disconnected", error: err.message });
  }
});

// --- ENDPOINTS ---

// Create user (simple MVP)
app.post("/users", async (req, res) => {
  const { nickname } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO users (nickname) VALUES ($1) RETURNING *",
      [nickname]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// Add post
app.post("/posts", async (req, res) => {
  const { user_id, text, image_url, lat, lng } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO posts (user_id, text, image_url, lat, lng)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, text, image_url, lat, lng]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create post" });
  }
});

// Get local feed (simple radius filter ~0.1 deg for MVP)
app.get("/posts", async (req, res) => {
  const { lat, lng } = req.query;

  try {
    const result = await pool.query(
      `SELECT p.*,
        COALESCE(SUM(CASE WHEN v.value = true THEN 1 ELSE 0 END), 0) AS true_votes,
        COALESCE(SUM(CASE WHEN v.value = false THEN 1 ELSE 0 END), 0) AS false_votes
       FROM posts p
       LEFT JOIN votes v ON p.id = v.post_id
       WHERE ABS(p.lat - $1) < 0.1 AND ABS(p.lng - $2) < 0.1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [lat, lng]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// Vote
app.post("/vote", async (req, res) => {
  const { post_id, user_id, value } = req.body;

  try {
    await pool.query(
      `INSERT INTO votes (post_id, user_id, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (post_id, user_id)
       DO UPDATE SET value = $3`,
      [post_id, user_id, value]
    );

    const result = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN value = true THEN 1 ELSE 0 END), 0) AS true_votes,
        COALESCE(SUM(CASE WHEN value = false THEN 1 ELSE 0 END), 0) AS false_votes
       FROM votes
       WHERE post_id = $1`,
      [post_id]
    );

    io.emit("vote_update", {
      post_id,
      true_votes: result.rows[0].true_votes,
      false_votes: result.rows[0].false_votes,
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to vote" });
  }
});

// --- START SERVER ---

const PORT = process.env.PORT || 4000;

server.listen(PORT, async () => {
  try {
    await initDb();
    console.log(`[SERVER] Serwer uruchomiony na porcie ${PORT}`);
  } catch (err) {
    console.error("[SERVER] Błąd inicjalizacji bazy danych:", err.message);
    process.exit(1);
  }
});
