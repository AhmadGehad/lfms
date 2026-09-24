// Takes a full, timestamped snapshot of the live MySQL/TiDB database and every
// object in Forge storage, with checksums. Run this immediately before the
// cutover - a backup taken days earlier is not a rollback for the data that
// changed since.
//
// Writes outside the repository so it can never be committed.
//
//   npx tsx scripts/pg-migration/backup-source.mts [--out <dir>]

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

const DEFAULT_ROOT = path.resolve(process.cwd(), "..", "lfms-migration-backup");

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

const qm = (id: string) => "`" + id.replace(/`/g, "``") + "`";

async function main() {
  const env = loadEnv();
  const outIndex = process.argv.indexOf("--out");
  const root = outIndex !== -1 ? process.argv[outIndex + 1] : DEFAULT_ROOT;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(root, stamp);
  mkdirSync(path.join(dir, "db"), { recursive: true });
  mkdirSync(path.join(dir, "images"), { recursive: true });
  console.log(`backup -> ${dir}`);

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
  // A consistent snapshot so the dump is a single point in time even if the
  // write freeze has not started yet.
  await my.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");

  const [tables] = await my.query<any[]>(
    `SELECT TABLE_NAME n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME`,
  );

  const ddl: string[] = [];
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const { n } of tables) {
    const name = String(n);
    const [[created]] = await my.query<any[]>(`SHOW CREATE TABLE ${qm(name)}`);
    ddl.push(`-- ${name}\n${created["Create Table"]};\n`);
    const [rows] = await my.query<any[]>(`SELECT * FROM ${qm(name)}`);
    data[name] = rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = Buffer.isBuffer(v) ? { __buf: v.toString("base64") } : v;
      }
      return out;
    });
    counts[name] = rows.length;
  }

  // Every object key referenced by the application, from the source of truth.
  const [photoRows] = await my.query<any[]>(
    `SELECT photoUrl p FROM saas_azal_animals WHERE photoUrl IS NOT NULL AND photoUrl <> ''
     UNION SELECT photoUrl FROM animals WHERE photoUrl IS NOT NULL AND photoUrl <> ''
     UNION SELECT storageKey FROM saas_tenant_files WHERE storageKey IS NOT NULL AND storageKey <> ''`,
  );
  await my.end();

  const dataJson = JSON.stringify(data, null, 1);
  writeFileSync(path.join(dir, "db", "ddl.sql"), ddl.join("\n"));
  writeFileSync(path.join(dir, "db", "data.json"), dataJson);
  writeFileSync(path.join(dir, "db", "counts.json"), JSON.stringify(counts, null, 2));
  const dbDigest = createHash("sha256").update(dataJson).digest("hex");
  writeFileSync(path.join(dir, "db", "data.json.sha256"), `${dbDigest}  data.json\n`);

  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`db: ${Object.keys(counts).length} tables, ${totalRows} rows, sha256 ${dbDigest.slice(0, 16)}...`);

  const keys = [...new Set(photoRows.map((r) => String(r.p)))].filter(Boolean);
  const manifest: { key: string; bytes: number; sha256: string; contentType: string | null }[] = [];
  for (const key of keys) {
    const endpoint = new URL("v1/storage/presign/get", `${env.BUILT_IN_FORGE_API_URL}/`);
    endpoint.searchParams.set("path", key);
    const presign = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${env.BUILT_IN_FORGE_API_KEY}` },
    });
    if (!presign.ok) throw new Error(`presign failed (${presign.status}) for ${key}`);
    const { url } = JSON.parse(await presign.text()) as { url: string };
    const object = await fetch(url);
    if (!object.ok) throw new Error(`download failed (${object.status}) for ${key}`);
    const bytes = Buffer.from(await object.arrayBuffer());
    const dest = path.join(dir, "images", key);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
    manifest.push({
      key,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      contentType: object.headers.get("content-type"),
    });
  }
  writeFileSync(path.join(dir, "images", "MANIFEST.json"), JSON.stringify(manifest, null, 2));
  console.log(`images: ${manifest.length} objects, ${manifest.reduce((s, m) => s + m.bytes, 0)} bytes`);
  console.log(`\nBACKUP COMPLETE: ${dir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
