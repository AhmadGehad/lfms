// Applies drizzle/pg/post-cutover/*.sql to PG_DATABASE_URL. Unlike apply-schema
// this targets a database that already holds data, so it never resets anything.
//
//   PG_DATABASE_URL=postgres://... pnpm pg:apply-post-cutover

import pg from "pg";
import { SUPABASE_ROOT_CA } from "../../server/_core/supabaseCa";
import { applyPostCutoverMigrations } from "./post-cutover.mts";

async function main() {
  const url = process.env.PG_DATABASE_URL;
  if (!url) throw new Error("PG_DATABASE_URL is required");
  const parsed = new URL(url);
  const host = parsed.hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  // node-postgres lets a URL's sslmode replace the ssl option below, CA included.
  parsed.searchParams.delete("sslmode");
  const client = new pg.Client({
    connectionString: parsed.toString(),
    ssl: local ? undefined : { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true },
  });
  await client.connect();
  try {
    await applyPostCutoverMigrations(client);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(String(e.message ?? e));
  process.exit(1);
});
