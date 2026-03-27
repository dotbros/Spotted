import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const { Pool } = pkg;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

app.use("/uploads", express.static(uploadDir));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const unique =
      Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY";

/* =========================
   DATABASE CONFIG
========================= */

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "spotted",
  password: process.env.DB_PASSWORD || "postgres",
  port: process.env.DB_PORT
    ? parseInt(process.env.DB_PORT)
    : 5432,
});

/* =========================
   INIT DB
========================= */

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY
    );
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password TEXT;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS nickname TEXT;
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
      comment TEXT,
      media_url TEXT,
      media_type TEXT,
      UNIQUE(post_id, user_id)
    );
  `);

  await pool.query(`
    ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS comment TEXT;
  `);

  await pool.query(`
    ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS media_url TEXT;
  `);

  await pool.query(`
    ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS media_type TEXT;
  `);

  console.log("✅ DB initialized");
};

/* =========================
   AUTH MIDDLEWARE
========================= */

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token)
    return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

/* =========================
   AUTH ROUTES
========================= */

// REGISTER
app.post("/auth/register", async (req, res) => {
  const { email, password, nickname } = req.body;

  try {
    const hashed = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password, nickname)
       VALUES ($1,$2,$3)
       RETURNING id,email,nickname`,
      [email, hashed, nickname]
    );

    const token = jwt.sign(
      { id: result.rows[0].id },
      JWT_SECRET
    );

    res.json({ user: result.rows[0], token });
  } catch (err) {
    res.status(400).json({
      error: "User already exists",
    });
  }
});

// LOGIN
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    `SELECT * FROM users WHERE email=$1`,
    [email]
  );

  if (result.rows.length === 0)
    return res.status(400).json({
      error: "User not found",
    });

  const user = result.rows[0];

  const valid = await bcrypt.compare(
    password,
    user.password
  );

  if (!valid)
    return res.status(400).json({
      error: "Wrong password",
    });

  const token = jwt.sign(
    { id: user.id },
    JWT_SECRET
  );

  res.json({
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
    },
    token,
  });
});

/* =========================
   POSTS
========================= */

app.get("/posts", async (req, res) => {
  const { lat, lng } = req.query;

  const result = await pool.query(
    `SELECT p.*,
     COALESCE(SUM(CASE WHEN v.value=true THEN 1 ELSE 0 END),0) AS true_votes,
     COALESCE(SUM(CASE WHEN v.value=false THEN 1 ELSE 0 END),0) AS false_votes
     FROM posts p
     LEFT JOIN votes v ON p.id=v.post_id
     WHERE ABS(p.lat - $1) < 0.1
       AND ABS(p.lng - $2) < 0.1
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [lat, lng]
  );

  res.json(result.rows);
});

app.post("/posts", authMiddleware, async (req, res) => {
  const { text, image_url, lat, lng } = req.body;

  const result = await pool.query(
    `INSERT INTO posts (user_id,text,image_url,lat,lng)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [req.user.id, text, image_url, lat, lng]
  );

  res.json(result.rows[0]);
});

app.post(
  "/vote",
  authMiddleware,
  upload.single("media"),
  async (req, res) => {
    const { post_id, value, comment } = req.body;

    let media_url = null;
    let media_type = null;

    if (req.file) {
      media_url = `/uploads/${req.file.filename}`;
      media_type = req.file.mimetype;
    }

    await pool.query(
      `INSERT INTO votes (post_id,user_id,value,comment,media_url,media_type)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (post_id,user_id)
       DO UPDATE SET 
         value=$3,
         comment=$4,
         media_url=$5,
         media_type=$6`,
      [
        post_id,
        req.user.id,
        value === "true" || value === true,
        comment || null,
        media_url,
        media_type,
      ]
    );

    res.json({ success: true, media_url });
  }
);

/* ========================= */

const PORT = process.env.PORT || 4000;

server.listen(PORT, async () => {
  await initDb();
  console.log(`🚀 Server running on ${PORT}`);
});