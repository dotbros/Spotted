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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, "..", ".env"),
});

const { Pool } = pkg;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(cors());
app.use(express.json());

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
const HERE_API_KEY = process.env.HERE_API_KEY;

const DEFAULT_STATUS_RULES = [
  {
    min: 0,
    max: 15,
    s1: "Informacja fałszywa",
    s2: "KŁAMSTWO",
  },
  {
    min: 16,
    max: 35,
    s1: "Informacja raczej nieprawdziwa",
    s2: "MAŁO PRAWDOPODOBNE",
  },
  {
    min: 36,
    max: 60,
    s1: "Sprzeczne relacje",
    s2: "USTALANIE FAKTÓW",
  },
  {
    min: 61,
    max: 85,
    s1: "Informacja potwierdzona w wielu źródłach",
    s2: "PRAWIE PEWNE",
  },
  {
    min: 86,
    max: 100,
    s1: "Informacja prawdziwa",
    s2: "TO SĄ FAKTY",
  },
];

const EARTH_RADIUS_M = 6371000;
const ON_PLACE_RADIUS_METERS = 100;

const REPUTATION = {
  BASE_VOTE: 10,
  PHOTO_BONUS: 20,
  ON_PLACE_BONUS: 30,
  SPEED_BONUS_5_MIN: 40,
  SPEED_BONUS_30_MIN: 25,
  SPEED_BONUS_2_HOURS: 10,
  MAX_INITIAL_POINTS: 100,
  ACCURACY_REWARD: 50,
  WRONG_VOTE_PENALTY: 150,
  BANKRUPT_POINTS_THRESHOLD: -200,
  BANKRUPT_ACCURACY_THRESHOLD: 0.3,
  BANKRUPT_MIN_VOTES: 20,
  LOCK_DAYS: 30,
  MIN_VOTES_TO_RESOLVE: 10,
  MIN_WEIGHT_TO_RESOLVE: 15,
  ANON_WEIGHT: 0.1,
  ANON_VOTES_PER_HOUR: 5,
  ANON_IP_VOTES_PER_HOUR: 20,
};

const RANKS = [
  { key: "NOWY", min: 0, weight: 1.0 },
  { key: "CZŁONEK", min: 100, weight: 1.2 },
  { key: "WERYFIKATOR", min: 500, weight: 1.5 },
  { key: "REPORTER", min: 1500, weight: 2.0 },
  { key: "EKSPERT", min: 5000, weight: 3.0 },
];

const PROFILE_POINTS = {
  first_name: 5,
  last_name: 5,
  phone: 50,
  profession: 15,
  city: 15,
  country: 5,
  default_location: 200,
};

const NOTIFICATION_MESSAGES = {
  WELCOME:
    "Witaj w serwisie SPOTTED - miejscu gdzie prawda wychodzi na jaw, a FAKE newsy gaszone są z prędkością światła. Mamy wielką nadzieję, że korzystanie z tej aplikacji będzie dla Ciebie nie tylko przyjemnością, ale także filtrem prawdy w ogólnym, szeroko manipulowanym świecie informacji. Zachęcamy Cię do aktywnego korzystania z aplikacji i udzielania się zarówno w sprawach lokalnych, jak i ogólnych. Korzystając z Aplikacji SPOTTED budujesz rangę swojej prawdomówności. Im ranga jest wyższa, tym Twój udział w aplikacji jest większy, a dzięki temu masz większy wpływ na ocenę prawdziwości publikowanych postów. Nie czekaj. Zacznij budować swoją rangę i zacznij kreować PRAWDĘ już dziś !",
  PROFILE_NAME_COMPLETED:
    `Dziękujemy, że dodałeś swoje imię i nazwisko. Dzięki temu otrzymałeś dodatkowych ${
      PROFILE_POINTS.first_name + PROFILE_POINTS.last_name
    } punktów do Twojej rangi. Wypełnij więcej danych, aby zdobyć więcej punktów rangi. Weryfikując swój numer telefonu, otrzymasz ${PROFILE_POINTS.phone} punktów do swojej rangi. Zwiększając swoją rangę, zwiększasz zaufanie do Siebie. My nagradzamy Cię większym wpływem na wynik głosowania w postach. Pamiętaj, Twój głos jest realny i widziany przez innych. Zdobywaj rangi, podnoś swoją REPUTACJĘ i działaj przeciw DEZINFORMACJI`,
  PHONE_COMPLETED:
    `Dziękujemy, że dodałeś numer telefonu do konta. Dałeś się poznać od mocnej strony i zapewniasz nas, że jesteś osobą prawdziwą, której zależy na prawdzie. Nagradzamy cię ilością ${PROFILE_POINTS.phone} punktów do Twojego konta. Chcemy też zapewnić, że podany numer telefonu nigdzie nie będzie widoczny, ani nie zostanie wykorzystany do celów marketingowych, jeśli nie wyrazisz na to zgody. Dziękujemy, że jesteś z nami. Korzystaj z aplikacji i dziel się prawdą !`,
};

const toRad = (deg) => (Number(deg) * Math.PI) / 180;

const distanceMeters = (lat1, lng1, lat2, lng2) => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
};

const hasValue = (v) =>
  v !== null && v !== undefined && String(v).trim() !== "";

const getRankForPoints = (points) => {
  const p = Number(points || 0);

  if (p >= 5000) return RANKS[4];
  if (p >= 1500) return RANKS[3];
  if (p >= 500) return RANKS[2];
  if (p >= 100) return RANKS[1];
  return RANKS[0];
};

const speedBonusForVote = (postCreatedAt, voteCreatedAt = new Date()) => {
  if (!postCreatedAt) return 0;

  const diffMs = voteCreatedAt.getTime() - new Date(postCreatedAt).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return 0;

  const diffMinutes = diffMs / (1000 * 60);
  if (diffMinutes <= 5) return REPUTATION.SPEED_BONUS_5_MIN;
  if (diffMinutes <= 30) return REPUTATION.SPEED_BONUS_30_MIN;
  if (diffMinutes <= 120) return REPUTATION.SPEED_BONUS_2_HOURS;
  return 0;
};

const calculatePointsSplit = (truePointsRaw, falsePointsRaw) => {
  const truePoints = Number(truePointsRaw || 0);
  const falsePoints = Number(falsePointsRaw || 0);
  const totalPoints = truePoints + falsePoints;

  const truePercent =
    totalPoints > 0 ? Math.round((truePoints / totalPoints) * 1000) / 10 : 0;
  const falsePercent =
    totalPoints > 0 ? Math.round((falsePoints / totalPoints) * 1000) / 10 : 0;

  return {
    truePoints,
    falsePoints,
    totalPoints,
    truePercent,
    falsePercent,
  };
};

const extractClientIp = (req) => {
  const forwarded = String(req.headers["x-forwarded-for"] || "").trim();
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return (
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    null
  );
};

const appendAnonVoteFlags = async (posts, anonId, client = null) => {
  const list = Array.isArray(posts) ? posts : [];
  if (list.length === 0) return list;

  const normalizedAnonId = String(anonId || "").trim();
  if (!normalizedAnonId) {
    return list.map((p) => ({ ...p, anon_voted: false }));
  }

  const postIds = list
    .map((p) => Number(p?.id))
    .filter((id) => Number.isFinite(id));

  if (postIds.length === 0) {
    return list.map((p) => ({ ...p, anon_voted: false }));
  }

  const db = getClient(client);
  const votesResult = await db.query(
    `SELECT post_id
     FROM votes
     WHERE anon_id=$1
       AND post_id = ANY($2::int[])`,
    [normalizedAnonId, postIds]
  );

  const votedSet = new Set(votesResult.rows.map((r) => Number(r.post_id)));
  return list.map((p) => ({ ...p, anon_voted: votedSet.has(Number(p.id)) }));
};

const calcProfileCompletenessPoints = (profile, hasDefaultLocation) => {
  let points = 0;

  if (hasValue(profile?.first_name)) points += PROFILE_POINTS.first_name;
  if (hasValue(profile?.last_name)) points += PROFILE_POINTS.last_name;
  if (hasValue(profile?.phone)) points += PROFILE_POINTS.phone;
  if (hasValue(profile?.profession)) points += PROFILE_POINTS.profession;
  if (hasValue(profile?.city)) points += PROFILE_POINTS.city;
  if (hasValue(profile?.country)) points += PROFILE_POINTS.country;
  if (hasDefaultLocation) points += PROFILE_POINTS.default_location;

  return points;
};

const recalculateProfilePoints = async (userId, client = null) => {
  const db = getClient(client);

  const profileResult = await db.query(
    `SELECT first_name, last_name, phone, profession, city, country, profile_points_awarded
     FROM users
     WHERE id=$1
     LIMIT 1`,
    [userId]
  );

  if (profileResult.rowCount === 0) return;

  const defaultLocationResult = await db.query(
    `SELECT 1
     FROM user_preferences
     WHERE user_id=$1 AND use_current_location=true
     LIMIT 1`,
    [userId]
  );

  const profile = profileResult.rows[0];
  const hasDefaultLocation = defaultLocationResult.rowCount > 0;

  const newProfilePoints = calcProfileCompletenessPoints(profile, hasDefaultLocation);
  const currentProfilePoints = Number(profile.profile_points_awarded || 0);
  const delta = newProfilePoints - currentProfilePoints;

  if (delta !== 0) {
    await db.query(
      `UPDATE users
       SET points = COALESCE(points, 0) + $1,
           profile_points_awarded=$2
       WHERE id=$3`,
      [delta, newProfilePoints, userId]
    );
  }

  const hasFullName = hasValue(profile?.first_name) && hasValue(profile?.last_name);
  const hasPhone = hasValue(profile?.phone);

  if (hasFullName) {
    await createNotificationIfNotExists(
      userId,
      "PROFILE_NAME_COMPLETED",
      "Profil uzupełniony",
      NOTIFICATION_MESSAGES.PROFILE_NAME_COMPLETED,
      db
    );
  }

  if (hasPhone) {
    await createNotificationIfNotExists(
      userId,
      "PHONE_COMPLETED",
      "Numer telefonu dodany",
      NOTIFICATION_MESSAGES.PHONE_COMPLETED,
      db
    );
  }

  await refreshUserReputation(userId, db);
};

const getClient = (client) => client || pool;

const createNotificationIfNotExists = async (
  userId,
  code,
  title,
  message,
  client = null
) => {
  const db = getClient(client);

  if (!code) {
    await db.query(
      `INSERT INTO notifications (user_id, code, title, message)
       VALUES ($1,$2,$3,$4)`,
      [userId, code, title, message]
    );
    return;
  }

  const lockResult = await db.query(
    `INSERT INTO notification_events (user_id, code)
     VALUES ($1, $2)
     ON CONFLICT (user_id, code) DO NOTHING
     RETURNING id`,
    [userId, code]
  );

  // Jeśli event już istnieje, powiadomienie było już wysłane wcześniej
  // i nie powinno być odtwarzane po usunięciu przez użytkownika.
  if (lockResult.rowCount === 0) return;

  await db.query(
    `INSERT INTO notifications (user_id, code, title, message)
     VALUES ($1, $2, $3, $4)`,
    [userId, code, title, message]
  );
};

const refreshUserReputation = async (userId, client = null) => {
  const db = getClient(client);
  const userResult = await db.query(
    `SELECT id, points, correct_votes, incorrect_votes, reputation_locked_until
     FROM users
     WHERE id=$1
     LIMIT 1`,
    [userId]
  );

  if (userResult.rowCount === 0) return;

  const user = userResult.rows[0];
  const correctVotes = Number(user.correct_votes || 0);
  const incorrectVotes = Number(user.incorrect_votes || 0);
  const totalVotes = correctVotes + incorrectVotes;
  const accuracy = totalVotes > 0 ? correctVotes / totalVotes : 1;

  const bankruptByPoints = Number(user.points || 0) < REPUTATION.BANKRUPT_POINTS_THRESHOLD;
  const bankruptByAccuracy =
    totalVotes >= REPUTATION.BANKRUPT_MIN_VOTES &&
    accuracy < REPUTATION.BANKRUPT_ACCURACY_THRESHOLD;

  if (bankruptByPoints || bankruptByAccuracy) {
    await db.query(
      `UPDATE users
       SET rank='NOWY',
           rank_weight=1,
           reputation_locked_until = GREATEST(
             COALESCE(reputation_locked_until, CURRENT_TIMESTAMP),
             CURRENT_TIMESTAMP + INTERVAL '30 days'
           )
       WHERE id=$1`,
      [userId]
    );
    return;
  }

  const rank = getRankForPoints(user.points);
  await db.query(
    `UPDATE users
     SET rank=$1,
         rank_weight=$2
     WHERE id=$3`,
    [rank.key, rank.weight, userId]
  );
};

const ensureUserNotLocked = async (userId, client = null) => {
  const db = getClient(client);
  const result = await db.query(
    `SELECT reputation_locked_until
     FROM users
     WHERE id=$1
     LIMIT 1`,
    [userId]
  );

  if (result.rowCount === 0) {
    return { ok: false, reason: "Użytkownik nie istnieje" };
  }

  const lockedUntil = result.rows[0].reputation_locked_until;
  if (lockedUntil && new Date(lockedUntil) > new Date()) {
    return {
      ok: false,
      reason: "Twoja reputacja jest zablokowana. Głosowanie i publikacja są tymczasowo wyłączone.",
      locked_until: lockedUntil,
    };
  }

  return { ok: true };
};

const processPostEvaluation = async (post, client) => {
  const votesResult = await client.query(
    `SELECT id, user_id, value, vote_weight, points_awarded_initial, evaluated
     FROM votes
     WHERE post_id=$1`,
    [post.id]
  );

  const votes = votesResult.rows;
  const trueWeight = votes
    .filter((v) => v.value === true)
    .reduce((sum, v) => sum + Number(v.vote_weight || 0), 0);
  const falseWeight = votes
    .filter((v) => v.value === false)
    .reduce((sum, v) => sum + Number(v.vote_weight || 0), 0);

  const totalWeight = trueWeight + falseWeight;
  const totalVotes = votes.length;
  const truthScore = totalWeight > 0 ? trueWeight / totalWeight : null;

  // Finalny (zamrożony) wynik punktowy posta po 12h:
  // dokładnie na bazie punktów przyznanych za głosy (live),
  // bez dalszych zmian po rozliczeniu.
  const truePointsInitial = votes
    .filter((v) => v.value === true)
    .reduce((sum, v) => sum + Number(v.points_awarded_initial || 0), 0);
  const falsePointsInitial = votes
    .filter((v) => v.value === false)
    .reduce((sum, v) => sum + Number(v.points_awarded_initial || 0), 0);

  const finalPointsSplit = calculatePointsSplit(truePointsInitial, falsePointsInitial);

  let finalStatus = "UNRESOLVED";

  if (
    totalVotes >= REPUTATION.MIN_VOTES_TO_RESOLVE &&
    totalWeight >= REPUTATION.MIN_WEIGHT_TO_RESOLVE
  ) {
    if (truthScore >= 0.65) finalStatus = "TRUE";
    else if (truthScore <= 0.35) finalStatus = "FALSE";
  }

  for (const vote of votes) {
    if (vote.evaluated) continue;

    let correction = 0;

    if (finalStatus === "TRUE" || finalStatus === "FALSE") {
      const expected = finalStatus === "TRUE";
      const isCorrect = vote.value === expected;

      if (isCorrect) {
        correction = REPUTATION.ACCURACY_REWARD;
        await client.query(
          `UPDATE users
           SET points = COALESCE(points, 0) + $1,
               correct_votes = COALESCE(correct_votes, 0) + 1
           WHERE id=$2`,
          [correction, vote.user_id]
        );
      } else {
        correction = -(
          REPUTATION.WRONG_VOTE_PENALTY + Number(vote.points_awarded_initial || 0)
        );
        await client.query(
          `UPDATE users
           SET points = COALESCE(points, 0) + $1,
               incorrect_votes = COALESCE(incorrect_votes, 0) + 1
           WHERE id=$2`,
          [correction, vote.user_id]
        );
      }

      await refreshUserReputation(vote.user_id, client);
    }

    await client.query(
      `UPDATE votes
       SET points_corrected=$1,
           evaluated=true
       WHERE id=$2`,
      [correction, vote.id]
    );
  }

  await client.query(
    `UPDATE posts
     SET final_truth_score=$1,
         final_status=$2,
         final_true_points=$3,
         final_false_points=$4,
         final_true_percent=$5,
         final_false_percent=$6,
         evaluation_processed=true
     WHERE id=$7`,
    [
      truthScore,
      finalStatus,
      finalPointsSplit.truePoints,
      finalPointsSplit.falsePoints,
      finalPointsSplit.truePercent,
      finalPointsSplit.falsePercent,
      post.id,
    ]
  );
};

const processPendingPostEvaluations = async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const pendingPostsResult = await client.query(
      `SELECT id, created_at, evaluation_deadline
       FROM posts
       WHERE evaluation_processed=false
         AND evaluation_deadline <= CURRENT_TIMESTAMP
       ORDER BY evaluation_deadline ASC
       FOR UPDATE SKIP LOCKED`
    );

    for (const post of pendingPostsResult.rows) {
      await processPostEvaluation(post, client);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Reputation evaluation error:", err.message);
  } finally {
    client.release();
  }
};

const processInactivityDecay = async () => {
  try {
    const result = await pool.query(
      `SELECT id, points, last_login_at
       FROM users`
    );

    for (const user of result.rows) {
      const lastLoginAt = user.last_login_at ? new Date(user.last_login_at) : null;
      if (!lastLoginAt) continue;

      const daysInactive = Math.floor(
        (Date.now() - lastLoginAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysInactive <= 7) continue;

      const decayDays = daysInactive - 7;
      const decayPercent = Math.min(0.5, decayDays * 0.05);
      const currentPoints = Number(user.points || 0);
      const newPoints = Math.round(currentPoints * (1 - decayPercent));

      if (newPoints === currentPoints) continue;

      await pool.query(
        `UPDATE users
         SET points=$1
         WHERE id=$2`,
        [newPoints, user.id]
      );

      await refreshUserReputation(user.id);
    }
  } catch (err) {
    console.error("❌ Inactivity decay error:", err.message);
  }
};

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
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS pseudonym TEXT;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS first_name TEXT;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_name TEXT;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone TEXT;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS profession TEXT;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS city TEXT;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS country TEXT;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS rank TEXT DEFAULT 'NOWY';
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS rank_weight FLOAT DEFAULT 1;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS correct_votes INTEGER DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS incorrect_votes INTEGER DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reputation_locked_until TIMESTAMP;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS profile_points_awarded INTEGER DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'ZAREJESTROWANY';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      radius_km INTEGER DEFAULT 10,
      use_current_location BOOLEAN DEFAULT false
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
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS shares_count INTEGER DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS description TEXT;
  `);

  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS evaluation_deadline TIMESTAMP;
  `);

  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS final_truth_score FLOAT;
  `);

  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS final_status TEXT;
  `);

  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS evaluation_processed BOOLEAN DEFAULT false;
  `);

  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS final_true_points INTEGER;
  `);

  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS final_false_points INTEGER;
  `);

  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS final_true_percent FLOAT;
  `);

  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS final_false_percent FLOAT;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_status_rules (
      id SERIAL PRIMARY KEY,
      min_true_percent INTEGER NOT NULL,
      max_true_percent INTEGER NOT NULL,
      status_1 TEXT NOT NULL,
      status_2 TEXT,
      status_3 TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const statusCountResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM post_status_rules`
  );

  if (statusCountResult.rows[0]?.count === 0) {
    for (const [index, rule] of DEFAULT_STATUS_RULES.entries()) {
      await pool.query(
        `INSERT INTO post_status_rules
         (min_true_percent, max_true_percent, status_1, status_2, status_3, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [
          rule.min,
          rule.max,
          rule.s1,
          rule.s2,
          null,
          index + 1,
        ]
      );
    }
  }

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

  await pool.query(`
    ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
  `);

  await pool.query(`
    ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
  `);

  await pool.query(`
    ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  await pool.query(`
    ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS is_on_place BOOLEAN DEFAULT false;
  `);

  await pool.query(`
    ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS vote_weight FLOAT DEFAULT 1;
  `);

  await pool.query(`
    ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS points_awarded_initial INTEGER DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS points_corrected INTEGER DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS evaluated BOOLEAN DEFAULT false;
  `);

  await pool.query(`
    ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false;
  `);

  await pool.query(`
    ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS anon_id TEXT;
  `);

  await pool.query(`
    ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS anon_ip TEXT;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS votes_unique_post_anon
    ON votes (post_id, anon_id)
    WHERE anon_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_on_place_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      user_lat DOUBLE PRECISION,
      user_lng DOUBLE PRECISION,
      post_lat DOUBLE PRECISION,
      post_lng DOUBLE PRECISION,
      distance_m DOUBLE PRECISION,
      is_within_radius BOOLEAN NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      code TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      read_at TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_code_unique
    ON notifications (user_id, code)
    WHERE code IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, code)
    );
  `);

  // Migracja bezpieczeństwa: jeśli użytkownik ma już uzupełnione dane,
  // traktujemy to jako zrealizowany event, aby usunięte powiadomienia
  // nie odtwarzały się ponownie po kolejnych zmianach profilu.
  await pool.query(`
    INSERT INTO notification_events (user_id, code)
    SELECT id, 'PROFILE_NAME_COMPLETED'
    FROM users
    WHERE first_name IS NOT NULL AND TRIM(first_name) <> ''
      AND last_name IS NOT NULL AND TRIM(last_name) <> ''
    ON CONFLICT (user_id, code) DO NOTHING;
  `);

  await pool.query(`
    INSERT INTO notification_events (user_id, code)
    SELECT id, 'PHONE_COMPLETED'
    FROM users
    WHERE phone IS NOT NULL AND TRIM(phone) <> ''
    ON CONFLICT (user_id, code) DO NOTHING;
  `);

  await pool.query(`
    UPDATE posts
    SET evaluation_deadline = created_at + INTERVAL '12 hours'
    WHERE evaluation_deadline IS NULL;
  `);

  await pool.query(`
    UPDATE posts
    SET final_status = COALESCE(final_status, 'PENDING'),
        evaluation_processed = COALESCE(evaluation_processed, false);
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

const optionalAuthMiddleware = (req, _res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  } catch {
    req.user = null;
  }

  next();
};

/* =========================
   AUTH ROUTES
========================= */

// REGISTER
app.post("/auth/register", async (req, res) => {
  const { email, phone, password, nickname, first_name, last_name, pseudonym } = req.body;

  try {
    const normalizedEmail =
      typeof email === "string" && email.trim() !== ""
        ? email.trim().toLowerCase()
        : null;
    const normalizedPhone =
      typeof phone === "string" && phone.trim() !== ""
        ? phone.trim()
        : null;

    if (!normalizedEmail && !normalizedPhone) {
      return res.status(400).json({
        error: "Podaj adres e-mail lub numer telefonu",
      });
    }

    if (!password || String(password).length < 6) {
      return res.status(400).json({
        error: "Hasło musi mieć co najmniej 6 znaków",
      });
    }

    const existsResult = await pool.query(
      `SELECT id
       FROM users
       WHERE ($1::text IS NOT NULL AND email=$1)
          OR ($2::text IS NOT NULL AND phone=$2)
       LIMIT 1`,
      [normalizedEmail, normalizedPhone]
    );

    if (existsResult.rowCount > 0) {
      return res.status(400).json({
        error: "Użytkownik z takim adresem e-mail lub numerem telefonu już istnieje",
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, phone, password, nickname, pseudonym, first_name, last_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id,email,phone,nickname,pseudonym,first_name,last_name`,
      [
        normalizedEmail,
        normalizedPhone,
        hashed,
        nickname || null,
        pseudonym || null,
        first_name || null,
        last_name || null,
      ]
    );

    await recalculateProfilePoints(result.rows[0].id);
    await createNotificationIfNotExists(
      result.rows[0].id,
      "WELCOME",
      "Witaj w SPOTTED",
      NOTIFICATION_MESSAGES.WELCOME
    );

    const token = jwt.sign(
      { id: result.rows[0].id },
      JWT_SECRET
    );

    res.json({ user: result.rows[0], token });
  } catch (err) {
    res.status(400).json({
      error: "Nie udało się utworzyć konta",
    });
  }
});

/* =========================
   PROFILE
========================= */

app.get("/user/profile", authMiddleware, async (req, res) => {
  const result = await pool.query(
    `SELECT id,email,phone,nickname,pseudonym,first_name,last_name,avatar_url,profession,city,country,points,rank,rank_weight
     FROM users WHERE id=$1`,
    [req.user.id]
  );

  res.json(result.rows[0]);
});

app.put("/user/profile", authMiddleware, async (req, res) => {
  const { first_name, last_name, phone, profession, city, country, pseudonym } = req.body;

  await pool.query(
    `UPDATE users SET
      first_name=$1,
      last_name=$2,
      phone=$3,
      profession=$4,
      city=$5,
      country=$6,
      pseudonym=$7
     WHERE id=$8`,
    [first_name, last_name, phone, profession, city, country, pseudonym || null, req.user.id]
  );

  await recalculateProfilePoints(req.user.id);

  res.json({ success: true });
});

app.post("/user/avatar", authMiddleware, upload.single("avatar"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  const url = `/uploads/${req.file.filename}`;

  await pool.query(
    `UPDATE users SET avatar_url=$1 WHERE id=$2`,
    [url, req.user.id]
  );

  res.json({ avatar_url: url });
});

app.get("/user/preferences", authMiddleware, async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM user_preferences WHERE user_id=$1`,
    [req.user.id]
  );

  res.json(result.rows);
});

app.post("/user/preferences", authMiddleware, async (req, res) => {
  const { lat, lng, radius_km, use_current_location } = req.body;

  const isDefault =
    use_current_location === true ||
    use_current_location === "true" ||
    use_current_location === 1 ||
    use_current_location === "1";

  // Użytkownik może mieć tylko jedną domyślną lokalizację.
  if (isDefault) {
    await pool.query(
      `DELETE FROM user_preferences WHERE user_id=$1 AND use_current_location=true`,
      [req.user.id]
    );
  }

  const result = await pool.query(
    `INSERT INTO user_preferences (user_id,lat,lng,radius_km,use_current_location)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [req.user.id, lat, lng, radius_km, isDefault]
  );

  await recalculateProfilePoints(req.user.id);

  res.json(result.rows[0]);
});

app.delete("/user/preferences/:id", authMiddleware, async (req, res) => {
  const prefId = parseInt(req.params.id, 10);

  if (!prefId) {
    return res.status(400).json({ error: "Invalid preference id" });
  }

  const result = await pool.query(
    `DELETE FROM user_preferences
     WHERE id=$1 AND user_id=$2
     RETURNING id`,
    [prefId, req.user.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Preference not found" });
  }

  await recalculateProfilePoints(req.user.id);

  res.json({ success: true, deletedId: prefId });
});

/* =========================
   NOTIFICATIONS
========================= */

app.get("/notifications", authMiddleware, async (req, res) => {
  const result = await pool.query(
    `SELECT id, code, title, message, is_read, created_at, read_at
     FROM notifications
     WHERE user_id=$1
     ORDER BY created_at DESC, id DESC
     LIMIT 100`,
    [req.user.id]
  );

  res.json(result.rows);
});

app.get("/notifications/unread-count", authMiddleware, async (req, res) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM notifications
     WHERE user_id=$1 AND is_read=false`,
    [req.user.id]
  );

  res.json({ unread_count: Number(result.rows[0]?.count || 0) });
});

app.post("/notifications/:id/read", authMiddleware, async (req, res) => {
  const notificationId = parseInt(req.params.id, 10);

  if (!notificationId) {
    return res.status(400).json({ error: "Invalid notification id" });
  }

  const result = await pool.query(
    `UPDATE notifications
     SET is_read=true,
         read_at=COALESCE(read_at, CURRENT_TIMESTAMP)
     WHERE id=$1 AND user_id=$2
     RETURNING id`,
    [notificationId, req.user.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Notification not found" });
  }

  res.json({ success: true, id: notificationId });
});

app.post("/notifications/read-all", authMiddleware, async (req, res) => {
  const result = await pool.query(
    `UPDATE notifications
     SET is_read=true,
         read_at=COALESCE(read_at, CURRENT_TIMESTAMP)
     WHERE user_id=$1 AND is_read=false
     RETURNING id`,
    [req.user.id]
  );

  res.json({ success: true, updated: result.rowCount });
});

app.delete("/notifications/:id", authMiddleware, async (req, res) => {
  const notificationId = parseInt(req.params.id, 10);

  if (!notificationId) {
    return res.status(400).json({ error: "Invalid notification id" });
  }

  const result = await pool.query(
    `DELETE FROM notifications
     WHERE id=$1 AND user_id=$2
     RETURNING id`,
    [notificationId, req.user.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Notification not found" });
  }

  return res.json({ success: true, id: notificationId });
});

/* =========================
   AUTH ROUTES
========================= */

// LOGIN
app.post("/auth/login", async (req, res) => {
  const { email, phone, identifier, password } = req.body;

  const loginIdentifier = String(identifier || email || phone || "")
    .trim()
    .toLowerCase();

  if (!loginIdentifier || !password) {
    return res.status(400).json({
      error: "Podaj login (e-mail lub telefon) i hasło",
    });
  }

  const result = await pool.query(
    `SELECT * FROM users WHERE email=$1 OR phone=$1 LIMIT 1`,
    [loginIdentifier]
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

  await pool.query(
    `UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id=$1`,
    [user.id]
  );

  await refreshUserReputation(user.id);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      nickname: user.nickname,
      pseudonym: user.pseudonym,
      first_name: user.first_name,
      last_name: user.last_name,
    },
    token,
  });
});

/* =========================
   GEO / HERE REVERSE GEOCODING
========================= */

app.get("/geo/reverse", async (req, res) => {
  const { lat, lng } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({
      error: "lat and lng query params are required",
    });
  }

  if (!HERE_API_KEY) {
    return res.status(500).json({
      error: "Missing HERE_API_KEY in environment",
    });
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
    return res.status(400).json({
      error: "lat and lng must be valid numbers",
    });
  }

  const url =
    `https://revgeocode.search.hereapi.com/v1/revgeocode` +
    `?at=${latNum},${lngNum}` +
    `&lang=pl-PL` +
    `&apiKey=${HERE_API_KEY}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const details = await response.text();
      return res.status(502).json({
        error: "HERE API request failed",
        details,
      });
    }

    const data = await response.json();
    const first = data?.items?.[0];
    const address = first?.address || {};

    return res.json({
      country: address.countryName || null,
      countryCode: address.countryCode || null,
      city: address.city || address.county || null,
      street: address.street || null,
      houseNumber: address.houseNumber || null,
      postalCode: address.postalCode || null,
      label: address.label || null,
      raw: first || null,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Unexpected error during reverse geocoding",
      details: err.message,
    });
  }
});

/* =========================
   HERE MAP PICKER (HTML page)
========================= */

app.get("/map", (req, res) => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; }
    .search-wrap {
      position: absolute;
      top: 10px;
      left: 10px;
      right: 10px;
      z-index: 9998;
      display: flex;
      gap: 8px;
    }
    .search-input {
      flex: 1;
      border: 1px solid #ccc;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 14px;
      outline: none;
      background: #fff;
    }
    .search-btn {
      border: none;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 14px;
      background: #1f2937;
      color: #fff;
      cursor: pointer;
    }
    .debug {
      position: absolute;
      top: 56px;
      left: 8px;
      right: 8px;
      z-index: 9999;
      font-family: Arial, sans-serif;
      font-size: 12px;
      background: rgba(0,0,0,0.6);
      color: #fff;
      padding: 6px 8px;
      border-radius: 6px;
      display: none;
    }
  </style>
  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
    crossorigin=""
  />
  <script
    src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
    crossorigin=""
  ></script>
</head>
<body>
  <div class="search-wrap">
    <input id="searchInput" class="search-input" placeholder="Wpisz adres / miasto" />
    <button id="searchBtn" class="search-btn">Szukaj</button>
  </div>
  <div class="debug" id="debug"></div>
  <div id="map"></div>
  <script>
    const debugEl = document.getElementById('debug');
    const showDebug = (msg) => {
      debugEl.style.display = 'block';
      debugEl.textContent = msg;
    };

    try {
      const map = L.map('map', {
        zoomControl: true,
        attributionControl: true,
      }).setView([52.0, 19.0], 6);

      const searchInput = document.getElementById('searchInput');
      const searchBtn = document.getElementById('searchBtn');

      const hereTiles = L.tileLayer(
        'https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?apiKey=${HERE_API_KEY}&style=explore.day&size=256',
        {
          maxZoom: 20,
          attribution: '&copy; HERE',
        }
      );

      hereTiles.on('tileerror', function (e) {
        showDebug('Błąd ładowania kafli HERE (tileerror). Sprawdź uprawnienia klucza HERE dla Map Tile API.');
      });

      hereTiles.addTo(map);

      let marker = null;

      const setMarkerAndCenter = (lat, lng, zoom = 14) => {
        if (marker) map.removeLayer(marker);
        marker = L.marker([lat, lng]).addTo(map);
        map.setView([lat, lng], zoom);

        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ lat, lng }));
        }
      };

      map.on('click', function (e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        setMarkerAndCenter(lat, lng, map.getZoom());
      });

      const searchAddress = async () => {
        const query = (searchInput.value || '').trim();
        if (!query) return;

        try {
          showDebug('Szukam: ' + query + ' ...');

          const at = map.getCenter();
          const url =
            'https://discover.search.hereapi.com/v1/discover' +
            '?q=' + encodeURIComponent(query) +
            '&at=' + at.lat + ',' + at.lng +
            '&limit=1' +
            '&lang=pl-PL' +
            '&apiKey=${HERE_API_KEY}';

          const resp = await fetch(url);
          if (!resp.ok) {
            showDebug('Błąd wyszukiwania HERE: ' + resp.status);
            return;
          }

          const data = await resp.json();
          const first = data?.items?.[0];
          if (!first?.position) {
            showDebug('Brak wyników dla: ' + query);
            return;
          }

          debugEl.style.display = 'none';
          setMarkerAndCenter(first.position.lat, first.position.lng, 15);
        } catch (err) {
          showDebug('Błąd wyszukiwania: ' + (err?.message || err));
        }
      };

      searchBtn.addEventListener('click', searchAddress);
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') searchAddress();
      });
    } catch (err) {
      showDebug('Błąd inicjalizacji mapy: ' + (err?.message || err));
    }
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

app.get("/link-preview", async (req, res) => {
  const rawUrl = String(req.query?.url || "").trim();

  if (!rawUrl) {
    return res.status(400).json({ error: "url query param is required" });
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return res.status(400).json({ error: "Only http/https URLs are allowed" });
  }

  try {
    const response = await fetch(parsed.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent": "SpottedBot/1.0 (+https://spotted.local)",
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: "Unable to fetch source page" });
    }

    const html = await response.text();

    const findMeta = (propertyName) => {
      const escaped = propertyName.replace(":", "\\:");
      const regexes = [
        new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, "i"),
        new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, "i"),
      ];

      for (const r of regexes) {
        const match = html.match(r);
        if (match?.[1]) return match[1].trim();
      }
      return null;
    };

    const imageCandidate =
      findMeta("og:image") ||
      findMeta("twitter:image") ||
      findMeta("og:image:url");

    const titleCandidate =
      findMeta("og:title") ||
      (() => {
        const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return m?.[1]?.trim() || null;
      })();

    const imageUrl = imageCandidate
      ? new URL(imageCandidate, parsed.origin).toString()
      : null;

    if (!imageUrl) {
      return res.status(404).json({ error: "Nie znaleziono zdjęcia wiodącego na stronie" });
    }

    return res.json({
      image_url: imageUrl,
      title: titleCandidate,
      source_url: parsed.toString(),
    });
  } catch (err) {
    return res.status(500).json({
      error: "Preview fetch failed",
      details: err?.message,
    });
  }
});

/* =========================
   POSTS
========================= */

app.get("/posts/all", async (req, res) => {
  const anonId = String(req.query?.anon_id || "").trim();
  const result = await pool.query(
    `SELECT p.*,
     COALESCE(SUM(CASE WHEN v.value=true THEN 1 ELSE 0 END),0) AS true_votes,
     COALESCE(SUM(CASE WHEN v.value=false THEN 1 ELSE 0 END),0) AS false_votes,
     COALESCE(
       CASE WHEN p.evaluation_processed THEN p.final_true_points END,
       SUM(CASE WHEN v.value=true THEN COALESCE(v.points_awarded_initial,0) ELSE 0 END),
       0
     ) AS true_points,
     COALESCE(
       CASE WHEN p.evaluation_processed THEN p.final_false_points END,
       SUM(CASE WHEN v.value=false THEN COALESCE(v.points_awarded_initial,0) ELSE 0 END),
       0
     ) AS false_points
     FROM posts p
     LEFT JOIN votes v ON p.id=v.post_id
     GROUP BY p.id
     ORDER BY p.created_at DESC`
  );

  const postsWithAnonFlag = await appendAnonVoteFlags(result.rows, anonId);
  res.json(postsWithAnonFlag);
});

app.get("/posts", async (req, res) => {
  const { lat, lng } = req.query;
  const anonId = String(req.query?.anon_id || "").trim();

  const hasLatLng =
    lat !== undefined &&
    lng !== undefined &&
    lat !== "" &&
    lng !== "";

  if (!hasLatLng) {
    const allResult = await pool.query(
      `SELECT p.*,
       COALESCE(SUM(CASE WHEN v.value=true THEN 1 ELSE 0 END),0) AS true_votes,
       COALESCE(SUM(CASE WHEN v.value=false THEN 1 ELSE 0 END),0) AS false_votes,
       COALESCE(
         CASE WHEN p.evaluation_processed THEN p.final_true_points END,
         SUM(CASE WHEN v.value=true THEN COALESCE(v.points_awarded_initial,0) ELSE 0 END),
         0
       ) AS true_points,
       COALESCE(
         CASE WHEN p.evaluation_processed THEN p.final_false_points END,
         SUM(CASE WHEN v.value=false THEN COALESCE(v.points_awarded_initial,0) ELSE 0 END),
         0
       ) AS false_points
       FROM posts p
       LEFT JOIN votes v ON p.id=v.post_id
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    );

    const postsWithAnonFlag = await appendAnonVoteFlags(allResult.rows, anonId);
    return res.json(postsWithAnonFlag);
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
    return res
      .status(400)
      .json({ error: "lat/lng must be valid numbers" });
  }

  const result = await pool.query(
    `SELECT p.*,
     COALESCE(SUM(CASE WHEN v.value=true THEN 1 ELSE 0 END),0) AS true_votes,
     COALESCE(SUM(CASE WHEN v.value=false THEN 1 ELSE 0 END),0) AS false_votes,
     COALESCE(
       CASE WHEN p.evaluation_processed THEN p.final_true_points END,
       SUM(CASE WHEN v.value=true THEN COALESCE(v.points_awarded_initial,0) ELSE 0 END),
       0
     ) AS true_points,
     COALESCE(
       CASE WHEN p.evaluation_processed THEN p.final_false_points END,
       SUM(CASE WHEN v.value=false THEN COALESCE(v.points_awarded_initial,0) ELSE 0 END),
       0
     ) AS false_points
     FROM posts p
     LEFT JOIN votes v ON p.id=v.post_id
     WHERE ABS(p.lat - $1) < 0.1
       AND ABS(p.lng - $2) < 0.1
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [latNum, lngNum]
  );

  const postsWithAnonFlag = await appendAnonVoteFlags(result.rows, anonId);
  res.json(postsWithAnonFlag);
});

app.get("/posts/:id/details", async (req, res) => {
  const postId = parseInt(req.params.id, 10);
  const anonId = String(req.query?.anon_id || "").trim();

  if (!postId) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const postResult = await pool.query(
    `SELECT p.*,
      COALESCE(SUM(CASE WHEN v.value=true THEN 1 ELSE 0 END),0) AS true_votes,
      COALESCE(SUM(CASE WHEN v.value=false THEN 1 ELSE 0 END),0) AS false_votes,
      COALESCE(
        CASE WHEN p.evaluation_processed THEN p.final_true_points END,
        SUM(CASE WHEN v.value=true THEN COALESCE(v.points_awarded_initial,0) ELSE 0 END),
        0
      ) AS true_points,
      COALESCE(
        CASE WHEN p.evaluation_processed THEN p.final_false_points END,
        SUM(CASE WHEN v.value=false THEN COALESCE(v.points_awarded_initial,0) ELSE 0 END),
        0
      ) AS false_points,
      COUNT(v.id) AS total_votes
     FROM posts p
     LEFT JOIN votes v ON p.id=v.post_id
     WHERE p.id=$1
     GROUP BY p.id`,
    [postId]
  );

  if (postResult.rows.length === 0) {
    return res.status(404).json({ error: "Post not found" });
  }

  const votesResult = await pool.query(
    `SELECT v.id,
      v.post_id,
      v.user_id,
      v.value,
      v.comment,
      v.media_url,
      v.media_type,
      v.lat,
      v.lng,
      v.is_on_place,
      v.created_at,
      u.nickname,
      u.email,
      u.avatar_url
     FROM votes v
     LEFT JOIN users u ON u.id=v.user_id
     WHERE v.post_id=$1
     ORDER BY v.created_at DESC NULLS LAST, v.id DESC`,
    [postId]
  );

  const trueVotes = Number(postResult.rows[0]?.true_votes || 0);
  const falseVotes = Number(postResult.rows[0]?.false_votes || 0);
  const truePoints = Number(postResult.rows[0]?.true_points || 0);
  const falsePoints = Number(postResult.rows[0]?.false_points || 0);
  const pointsSplit = calculatePointsSplit(truePoints, falsePoints);
  const totalVotes = Number(
    postResult.rows[0]?.total_votes || trueVotes + falseVotes || 0
  );
  const commentsCount = votesResult.rows.filter(
    (v) => typeof v.comment === "string" && v.comment.trim() !== ""
  ).length;

  const truePercent =
    totalVotes > 0
      ? Math.round((trueVotes / totalVotes) * 100)
      : 0;

  const statusResult = await pool.query(
    `SELECT *
     FROM post_status_rules
     WHERE is_active=true
       AND $1 BETWEEN min_true_percent AND max_true_percent
     ORDER BY sort_order ASC, id ASC
     LIMIT 1`,
    [truePercent]
  );

  const matchedStatus = statusResult.rows[0] || null;
  const isUnverified = totalVotes === 0 && commentsCount === 0;

  const resolvedStatus = isUnverified
    ? {
        id: null,
        min_true_percent: null,
        max_true_percent: null,
        status_1: "Nikt jeszcze nie potwierdził tej informacji",
        status_2: "NIEZWERYFIKOWANE",
        status_3: null,
      }
    : matchedStatus
      ? {
          id: matchedStatus.id,
          min_true_percent: matchedStatus.min_true_percent,
          max_true_percent: matchedStatus.max_true_percent,
          status_1: matchedStatus.status_1,
          status_2: matchedStatus.status_2,
          status_3: matchedStatus.status_3,
        }
      : null;

  res.json({
    post: {
      ...postResult.rows[0],
      anon_voted:
        !!anonId &&
        !!(
          await pool.query(
            `SELECT 1 FROM votes WHERE post_id=$1 AND anon_id=$2 LIMIT 1`,
            [postId, anonId]
          )
        ).rowCount,
    },
    votes: votesResult.rows,
    truth: {
      true_votes: trueVotes,
      false_votes: falseVotes,
      total_votes: totalVotes,
      true_percent: truePercent,
      true_points: pointsSplit.truePoints,
      false_points: pointsSplit.falsePoints,
      total_points: pointsSplit.totalPoints,
      true_percent_points: pointsSplit.truePercent,
      false_percent_points: pointsSplit.falsePercent,
    },
    status: resolvedStatus,
  });
});

app.post("/posts/:id/view", optionalAuthMiddleware, async (req, res) => {
  const postId = parseInt(req.params.id, 10);

  if (!postId) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const anonId = String(req.headers["x-anon-id"] || req.body?.anon_id || "").trim();

  if (!req.user?.id && !anonId) {
    return res.status(400).json({ error: "Missing viewer identity" });
  }

  const updateResult = await pool.query(
    `UPDATE posts
     SET views_count = COALESCE(views_count, 0) + 1
     WHERE id=$1
     RETURNING id, views_count`,
    [postId]
  );

  if (updateResult.rowCount === 0) {
    return res.status(404).json({ error: "Post not found" });
  }

  return res.json({
    success: true,
    post_id: postId,
    views_count: Number(updateResult.rows[0]?.views_count || 0),
  });
});

app.post("/posts", authMiddleware, async (req, res) => {
  const { text, image_url, lat, lng, description } = req.body;

  const lockCheck = await ensureUserNotLocked(req.user.id);
  if (!lockCheck.ok) {
    return res.status(403).json({
      error: lockCheck.reason,
      locked_until: lockCheck.locked_until || null,
    });
  }

  const result = await pool.query(
    `INSERT INTO posts (user_id,text,image_url,lat,lng,description,evaluation_deadline,final_status,evaluation_processed)
     VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP + INTERVAL '12 hours','PENDING',false)
     RETURNING *`,
    [req.user.id, text, image_url, lat, lng, description || null]
  );

  res.json(result.rows[0]);
});

app.post("/posts/:id/on-place-check", authMiddleware, async (req, res) => {
  const postId = parseInt(req.params.id, 10);
  const userLat = Number(req.body?.lat);
  const userLng = Number(req.body?.lng);

  if (!postId) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  if (Number.isNaN(userLat) || Number.isNaN(userLng)) {
    return res.status(400).json({ error: "lat/lng required" });
  }

  const postResult = await pool.query(
    `SELECT id, lat, lng FROM posts WHERE id=$1 LIMIT 1`,
    [postId]
  );

  if (postResult.rowCount === 0) {
    return res.status(404).json({ error: "Post not found" });
  }

  const post = postResult.rows[0];

  if (post.lat == null || post.lng == null) {
    return res.status(400).json({
      error: "Post has no location to verify on-place status",
    });
  }

  const distance = distanceMeters(userLat, userLng, post.lat, post.lng);
  const isWithin = distance <= ON_PLACE_RADIUS_METERS;

  await pool.query(
    `INSERT INTO user_on_place_events
     (user_id, post_id, user_lat, user_lng, post_lat, post_lng, distance_m, is_within_radius)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      req.user.id,
      postId,
      userLat,
      userLng,
      post.lat,
      post.lng,
      distance,
      isWithin,
    ]
  );

  if (!isWithin) {
    return res.status(400).json({
      error: "Nie jesteś na miejscu zdarzenia (poza promieniem 100m)",
      distance_m: Math.round(distance),
      allowed_radius_m: ON_PLACE_RADIUS_METERS,
    });
  }

  return res.json({
    success: true,
    is_on_place: true,
    distance_m: Math.round(distance),
    allowed_radius_m: ON_PLACE_RADIUS_METERS,
  });
});

app.get("/posts/mine", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const summaryResult = await pool.query(
      `SELECT
        COUNT(*) AS total_posts,
        COALESCE(SUM(post_stats.views_count), 0) AS total_views,
        COALESCE(SUM(post_stats.shares_count), 0) AS total_shares,
        COALESCE(SUM(post_stats.has_photo), 0) AS total_photos,
        COALESCE(SUM(post_stats.true_votes), 0) AS total_true_votes,
        COALESCE(SUM(post_stats.false_votes), 0) AS total_false_votes,
        COALESCE(SUM(post_stats.comments_count), 0) AS total_comments
       FROM (
        SELECT
          p.id,
          COALESCE(p.views_count, 0) AS views_count,
          COALESCE(p.shares_count, 0) AS shares_count,
          CASE WHEN p.image_url IS NOT NULL AND p.image_url <> '' THEN 1 ELSE 0 END AS has_photo,
          COALESCE(SUM(CASE WHEN v.value=true THEN 1 ELSE 0 END), 0) AS true_votes,
          COALESCE(SUM(CASE WHEN v.value=false THEN 1 ELSE 0 END), 0) AS false_votes,
          COALESCE(SUM(CASE WHEN v.comment IS NOT NULL AND TRIM(v.comment) <> '' THEN 1 ELSE 0 END), 0) AS comments_count
        FROM posts p
        LEFT JOIN votes v ON v.post_id=p.id
        WHERE p.user_id=$1
        GROUP BY p.id
       ) AS post_stats`,
      [userId]
    );

    const postsResult = await pool.query(
      `SELECT
        p.*,
        COALESCE(SUM(CASE WHEN v.value=true THEN 1 ELSE 0 END), 0) AS true_votes,
        COALESCE(SUM(CASE WHEN v.value=false THEN 1 ELSE 0 END), 0) AS false_votes,
        COALESCE(
          CASE WHEN p.evaluation_processed THEN p.final_true_points END,
          SUM(CASE WHEN v.value=true THEN COALESCE(v.points_awarded_initial,0) ELSE 0 END),
          0
        ) AS true_points,
        COALESCE(
          CASE WHEN p.evaluation_processed THEN p.final_false_points END,
          SUM(CASE WHEN v.value=false THEN COALESCE(v.points_awarded_initial,0) ELSE 0 END),
          0
        ) AS false_points,
        COALESCE(SUM(CASE WHEN v.comment IS NOT NULL AND TRIM(v.comment) <> '' THEN 1 ELSE 0 END), 0) AS comments_count
       FROM posts p
       LEFT JOIN votes v ON v.post_id=p.id
       WHERE p.user_id=$1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [userId]
    );

    const summary = summaryResult.rows[0] || {
      total_posts: "0",
      total_views: "0",
      total_shares: "0",
      total_photos: "0",
      total_true_votes: "0",
      total_false_votes: "0",
      total_comments: "0",
    };

    res.json({
      summary,
      posts: postsResult.rows,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to load user posts",
      details: err.message,
    });
  }
});

app.delete("/posts/:id", authMiddleware, async (req, res) => {
  const postId = parseInt(req.params.id, 10);

  if (!postId) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const result = await pool.query(
    `DELETE FROM posts
     WHERE id=$1 AND user_id=$2
     RETURNING id`,
    [postId, req.user.id]
  );

  if (result.rowCount === 0) {
    return res
      .status(404)
      .json({ error: "Post not found or access denied" });
  }

  res.json({ success: true, deletedId: postId });
});

app.post(
  "/vote",
  optionalAuthMiddleware,
  upload.single("media"),
  async (req, res) => {
    const { post_id, value, comment, lat, lng, is_on_place } = req.body;

    const postIdNum = Number(post_id);
    const latNum = lat !== undefined && lat !== null && lat !== "" ? Number(lat) : null;
    const lngNum = lng !== undefined && lng !== null && lng !== "" ? Number(lng) : null;
    const isOnPlace =
      is_on_place === true ||
      is_on_place === "true" ||
      is_on_place === 1 ||
      is_on_place === "1";

    if (!postIdNum) {
      return res.status(400).json({ error: "Invalid post_id" });
    }

    if ((latNum !== null && Number.isNaN(latNum)) || (lngNum !== null && Number.isNaN(lngNum))) {
      return res.status(400).json({ error: "Invalid lat/lng" });
    }

    const isAnonymousVote = !req.user?.id;
    const anonId = String(req.headers["x-anon-id"] || req.body?.anon_id || "").trim();
    const anonIp = extractClientIp(req);

    if (isAnonymousVote && !anonId) {
      return res.status(400).json({ error: "Missing anon id" });
    }

    if (!isAnonymousVote) {
      const lockCheck = await ensureUserNotLocked(req.user.id);
      if (!lockCheck.ok) {
        return res.status(403).json({
          error: lockCheck.reason,
          locked_until: lockCheck.locked_until || null,
        });
      }
    }

    const postForVoteResult = await pool.query(
      `SELECT id, lat, lng, created_at, evaluation_deadline, evaluation_processed
       FROM posts
       WHERE id=$1
       LIMIT 1`,
      [postIdNum]
    );

    if (postForVoteResult.rowCount === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = postForVoteResult.rows[0];

    if (post.evaluation_processed) {
      return res.status(400).json({
        error: "Post został już rozliczony i nie przyjmuje nowych głosów",
      });
    }

    if (post.evaluation_deadline && new Date(post.evaluation_deadline) <= new Date()) {
      return res.status(400).json({
        error: "Czas głosowania dla tego posta minął",
      });
    }

    if (!isAnonymousVote && isOnPlace) {
      if (latNum === null || lngNum === null) {
        return res.status(400).json({
          error: "Do oznaczenia 'Jestem na miejscu' wymagana jest lokalizacja",
        });
      }

      if (post.lat == null || post.lng == null) {
        return res.status(400).json({
          error: "Post has no location to verify on-place status",
        });
      }

      const distance = distanceMeters(latNum, lngNum, post.lat, post.lng);

      if (distance > ON_PLACE_RADIUS_METERS) {
        return res.status(400).json({
          error: "Nie jesteś na miejscu zdarzenia (poza promieniem 100m)",
          distance_m: Math.round(distance),
          allowed_radius_m: ON_PLACE_RADIUS_METERS,
        });
      }
    }

    let media_url = null;
    let media_type = null;

    if (req.file) {
      media_url = `/uploads/${req.file.filename}`;
      media_type = req.file.mimetype;
    }

    if (isAnonymousVote) {
      const existingAnonVoteResult = await pool.query(
        `SELECT id
         FROM votes
         WHERE post_id=$1 AND anon_id=$2
         LIMIT 1`,
        [postIdNum, anonId]
      );

      if (existingAnonVoteResult.rowCount > 0) {
        return res.status(400).json({
          error: "NIEZAREJESTROWANY może oddać tylko jeden głos na post",
          anon_vote_locked: true,
        });
      }

      const anonLimitResult = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM votes
         WHERE is_anonymous=true
           AND anon_id=$1
           AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
        [anonId]
      );

      if (Number(anonLimitResult.rows[0]?.count || 0) >= REPUTATION.ANON_VOTES_PER_HOUR) {
        return res.status(429).json({
          error: `Limit ${REPUTATION.ANON_VOTES_PER_HOUR} głosów/h dla NIEZAREJESTROWANY został przekroczony`,
        });
      }

      if (anonIp) {
        const ipLimitResult = await pool.query(
          `SELECT COUNT(*)::int AS count
           FROM votes
           WHERE is_anonymous=true
             AND anon_ip=$1
             AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
          [anonIp]
        );

        if (Number(ipLimitResult.rows[0]?.count || 0) >= REPUTATION.ANON_IP_VOTES_PER_HOUR) {
          return res.status(429).json({
            error: `Limit ${REPUTATION.ANON_IP_VOTES_PER_HOUR} głosów/h dla IP został przekroczony`,
          });
        }
      }

      const initialPoints = Math.round(REPUTATION.BASE_VOTE * REPUTATION.ANON_WEIGHT);

      await pool.query(
        `INSERT INTO votes (
          post_id,user_id,value,comment,media_url,media_type,lat,lng,is_on_place,
          vote_weight,points_awarded_initial,points_corrected,evaluated,created_at,
          is_anonymous,anon_id,anon_ip
        )
         VALUES ($1,NULL,$2,NULL,NULL,NULL,NULL,NULL,false,$3,$4,0,false,CURRENT_TIMESTAMP,true,$5,$6)`,
        [
          postIdNum,
          value === "true" || value === true,
          REPUTATION.ANON_WEIGHT,
          initialPoints,
          anonId,
          anonIp,
        ]
      );

      const aggregateResult = await pool.query(
        `SELECT
          COALESCE(SUM(CASE WHEN value=true THEN 1 ELSE 0 END),0) AS true_votes,
          COALESCE(SUM(CASE WHEN value=false THEN 1 ELSE 0 END),0) AS false_votes,
          COALESCE(SUM(CASE WHEN value=true THEN COALESCE(points_awarded_initial,0) ELSE 0 END),0) AS true_points,
          COALESCE(SUM(CASE WHEN value=false THEN COALESCE(points_awarded_initial,0) ELSE 0 END),0) AS false_points
         FROM votes
         WHERE post_id=$1`,
        [postIdNum]
      );

      const trueVotes = Number(aggregateResult.rows[0]?.true_votes || 0);
      const falseVotes = Number(aggregateResult.rows[0]?.false_votes || 0);
      const truePoints = Number(aggregateResult.rows[0]?.true_points || 0);
      const falsePoints = Number(aggregateResult.rows[0]?.false_points || 0);
      const pointsSplit = calculatePointsSplit(truePoints, falsePoints);

      return res.json({
        success: true,
        anonymous: true,
        anon_vote_locked: true,
        true_votes: trueVotes,
        false_votes: falseVotes,
        true_points: truePoints,
        false_points: falsePoints,
        true_percent_points: pointsSplit.truePercent,
        false_percent_points: pointsSplit.falsePercent,
        points_awarded_initial: initialPoints,
        vote_weight: REPUTATION.ANON_WEIGHT,
      });
    }

    const userResult = await pool.query(
      `SELECT rank_weight FROM users WHERE id=$1 LIMIT 1`,
      [req.user.id]
    );
    const userRankWeight = Number(userResult.rows[0]?.rank_weight || 1);

    const speedBonus = speedBonusForVote(new Date(post.created_at), new Date());
    const basePointsRaw =
      REPUTATION.BASE_VOTE +
      (req.file ? REPUTATION.PHOTO_BONUS : 0) +
      (isOnPlace ? REPUTATION.ON_PLACE_BONUS : 0) +
      speedBonus;

    // Model C: pełna siła punktów = punkty akcji * weight użytkownika.
    const weightedInitialPointsRaw = basePointsRaw * userRankWeight;
    const weightedInitialPointsMax = REPUTATION.MAX_INITIAL_POINTS * userRankWeight;
    const initialPoints = Math.round(
      Math.min(weightedInitialPointsRaw, weightedInitialPointsMax)
    );

    const existingVoteResult = await pool.query(
      `SELECT id, points_awarded_initial
       FROM votes
       WHERE post_id=$1 AND user_id=$2
       LIMIT 1`,
      [postIdNum, req.user.id]
    );

    const existingInitialPoints = Number(existingVoteResult.rows[0]?.points_awarded_initial || 0);
    const pointsDelta = initialPoints - existingInitialPoints;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO votes (
          post_id,user_id,value,comment,media_url,media_type,lat,lng,is_on_place,
          vote_weight,points_awarded_initial,points_corrected,evaluated,created_at,
          is_anonymous,anon_id,anon_ip
        )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,false,CURRENT_TIMESTAMP,false,NULL,NULL)
         ON CONFLICT (post_id,user_id)
         DO UPDATE SET
           value=$3,
           comment=$4,
           media_url=$5,
           media_type=$6,
           lat=$7,
           lng=$8,
           is_on_place=$9,
           vote_weight=$10,
           points_awarded_initial=$11,
           points_corrected=0,
           evaluated=false,
           is_anonymous=false,
           anon_id=NULL,
           anon_ip=NULL,
           created_at=CURRENT_TIMESTAMP`,
        [
          postIdNum,
          req.user.id,
          value === "true" || value === true,
          comment || null,
          media_url,
          media_type,
          latNum,
          lngNum,
          isOnPlace,
          userRankWeight,
          initialPoints,
        ]
      );

      if (pointsDelta !== 0) {
        await client.query(
          `UPDATE users
           SET points = COALESCE(points, 0) + $1
           WHERE id=$2`,
          [pointsDelta, req.user.id]
        );
      }

      await refreshUserReputation(req.user.id, client);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const aggregateResult = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN value=true THEN 1 ELSE 0 END),0) AS true_votes,
        COALESCE(SUM(CASE WHEN value=false THEN 1 ELSE 0 END),0) AS false_votes,
        COALESCE(SUM(CASE WHEN value=true THEN COALESCE(points_awarded_initial,0) ELSE 0 END),0) AS true_points,
        COALESCE(SUM(CASE WHEN value=false THEN COALESCE(points_awarded_initial,0) ELSE 0 END),0) AS false_points
       FROM votes
       WHERE post_id=$1`,
      [postIdNum]
    );

    const trueVotes = Number(aggregateResult.rows[0]?.true_votes || 0);
    const falseVotes = Number(aggregateResult.rows[0]?.false_votes || 0);
    const truePoints = Number(aggregateResult.rows[0]?.true_points || 0);
    const falsePoints = Number(aggregateResult.rows[0]?.false_points || 0);
    const pointsSplit = calculatePointsSplit(truePoints, falsePoints);

    res.json({
      success: true,
      media_url,
      true_votes: trueVotes,
      false_votes: falseVotes,
      true_points: truePoints,
      false_points: falsePoints,
      true_percent_points: pointsSplit.truePercent,
      false_percent_points: pointsSplit.falsePercent,
      points_awarded_initial: initialPoints,
      points_delta: pointsDelta,
      vote_weight: userRankWeight,
    });
  }
);

/* ========================= */

const PORT = process.env.PORT || 4000;

server.listen(PORT, async () => {
  await initDb();

  setInterval(processPendingPostEvaluations, 60 * 1000);
  setInterval(processInactivityDecay, 24 * 60 * 60 * 1000);

  // Pierwsze uruchomienie od razu po starcie
  processPendingPostEvaluations();
  processInactivityDecay();

  console.log(`🚀 Server running on ${PORT}`);
});