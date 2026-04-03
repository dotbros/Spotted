const { Client } = require("pg");
require("dotenv").config({ path: "backend/.env" });

async function main() {
  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT || 5432),
  });

  await client.connect();

  const columns = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
    ORDER BY ordinal_position
  `);

  const constraints = await client.query(`
    SELECT tc.constraint_name, tc.constraint_type, kcu.column_name
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
      AND tc.table_name = kcu.table_name
    WHERE tc.table_schema='public' AND tc.table_name='users'
    ORDER BY tc.constraint_name, kcu.ordinal_position
  `);

  console.log("COLUMNS:");
  console.table(columns.rows);
  console.log("CONSTRAINTS:");
  console.table(constraints.rows);

  await client.end();
}

main().catch((err) => {
  console.error("SCHEMA DEBUG ERROR:", err);
  process.exit(1);
});
