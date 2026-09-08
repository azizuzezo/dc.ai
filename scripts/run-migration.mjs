import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2] || join(__dirname, "..", "supabase-migrations");

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("SUPABASE_DB_URL is missing in .env");
  process.exit(1);
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const client = new Client({ connectionString });
await client.connect();

try {
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    console.log(`Applying ${file}...`);
    await client.query(sql);
  }
  console.log(`All ${files.length} migration(s) applied.`);
} finally {
  await client.end();
}
