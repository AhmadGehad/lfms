import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RETIRED_SHARED_TABLE_PLAN = [
  "The shared-table tenancy migration plan is retired.",
  "It alters and backfills legacy LFMS production tables, which is forbidden.",
  "No SQL was executed. Use the additive sidecar rollout in docs/LEGACY_IMMUTABILITY.md.",
].join(" ");
const migrationFiles = [
  "drizzle/0024_saas_control_plane.sql",
  "drizzle/0025_tenant_scope_expand.sql",
  "drizzle/0026_legacy_azal_backfill.sql",
  "drizzle/0027_tenant_scope_contract.sql",
  "drizzle/0028_lifecycle_processors.sql",
  "drizzle/0029_secure_company_invitations.sql",
  "drizzle/0030_platform_administrator_permissions.sql",
  "drizzle/0031_subscription_plan_version.sql",
];
const rollbackFiles = [
  "drizzle/rollback/0031_subscription_plan_version.sql",
  "drizzle/rollback/0030_platform_administrator_permissions.sql",
  "drizzle/rollback/0029_secure_company_invitations.sql",
  "drizzle/rollback/0028_lifecycle_processors.sql",
  "drizzle/rollback/0027_tenant_scope_contract.sql",
  "drizzle/rollback/0026_legacy_azal_backfill.sql",
  "drizzle/rollback/0025_tenant_scope_expand.sql",
  "drizzle/rollback/0024_saas_control_plane.sql",
];
const legacyTables = [
  "users", "user_settings", "species", "animal_categories", "animal_statuses",
  "groups", "owners", "birth_types", "feed_items", "feed_item_price_history",
  "vaccines", "vaccination_records", "expense_categories", "expense_sub_categories",
  "system_settings", "animals", "animal_status_history", "sales", "lambing_log",
  "weight_log", "ration_plans", "feed_stock_ledger", "expenses",
  "pregnancy_records", "notifications", "audit_log",
];
const tenantTables = legacyTables.filter(table => !["users"].includes(table));
const farmRequiredTables = [
  "groups", "animals", "animal_status_history", "sales", "lambing_log", "weight_log",
  "feed_stock_ledger", "vaccination_records", "pregnancy_records",
];
const executionId = `01J${randomBytes(12).toString("hex").slice(0, 23)}`;
const snapshotBatchSize = 1_000;
const snapshotColumnExclusions = new Map([
  // This nullable placeholder was introduced before tenancy and is intentionally backfilled.
  ["user_settings", new Set(["companyId"])],
]);
const duplicatePreflightChecks = [
  ["active species name", "SELECT LOWER(`name`) FROM `species` WHERE `deletedAt` IS NULL GROUP BY LOWER(`name`) HAVING COUNT(*) > 1"],
  ["active category name", "SELECT LOWER(`name`) FROM `animal_categories` WHERE `deletedAt` IS NULL GROUP BY LOWER(`name`) HAVING COUNT(*) > 1"],
  ["active category prefix", "SELECT UPPER(`idPrefix`) FROM `animal_categories` WHERE `deletedAt` IS NULL GROUP BY UPPER(`idPrefix`) HAVING COUNT(*) > 1"],
  ["active status name", "SELECT LOWER(`name`) FROM `animal_statuses` WHERE `deletedAt` IS NULL GROUP BY LOWER(`name`) HAVING COUNT(*) > 1"],
  ["active group code", "SELECT UPPER(`groupCode`) FROM `groups` WHERE `deletedAt` IS NULL GROUP BY UPPER(`groupCode`) HAVING COUNT(*) > 1"],
  ["active birth type name", "SELECT LOWER(`name`) FROM `birth_types` WHERE `deletedAt` IS NULL GROUP BY LOWER(`name`) HAVING COUNT(*) > 1"],
  ["active feed item name", "SELECT LOWER(`name`) FROM `feed_items` WHERE `deletedAt` IS NULL GROUP BY LOWER(`name`) HAVING COUNT(*) > 1"],
  ["active vaccine name", "SELECT LOWER(`name`) FROM `vaccines` WHERE `deletedAt` IS NULL GROUP BY LOWER(`name`) HAVING COUNT(*) > 1"],
  ["active expense category name", "SELECT LOWER(`name`) FROM `expense_categories` WHERE `deletedAt` IS NULL GROUP BY LOWER(`name`) HAVING COUNT(*) > 1"],
  ["expense subcategory name per parent", "SELECT `categoryId`, LOWER(`name`) FROM `expense_sub_categories` GROUP BY `categoryId`, LOWER(`name`) HAVING COUNT(*) > 1"],
  ["active animal code", "SELECT UPPER(`animalId`) FROM `animals` WHERE `deletedAt` IS NULL GROUP BY UPPER(`animalId`) HAVING COUNT(*) > 1"],
  ["active lamb code", "SELECT UPPER(`lambId`) FROM `lambing_log` WHERE `deletedAt` IS NULL GROUP BY UPPER(`lambId`) HAVING COUNT(*) > 1"],
  ["active pregnancy per animal", "SELECT `animalId` FROM `pregnancy_records` WHERE `status` = 'active' AND `deletedAt` IS NULL GROUP BY `animalId` HAVING COUNT(*) > 1"],
  ["sale per animal", "SELECT `animalId` FROM `sales` GROUP BY `animalId` HAVING COUNT(*) > 1"],
  ["weight per non-null session and animal", "SELECT `sessionId`, `animalId` FROM `weight_log` WHERE `sessionId` IS NOT NULL GROUP BY `sessionId`, `animalId` HAVING COUNT(*) > 1"],
];

const relationshipChecks = [
  ["user settings user", "user_settings", ["userId"], "users", ["id"]],
  ["category species", "animal_categories", ["speciesId"], "species", ["id"]],
  ["category auto-stage target", "animal_categories", ["autoStageTargetCategoryId"], "animal_categories", ["id"]],
  ["group species", "groups", ["speciesId"], "species", ["id"]],
  ["group category", "groups", ["categoryId"], "animal_categories", ["id"]],
  ["feed price item", "feed_item_price_history", ["feedItemId"], "feed_items", ["id"]],
  ["vaccination animal", "vaccination_records", ["animalId"], "animals", ["id"]],
  ["vaccination vaccine", "vaccination_records", ["vaccineId"], "vaccines", ["id"]],
  ["expense subcategory parent", "expense_sub_categories", ["categoryId"], "expense_categories", ["id"]],
  ["animal species", "animals", ["speciesId"], "species", ["id"]],
  ["animal category", "animals", ["categoryId"], "animal_categories", ["id"]],
  ["animal group", "animals", ["groupId"], "groups", ["id"]],
  ["animal status", "animals", ["statusId"], "animal_statuses", ["id"]],
  ["animal owner", "animals", ["ownerId"], "owners", ["id"]],
  ["animal dam", "animals", ["damId"], "animals", ["id"]],
  ["animal sire", "animals", ["sireId"], "animals", ["id"]],
  ["history previous status", "animal_status_history", ["previousStatusId"], "animal_statuses", ["id"]],
  ["history new status", "animal_status_history", ["newStatusId"], "animal_statuses", ["id"]],
  ["sale animal", "sales", ["animalId"], "animals", ["id"]],
  ["lamb dam", "lambing_log", ["damId"], "animals", ["id"]],
  ["lamb sire", "lambing_log", ["sireId"], "animals", ["id"]],
  ["lamb species", "lambing_log", ["speciesId"], "species", ["id"]],
  ["lamb category", "lambing_log", ["categoryId"], "animal_categories", ["id"]],
  ["lamb group", "lambing_log", ["groupId"], "groups", ["id"]],
  ["lamb birth type", "lambing_log", ["birthTypeId"], "birth_types", ["id"]],
  ["lamb promoted animal", "lambing_log", ["promotedHeadId"], "animals", ["id"]],
  ["weight animal", "weight_log", ["animalId"], "animals", ["id"]],
  ["ration category", "ration_plans", ["categoryId"], "animal_categories", ["id"]],
  ["ration feed item", "ration_plans", ["feedItemId"], "feed_items", ["id"]],
  ["stock feed item", "feed_stock_ledger", ["feedItemId"], "feed_items", ["id"]],
  ["expense category", "expenses", ["categoryId"], "expense_categories", ["id"]],
  ["expense subcategory", "expenses", ["subCategoryId"], "expense_sub_categories", ["id"]],
  ["expense animal", "expenses", ["headId"], "animals", ["id"]],
  ["pregnancy animal", "pregnancy_records", ["animalId"], "animals", ["id"]],
  ["pregnancy sire", "pregnancy_records", ["sireId"], "animals", ["id"]],
  ["pregnancy outcome", "pregnancy_records", ["outcomeLambingLogId"], "lambing_log", ["id"]],
  ["notification recipient", "notifications", ["companyId", "userId"], "company_memberships", ["companyId", "userId"]],
];

function splitSql(source) {
  const statements = [];
  let current = "";
  let quote = null;
  let lineComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (!quote && char === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (quote) {
      current += char;
      if (char === "\\") {
        current += source[index + 1] ?? "";
        index += 1;
      } else if (char === quote) {
        if (source[index + 1] === quote) {
          current += source[index + 1];
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function quoteIdentifier(value) {
  return `\`${String(value).replaceAll("`", "``")}\``;
}

function normalizeTarget(urlString) {
  const url = new URL(urlString);
  return {
    hostname: url.hostname.toLowerCase(),
    port: url.port || "3306",
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

function migrationConnectionOptions(urlString, requireVerifiedTls) {
  const url = new URL(urlString);
  const ssl = (url.searchParams.get("ssl") ?? "").toLowerCase();
  const sslMode = (url.searchParams.get("ssl-mode") ?? "").toUpperCase();
  const verifiedTlsRequested = ssl === "true" || ssl === "verify_identity" ||
    sslMode === "VERIFY_CA" || sslMode === "VERIFY_IDENTITY";
  if (requireVerifiedTls && !verifiedTlsRequested) {
    throw new Error("production migration database connection must require verified TLS");
  }
  if (!verifiedTlsRequested) return urlString;
  url.searchParams.delete("ssl");
  url.searchParams.delete("ssl-mode");
  return {
    uri: url.toString(),
    ssl: { rejectUnauthorized: true, verifyIdentity: true },
  };
}

function targetsEqual(left, right) {
  return Object.keys(left).every(key => left[key] === right[key]);
}

function canonicalValue(value) {
  if (value === null || value === undefined) return value ?? null;
  if (Buffer.isBuffer(value)) return { type: "buffer", value: value.toString("base64") };
  if (value instanceof Date) return { type: "date", value: value.toISOString() };
  if (typeof value === "bigint") return { type: "bigint", value: value.toString() };
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

async function readGlobalVariable(connection, name) {
  const [rows] = await connection.query("SHOW GLOBAL VARIABLES LIKE ?", [name]);
  return rows[0]?.Value ?? rows[0]?.VALUE;
}

async function assertDatabaseCapabilities(connection) {
  const [[runtime]] = await connection.query(
    "SELECT VERSION() AS version_, @@foreign_key_checks AS foreignKeyChecks, @@sql_mode AS sqlMode",
  );
  const match = String(runtime.version_).match(/TiDB-v(\d+)\.(\d+)\.(\d+)/i);
  if (!match || Number(match[1]) < 8 || (Number(match[1]) === 8 && Number(match[2]) < 5)) {
    throw new Error(`migration requires TiDB 8.5 or newer; found ${runtime.version_}`);
  }
  if (Number(runtime.foreignKeyChecks) !== 1) {
    throw new Error("foreign_key_checks must be ON for the complete migration and application runtime");
  }
  if (!String(runtime.sqlMode).split(",").some(mode => mode.startsWith("STRICT_"))) {
    throw new Error("strict SQL mode is required to prevent silent migration truncation");
  }

  const foreignKeysEnabled = await readGlobalVariable(connection, "tidb_enable_foreign_key");
  if (String(foreignKeysEnabled).toUpperCase() !== "ON") {
    throw new Error("GLOBAL tidb_enable_foreign_key must be ON");
  }
  const checksEnabled = await readGlobalVariable(connection, "tidb_enable_check_constraint");
  if (String(checksEnabled).toUpperCase() !== "ON") {
    throw new Error(
      "GLOBAL tidb_enable_check_constraint must be ON before rehearsal and production cutover",
    );
  }
}

async function assertLegacyPreflight(connection) {
  const [tables] = await connection.query(
    `SELECT TABLE_NAME
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const existing = new Set(tables.map(row => row.TABLE_NAME));
  const missing = legacyTables.filter(table => !existing.has(table));
  if (missing.length) throw new Error(`legacy schema is missing tables: ${missing.join(", ")}`);

  const [[users]] = await connection.query(
    `SELECT COUNT(*) AS count_,
            SUM(\`role\` = 'owner') AS owners_,
            SUM(\`openId\` IS NULL OR TRIM(\`openId\`) = '') AS missingOpenIds
       FROM \`users\``,
  );
  if (Number(users.count_) === 0) throw new Error("legacy dataset must contain at least one user");
  if (Number(users.owners_) === 0) throw new Error("legacy dataset must contain an owner user");
  if (Number(users.missingOpenIds) !== 0) {
    throw new Error(`${users.missingOpenIds} users have no Manus subject`);
  }

  const [[settings]] = await connection.query(
    "SELECT COUNT(*) AS unexpected FROM user_settings WHERE companyId IS NOT NULL",
  );
  if (Number(settings.unexpected) !== 0) {
    throw new Error("legacy user_settings.companyId contains non-null values that cannot be overwritten safely");
  }

  for (const [name, query] of duplicatePreflightChecks) {
    const [rows] = await connection.query(`${query} LIMIT 1`);
    if (rows.length) throw new Error(`new tenant uniqueness would reject duplicate ${name}`);
  }
}

async function getBaselineColumns(connection) {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${legacyTables.map(() => "?").join(",")})
      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    legacyTables,
  );
  const result = new Map(legacyTables.map(table => [table, []]));
  for (const row of rows) {
    if (snapshotColumnExclusions.get(row.TABLE_NAME)?.has(row.COLUMN_NAME)) continue;
    result.get(row.TABLE_NAME).push(row.COLUMN_NAME);
  }
  return result;
}

async function hasLedger(connection) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count_
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'saas_schema_migrations'`,
  );
  return Number(row.count_) === 1;
}

async function expectedMigrationChecksums() {
  const result = new Map();
  for (const file of migrationFiles) {
    const source = await readFile(path.join(root, file), "utf8");
    result.set(
      path.basename(file, ".sql"),
      createHash("sha256").update(source).digest("hex"),
    );
  }
  return result;
}

async function inspectMigrationState(connection) {
  const expected = await expectedMigrationChecksums();
  if (!await hasLedger(connection)) return { status: "none", expected };
  const [rows] = await connection.query(
    "SELECT version, checksumSha256 FROM saas_schema_migrations ORDER BY id",
  );
  if (rows.length === 0) return { status: "none", expected };

  const actual = new Map(rows.map(row => [row.version, row.checksumSha256]));
  const unknown = [...actual.keys()].filter(version => !expected.has(version));
  if (unknown.length) {
    throw new Error(`migration ledger contains unknown versions: ${unknown.join(", ")}`);
  }
  for (const [version, checksum] of actual) {
    if (expected.get(version) !== checksum) {
      throw new Error(`checksum drift for already-applied migration ${version}`);
    }
  }
  const expectedVersions = [...expected.keys()];
  const actualVersions = [...actual.keys()];
  if (actualVersions.some((version, index) => version !== expectedVersions[index])) {
    throw new Error("migration ledger is not an ordered prefix of the reviewed migration set");
  }
  if (actual.size === expected.size) return { status: "complete", expected };
  return { status: "partial", expected, appliedCount: actual.size };
}

async function assertNoUnrecordedTenancyDdl(connection) {
  const [tables] = await connection.query(
    `SELECT TABLE_NAME
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('companies','farms','company_memberships','company_category_sequences','notification_receipts')`,
  );
  const [columns] = await connection.query(
    `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND ((TABLE_NAME = 'users' AND COLUMN_NAME = 'publicId')
          OR (TABLE_NAME = 'species' AND COLUMN_NAME = 'companyId')
          OR (TABLE_NAME = 'animals' AND COLUMN_NAME = 'companyId'))`,
  );
  if (tables.length || columns.length) {
    const objects = [
      ...tables.map(row => row.TABLE_NAME),
      ...columns.map(row => `${row.TABLE_NAME}.${row.COLUMN_NAME}`),
    ];
    throw new Error(
      `unrecorded or partial tenancy DDL detected (${objects.join(", ")}); do not retry automatically`,
    );
  }
}

async function applySqlFile(connection, file, record = true) {
  const source = await readFile(path.join(root, file), "utf8");
  const version = path.basename(file, ".sql");
  const checksum = createHash("sha256").update(source).digest("hex");
  if (record && await hasLedger(connection)) {
    const [rows] = await connection.execute(
      "SELECT checksumSha256 FROM saas_schema_migrations WHERE version = ?",
      [version],
    );
    if (rows.length) {
      if (rows[0].checksumSha256 !== checksum) {
        throw new Error(`checksum drift for already-applied migration ${version}`);
      }
      process.stdout.write(`skipped ${file} (already applied)\n`);
      return;
    }
  }
  const statements = splitSql(source.replaceAll("--> statement-breakpoint", ""));
  for (let index = 0; index < statements.length; index += 1) {
    try {
      await connection.query(statements[index]);
    } catch (error) {
      error.message = `${file} statement ${index + 1}: ${error.message}`;
      throw error;
    }
  }
  if (record) {
    await connection.execute(
      `INSERT INTO saas_schema_migrations
         (version, checksumSha256, executionId, appliedBy)
       VALUES (?, ?, ?, ?)`,
      [version, checksum, executionId, process.env.MIGRATION_APPLIED_BY ?? "tenancy-rehearsal"],
    );
  }
  process.stdout.write(`applied ${file} (${statements.length} statements)\n`);
}

async function snapshot(connection, baselineColumns) {
  const result = {};
  for (const table of legacyTables) {
    const [currentColumnRows] = await connection.query(
      `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    const currentColumns = new Set(currentColumnRows.map(row => row.COLUMN_NAME));
    const columns = baselineColumns.get(table);
    const projection = columns.map(column => {
      if (table === "animal_status_history" && column === "animalId" && currentColumns.has("legacyAnimalId")) {
        return "COALESCE(`animalId`, `legacyAnimalId`) AS `animalId`";
      }
      return quoteIdentifier(column);
    }).join(", ");
    const hash = createHash("sha256");
    let lastId = -1;
    let rowCount = 0;
    while (true) {
      const [rows] = await connection.query(
        `SELECT ${projection}
           FROM ${quoteIdentifier(table)}
          WHERE \`id\` > ?
          ORDER BY \`id\`
          LIMIT ${snapshotBatchSize}`,
        [lastId],
      );
      if (rows.length === 0) break;
      for (const row of rows) {
        hash.update(JSON.stringify(columns.map(column => canonicalValue(row[column]))));
        hash.update("\n");
        lastId = Number(row.id);
        rowCount += 1;
      }
    }
    result[table] = { rows: rowCount, contentSha256: hash.digest("hex") };
  }
  return result;
}

function assertSnapshotsEqual(before, after) {
  for (const table of legacyTables) {
    if (
      before[table].rows !== after[table].rows
      || before[table].contentSha256 !== after[table].contentSha256
    ) {
      throw new Error(`legacy row content changed for ${table}`);
    }
  }
}

async function assertBackfillComplete(connection, { initialCutover = true } = {}) {
  const [[users]] = await connection.query(
    "SELECT COUNT(*) AS missing FROM users WHERE publicId IS NULL",
  );
  if (Number(users.missing) !== 0) throw new Error(`users has ${users.missing} rows without public IDs`);
  for (const table of tenantTables) {
    const [[row]] = await connection.query(
      `SELECT COUNT(*) AS missing FROM \`${table}\` WHERE \`companyId\` IS NULL OR \`publicId\` IS NULL`,
    );
    if (Number(row.missing) !== 0) throw new Error(`${table} has ${row.missing} unscoped rows`);
  }
  for (const table of farmRequiredTables) {
    const [[row]] = await connection.query(
      `SELECT COUNT(*) AS missing FROM \`${table}\` WHERE \`farmId\` IS NULL`,
    );
    if (Number(row.missing) !== 0) throw new Error(`${table} has ${row.missing} rows without farm snapshots`);
  }
  const [[company]] = await connection.query(
    "SELECT COUNT(*) AS companies_ FROM companies WHERE slug = 'azal-farms' AND lifecycleStatus = 'active'",
  );
  if (Number(company.companies_) !== 1) throw new Error("legacy company mapping missing or duplicated");
  const [[mapping]] = await connection.query(
    `SELECT
       (SELECT COUNT(*) FROM farms f JOIN companies c ON c.id = f.companyId
         WHERE c.slug = 'azal-farms' AND f.activeCode = 'main' AND f.deletedAt IS NULL) AS farms_,
       (SELECT COUNT(*) FROM company_memberships m JOIN companies c ON c.id = m.companyId
         WHERE c.slug = 'azal-farms' AND m.role = 'owner' AND m.status = 'active') AS owners_,
       (SELECT COUNT(*) FROM company_memberships m JOIN companies c ON c.id = m.companyId
         WHERE c.slug = 'azal-farms' AND m.status = 'active') AS memberships_,
       (SELECT COUNT(*) FROM users) AS users_,
       (SELECT COUNT(*) FROM users u JOIN auth_identities i
          ON i.userId = u.id AND i.provider = 'manus' AND i.providerSubject = u.openId) AS identities_`,
  );
  if (Number(mapping.farms_) !== 1) throw new Error("legacy Main Farm mapping missing or duplicated");
  if (Number(mapping.owners_) !== 1) throw new Error("legacy active owner membership missing or duplicated");
  if (initialCutover) {
    if (Number(mapping.memberships_) !== Number(mapping.users_)) {
      throw new Error("not every legacy user has one active Azal Farms membership");
    }
    if (Number(mapping.identities_) !== Number(mapping.users_)) {
      throw new Error("not every legacy user has a matching Manus identity");
    }
  }

  const publicIdTables = [
    "users", ...tenantTables, "companies", "farms", "company_memberships", "tenant_files",
    "feature_catalog", "subscription_plans", "company_subscriptions",
  ];
  for (const table of publicIdTables) {
    const [[row]] = await connection.query(
      `SELECT COUNT(*) AS invalid
         FROM ${quoteIdentifier(table)}
        WHERE BINARY \`publicId\` NOT REGEXP '^[0-9A-HJKMNP-TV-Z]{26}$'`,
    );
    if (Number(row.invalid) !== 0) throw new Error(`${table} has ${row.invalid} invalid public IDs`);
  }

  for (const [name, childTable, childColumns, parentTable, parentColumns] of relationshipChecks) {
    const join = childColumns.map(
      (column, index) => `p.${quoteIdentifier(parentColumns[index])} = c.${quoteIdentifier(column)}`,
    ).join(" AND ");
    const present = childColumns.map(column => `c.${quoteIdentifier(column)} IS NOT NULL`).join(" AND ");
    const [[row]] = await connection.query(
      `SELECT COUNT(*) AS missing
         FROM ${quoteIdentifier(childTable)} c
         LEFT JOIN ${quoteIdentifier(parentTable)} p ON ${join}
        WHERE ${present} AND p.${quoteIdentifier(parentColumns[0])} IS NULL`,
    );
    if (Number(row.missing) !== 0) {
      throw new Error(`${name} has ${row.missing} orphaned references`);
    }
  }

  const [[files]] = await connection.query(
    `SELECT COUNT(*) AS unsafe
       FROM tenant_files
      WHERE checksumSha256 = REPEAT('0', 64)
        AND (status <> 'quarantine' OR verifiedAt IS NOT NULL)`,
  );
  if (Number(files.unsafe) !== 0) throw new Error("unverified legacy files were marked trusted");
}

async function assertExpandSchema(connection) {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME, COLUMN_NAME, EXTRA
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME IN ('activeName','activePrefix','activeCode','activeAnimalCode','activeLambCode','activeAnimalGuard')
        AND TABLE_NAME IN (${tenantTables.map(() => "?").join(",")})`,
    tenantTables,
  );
  if (rows.length !== 13) throw new Error(`expected 13 legacy generated columns, found ${rows.length}`);
  const stored = rows.filter(row => !String(row.EXTRA).toUpperCase().includes("VIRTUAL GENERATED"));
  if (stored.length) {
    throw new Error(`legacy generated columns must be VIRTUAL on TiDB: ${stored.map(row => `${row.TABLE_NAME}.${row.COLUMN_NAME}`).join(", ")}`);
  }
}

async function assertCompositeForeignKeys(connection) {
  const sources = await Promise.all(
    migrationFiles.map(file => readFile(path.join(root, file), "utf8")),
  );
  const expected = new Set(
    [...sources.join("\n").matchAll(/CONSTRAINT\s+`([^`]+)`\s+FOREIGN KEY/g)]
      .map(match => match[1]),
  );
  const [rows] = await connection.query(
    `SELECT TABLE_NAME, CONSTRAINT_NAME
       FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()`,
  );
  const actual = new Set(rows.map(row => row.CONSTRAINT_NAME));
  const missing = [...expected].filter(name => !actual.has(name));
  if (missing.length) throw new Error(`missing foreign keys: ${missing.join(", ")}`);

  for (const table of new Set(rows.map(row => row.TABLE_NAME))) {
    const [[definition]] = await connection.query(`SHOW CREATE TABLE ${quoteIdentifier(table)}`);
    if (String(definition["Create Table"]).includes("FOREIGN KEY INVALID")) {
      throw new Error(`${table} contains an ineffective foreign key`);
    }
  }

  const [companyScopedRows] = await connection.query(
    `SELECT CONSTRAINT_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION) AS columns_
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
      GROUP BY CONSTRAINT_NAME`,
  );
  for (const row of companyScopedRows) {
    if (
      /^(animals|groups|sales|lambing_log|weight_log|ration_plans|feed_stock_ledger|vaccination_records|pregnancy_records|notifications|expenses)_/.test(row.CONSTRAINT_NAME)
      && !String(row.columns_).split(",").includes("companyId")
    ) {
      throw new Error(`${row.CONSTRAINT_NAME} is not company-scoped`);
    }
  }
}

async function assertCheckConstraints(connection) {
  const [rows] = await connection.query(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'CHECK'`,
  );
  const actual = new Set(rows.map(row => row.CONSTRAINT_NAME));
  for (const name of ["expenses_scope_check", "outbox_payload_check", "tenant_files_attribution_check"]) {
    if (!actual.has(name)) throw new Error(`missing enforced check constraint ${name}`);
  }
}

async function assertCrossTenantConstraint(connection) {
  await connection.beginTransaction();
  try {
    const suffix = createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 8).toUpperCase();
    const [companyResult] = await connection.execute(
      "INSERT INTO companies (publicId,name,slug,lifecycleStatus) VALUES (?,?,?,'active')",
      [`01J${suffix.padEnd(23, "0")}`, "Constraint Test", `constraint-test-${suffix}`],
    );
    const companyId = Number(companyResult.insertId);
    const [[legacyFarm]] = await connection.query(
      "SELECT id FROM farms WHERE companyId <> ? ORDER BY id LIMIT 1",
      [companyId],
    );
    let rejected = false;
    try {
      await connection.execute(
        "INSERT INTO groups (publicId,companyId,farmId,groupCode,name,isActive) VALUES (?,?,?,?,?,true)",
        [`01J${suffix.padStart(23, "0")}`, companyId, legacyFarm.id, `X-${suffix}`, "Cross tenant"],
      );
    } catch (error) {
      rejected = error.code === "ER_NO_REFERENCED_ROW_2" || error.errno === 1452;
    }
    if (!rejected) throw new Error("cross-tenant farm reference was not rejected");
  } finally {
    await connection.rollback();
  }
}

async function assertRollbackSchema(connection) {
  const [controlTables] = await connection.query(
    `SELECT TABLE_NAME
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('companies','farms','company_memberships','tenant_sessions','platform_administrators','feature_catalog','saas_schema_migrations')`,
  );
  if (controlTables.length) {
    throw new Error(`rollback left control-plane tables: ${controlTables.map(row => row.TABLE_NAME).join(", ")}`);
  }

  const [foreignKeys] = await connection.query(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()`,
  );
  const expected = new Set([
    "animals_ownerId_fk",
    "vaccination_records_animalId_fk",
    "vaccination_records_vaccineId_fk",
  ]);
  const actual = new Set(foreignKeys.map(row => row.CONSTRAINT_NAME));
  if (actual.size !== expected.size || [...expected].some(name => !actual.has(name))) {
    throw new Error(`rollback foreign keys differ from legacy schema: ${[...actual].join(", ")}`);
  }

  const [columns] = await connection.query(
    `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${legacyTables.map(() => "?").join(",")})
        AND COLUMN_NAME IN ('publicId','version','farmId','activeName','activeCode','activeAnimalCode','activeLambCode','activeAnimalGuard')`,
    legacyTables,
  );
  if (columns.length) {
    throw new Error(`rollback left tenancy columns: ${columns.map(row => `${row.TABLE_NAME}.${row.COLUMN_NAME}`).join(", ")}`);
  }
}

async function main() {
  const mode = process.env.MIGRATION_MODE ?? "rehearsal";
  if (!new Set(["rehearsal", "production"]).has(mode)) {
    throw new Error("MIGRATION_MODE must be rehearsal or production");
  }
  throw new Error(RETIRED_SHARED_TABLE_PLAN);

  // The retained implementation below documents the superseded plan for audit
  // comparison only. It must remain unreachable while legacy tables are immutable.
  const url = process.env.MIGRATION_DATABASE_URL ?? (mode === "production" ? process.env.DATABASE_URL : undefined);
  if (!url) throw new Error("MIGRATION_DATABASE_URL is required");
  const target = normalizeTarget(url);
  if (
    mode === "rehearsal"
    && process.env.DATABASE_URL
    && targetsEqual(target, normalizeTarget(process.env.DATABASE_URL))
  ) {
    throw new Error("MIGRATION_DATABASE_URL must not equal DATABASE_URL");
  }
  if (mode === "rehearsal" && (!target.database || !/(rehearsal|staging|clone)/i.test(target.database))) {
    throw new Error("database name must contain rehearsal, staging, or clone");
  }
  if (mode === "production") {
    if (process.env.MIGRATION_CONFIRM_DATABASE !== target.database) {
      throw new Error("MIGRATION_CONFIRM_DATABASE must exactly equal the target database name");
    }
    if (process.env.MIGRATION_MAINTENANCE_CONFIRMED !== "1") {
      throw new Error("MIGRATION_MAINTENANCE_CONFIRMED=1 is required after disabling all writes and workers");
    }
    const checkpoint = process.env.MIGRATION_BACKUP_CHECKPOINT?.trim();
    if (!checkpoint || checkpoint.length < 8 || /^(replace|todo|none|unknown)$/i.test(checkpoint)) {
      throw new Error("MIGRATION_BACKUP_CHECKPOINT must identify a verified, restorable pre-cutover backup");
    }
    const appliedBy = process.env.MIGRATION_APPLIED_BY?.trim();
    if (!appliedBy || appliedBy === "tenancy-rehearsal") {
      throw new Error("MIGRATION_APPLIED_BY is required in production");
    }
    if (process.env.REHEARSAL_ROLLBACK === "1") {
      throw new Error("production mode never runs SQL rollback files");
    }
  }

  const connection = await mysql.createConnection(
    migrationConnectionOptions(url, mode === "production"),
  );
  try {
    await assertDatabaseCapabilities(connection);
    const migrationState = await inspectMigrationState(connection);
    if (migrationState.status === "complete") {
      await assertBackfillComplete(connection, { initialCutover: false });
      await assertCompositeForeignKeys(connection);
      await assertCheckConstraints(connection);
      await assertCrossTenantConstraint(connection);
      process.stdout.write("tenancy migrations already applied; checksums and constraints verified\n");
      return;
    }
    if (migrationState.status === "partial") {
      // Reviewed post-cutover migrations may be applied incrementally. Earlier
      // partial cutovers still require restoration from the backup checkpoint.
      if (migrationState.appliedCount < 4) {
        const missing = migrationFiles.slice(migrationState.appliedCount);
        throw new Error(
          `partial tenancy cutover detected; missing ${missing.join(", ")}. Restore the pre-cutover backup or follow the reviewed recovery runbook`,
        );
      }
      const baselineColumns = await getBaselineColumns(connection);
      const before = await snapshot(connection, baselineColumns);
      const incrementalFiles = migrationFiles.slice(migrationState.appliedCount);
      for (const file of incrementalFiles) {
        await applySqlFile(connection, file);
      }
      await assertBackfillComplete(connection, { initialCutover: false });
      await assertCompositeForeignKeys(connection);
      await assertCheckConstraints(connection);
      await assertCrossTenantConstraint(connection);
      assertSnapshotsEqual(before, await snapshot(connection, baselineColumns));
      process.stdout.write(`${mode === "production" ? "production migration" : "migration rehearsal"} incremental tenancy migrations passed\n`);
      if (mode === "rehearsal" && process.env.REHEARSAL_ROLLBACK === "1") {
        for (const file of rollbackFiles.slice(0, incrementalFiles.length)) {
          await applySqlFile(connection, file, false);
        }
        for (const file of incrementalFiles) {
          await connection.execute(
            "DELETE FROM saas_schema_migrations WHERE version = ?",
            [path.basename(file, ".sql")],
          );
        }
        assertSnapshotsEqual(before, await snapshot(connection, baselineColumns));
        process.stdout.write("incremental tenancy rollback rehearsal passed\n");
      }
      return;
    }
    await assertNoUnrecordedTenancyDdl(connection);
    await assertLegacyPreflight(connection);
    const baselineColumns = await getBaselineColumns(connection);
    const before = await snapshot(connection, baselineColumns);
    await applySqlFile(connection, migrationFiles[0]);
    await applySqlFile(connection, migrationFiles[1]);
    await assertExpandSchema(connection);
    await applySqlFile(connection, migrationFiles[2]);
    await assertBackfillComplete(connection);
    assertSnapshotsEqual(before, await snapshot(connection, baselineColumns));
    await applySqlFile(connection, migrationFiles[3]);
    for (const file of migrationFiles.slice(4)) await applySqlFile(connection, file);
    await assertCompositeForeignKeys(connection);
    await assertCheckConstraints(connection);
    await assertCrossTenantConstraint(connection);
    assertSnapshotsEqual(before, await snapshot(connection, baselineColumns));
    process.stdout.write(`${mode === "production" ? "production migration" : "migration rehearsal"} passed\n`);

    if (mode === "rehearsal" && process.env.REHEARSAL_ROLLBACK === "1") {
      for (const file of rollbackFiles) await applySqlFile(connection, file, false);
      assertSnapshotsEqual(before, await snapshot(connection, baselineColumns));
      await assertRollbackSchema(connection);
      process.stdout.write("rollback rehearsal passed\n");
    }
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
