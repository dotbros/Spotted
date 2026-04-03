const { Client } = require("../node_modules/pg");

async function run() {
  const client = new Client({
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "irekirek",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "spotted",
    port: Number(process.env.DB_PORT || 5432),
  });

  await client.connect();

  const column = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='posts' AND column_name='description'"
  );

  const rows = await client.query(
    "SELECT id, text, description, created_at FROM posts ORDER BY id DESC LIMIT 10"
  );

  console.log("has_description_column=", column.rowCount > 0);
  console.log(JSON.stringify(rows.rows, null, 2));

  await client.end();
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
