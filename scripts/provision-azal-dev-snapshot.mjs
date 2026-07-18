import "dotenv/config";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

if (process.env.SAAS_AZAL_SNAPSHOT_CONFIRM !== "read-legacy-write-new") {
  throw new Error("Set SAAS_AZAL_SNAPSHOT_CONFIRM=read-legacy-write-new to import the Azal legacy snapshot");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const backupManifestPath = process.env.SAAS_BACKUP_MANIFEST?.trim();
if (!backupManifestPath) throw new Error("SAAS_BACKUP_MANIFEST is required");
await access(backupManifestPath);
const backupManifest = JSON.parse(await readFile(backupManifestPath, "utf8"));
if (!backupManifest.readOnly || typeof backupManifest.archiveSha256 !== "string") {
  throw new Error("SAAS_BACKUP_MANIFEST is not a verified read-only backup manifest");
}

const legacyTables = [
  "user_settings", "role_permissions", "species", "animal_categories", "animal_statuses",
  "groups", "owners", "birth_types", "feed_items", "feed_item_price_history", "vaccines",
  "vaccination_records", "expense_categories", "expense_sub_categories", "system_settings",
  "animals", "animal_status_history", "sales", "lambing_log", "weight_log", "ration_plans",
  "feed_stock_ledger", "expenses", "pregnancy_records", "notifications", "audit_log",
];
const companyScoped = [
  "user_settings", "species", "animal_categories", "animal_statuses", "owners", "birth_types",
  "feed_items", "feed_item_price_history", "vaccines", "expense_categories",
  "expense_sub_categories", "system_settings", "animals", "animal_status_history", "sales",
  "lambing_log", "weight_log", "ration_plans", "feed_stock_ledger", "expenses",
  "pregnancy_records", "notifications", "audit_log", "groups", "vaccination_records",
];
const farmScoped = new Set([
  "groups", "vaccination_records", "animals", "animal_status_history", "sales", "lambing_log",
  "weight_log", "feed_stock_ledger", "feed_item_price_history", "ration_plans", "expenses",
  "pregnancy_records", "notifications",
]);

function connectionOptions(databaseUrl) {
  const url = new URL(databaseUrl);
  const ssl = (url.searchParams.get("ssl") ?? "").toLowerCase();
  if (ssl === "true" || ssl === "verify_identity") {
    url.searchParams.delete("ssl");
    return { uri: url.toString(), ssl: { rejectUnauthorized: true, verifyIdentity: true } };
  }
  return { uri: databaseUrl };
}

function quote(name) {
  return `\`${name.replaceAll("`", "``")}\``;
}

function tenantTable(table) {
  return `saas_azal_${table}`;
}

async function tableColumns(connection, table) {
  const [rows] = await connection.query(
    `SELECT column_name AS name, is_nullable AS nullable, column_default AS defaultValue, extra
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ?
      ORDER BY ordinal_position`,
    [table],
  );
  return rows;
}

async function copyTable(connection, table, companyId, farmId) {
  const sourceColumns = await tableColumns(connection, table);
  const targetColumns = await tableColumns(connection, tenantTable(table));
  const sourceNames = new Set(sourceColumns.map(column => column.name));
  const insertColumns = targetColumns
    .filter(column => !/GENERATED/i.test(column.extra ?? "") && sourceNames.has(column.name))
    .map(column => column.name);
  const selectExpressions = insertColumns.map(column => `legacy.${quote(column)}`);
  const targetNames = new Set(targetColumns.map(column => column.name));
  const add = (column, expression, value) => {
    if (!targetNames.has(column) || sourceNames.has(column)) return;
    insertColumns.push(column);
    selectExpressions.push(expression);
    values.push(value);
  };
  const values = [];
  add("companyId", "?", companyId);
  if (farmScoped.has(table)) add("farmId", "?", farmId);
  add("publicId", `CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('${tenantTable(table)}:', legacy.\`id\`), 256)), 1, 23))`, undefined);
  if (table === "expenses") add("scopeType", "'farm'", undefined);

  const requiredUnfilled = targetColumns.filter(column =>
    !/GENERATED/i.test(column.extra ?? "") &&
    column.nullable === "NO" &&
    column.defaultValue === null &&
    !insertColumns.includes(column.name) &&
    !/auto_increment/i.test(column.extra ?? ""),
  );
  if (requiredUnfilled.length) {
    throw new Error(`Target ${tenantTable(table)} has required unmapped columns: ${requiredUnfilled.map(column => column.name).join(", ")}`);
  }
  if (!insertColumns.length) throw new Error(`No compatible columns for ${table}`);
  await connection.query(
    `INSERT INTO ${quote(tenantTable(table))} (${insertColumns.map(quote).join(",")})
     SELECT ${selectExpressions.join(",")} FROM ${quote(table)} legacy`,
    values.filter(value => value !== undefined),
  );
}

const connection = await mysql.createConnection(connectionOptions(process.env.DATABASE_URL));
try {
  const [[company]] = await connection.query(
    "SELECT `id` FROM `saas_companies` WHERE `slug` = 'azal-farms' LIMIT 1",
  );
  const [[farm]] = await connection.query(
    "SELECT `id` FROM `saas_farms` WHERE `companyId` = ? AND `code` = 'AZAL' LIMIT 1",
    [company?.id],
  );
  if (!company || !farm) throw new Error("Local SaaS Azal company and farm must be bootstrapped first");

  for (const table of legacyTables) {
    const target = tenantTable(table);
    const columns = await tableColumns(connection, target);
    if (!columns.length) throw new Error(`SaaS target table is missing: ${target}`);
    const [[targetCount]] = await connection.query(`SELECT COUNT(*) AS count FROM ${quote(target)}`);
    if (Number(targetCount.count) !== 0) throw new Error(`SaaS target table must be empty: ${target}`);
  }

  await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const table of legacyTables) await copyTable(connection, table, company.id, farm.id);

    for (const table of companyScoped) {
    const target = tenantTable(table);
    const assignments = [
      "`companyId` = ?",
      "`publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT(?, ':', `id`), 256)), 1, 23)))",
    ];
    const values = [company.id, target];
    if (farmScoped.has(table)) {
      assignments.splice(1, 0, "`farmId` = ?");
      values.splice(1, 0, farm.id);
    }
    if (table === "expenses") assignments.push("`scopeType` = 'farm'");
      await connection.query(`UPDATE ${quote(target)} SET ${assignments.join(", ")}`, values);
    }
    await connection.query(`UPDATE ${quote(tenantTable("animal_status_history"))} h JOIN ${quote(tenantTable("animals"))} a ON a.\`id\` = h.\`animalId\` SET h.\`animalPublicIdSnapshot\` = a.\`publicId\`, h.\`animalCodeSnapshot\` = a.\`animalId\``);

    await connection.query(`
    INSERT INTO \`saas_azal_company_category_sequences\` (\`companyId\`,\`categoryId\`,\`animalIdSequence\`,\`lambIdSequence\`)
    SELECT ?, c.\`id\`, c.\`idSequence\`, c.\`lambIdSequence\` FROM ${quote(tenantTable("animal_categories"))} c
    ON DUPLICATE KEY UPDATE \`animalIdSequence\` = GREATEST(\`saas_azal_company_category_sequences\`.\`animalIdSequence\`, VALUES(\`animalIdSequence\`)),
      \`lambIdSequence\` = GREATEST(\`saas_azal_company_category_sequences\`.\`lambIdSequence\`, VALUES(\`lambIdSequence\`))
    `, [company.id]);

    for (const table of legacyTables) {
      const [[sourceCount]] = await connection.query(`SELECT COUNT(*) AS count FROM ${quote(table)}`);
      const [[targetCount]] = await connection.query(`SELECT COUNT(*) AS count FROM ${quote(tenantTable(table))}`);
      if (Number(sourceCount.count) !== Number(targetCount.count)) {
        throw new Error(`Snapshot row-count mismatch for ${table}: legacy=${sourceCount.count}, target=${targetCount.count}`);
      }
    }
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    await connection.commit();
  } catch (error) {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => undefined);
    await connection.rollback();
    throw error;
  }

  const [rows] = await connection.query(
    "SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'saas\\_azal\\_%' ESCAPE '\\\\' ORDER BY table_name",
  );
  const checksum = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  process.stdout.write(`${JSON.stringify({ companyId: company.id, farmId: farm.id, tables: rows, backupManifestPath, manifestSha256: checksum })}\n`);
} finally {
  await connection.end();
}
