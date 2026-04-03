const path = require("path");
const dotenv = require("../node_modules/dotenv");
const { Client } = require("../node_modules/pg");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function run() {
  const client = new Client({
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "spotted",
    port: Number(process.env.DB_PORT || 5432),
  });

  await client.connect();

  const updateResult = await client.query(
    `UPDATE post_status_rules
     SET status_2 = 'TO JEST FAKE'
     WHERE status_2 = 'KŁAMSTWO' OR status_2 = 'KLAMSTWO'
     RETURNING id, min_true_percent, max_true_percent, status_1, status_2`
  );

  console.log(`updated_rows=${updateResult.rowCount}`);
  console.log(JSON.stringify(updateResult.rows, null, 2));

  const allStatuses = await client.query(
    `SELECT id, min_true_percent, max_true_percent, status_1, status_2
     FROM post_status_rules
     WHERE is_active=true
     ORDER BY sort_order ASC, id ASC`
  );

  console.log("active_rules=");
  console.log(JSON.stringify(allStatuses.rows, null, 2));

  await client.end();
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
