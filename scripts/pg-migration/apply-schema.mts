// Applies the generated Postgres schema to PG_DATABASE_URL, then verifies its
// shape. Each migration file runs as one transaction so a failure leaves
// nothing half-created.
//
//   PG_DATABASE_URL=postgres://... npx tsx scripts/pg-migration/apply-schema.mts [--reset]

import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";
import { SUPABASE_ROOT_CA } from "../../server/_core/supabaseCa";

/**
 * TLS options for a Postgres URL. Supabase needs its private root pinned;
 * a local rehearsal database speaks plaintext and must not be handed an
 * `ssl` block at all.
 */
function pgTls(url: string) {
  const host = new URL(url).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return undefined;
  return { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true };
}

const EXPECTED = {
  tables: 76,
  "enum types": 58,
  "foreign keys": 154, // 155 declared minus animal_status_history_animal_fk
  "check constraints": 2, // 3 declared minus expenses_scope_check
  "generated columns": 22,
  "identity columns": 68,
  "updatedAt triggers": 38,
  "bytea columns": 3,
};

async function main() {
  const url = process.env.PG_DATABASE_URL;
  if (!url) throw new Error("PG_DATABASE_URL is required");

  const client = new pg.Client({ connectionString: url, ssl: pgTls(url) });
  await client.connect();
  await client.query("SET TIME ZONE 'UTC'");

  if (process.argv.includes("--reset")) {
    console.log("resetting public schema");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  }

  const dir = "drizzle/pg/migrations";
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const statements = readFileSync(`${dir}/${file}`, "utf8")
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

  const { rows } = await client.query<{ k: string; n: string }>(`
    SELECT 'tables' k, count(*)::text n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'
    UNION ALL SELECT 'enum types', count(*)::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e'
    UNION ALL SELECT 'foreign keys', count(*)::text FROM information_schema.table_constraints WHERE table_schema='public' AND constraint_type='FOREIGN KEY'
    UNION ALL SELECT 'check constraints', count(*)::text FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='c'
    UNION ALL SELECT 'generated columns', count(*)::text FROM information_schema.columns WHERE table_schema='public' AND is_generated='ALWAYS'
    UNION ALL SELECT 'identity columns', count(*)::text FROM information_schema.columns WHERE table_schema='public' AND is_identity='YES'
    UNION ALL SELECT 'updatedAt triggers', count(*)::text FROM pg_trigger WHERE tgname LIKE '%_set_updated_at' AND NOT tgisinternal
    UNION ALL SELECT 'bytea columns', count(*)::text FROM information_schema.columns WHERE table_schema='public' AND data_type='bytea'`);

  console.log("\nshape:");
  let failed = 0;
  for (const { k, n } of rows) {
    const want = EXPECTED[k as keyof typeof EXPECTED];
    const ok = Number(n) === want;
    if (!ok) failed++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${k}: ${n}${ok ? "" : ` (expected ${want})`}`);
  }

  await client.end();
  if (failed) throw new Error(`${failed} shape check(s) failed`);
  console.log("\nschema verified");
}

main().catch((e) => {
  console.error(String(e.message ?? e));
  process.exit(1);
});
