// Schema changes made after the Postgres cutover. They live outside
// drizzle/pg/migrations because `pg:build-schema` deletes and regenerates that
// directory. Every file must be safe to re-run: there is no ledger, so each run
// applies them all, in name order, one transaction per file.

import { readFileSync, readdirSync } from "node:fs";
import type pg from "pg";

const DIR = "drizzle/pg/post-cutover";

export async function applyPostCutoverMigrations(client: pg.Client) {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const statements = readFileSync(`${DIR}/${file}`, "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim().replace(/;$/, ""))
      .filter(Boolean);
    await client.query("BEGIN");
    try {
      for (const s of statements) await client.query(s);
      await client.query("COMMIT");
      console.log(`applied ${file} (${statements.length} statements)`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error(`${file}: ${(e as Error).message}`);
    }
  }
}
