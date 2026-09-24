// Archives the 27 pre-SaaS tables that drizzle/schema.ts does not declare
// (animals, users, audit_log, ...) into a separate `legacy` Postgres schema.
//
// The app never reads them and docs/LEGACY_IMMUTABILITY.md makes them
// read-only, but the migration requirement is zero data loss. Keeping them out
// of `public` preserves that sidecar boundary.
//
// Types are derived from MySQL introspection rather than a drizzle model,
// since no model exists. Constraints are deliberately NOT reproduced - this is
// a frozen archive, not a live schema.
//
//   PG_DATABASE_URL=postgres://... npx tsx scripts/pg-migration/copy-legacy.mts

import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
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

const qi = (id: string) => `"${id.replace(/"/g, '""')}"`;
const qm = (id: string) => "`" + id.replace(/`/g, "``") + "`";

function loadEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(".env", "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

/**
 * The MySQL source URL. Read from SOURCE_DATABASE_URL first so these scripts
 * keep working after .env's DATABASE_URL has been repointed at Postgres.
 */
function sourceDatabaseUrl(env: Record<string, string>): string {
  const url = process.env.SOURCE_DATABASE_URL ?? env.SOURCE_DATABASE_URL ?? env.DATABASE_URL ?? "";
  if (!url) throw new Error("SOURCE_DATABASE_URL (or DATABASE_URL) is required");
  if (!url.startsWith("mysql:")) {
    throw new Error(`source must be a mysql:// URL, got ${url.split(":")[0]}: - set SOURCE_DATABASE_URL`);
  }
  return url;
}

/** Maps a MySQL column to a Postgres type, preferring fidelity over elegance. */
function pgType(dataType: string, columnType: string, precision: number | null, scale: number | null): string {
  switch (dataType) {
    case "tinyint":
      return columnType.startsWith("tinyint(1)") ? "boolean" : "smallint";
    case "smallint":
      return "smallint";
    case "mediumint":
    case "int":
      return "integer";
    case "bigint":
      return "bigint";
    case "decimal":
      return `numeric(${precision ?? 20},${scale ?? 0})`;
    case "float":
      return "real";
    case "double":
      return "double precision";
    case "date":
      return "date";
    case "datetime":
    case "timestamp":
      return "timestamp(0)";
    case "time":
      return "time";
    case "year":
      return "smallint";
    case "json":
      return "json";
    case "binary":
    case "varbinary":
    case "blob":
    case "tinyblob":
    case "mediumblob":
    case "longblob":
      return "bytea";
    case "enum":
      // Archive only: a text column avoids creating 27 tables' worth of enum
      // types that nothing will ever reference.
      return "text";
    default:
      return "text";
  }
}

async function main() {
  const env = loadEnv();
  const pgUrl = process.env.PG_DATABASE_URL;
  if (!pgUrl) throw new Error("PG_DATABASE_URL is required");

  const u = new URL(sourceDatabaseUrl(env));
  const my = await mysql.createConnection({
    host: u.hostname,
    port: Number(u.port) || 4000,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    ssl: { rejectUnauthorized: true },
    charset: "utf8mb4",
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    timezone: "Z",
    typeCast(field, next) {
      if (field.type === "JSON") return field.string("utf8");
      if ((field as unknown as { characterSet: number }).characterSet === 63) return field.buffer();
      return next();
    },
  });
  await my.query("SET SESSION time_zone='+00:00'");

  const client = new pg.Client({ connectionString: pgUrl, ssl: pgTls(pgUrl) });
  await client.connect();
  await client.query("SET TIME ZONE 'UTC'");

  // Anything in MySQL that the ported public schema does not contain.
  const { rows: publicTables } = await client.query<{ n: string }>(
    `SELECT table_name n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
  );
  const known = new Set(publicTables.map((r) => r.n));

  const [allTables] = await my.query<any[]>(
    `SELECT TABLE_NAME n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME`,
  );
  const legacy = allTables.map((r) => String(r.n)).filter((n) => !known.has(n));

  await client.query("BEGIN");
  let totalRows = 0;
  try {
    await client.query("DROP SCHEMA IF EXISTS legacy CASCADE");
    await client.query("CREATE SCHEMA legacy");
    await client.query(
      `COMMENT ON SCHEMA legacy IS 'Frozen pre-SaaS tables archived from TiDB. Read-only; see docs/LEGACY_IMMUTABILITY.md'`,
    );

    for (const table of legacy) {
      const [cols] = await my.query<any[]>(
        `SELECT COLUMN_NAME cn, DATA_TYPE dt, COLUMN_TYPE ct, IS_NULLABLE nul,
                NUMERIC_PRECISION np, NUMERIC_SCALE ns, GENERATION_EXPRESSION ge
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`,
        [table],
      );
      const usable = cols.filter((c) => !c.ge);
      const defs = usable.map((c) => {
        const t = pgType(String(c.dt), String(c.ct), c.np, c.ns);
        return `${qi(String(c.cn))} ${t}${String(c.nul) === "NO" ? " NOT NULL" : ""}`;
      });
      await client.query(`CREATE TABLE legacy.${qi(table)} (${defs.join(", ")})`);

      const names = usable.map((c) => String(c.cn));
      const [rows] = await my.query<any[]>(`SELECT ${names.map(qm).join(",")} FROM ${qm(table)}`);
      if (rows.length === 0) continue;

      const typeByName = new Map(
        usable.map((c) => [String(c.cn), pgType(String(c.dt), String(c.ct), c.np, c.ns)]),
      );
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const params: unknown[] = [];
        const tuples = chunk.map((row) => {
          const ph = names.map((n) => {
            const t = typeByName.get(n)!;
            let v = row[n];
            if (v !== null && v !== undefined) {
              if (t === "boolean") v = Boolean(Number(v));
              else if (t === "json") v = Buffer.isBuffer(v) ? v.toString("utf8") : String(v);
              else if (t === "date" && String(v).startsWith("0000-00-00")) v = null;
              else if (t !== "bytea" && Buffer.isBuffer(v)) v = v.toString("utf8");
            }
            params.push(v ?? null);
            return t === "json" ? `$${params.length}::json` : `$${params.length}`;
          });
          return `(${ph.join(",")})`;
        });
        await client.query(
          `INSERT INTO legacy.${qi(table)} (${names.map(qi).join(",")}) VALUES ${tuples.join(",")}`,
          params,
        );
      }
      totalRows += rows.length;
      console.log(`  legacy.${table}: ${rows.length}`);
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("ROLLED BACK");
    throw e;
  }

  // Verify counts against the source before declaring success.
  let mismatches = 0;
  for (const table of legacy) {
    const [[m]] = await my.query<any[]>(`SELECT COUNT(*) n FROM ${qm(table)}`);
    const { rows: [p] } = await client.query(`SELECT COUNT(*) n FROM legacy.${qi(table)}`);
    if (Number(m.n) !== Number(p.n)) {
      mismatches++;
      console.log(`  FAIL ${table}: ${m.n} vs ${p.n}`);
    }
  }

  await my.end();
  await client.end();
  console.log(`\n${legacy.length} legacy tables, ${totalRows} rows`);
  console.log(mismatches === 0 ? "LEGACY ARCHIVE VERIFIED" : `FAILED: ${mismatches} mismatch(es)`);
  process.exitCode = mismatches === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
