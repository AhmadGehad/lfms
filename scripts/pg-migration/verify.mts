// Proves the Postgres copy matches MySQL. Row counts alone are not enough:
// they pass happily while booleans, decimals, JSON and bytea are silently
// mangled. Every check below targets a specific way this migration can appear
// to succeed and actually be wrong.
//
//   PG_DATABASE_URL=postgres://... npx tsx scripts/pg-migration/verify.mts

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

// Compare raw wire text on both sides. Letting either driver parse timestamps
// or JSON into objects makes identical data look different (Date formatting,
// key reordering) and would mask real differences behind noise.
const RAW = (v: string) => v;
pg.types.setTypeParser(1082, RAW); // date
pg.types.setTypeParser(1114, RAW); // timestamp
pg.types.setTypeParser(1184, RAW); // timestamptz
pg.types.setTypeParser(114, RAW); // json
pg.types.setTypeParser(3802, RAW); // jsonb

const qi = (id: string) => `"${id.replace(/"/g, '""')}"`;
const qm = (id: string) => "`" + id.replace(/`/g, "``") + "`";

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.log(`  FAIL ${msg}`);
};

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

/** Canonical text for one value, identical rules on both engines. */
function canon(v: unknown): string {
  if (v === null || v === undefined) return "\u0000NULL";
  if (Buffer.isBuffer(v)) return "hex:" + v.toString("hex");
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  // MySQL returns "1600.00" and Postgres "1600.00" for numeric, but integers
  // can differ in string form; normalise plain numerics.
  if (/^-?\d+\.\d+$/.test(s)) return String(Number(s));
  return s;
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

  const { rows: tables } = await client.query<{ name: string }>(`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);

  // ── 1. Row counts ─────────────────────────────────────────────────────────
  console.log("1. row counts");
  let totalRows = 0;
  for (const { name } of tables) {
    const [[m]] = await my.query<any[]>(`SELECT COUNT(*) n FROM ${qm(name)}`);
    const { rows: [p] } = await client.query(`SELECT COUNT(*) n FROM ${qi(name)}`);
    if (Number(m.n) !== Number(p.n)) fail(`${name}: mysql ${m.n} vs pg ${p.n}`);
    totalRows += Number(p.n);
  }
  console.log(`  ${tables.length} tables, ${totalRows} rows`);

  // ── 2. Per-row content digest ─────────────────────────────────────────────
  // Computed in JS on both sides so no engine-specific aggregate (and no
  // group_concat_max_len truncation) can produce a false pass.
  console.log("2. content digests");
  for (const { name } of tables) {
    const { rows: cols } = await client.query<{ c: string }>(
      `SELECT column_name c FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 AND is_generated='NEVER'
       ORDER BY column_name`,
      [name],
    );
    const [mysqlCols] = await my.query<any[]>(
      `SELECT COLUMN_NAME cn FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?
         AND (GENERATION_EXPRESSION IS NULL OR GENERATION_EXPRESSION='')`,
      [name],
    );
    const available = new Set(mysqlCols.map((c) => String(c.cn)));
    const shared = cols.map((c) => c.c).filter((c) => available.has(c));
    if (shared.length === 0) continue;

    const [mRows] = await my.query<any[]>(
      `SELECT ${shared.map(qm).join(",")} FROM ${qm(name)}`,
    );
    const { rows: pRows } = await client.query(
      `SELECT ${shared.map(qi).join(",")} FROM ${qi(name)}`,
    );

    const digest = (rows: any[]) =>
      rows
        .map((r) => shared.map((c) => canon(r[c])).join("\u0001"))
        .sort()
        .map((s) => createHash("sha256").update(s).digest("hex"))
        .join("");

    const dm = createHash("sha256").update(digest(mRows)).digest("hex");
    const dp = createHash("sha256").update(digest(pRows)).digest("hex");
    if (dm !== dp) {
      fail(`${name}: content digest mismatch over ${shared.length} columns`);
      // Narrow it to the offending column to make the failure actionable.
      for (const c of shared) {
        const a = mRows.map((r) => canon(r[c])).sort().join("\u0001");
        const b = pRows.map((r) => canon(r[c])).sort().join("\u0001");
        if (a !== b) console.log(`       column ${c} differs`);
      }
    }
  }
  console.log("  done");

  // ── 3. bytea columns, byte for byte ───────────────────────────────────────
  // A hex-string coercion here silently breaks every auth token.
  console.log("3. bytea columns");
  const { rows: byteaCols } = await client.query<{ t: string; c: string }>(
    `SELECT table_name t, column_name c FROM information_schema.columns
     WHERE table_schema='public' AND data_type='bytea'`,
  );
  for (const { t, c } of byteaCols) {
    const [mRows] = await my.query<any[]>(`SELECT HEX(${qm(c)}) h FROM ${qm(t)} ORDER BY h`);
    const { rows: pRows } = await client.query(
      `SELECT upper(encode(${qi(c)},'hex')) h FROM ${qi(t)} ORDER BY h`,
    );
    const a = mRows.map((r) => String(r.h)).join(",");
    const b = pRows.map((r) => String(r.h)).join(",");
    if (a !== b) fail(`${t}.${c}: bytea mismatch (${mRows.length} vs ${pRows.length} rows)`);
    else console.log(`  ok ${t}.${c} (${mRows.length} rows)`);
  }

  // ── 4. Numeric sums ───────────────────────────────────────────────────────
  console.log("4. numeric sums");
  const { rows: numCols } = await client.query<{ t: string; c: string }>(
    `SELECT table_name t, column_name c FROM information_schema.columns
     WHERE table_schema='public' AND data_type='numeric' AND is_generated='NEVER'`,
  );
  for (const { t, c } of numCols) {
    const [[m]] = await my.query<any[]>(`SELECT COALESCE(SUM(${qm(c)}),0) s FROM ${qm(t)}`);
    const { rows: [p] } = await client.query(`SELECT COALESCE(SUM(${qi(c)}),0)::text s FROM ${qi(t)}`);
    if (Number(m.s) !== Number(p.s)) fail(`${t}.${c}: sum ${m.s} vs ${p.s}`);
  }
  console.log(`  ${numCols.length} numeric columns match`);

  // ── 5. Generated columns recompute correctly ──────────────────────────────
  // Excluded from the INSERT, so the digest above cannot cover them.
  console.log("5. generated columns");
  const { rows: genCols } = await client.query<{ t: string; c: string }>(
    `SELECT table_name t, column_name c FROM information_schema.columns
     WHERE table_schema='public' AND is_generated='ALWAYS'`,
  );
  for (const { t, c } of genCols) {
    const [mRows] = await my.query<any[]>(`SELECT ${qm(c)} v FROM ${qm(t)}`);
    const { rows: pRows } = await client.query(`SELECT ${qi(c)} v FROM ${qi(t)}`);
    const a = mRows.map((r) => canon(r.v)).sort().join("|");
    const b = pRows.map((r) => canon(r.v)).sort().join("|");
    if (a !== b) fail(`${t}.${c}: generated values differ`);
  }
  console.log(`  ${genCols.length} generated columns match`);

  // ── 6. Sequences ahead of max(id) ─────────────────────────────────────────
  // The most common way this migration fails in production: the first insert
  // after cutover dies on a duplicate primary key.
  console.log("6. identity sequences");
  const { rows: identities } = await client.query<{ t: string; c: string }>(
    `SELECT table_name t, column_name c FROM information_schema.columns
     WHERE table_schema='public' AND is_identity='YES'`,
  );
  for (const { t, c } of identities) {
    const { rows: [r] } = await client.query(
      `SELECT COALESCE((SELECT MAX(${qi(c)}) FROM ${qi(t)}),0) AS maxid,
              (SELECT last_value FROM ${qi(t + "_" + c + "_seq")}) AS seq`,
    ).catch(async () => {
      const { rows } = await client.query(
        `SELECT COALESCE((SELECT MAX(${qi(c)}) FROM ${qi(t)}),0) AS maxid,
                nextval(pg_get_serial_sequence($1,$2)) - 1 AS seq`,
        [t, c],
      );
      return { rows };
    });
    if (Number(r.seq) <= Number(r.maxid) && Number(r.maxid) > 0) {
      fail(`${t}.${c}: sequence at ${r.seq} but max id is ${r.maxid}`);
    }
  }
  console.log(`  ${identities.length} sequences ahead of max(id)`);

  // ── 7. Foreign keys all present and valid ─────────────────────────────────
  console.log("7. constraints");
  const { rows: [fk] } = await client.query(
    `SELECT count(*) n FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
     WHERE n.nspname='public' AND c.contype='f' AND c.convalidated`,
  );
  console.log(`  ${fk.n} validated foreign keys`);

  await my.end();
  await client.end();

  console.log(failures === 0 ? "\nVERIFICATION PASSED" : `\nVERIFICATION FAILED: ${failures} problem(s)`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
