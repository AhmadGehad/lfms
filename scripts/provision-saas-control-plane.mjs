import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

if (process.env.SAAS_PROVISION_CONFIRM !== "new-tables-only") {
  throw new Error(
    "Set SAAS_PROVISION_CONFIRM=new-tables-only to provision the additive SaaS control plane"
  );
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const backupManifest = process.env.SAAS_BACKUP_MANIFEST?.trim();
if (!backupManifest) {
  throw new Error(
    "SAAS_BACKUP_MANIFEST must name a verified pre-change backup manifest"
  );
}
await access(backupManifest);

function connectionOptions(databaseUrl) {
  const url = new URL(databaseUrl);
  const ssl = (url.searchParams.get("ssl") ?? "").toLowerCase();
  if (ssl === "true" || ssl === "verify_identity") {
    url.searchParams.delete("ssl");
    return {
      uri: url.toString(),
      ssl: { rejectUnauthorized: true, verifyIdentity: true },
    };
  }
  return { uri: databaseUrl };
}

function splitSql(source) {
  return source
    .split(/--> statement-breakpoint\s*/)
    .map(statement => statement.trim())
    .filter(Boolean);
}

function saasName(name) {
  return name === "saas_schema_migrations" ? name : `saas_${name}`;
}

function rewriteControlPlaneSql(source) {
  const knownTables = [
    ...source.matchAll(/CREATE TABLE IF NOT EXISTS `([^`]+)`/g),
  ].map(match => match[1]);
  const mapping = new Map([
    ["users", "saas_users"],
    ...knownTables.map(name => [name, saasName(name)]),
  ]);
  let rewritten = source;
  for (const [from, to] of mapping) {
    rewritten = rewritten.replaceAll(`\`${from}\``, `\`${to}\``);
  }
  // TiDB/MySQL foreign-key names are schema-scoped. Namespacing them prevents
  // a new SaaS table from colliding with an immutable legacy table constraint.
  rewritten = rewritten.replaceAll("CONSTRAINT `", "CONSTRAINT `saas_");
  // Physical company deletion is deliberately blocked until the retention
  // workflow completes. TiDB also rejects CASCADE with these generated guards.
  rewritten = rewritten
    .replace(
      "CONSTRAINT `saas_company_feature_overrides_company_fk` FOREIGN KEY (`companyId`) REFERENCES `saas_companies` (`id`) ON DELETE CASCADE",
      "CONSTRAINT `saas_company_feature_overrides_company_fk` FOREIGN KEY (`companyId`) REFERENCES `saas_companies` (`id`) ON DELETE RESTRICT"
    )
    .replace(
      "CONSTRAINT `saas_idempotency_keys_company_fk` FOREIGN KEY (`companyId`) REFERENCES `saas_companies` (`id`) ON DELETE CASCADE",
      "CONSTRAINT `saas_idempotency_keys_company_fk` FOREIGN KEY (`companyId`) REFERENCES `saas_companies` (`id`) ON DELETE RESTRICT"
    );
  return rewritten;
}

function rewriteLifecycleSql(source) {
  // 0028 follows the control-plane foundation but was written before the
  // additive `saas_` namespacing convention. Keep its scope explicit: it may
  // only evolve the new SaaS control-plane tables.
  return source
    .replaceAll("`background_jobs`", "`saas_background_jobs`")
    .replaceAll("`tenant_files`", "`saas_tenant_files`")
    .replaceAll("`export_jobs`", "`saas_export_jobs`")
    .replaceAll("CONSTRAINT `", "CONSTRAINT `saas_");
}

function assertNewTablesOnly(statement) {
  const mutatingTarget = statement.match(
    /^\s*(?:ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE\s+TABLE|UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+`?([a-zA-Z0-9_]+)/im,
  )?.[1];
  if (mutatingTarget && !mutatingTarget.startsWith("saas_"))
    throw new Error(
      `Unsafe non-additive statement: ${statement.slice(0, 160)}`
    );
  for (const match of statement.matchAll(
    /(?:CREATE TABLE(?: IF NOT EXISTS)?|REFERENCES) `([^`]+)`/g
  )) {
    if (!match[1].startsWith("saas_"))
      throw new Error(`Legacy table reference rejected: ${match[1]}`);
  }
}

function addExplicitForeignKeyIndexes(statement) {
  const table = statement.match(/CREATE TABLE(?: IF NOT EXISTS)? `([^`]+)`/i)?.[1];
  if (!table) return statement;
  const foreignKeys = [...statement.matchAll(/FOREIGN KEY \(([^)]+)\)/g)];
  if (!foreignKeys.length) return statement;
  const indexes = foreignKeys
    .map(
      (match, index) =>
        `  KEY \`saas_${table.replace(/^saas_/, "")}_fk_${index + 1}\` (${match[1]}),`
    )
    .join("\n");
  return statement.replace("  CONSTRAINT `", `${indexes}\n  CONSTRAINT \``);
}

async function executeCreateStatement(connection, statement) {
  try {
    await connection.query(statement);
    return;
  } catch (error) {
    // TiDB accepts ADD COLUMN IF NOT EXISTS while MySQL 8 rejects that syntax.
    // The retry remains additive and duplicate-column errors are handled below.
    if (
      error?.code === "ER_PARSE_ERROR" &&
      /^\s*ALTER\s+TABLE\s+`saas_[^`]+`\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+/i.test(statement)
    ) {
      return executeCreateStatement(
        connection,
        statement.replace(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+/i, "ADD COLUMN "),
      );
    }
    if (
      error?.code === "ER_DUP_FIELDNAME" &&
      /^\s*ALTER\s+TABLE\s+`saas_[^`]+`\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+/i.test(statement)
    ) {
      return;
    }
    if (
      ["ER_DUP_KEYNAME", "ER_FK_DUP_NAME"].includes(error?.code) &&
      /^\s*ALTER\s+TABLE\s+`saas_[^`]+`\s+ADD\s+CONSTRAINT\s+/i.test(statement)
    ) {
      return;
    }
    const table = statement.match(/CREATE TABLE IF NOT EXISTS `([^`]+)`/i)?.[1];
    const constraints = [
      ...statement.matchAll(/^\s*(CONSTRAINT .+?)(?:,)?\s*$/gm),
    ].map(match => match[1].replace(/,$/, ""));
    if (
      error?.code !== "ER_CANNOT_ADD_FOREIGN" ||
      !table ||
      !constraints.length
    )
      throw error;

    // TiDB can reject a valid CREATE ... FOREIGN KEY statement when it contains
    // generated columns. Creating the new empty table first and adding the same
    // constraints is equivalent and keeps the legacy schema entirely untouched.
    const withoutConstraints = statement
      .replace(/^\s*CONSTRAINT .+?(?:,)?\s*$/gm, "")
      .replace(/,\s*\);$/, "\n);");
    await connection.query(withoutConstraints);
    for (const constraint of constraints) {
      await connection.query(`ALTER TABLE \`${table}\` ADD ${constraint}`);
    }
  }
}

const usersSql = `
CREATE TABLE IF NOT EXISTS \`saas_users\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`publicId\` varchar(26) NOT NULL,
  \`openId\` varchar(64) NOT NULL,
  \`name\` text,
  \`email\` varchar(320),
  \`normalizedEmail\` varchar(320),
  \`loginMethod\` varchar(64),
  \`role\` enum('owner','supervisor','staff','admin','user','viewer') NOT NULL DEFAULT 'user',
  \`status\` enum('active','locked','disabled') NOT NULL DEFAULT 'active',
  \`authVersion\` int NOT NULL DEFAULT 1,
  \`failedLoginAttempts\` int NOT NULL DEFAULT 0,
  \`lockedUntil\` timestamp NULL,
  \`lastPasswordChange\` timestamp NULL,
  \`version\` int NOT NULL DEFAULT 1,
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  \`lastSignedIn\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`saas_users_public_id_unique\` (\`publicId\`),
  UNIQUE KEY \`saas_users_open_id_unique\` (\`openId\`),
  UNIQUE KEY \`saas_users_normalized_email_unique\` (\`normalizedEmail\`)
)`;

const controlPlaneSource = await readFile(
  new URL("../drizzle/0024_saas_control_plane.sql", import.meta.url),
  "utf8"
);
const rewrittenControlPlane = rewriteControlPlaneSql(controlPlaneSource);
const userLinksSource = await readFile(
  new URL("../drizzle/0032_saas_legacy_user_links.sql", import.meta.url),
  "utf8"
);
const invitationHardeningSource = await readFile(
  new URL("../drizzle/0033_saas_company_invitation_hardening.sql", import.meta.url),
  "utf8"
);
const invitationSubjectRequiredSource = await readFile(
  new URL("../drizzle/0034_saas_company_invitation_subject_required.sql", import.meta.url),
  "utf8"
);
const revokeLegacySubjectInvitationsSource = await readFile(
  new URL("../drizzle/0035_saas_revoke_legacy_subject_invitations.sql", import.meta.url),
  "utf8"
);
const limitFeaturesSource = await readFile(
  new URL("../drizzle/0036_saas_limit_features.sql", import.meta.url),
  "utf8"
);
const companyBrandingSource = await readFile(
  new URL("../drizzle/0037_saas_company_branding.sql", import.meta.url),
  "utf8"
);
const subscriptionPlanVersionSource = (await readFile(
  new URL("../drizzle/0031_subscription_plan_version.sql", import.meta.url),
  "utf8"
)).replaceAll("`subscription_plans`", "`saas_subscription_plans`");
const lifecycleProcessorsSource = rewriteLifecycleSql(await readFile(
  new URL("../drizzle/0028_lifecycle_processors.sql", import.meta.url),
  "utf8"
));
const migrations = [
  {
    version: "saas-control-plane-v1",
    source: `${usersSql}\n${rewrittenControlPlane}`,
    statements: [
      usersSql,
      ...splitSql(rewrittenControlPlane).map(addExplicitForeignKeyIndexes),
    ],
  },
  {
    version: "saas-control-plane-v2-legacy-user-links",
    source: userLinksSource,
    statements: splitSql(userLinksSource).map(addExplicitForeignKeyIndexes),
  },
  {
    version: "saas-control-plane-v3-company-invitation-hardening",
    source: invitationHardeningSource,
    statements: splitSql(invitationHardeningSource),
  },
  {
    version: "saas-control-plane-v4-company-invitation-subject-required",
    source: invitationSubjectRequiredSource,
    statements: splitSql(invitationSubjectRequiredSource),
  },
  {
    version: "saas-control-plane-v5-revoke-legacy-subject-invitations",
    source: revokeLegacySubjectInvitationsSource,
    statements: splitSql(revokeLegacySubjectInvitationsSource),
  },
  {
    version: "saas-control-plane-v6-limit-features",
    source: limitFeaturesSource,
    statements: splitSql(limitFeaturesSource),
  },
  {
    version: "saas-control-plane-v7-company-branding",
    source: companyBrandingSource,
    statements: splitSql(companyBrandingSource).map(addExplicitForeignKeyIndexes),
  },
  {
    version: "saas-control-plane-v8-subscription-plan-version",
    source: subscriptionPlanVersionSource,
    statements: splitSql(subscriptionPlanVersionSource),
  },
  {
    version: "saas-control-plane-v9-lifecycle-file-attribution",
    source: lifecycleProcessorsSource,
    statements: splitSql(lifecycleProcessorsSource),
  },
].map(migration => ({
  ...migration,
  checksum: createHash("sha256").update(migration.source).digest("hex"),
}));
for (const migration of migrations) {
  for (const statement of migration.statements) assertNewTablesOnly(statement);
}

const connection = await mysql.createConnection(
  connectionOptions(process.env.DATABASE_URL)
);
try {
  const applied = [];
  for (const migration of migrations) {
    const [existing] = await connection
      .query(
        "SELECT `checksumSha256` FROM `saas_schema_migrations` WHERE `version` = ? LIMIT 1",
        [migration.version]
      )
      .catch(() => [[]]);
    if (existing.length && existing[0].checksumSha256 !== migration.checksum) {
      throw new Error(
        `Existing SaaS migration checksum differs for ${migration.version}; refusing to continue`
      );
    }
    if (existing.length) continue;
    for (const statement of migration.statements)
      await executeCreateStatement(connection, statement);
    await connection.query(
      "INSERT INTO `saas_schema_migrations` (`version`,`checksumSha256`,`executionId`,`appliedBy`) VALUES (?,?,?,?)",
      [
        migration.version,
        migration.checksum,
        `01J${randomBytes(12).toString("hex").slice(0, 23)}`,
        "saas-provisioner",
      ]
    );
    applied.push(migration.version);
  }
  const [tables] = await connection.query(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'saas\\_%' ESCAPE '\\\\' ORDER BY table_name"
  );
  process.stdout.write(
    `${JSON.stringify({ applied, backupManifest, saasTables: tables.map(row => row.name) })}\n`
  );
} finally {
  await connection.end();
}
