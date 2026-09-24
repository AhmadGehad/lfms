// Copies every row from the live MySQL/TiDB database into Postgres.
//
// Deliberately does NOT go through drizzle: drizzle decodes binary() columns as
// utf8 text, which would corrupt the three 32-byte SHA-256 hash columns that
// back auth tokens and invitations.
//
// Runs inside one Postgres transaction. At ~3.4k rows the whole copy takes
// seconds, so it is all-or-nothing: any failure rolls back to an empty
// database and the run is simply repeated.
//
//   PG_DATABASE_URL=postgres://... npx tsx scripts/pg-migration/copy-data.mts [--legacy]

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

const INCLUDE_LEGACY = process.argv.includes("--legacy");

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

const qi = (id: string) => `"${id.replace(/"/g, '""')}"`;

async function connectMysql(url: string) {
  const u = new URL(url);
  return mysql.createConnection({
    host: u.hostname,
    port: Number(u.port) || 4000,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    ssl: { rejectUnauthorized: true },
    charset: "utf8mb4",
    // Strings everywhere: any numeric/date coercion here is silent data loss.
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    timezone: "Z",
    typeCast(field, next) {
      // Raw text for JSON so key order and spacing survive the round trip.
      if (field.type === "JSON") return field.string("utf8");
      // charsetNr 63 is the binary charset - the only columns that must stay
      // Buffers. Matching on type alone would also capture every varchar.
      if ((field as unknown as { characterSet: number }).characterSet === 63) {
        return field.buffer();
      }
      return next();
    },
  });
}

type ColumnInfo = { name: string; type: string };

/** Converts one MySQL value for a specific Postgres column type. */
function convert(value: unknown, pgType: string, column: string): unknown {
  if (value === null || value === undefined) return null;

  switch (pgType) {
    case "boolean":
      // drizzle's MySQL boolean is tinyint(1); mysql2 hands back 0/1.
      if (Buffer.isBuffer(value)) return value.length > 0 && value[0] !== 0x30;
      return Boolean(Number(value));

    case "bytea": {
      if (Buffer.isBuffer(value)) {
        if (value.length !== 32) {
          throw new Error(`${column}: expected 32-byte digest, got ${value.length} bytes`);
        }
        return value;
      }
      throw new Error(`${column}: expected Buffer for bytea, got ${typeof value}`);
    }

    case "json":
    case "jsonb":
      // Passed through as raw text and cast in SQL, so key order and numeric
      // formatting survive byte-for-byte.
      return Buffer.isBuffer(value) ? value.toString("utf8") : String(value);

    case "numeric":
      return String(value); // never parse to float

    case "date": {
      const s = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
      if (s.startsWith("0000-00-00")) {
        console.warn(`  zero date in ${column} -> NULL`);
        return null;
      }
      return s;
    }

    default: {
      const s = Buffer.isBuffer(value) ? value.toString("utf8") : value;
      if (typeof s === "string" && s.includes("\u0000")) {
        throw new Error(`${column}: NUL byte in text value, Postgres cannot store it`);
      }
      return s;
    }
  }
}

async function main() {
  const env = loadEnv();
  const pgUrl = process.env.PG_DATABASE_URL;
  if (!pgUrl) throw new Error("PG_DATABASE_URL is required");

  const my = await connectMysql(sourceDatabaseUrl(env));
  await my.query("SET SESSION time_zone='+00:00'");
  await my.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");

  const client = new pg.Client({ connectionString: pgUrl, ssl: pgTls(pgUrl) });
  await client.connect();
  await client.query("SET TIME ZONE 'UTC'");
  await client.query("BEGIN");

  const summary: { table: string; rows: number }[] = [];

  try {
    // Foreign keys come off for the load and go back on afterwards. This
    // removes any need for a topological order, handles self-references, and
    // the successful re-add is itself the referential-integrity proof.
    const { rows: fks } = await client.query<{ table: string; name: string; def: string }>(`
      SELECT rel.relname AS table, con.conname AS name, pg_get_constraintdef(con.oid) AS def
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = con.connamespace
      WHERE n.nspname = 'public' AND con.contype = 'f'`);
    console.log(`dropping ${fks.length} foreign keys`);
    for (const fk of fks) {
      await client.query(`ALTER TABLE ${qi(fk.table)} DROP CONSTRAINT ${qi(fk.name)}`);
    }

    const { rows: tables } = await client.query<{ name: string }>(`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);

    for (const { name: table } of tables) {
      // Generated columns are read from the target, never hardcoded; Postgres
      // rejects any write to them.
      const { rows: cols } = await client.query<ColumnInfo>(
        `SELECT column_name AS name, data_type AS type
         FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1 AND is_generated='NEVER'
         ORDER BY ordinal_position`,
        [table],
      );

      const [mysqlCols] = await my.query<any[]>(
        // TiDB reports NULL rather than '' for non-generated columns.
        `SELECT COLUMN_NAME cn FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?
           AND (GENERATION_EXPRESSION IS NULL OR GENERATION_EXPRESSION='')`,
        [table],
      );
      const available = new Set(mysqlCols.map((c) => String(c.cn)));
      const usable = cols.filter((c) => available.has(c.name));
      const missing = cols.filter((c) => !available.has(c.name));
      if (missing.length) {
        console.log(`  ${table}: ${missing.map((m) => m.name).join(", ")} absent upstream, left default`);
      }
      if (usable.length === 0) continue;

      const select = usable.map((c) => "`" + c.name + "`").join(",");
      const [rows] = await my.query<any[]>(`SELECT ${select} FROM \`${table}\``);
      if (rows.length === 0) {
        summary.push({ table, rows: 0 });
        continue;
      }

      const colList = usable.map((c) => qi(c.name)).join(",");
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const params: unknown[] = [];
        const tuples = chunk.map((row) => {
          const placeholders = usable.map((c) => {
            params.push(convert(row[c.name], c.type, `${table}.${c.name}`));
            const p = `$${params.length}`;
            // json/jsonb arrive as text and are cast here so the stored bytes
            // match the source exactly.
            return c.type === "json" ? `${p}::json` : c.type === "jsonb" ? `${p}::jsonb` : p;
          });
          return `(${placeholders.join(",")})`;
        });
        await client.query(`INSERT INTO ${qi(table)} (${colList}) VALUES ${tuples.join(",")}`, params);
      }
      summary.push({ table, rows: rows.length });
    }

    console.log(`re-adding ${fks.length} foreign keys`);
    const fkFailures: string[] = [];
    for (const fk of fks) {
      try {
        await client.query(`ALTER TABLE ${qi(fk.table)} ADD CONSTRAINT ${qi(fk.name)} ${fk.def}`);
      } catch (e) {
        fkFailures.push(`${fk.table}.${fk.name}: ${(e as Error).message}`);
      }
    }
    if (fkFailures.length) {
      throw new Error(`${fkFailures.length} foreign key(s) failed to re-add:\n  ` + fkFailures.join("\n  "));
    }

    // Identity sequences stay at 1 after explicit-id inserts. Without this the
    // first production insert dies on a duplicate primary key.
    const { rows: identities } = await client.query<{ table: string; column: string }>(`
      SELECT table_name AS table, column_name AS column
      FROM information_schema.columns
      WHERE table_schema='public' AND is_identity='YES'`);
    for (const id of identities) {
      await client.query(
        `SELECT setval(
           pg_get_serial_sequence($1, $2),
           COALESCE((SELECT MAX(${qi(id.column)}) FROM ${qi(id.table)}), 0) + 1,
           false)`,
        [id.table, id.column],
      );
    }
    console.log(`resynced ${identities.length} identity sequences`);

    await client.query("COMMIT");
    console.log("\nCOMMITTED");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\nROLLED BACK - target left empty");
    throw e;
  } finally {
    await my.end();
    await client.end();
  }

  const total = summary.reduce((a, b) => a + b.rows, 0);
  console.log(`tables: ${summary.length}  rows: ${total}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
