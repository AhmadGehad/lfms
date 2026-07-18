import "dotenv/config";
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";

if (process.env.SAAS_AZAL_USERS_CONFIRM !== "read-legacy-write-new") {
  throw new Error("Set SAAS_AZAL_USERS_CONFIRM=read-legacy-write-new to import Azal users into SaaS tables");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const dryRun = process.env.SAAS_AZAL_USERS_DRY_RUN === "1";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function connectionOptions(databaseUrl) {
  const url = new URL(databaseUrl);
  const ssl = (url.searchParams.get("ssl") ?? "").toLowerCase();
  if (ssl === "true" || ssl === "verify_identity") {
    url.searchParams.delete("ssl");
    return { uri: url.toString(), ssl: { rejectUnauthorized: true, verifyIdentity: true } };
  }
  return { uri: databaseUrl };
}

function encodeBase32(bytes) {
  let output = "";
  let buffer = 0;
  let bufferedBits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bufferedBits += 8;
    while (bufferedBits >= 5) {
      bufferedBits -= 5;
      output += CROCKFORD[(buffer >>> bufferedBits) & 31];
      buffer &= (1 << bufferedBits) - 1;
    }
  }
  if (bufferedBits) output += CROCKFORD[(buffer << (5 - bufferedBits)) & 31];
  return output;
}

function publicId() {
  return `01J${encodeBase32(randomBytes(15)).slice(0, 23)}`;
}

function normalizeEmail(value) {
  const email = value?.trim().toLowerCase();
  return email || null;
}

function membershipRole(role, isPrimaryOwner) {
  if (role === "owner") return isPrimaryOwner ? "owner" : "admin";
  if (["supervisor", "staff", "admin", "user", "viewer"].includes(role)) return role;
  throw new Error(`Unsupported legacy role: ${role}`);
}

function legacySubject(user) {
  return user.openId?.trim() || `legacy-azal-${user.id}`;
}

const connection = await mysql.createConnection(connectionOptions(process.env.DATABASE_URL));
try {
  const [[company]] = await connection.query(
    "SELECT `id` FROM `saas_companies` WHERE `slug` = 'azal-farms' AND `deletedAt` IS NULL LIMIT 1",
  );
  if (!company) throw new Error("Azal Farms SaaS company must exist before user import");

  const [legacyUsers] = await connection.query(`
    SELECT \`id\`, \`openId\`, \`name\`, \`email\`, \`role\`, \`createdAt\`, \`lastSignedIn\`
    FROM \`users\`
    ORDER BY CASE WHEN \`role\` = 'owner' THEN 0 ELSE 1 END, \`id\`
  `);
  if (!legacyUsers.length) throw new Error("No legacy users were found");

  const primaryOwnerId = legacyUsers.find(user => user.role === "owner")?.id ?? legacyUsers[0].id;
  const summary = {
    dryRun,
    legacyUsers: legacyUsers.length,
    usersCreated: 0,
    usersMatched: 0,
    membershipsCreated: 0,
    membershipsExisting: 0,
    legacyLinksUpserted: 0,
    tenantUserSettingsUpdated: 0,
    tenantNotificationsUpdated: 0,
    tenantAuditRowsUpdated: 0,
    companyRolePermissionsUpserted: 0,
  };

  if (dryRun) {
    const [existing] = await connection.query(
      "SELECT `openId` FROM `saas_users` WHERE `openId` IN (?)",
      [legacyUsers.map(legacySubject)],
    );
    const existingOpenIds = new Set(existing.map(user => user.openId));
    summary.usersCreated = legacyUsers.filter(user => !existingOpenIds.has(legacySubject(user))).length;
    summary.usersMatched = legacyUsers.length - summary.usersCreated;
    const [memberships] = await connection.query(
      "SELECT `userId` FROM `saas_company_memberships` WHERE `companyId` = ?",
      [company.id],
    );
    const existingMembershipUserIds = new Set(memberships.map(membership => membership.userId));
    const [targetUsers] = await connection.query(
      "SELECT `id`, `openId` FROM `saas_users` WHERE `openId` IN (?)",
      [legacyUsers.map(legacySubject)],
    );
    const targetUserIds = new Map(targetUsers.map(user => [user.openId, user.id]));
    summary.membershipsExisting = legacyUsers.filter(user => existingMembershipUserIds.has(targetUserIds.get(legacySubject(user)))).length;
    summary.membershipsCreated = legacyUsers.length - summary.membershipsExisting;
  } else {
    // DDL commits implicitly in MySQL/TiDB, so establish the additive mapping
    // table before the atomic identity and membership import transaction.
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`saas_legacy_user_links\` (
        \`companyId\` int NOT NULL,
        \`legacyUserId\` int NOT NULL,
        \`saasUserId\` int NOT NULL,
        \`legacyOpenId\` varchar(64) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`companyId\`, \`legacyUserId\`),
        UNIQUE KEY \`saas_legacy_user_links_company_user_unique\` (\`companyId\`, \`saasUserId\`),
        CONSTRAINT \`saas_legacy_user_links_company_fk\` FOREIGN KEY (\`companyId\`) REFERENCES \`saas_companies\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`saas_legacy_user_links_user_fk\` FOREIGN KEY (\`saasUserId\`) REFERENCES \`saas_users\` (\`id\`) ON DELETE RESTRICT
      )
    `);
    await connection.beginTransaction();
    try {
      for (const legacyUser of legacyUsers) {
        const openId = legacySubject(legacyUser);
        const hasProviderIdentity = Boolean(legacyUser.openId?.trim());
        const email = legacyUser.email?.trim() || null;
        const normalizedEmail = normalizeEmail(email);
        const role = membershipRole(legacyUser.role, legacyUser.id === primaryOwnerId);
        const [matchingUsers] = await connection.query(
          "SELECT `id`, `openId` FROM `saas_users` WHERE `openId` = ? LIMIT 1 FOR UPDATE",
          [openId],
        );
        let user = matchingUsers[0];
        if (!user && normalizedEmail) {
          const [emailMatches] = await connection.query(
            "SELECT `id`, `openId` FROM `saas_users` WHERE `normalizedEmail` = ? LIMIT 1 FOR UPDATE",
            [normalizedEmail],
          );
          if (emailMatches[0]) {
            throw new Error(`SaaS email identity conflict for legacy user ${legacyUser.id}`);
          }
        }
        if (user) {
          // A principal can belong to multiple companies. Never overwrite its
          // global authentication/profile state during a tenant import.
          summary.usersMatched += 1;
        } else {
          const [result] = await connection.query(
            "INSERT INTO `saas_users` (`publicId`, `openId`, `name`, `email`, `normalizedEmail`, `loginMethod`, `role`, `status`, `createdAt`, `lastSignedIn`) VALUES (?, ?, ?, ?, ?, 'legacy-import', 'user', ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))",
            [publicId(), openId, legacyUser.name ?? null, email, normalizedEmail, hasProviderIdentity ? "active" : "disabled", legacyUser.createdAt ?? null, legacyUser.lastSignedIn ?? null],
          );
          user = { id: result.insertId, openId };
          summary.usersCreated += 1;
        }
        const [matchingMemberships] = await connection.query(
          "SELECT `id` FROM `saas_company_memberships` WHERE `companyId` = ? AND `userId` = ? LIMIT 1 FOR UPDATE",
          [company.id, user.id],
        );
        if (matchingMemberships[0]) {
          summary.membershipsExisting += 1;
        } else {
          await connection.query(
            "INSERT INTO `saas_company_memberships` (`publicId`, `companyId`, `userId`, `role`, `status`, `farmAccessMode`, `joinedAt`) VALUES (?, ?, ?, ?, 'active', 'all', ?)",
            [publicId(), company.id, user.id, role, legacyUser.createdAt ?? new Date()],
          );
          summary.membershipsCreated += 1;
        }
        const [links] = await connection.query(
          "SELECT `saasUserId`, `legacyOpenId` FROM `saas_legacy_user_links` WHERE `companyId` = ? AND `legacyUserId` = ? LIMIT 1 FOR UPDATE",
          [company.id, legacyUser.id],
        );
        if (links[0] && (links[0].saasUserId !== user.id || links[0].legacyOpenId !== openId)) {
          throw new Error(`Legacy identity mapping conflict for user ${legacyUser.id}`);
        }
        if (!links[0]) {
          await connection.query(
            "INSERT INTO `saas_legacy_user_links` (`companyId`, `legacyUserId`, `saasUserId`, `legacyOpenId`) VALUES (?, ?, ?, ?)",
            [company.id, legacyUser.id, user.id, openId],
          );
          summary.legacyLinksUpserted += 1;
        }
      }
      const [userSettings] = await connection.query(`
        UPDATE \`saas_azal_user_settings\` target
        INNER JOIN \`user_settings\` legacy ON legacy.\`id\` = target.\`id\`
        INNER JOIN \`saas_legacy_user_links\` link
          ON link.\`companyId\` = ? AND link.\`legacyUserId\` = legacy.\`userId\`
        SET target.\`userId\` = link.\`saasUserId\`
      `, [company.id]);
      summary.tenantUserSettingsUpdated = Number(userSettings.affectedRows ?? 0);
      const [notifications] = await connection.query(`
        UPDATE \`saas_azal_notifications\` target
        INNER JOIN \`notifications\` legacy ON legacy.\`id\` = target.\`id\`
        LEFT JOIN \`saas_legacy_user_links\` link
          ON link.\`companyId\` = ? AND link.\`legacyUserId\` = legacy.\`userId\`
        SET target.\`userId\` = link.\`saasUserId\`
      `, [company.id]);
      summary.tenantNotificationsUpdated = Number(notifications.affectedRows ?? 0);
      const [auditRows] = await connection.query(`
        UPDATE \`saas_azal_audit_log\` target
        INNER JOIN \`audit_log\` legacy ON legacy.\`id\` = target.\`id\`
        LEFT JOIN \`saas_legacy_user_links\` actorLink
          ON actorLink.\`companyId\` = ? AND actorLink.\`legacyUserId\` = legacy.\`userId\`
        LEFT JOIN \`saas_legacy_user_links\` reverterLink
          ON reverterLink.\`companyId\` = ? AND reverterLink.\`legacyUserId\` = legacy.\`revertedByUserId\`
        LEFT JOIN \`saas_company_memberships\` membership
          ON membership.\`companyId\` = ? AND membership.\`userId\` = actorLink.\`saasUserId\`
        SET target.\`userId\` = actorLink.\`saasUserId\`,
            target.\`revertedByUserId\` = reverterLink.\`saasUserId\`,
            target.\`membershipId\` = membership.\`id\`
      `, [company.id, company.id, company.id]);
      summary.tenantAuditRowsUpdated = Number(auditRows.affectedRows ?? 0);
      const [[referenceCheck]] = await connection.query(`
        SELECT
          (SELECT COUNT(*) FROM \`user_settings\` legacy
            INNER JOIN \`saas_azal_user_settings\` target ON target.\`id\` = legacy.\`id\`
            LEFT JOIN \`saas_legacy_user_links\` link ON link.\`companyId\` = ? AND link.\`legacyUserId\` = legacy.\`userId\`
            WHERE NOT (target.\`userId\` <=> link.\`saasUserId\`)) AS settingsMismatches,
          (SELECT COUNT(*) FROM \`notifications\` legacy
            INNER JOIN \`saas_azal_notifications\` target ON target.\`id\` = legacy.\`id\`
            LEFT JOIN \`saas_legacy_user_links\` link ON link.\`companyId\` = ? AND link.\`legacyUserId\` = legacy.\`userId\`
            WHERE NOT (target.\`userId\` <=> link.\`saasUserId\`)) AS notificationMismatches,
          (SELECT COUNT(*) FROM \`audit_log\` legacy
            INNER JOIN \`saas_azal_audit_log\` target ON target.\`id\` = legacy.\`id\`
            LEFT JOIN \`saas_legacy_user_links\` actorLink ON actorLink.\`companyId\` = ? AND actorLink.\`legacyUserId\` = legacy.\`userId\`
            LEFT JOIN \`saas_legacy_user_links\` reverterLink ON reverterLink.\`companyId\` = ? AND reverterLink.\`legacyUserId\` = legacy.\`revertedByUserId\`
            WHERE NOT (target.\`userId\` <=> actorLink.\`saasUserId\`)
               OR NOT (target.\`revertedByUserId\` <=> reverterLink.\`saasUserId\`)) AS auditMismatches
      `, [company.id, company.id, company.id, company.id]);
      if (Object.values(referenceCheck).some(value => Number(value) !== 0)) {
        throw new Error(`Legacy user reference reconciliation failed: ${JSON.stringify(referenceCheck)}`);
      }
      const [permissions] = await connection.query(`
        INSERT INTO \`saas_company_role_permissions\` (
          \`companyId\`, \`role\`, \`resource\`, \`action\`, \`effect\`, \`updatedByMembershipId\`
        )
        SELECT
          ?,
          CASE WHEN legacy.\`role\` = 'owner' THEN 'owner' ELSE legacy.\`role\` END,
          legacy.\`page\`,
          legacy.\`action\`,
          CASE WHEN legacy.\`allowed\` = true THEN 'allow' ELSE 'deny' END,
          membership.\`id\`
        FROM \`role_permissions\` legacy
        LEFT JOIN \`saas_legacy_user_links\` link
          ON link.\`companyId\` = ? AND link.\`legacyUserId\` = legacy.\`updatedBy\`
        LEFT JOIN \`saas_company_memberships\` membership
          ON membership.\`companyId\` = ? AND membership.\`userId\` = link.\`saasUserId\`
        ON DUPLICATE KEY UPDATE \`version\` = \`saas_company_role_permissions\`.\`version\`
      `, [company.id, company.id, company.id]);
      summary.companyRolePermissionsUpserted = Number(permissions.affectedRows ?? 0);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} finally {
  await connection.end();
}
