// Rebuilds the test database schema from the migration files before the run.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

module.exports = async () => {
  require("./setup-env");
  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  const dir = path.join(__dirname, "..", "prisma", "migrations");
  for (const m of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort()) {
    await client.query(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  }
  await client.end();
  fs.rmSync(process.env.STORAGE_LOCAL_DIR, { recursive: true, force: true });
};
