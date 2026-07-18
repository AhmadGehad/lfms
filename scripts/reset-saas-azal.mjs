import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const confirmation = "backup-verified-truncate-saas-data";
if (process.env.SAAS_AZAL_RESET_CONFIRM !== confirmation) {
  throw new Error(`Set SAAS_AZAL_RESET_CONFIRM=${confirmation}`);
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const backupManifestPath = process.env.SAAS_BACKUP_MANIFEST?.trim();
if (!backupManifestPath) throw new Error("SAAS_BACKUP_MANIFEST is required");
await access(backupManifestPath);
const backupManifest = JSON.parse(await readFile(backupManifestPath, "utf8"));
if (!backupManifest.readOnly || typeof backupManifest.archiveSha256 !== "string") {
  throw new Error("SAAS_BACKUP_MANIFEST is not a verified read-only backup manifest");
}

function connectionOptions(databaseUrl) {
  const url = new URL(databaseUrl);
  const ssl = (url.searchParams.get("ssl") ?? "").toLowerCase();
  if (ssl === "true" || ssl === "verify_identity") {
    url.searchParams.delete("ssl");
    return { uri: url.toString(), ssl: { rejectUnauthorized: true, verifyIdentity: true } };
  }
  return { uri: databaseUrl };
}

const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function publicId() {
  let value = "01J";
  for (const byte of randomBytes(23)) value += alphabet[byte % alphabet.length];
  return value.slice(0, 26);
}

const businessTables = [
  "saas_azal_notification_receipts", "saas_azal_audit_log",
  "saas_azal_animal_status_history", "saas_azal_vaccination_records",
  "saas_azal_pregnancy_records", "saas_azal_lambing_log", "saas_azal_weight_log",
  "saas_azal_sales", "saas_azal_expenses", "saas_azal_feed_stock_ledger",
  "saas_azal_feed_item_price_history", "saas_azal_ration_plans", "saas_azal_notifications",
  "saas_azal_animals", "saas_azal_groups", "saas_azal_animal_categories",
  "saas_azal_animal_statuses", "saas_azal_birth_types", "saas_azal_owners",
  "saas_azal_feed_items", "saas_azal_vaccines", "saas_azal_expense_sub_categories",
  "saas_azal_expense_categories", "saas_azal_species", "saas_azal_system_settings",
  "saas_azal_user_settings", "saas_azal_role_permissions",
  "saas_azal_company_category_sequences",
];

// Authentication identities and platform administrator records intentionally
// survive this reset so the existing protected Admin login keeps working.
const controlPlaneTables = [
  "saas_auth_rate_limits", "saas_oauth_states", "saas_tenant_sessions",
  "saas_idempotency_keys", "saas_support_access_approvals", "saas_support_access_grants",
  "saas_tenant_restore_jobs", "saas_deletion_requests", "saas_export_jobs",
  "saas_tenant_files", "saas_background_jobs", "saas_usage_counters",
  "saas_company_branding", "saas_company_feature_overrides", "saas_company_security_policies",
  "saas_company_role_permissions", "saas_farm_memberships", "saas_company_invitations",
  "saas_company_memberships", "saas_company_subscriptions", "saas_farms",
  "saas_legacy_user_links", "saas_companies", "saas_plan_entitlements",
  "saas_subscription_plans", "saas_feature_catalog", "saas_outbox_events", "saas_security_events",
];

const features = [
  ["core", "Core operations", "Essential farm dashboard and workflows", "boolean"],
  ["animals", "Animal management", "Animal records, health, and lifecycle tracking", "boolean"],
  ["breeding", "Breeding", "Breeding, births, and lambing records", "boolean"],
  ["pregnancy", "Pregnancy", "Pregnancy tracking and checkup schedules", "boolean"],
  ["fattening", "Fattening", "Weight progress and fattening workflows", "boolean"],
  ["feed", "Feed management", "Feed items, rations, stock, and consumption", "boolean"],
  ["vaccinations", "Vaccinations", "Vaccines, schedules, and due alerts", "boolean"],
  ["expenses", "Expenses", "Expense tracking and cost categorization", "boolean"],
  ["reporting", "Reporting", "Profitability and operational reports", "boolean"],
  ["sales", "Sales", "Sales records and revenue tracking", "boolean"],
  ["notifications", "Notifications", "Tenant operational notifications", "boolean"],
  ["audit", "Audit log", "Tenant audit history and activity review", "boolean"],
  ["user_management", "User management", "Tenant users, roles, and access control", "boolean"],
  ["configuration", "Configuration", "Farm configuration and reference data", "boolean"],
  ["farm_map", "Farm map", "Farm map and animal location workflows", "boolean"],
  ["data_transfer", "Data transfer", "Tenant data export and import tools", "boolean"],
  ["data_recovery", "Data recovery", "Recycle bin and recovery workflows", "boolean"],
  ["users_limit", "Users limit", "Maximum active company members", "count"],
  ["farms_limit", "Farms limit", "Maximum active farms", "count"],
  ["animals_limit", "Animals limit", "Maximum active animals", "count"],
  ["storage_limit", "Storage limit", "Maximum stored file bytes", "bytes"],
];

const connection = await mysql.createConnection(connectionOptions(process.env.DATABASE_URL));
try {
  const expectedTables = [...businessTables, ...controlPlaneTables];
  const [existingRows] = await connection.query(
    `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name IN (${expectedTables.map(() => "?").join(",")})`,
    expectedTables,
  );
  const existing = new Set(existingRows.map(row => row.name));
  const missing = expectedTables.filter(table => !existing.has(table));
  if (missing.length) throw new Error(`Missing SaaS tables: ${missing.join(", ")}`);

  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    await connection.beginTransaction();
    for (const table of [...businessTables, ...controlPlaneTables]) {
      if (!table.startsWith("saas_")) throw new Error(`Unsafe reset target: ${table}`);
      await connection.query(`DELETE FROM \`${table}\``);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  }

  await connection.beginTransaction();
  try {
    const [platformAdmins] = await connection.query(
      "SELECT `id` FROM `saas_platform_administrators` WHERE `status` = 'active' ORDER BY `id` LIMIT 1",
    );
    const platformAdminId = platformAdmins[0]?.id ?? null;

    for (const [code, name, description, limitUnit] of features) {
      await connection.query(
        `INSERT INTO \`saas_feature_catalog\`
          (\`publicId\`,\`code\`,\`name\`,\`description\`,\`status\`,\`disabledDataMode\`,\`limitUnit\`)
         VALUES (?,?,?,?, 'active','read_only',?)`,
        [publicId(), code, name, description, limitUnit],
      );
    }
    const [featureRows] = await connection.query(
      "SELECT `id`, `code` FROM `saas_feature_catalog` WHERE `status` = 'active' ORDER BY `id`",
    );
    if (featureRows.length !== features.length) throw new Error("Feature catalog seeding did not complete");

    const planPublicId = publicId();
    const [planResult] = await connection.query(
      `INSERT INTO \`saas_subscription_plans\`
        (\`publicId\`,\`code\`,\`name\`,\`description\`,\`planVersion\`,\`status\`,\`priceMonthly\`,\`priceYearly\`,\`currency\`,\`createdByPlatformAdministratorId\`,\`publishedAt\`)
       VALUES (?,?,?,?,1,'active','0.00','0.00','USD',?,CURRENT_TIMESTAMP)`,
      [planPublicId, "azal-full-access", "Azal Full Access", "All LFMS features and unlimited tenant limits. Prices can be edited from the Admin panel.", platformAdminId],
    );
    const planId = Number(planResult.insertId);
    for (const feature of featureRows) {
      await connection.query(
        "INSERT INTO `saas_plan_entitlements` (`subscriptionPlanId`,`featureId`,`accessMode`,`limitValue`) VALUES (?,?,'enabled',NULL)",
        [planId, feature.id],
      );
    }

    const companyPublicId = publicId();
    const [companyResult] = await connection.query(
      "INSERT INTO `saas_companies` (`publicId`,`name`,`slug`,`lifecycleStatus`) VALUES (?,?,'azal-farms','provisioning')",
      [companyPublicId, "Azal Farms"],
    );
    const companyId = Number(companyResult.insertId);
    const farmPublicId = publicId();
    const [farmResult] = await connection.query(
      "INSERT INTO `saas_farms` (`publicId`,`companyId`,`name`,`code`,`status`,`timezone`) VALUES (?,?,?,'AZAL','active','Africa/Cairo')",
      [farmPublicId, companyId, "Azal Main Farm"],
    );
    const farmId = Number(farmResult.insertId);
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 10);
    await connection.query(
      `INSERT INTO \`saas_company_subscriptions\`
        (\`publicId\`,\`companyId\`,\`subscriptionPlanId\`,\`planSnapshot\`,\`status\`,\`periodStart\`,\`periodEnd\`,\`isCurrent\`,\`changedByPlatformAdministratorId\`)
       VALUES (?,?,?,JSON_OBJECT('publicId',?,'code','azal-full-access','name','Azal Full Access','planVersion',1,'currency','USD','priceMonthly','0.00','priceYearly','0.00','allFeatures',true),'active',?,?,TRUE,?)`,
      [publicId(), companyId, planId, planPublicId, periodStart, periodEnd, platformAdminId],
    );
    await connection.commit();
    const manifest = createHash("sha256").update(JSON.stringify({ companyId, farmId, planId, featureCount: featureRows.length, backup: backupManifest.archiveSha256 })).digest("hex");
    process.stdout.write(`${JSON.stringify({ companyId, companyPublicId, farmId, farmPublicId, planId, planPublicId, featureCount: featureRows.length, backupManifestPath, manifestSha256: manifest })}\n`);
  } catch (error) {
    await connection.rollback();
    throw error;
  }
} finally {
  await connection.end();
}
