import { execFileSync } from "node:child_process";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { withMysqlResultShape } from "../pgCompat";

export const TEST_DATABASE_URL = process.env.PG_TEST_DATABASE_URL ?? "";
export const hasTestDatabase = TEST_DATABASE_URL.length > 0;

/** Builds the schema once per run, then hands back a wrapped drizzle handle. */
export async function createTestDb() {
  execFileSync("npx", ["tsx", "scripts/pg-migration/apply-schema.mts", "--reset"], {
    env: { ...process.env, PG_DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  const db = withMysqlResultShape(drizzle(pool));
  return { db, pool };
}
