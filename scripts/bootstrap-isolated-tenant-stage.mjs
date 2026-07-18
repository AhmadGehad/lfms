import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stageUrl = process.env.ISOLATED_STAGE_DATABASE_URL;

if (process.env.ISOLATED_STAGE_CONFIRM !== "new-saas-tables-only") {
  throw new Error("Set ISOLATED_STAGE_CONFIRM=new-saas-tables-only");
}
if (!stageUrl) throw new Error("ISOLATED_STAGE_DATABASE_URL is required");

const parsed = new URL(stageUrl);
const database = decodeURIComponent(parsed.pathname.slice(1));
if (parsed.hostname !== "127.0.0.1" || parsed.port !== "3307" || !database.startsWith("lfms_tenant_isolation_")) {
  throw new Error("Isolated stage must use 127.0.0.1:3307 and an lfms_tenant_isolation_* database");
}

const businessTables = [
  "user_settings", "role_permissions", "species", "animal_categories",
  "animal_statuses", "groups", "owners", "birth_types", "feed_items",
  "feed_item_price_history", "vaccines", "vaccination_records",
  "expense_categories", "expense_sub_categories", "system_settings",
  "animals", "animal_status_history", "sales", "lambing_log", "weight_log",
  "ration_plans", "feed_stock_ledger", "expenses", "pregnancy_records",
  "notifications", "audit_log", "company_category_sequences", "notification_receipts",
];
const sharedTables = [
  "users", "companies", "farms", "company_memberships", "background_jobs",
  "tenant_files", "export_jobs", "platform_administrators", "support_access_grants",
  "outbox_events", "security_events", "deletion_requests", "tenant_restore_jobs",
];
const mapping = new Map([
  ...businessTables.map(table => [table, `saas_azal_${table}`]),
  ...sharedTables.map(table => [table, `saas_${table}`]),
]);

const migrationFiles = [
  "0001_lush_smiling_tiger.sql",
  "0002_useful_mordo.sql",
  "0002_auto_stage.sql",
  "0003_plain_nocturne.sql",
  "0003_fix_ration_quantities.sql",
  "0004_owners_and_outstanding.sql",
  "0005_owner_perf_indexes.sql",
  "0006_herd_allocation.sql",
  "0007_animal_photo.sql",
  "0008_birth_value.sql",
  "0009_group_coordinates.sql",
  "0010_group_map_shape.sql",
  "0011_group_color.sql",
  "0012_booster_due_date.sql",
  "0013_role_permissions.sql",
  "0014_vaccine_notify_before.sql",
  "0015_birth_animal_integrity.sql",
  "0016_pregnancy_tracking.sql",
  "0017_acquisition_weight_history.sql",
  "0018_audit_revert.sql",
  "0019_user_settings.sql",
  "0020_feed_indexes.sql",
  "0021_feed_item_lookup_indexes.sql",
  "0022_ready_to_sell_threshold.sql",
  "0023_move_ready_to_sell_to_category.sql",
  "0025_tenant_scope_expand.sql",
  "0027_tenant_scope_contract.sql",
];

function splitSql(source) {
  const statements = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      current += character;
      if (character === "\\") {
        current += source[index + 1] ?? "";
        index += 1;
      } else if (character === quote) quote = null;
      continue;
    }
    if (["'", '"', "`"].includes(character)) {
      quote = character;
      current += character;
      continue;
    }
    if (character === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function targetTable(statement) {
  return statement.match(/^\s*(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|ALTER\s+TABLE|DROP\s+TABLE|UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+`?([a-zA-Z0-9_]+)/im)?.[1] ?? null;
}

function isLegacyUserTarget(statement) {
  return /\busers\b/i.test(statement);
}

function isControlPlaneTarget(statement) {
  const target = targetTable(statement);
  return target !== null && sharedTables.includes(target);
}

function rewrite(statement) {
  let result = statement;
  for (const [from, to] of mapping) {
    result = result.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  }
  return result;
}

function assertSaasOnly(statement) {
  const target = targetTable(statement);
  if (target && !target.startsWith("saas_")) {
    throw new Error(`Unsafe non-SaaS stage DDL: ${statement.slice(0, 160)}`);
  }
  for (const match of statement.matchAll(/(?:REFERENCES|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+`?([a-zA-Z0-9_]+)/gi)) {
    if (!match[1].startsWith("saas_")) throw new Error(`Legacy reference rejected: ${match[1]}`);
  }
}

async function execute(connection, statement) {
  try {
    await connection.query(statement);
  } catch (error) {
    if (["ER_DUP_FIELDNAME", "ER_DUP_KEYNAME", "ER_FK_DUP_NAME", "ER_TABLE_EXISTS_ERROR", "ER_CANT_DROP_FIELD_OR_KEY"].includes(error?.code)) return;
    if (error?.code === "ER_PARSE_ERROR" && /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i.test(statement)) {
      return execute(connection, statement.replace(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+/i, "ADD COLUMN "));
    }
    if (error?.code === "ER_PARSE_ERROR" && /CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/i.test(statement)) {
      return execute(connection, statement.replace(/(CREATE\s+(?:UNIQUE\s+)?INDEX)\s+IF\s+NOT\s+EXISTS\s+/i, "$1 "));
    }
    throw error;
  }
}

const connection = await mysql.createConnection(stageUrl);
try {
  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  const applied = [];
  for (const file of migrationFiles) {
    if (file === "0027_tenant_scope_contract.sql") {
      const sequences = `
        CREATE TABLE IF NOT EXISTS saas_azal_company_category_sequences (
          companyId int NOT NULL,
          categoryId int NOT NULL,
          animalIdSequence int NOT NULL DEFAULT 0,
          lambIdSequence int NOT NULL DEFAULT 0,
          version int NOT NULL DEFAULT 1,
          updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (companyId, categoryId)
        )`;
      assertSaasOnly(sequences);
      await execute(connection, sequences);
      const receipts = `
        CREATE TABLE IF NOT EXISTS saas_azal_notification_receipts (
          id bigint AUTO_INCREMENT NOT NULL,
          companyId int NOT NULL,
          notificationId int NOT NULL,
          companyMembershipId int NOT NULL,
          deliveredAt timestamp NULL,
          readAt timestamp NULL,
          createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY saas_azal_notification_receipts_recipient_unique (notificationId, companyMembershipId)
        )`;
      assertSaasOnly(receipts);
      await execute(connection, receipts);
    }
    const source = await readFile(path.join(root, "drizzle", file), "utf8");
    for (const raw of splitSql(source.replaceAll("--> statement-breakpoint", ";"))) {
      if (isLegacyUserTarget(raw) || isControlPlaneTarget(raw)) continue;
      const statement = rewrite(raw);
      assertSaasOnly(statement);
      await execute(connection, statement);
    }
    applied.push(file);
  }
  await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  const [tables] = await connection.query(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME",
  );
  const names = tables.map(row => row.name);
  if (names.some(name => !name.startsWith("saas_"))) throw new Error("Stage contains a non-SaaS table");
  process.stdout.write(`${JSON.stringify({ database, applied, tables: names })}\n`);
} finally {
  await connection.end();
}
