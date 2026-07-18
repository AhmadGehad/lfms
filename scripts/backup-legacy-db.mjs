import "dotenv/config";
import { createHash } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import mysql from "mysql2/promise";

if (process.env.LEGACY_BACKUP_CONFIRM !== "read-only") {
  throw new Error("Set LEGACY_BACKUP_CONFIRM=read-only to run a legacy backup");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

function connectionOptions(databaseUrl) {
  const url = new URL(databaseUrl);
  const ssl = (url.searchParams.get("ssl") ?? "").toLowerCase();
  if (ssl === "true" || ssl === "verify_identity") {
    url.searchParams.delete("ssl");
    return { uri: url.toString(), ssl: { rejectUnauthorized: true, verifyIdentity: true } };
  }
  return { uri: databaseUrl };
}

function tableName(row) {
  return String(Object.values(row)[0]);
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (Buffer.isBuffer(value)) return `X'${value.toString("hex")}'`;
  if (value instanceof Date) return mysql.escape(value.toISOString().slice(0, 23).replace("T", " "));
  return mysql.escape(value);
}

const backupRoot = path.resolve("backups");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = path.join(backupRoot, `legacy-read-only-${timestamp}.sql.gz`);
await fs.mkdir(backupRoot, { recursive: true });

const connection = await mysql.createConnection(connectionOptions(process.env.DATABASE_URL));
const hash = createHash("sha256");
const sink = createWriteStream(outputPath, { flags: "wx", mode: 0o600 });
const gzip = createGzip({ level: 9 });
gzip.on("data", chunk => hash.update(chunk));
const completed = pipeline(gzip, sink);

function write(value) {
  if (!gzip.write(value)) return new Promise(resolve => gzip.once("drain", resolve));
  return Promise.resolve();
}

try {
  // TiDB rejects MySQL's SET TRANSACTION READ ONLY syntax. This script still
  // executes only metadata and SELECT statements against the legacy database.
  await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
  const [tableRows] = await connection.query("SHOW TABLES");
  const tables = tableRows.map(tableName).sort();
  await write("-- LFMS legacy read-only backup\n");
  await write(`-- Created at ${new Date().toISOString()}\n`);
  await write("SET FOREIGN_KEY_CHECKS=0;\n\n");

  const manifest = [];
  for (const table of tables) {
    const escapedTable = `\`${table.replaceAll("`", "``")}\``;
    const [[createRow]] = await connection.query(`SHOW CREATE TABLE ${escapedTable}`);
    const createStatement = String(Object.values(createRow)[1]);
    const [rows] = await connection.query(`SELECT * FROM ${escapedTable}`);
    await write(`DROP TABLE IF EXISTS ${escapedTable};\n${createStatement};\n`);
    if (rows.length) {
      const columns = Object.keys(rows[0]);
      const columnList = columns.map(column => `\`${column.replaceAll("`", "``")}\``).join(",");
      for (const row of rows) {
        const values = columns.map(column => sqlValue(row[column])).join(",");
        await write(`INSERT INTO ${escapedTable} (${columnList}) VALUES (${values});\n`);
      }
    }
    await write("\n");
    manifest.push({ table, rows: rows.length });
  }
  await write("SET FOREIGN_KEY_CHECKS=1;\n");
  gzip.end();
  await completed;
  await connection.commit();
  const stat = await fs.stat(outputPath);
  const manifestPath = outputPath.replace(/\.sql\.gz$/, ".manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify({
    createdAt: new Date().toISOString(),
    source: "legacy database",
    readOnly: true,
    archive: path.basename(outputPath),
    archiveBytes: stat.size,
    archiveSha256: hash.digest("hex"),
    tables: manifest,
  }, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ outputPath, manifestPath, tables: manifest.length, archiveBytes: stat.size })}\n`);
} catch (error) {
  gzip.destroy();
  await completed.catch(() => undefined);
  await connection.rollback().catch(() => undefined);
  await fs.unlink(outputPath).catch(() => undefined);
  throw error;
} finally {
  await connection.end();
}
