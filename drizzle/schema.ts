import {
  bigint,
  binary,
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  date,
  json,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
  check,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// ─── USERS ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("saas_users", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  normalizedEmail: varchar("normalizedEmail", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["owner", "supervisor", "staff", "admin", "user", "viewer"]).default("user").notNull(),
  status: mysqlEnum("status", ["active", "locked", "disabled"]).default("active").notNull(),
  authVersion: int("authVersion").default(1).notNull(),
  failedLoginAttempts: int("failedLoginAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  lastPasswordChange: timestamp("lastPasswordChange"),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── TENANT CONTROL PLANE ───────────────────────────────────────────────────

export const saasSchemaMigrations = mysqlTable("saas_schema_migrations", {
  id: int("id").autoincrement().primaryKey(),
  version: varchar("version", { length: 100 }).notNull().unique(),
  checksumSha256: varchar("checksumSha256", { length: 64 }).notNull(),
  executionId: varchar("executionId", { length: 26 }).notNull(),
  appliedBy: varchar("appliedBy", { length: 200 }).notNull(),
  appliedAt: timestamp("appliedAt").defaultNow().notNull(),
});

export const companies = mysqlTable("saas_companies", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  lifecycleStatus: mysqlEnum("lifecycleStatus", [
    "provisioning",
    "active",
    "suspended",
    "deletion_requested",
    "purging",
    "deleted",
  ]).default("provisioning").notNull(),
  settings: json("settings"),
  entitlementVersion: int("entitlementVersion").default(1).notNull(),
  version: int("version").default(1).notNull(),
  suspendedAt: timestamp("suspendedAt"),
  suspendedReason: text("suspendedReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, table => ({
  lifecycleIdx: index("companies_lifecycle_idx").on(table.lifecycleStatus, table.id),
}));

export const farms = mysqlTable("saas_farms", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  code: varchar("code", { length: 40 }).notNull(),
  timezone: varchar("timezone", { length: 64 }).default("UTC").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  status: mysqlEnum("status", ["active", "suspended", "archived"]).default("active").notNull(),
  settings: json("settings"),
  version: int("version").default(1).notNull(),
  createdByMembershipId: int("createdByMembershipId"),
  deletedByMembershipId: int("deletedByMembershipId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
  activeCode: varchar("activeCode", { length: 40 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`deletedAt\` IS NULL THEN LOWER(\`code\`) ELSE NULL END`, { mode: "stored" }),
}, table => ({
  companyIdUnique: uniqueIndex("farms_company_id_id_unique").on(table.companyId, table.id),
  activeCodeUnique: uniqueIndex("farms_company_active_code_unique").on(table.companyId, table.activeCode),
  companyStatusIdx: index("farms_company_status_idx").on(table.companyId, table.status, table.id),
  companyFk: foreignKey({
    name: "farms_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
  createdByFk: foreignKey({
    name: "farms_created_by_fk",
    columns: [table.companyId, table.createdByMembershipId],
    foreignColumns: [companyMemberships.companyId, companyMemberships.id],
  }).onDelete("restrict"),
  deletedByFk: foreignKey({
    name: "farms_deleted_by_fk",
    columns: [table.companyId, table.deletedByMembershipId],
    foreignColumns: [companyMemberships.companyId, companyMemberships.id],
  }).onDelete("restrict"),
}));

export const companyMemberships = mysqlTable("saas_company_memberships", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "supervisor", "staff", "admin", "user", "viewer"]).default("viewer").notNull(),
  status: mysqlEnum("status", ["invited", "active", "suspended", "removed"]).default("invited").notNull(),
  farmAccessMode: mysqlEnum("farmAccessMode", ["all", "restricted"]).default("restricted").notNull(),
  authorizationVersion: int("authorizationVersion").default(1).notNull(),
  version: int("version").default(1).notNull(),
  invitedByMembershipId: int("invitedByMembershipId"),
  joinedAt: timestamp("joinedAt"),
  removedAt: timestamp("removedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  ownerCompanyGuard: int("ownerCompanyGuard")
    .generatedAlwaysAs(() => sql`CASE WHEN \`role\` = 'owner' AND \`status\` = 'active' THEN \`companyId\` ELSE NULL END`, { mode: "stored" }),
}, table => ({
  companyIdUnique: uniqueIndex("company_memberships_company_id_id_unique").on(table.companyId, table.id),
  companyUserUnique: uniqueIndex("company_memberships_company_user_unique").on(table.companyId, table.userId),
  ownerGuardUnique: uniqueIndex("company_memberships_owner_guard_unique").on(table.ownerCompanyGuard),
  userStatusIdx: index("company_memberships_user_status_idx").on(table.userId, table.status, table.companyId),
  companyFk: foreignKey({
    name: "company_memberships_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
  userFk: foreignKey({
    name: "company_memberships_user_fk",
    columns: [table.userId],
    foreignColumns: [users.id],
  }).onDelete("restrict"),
  invitedByFk: foreignKey({
    name: "company_memberships_invited_by_fk",
    columns: [table.companyId, table.invitedByMembershipId],
    foreignColumns: [table.companyId, table.id],
  }).onDelete("restrict"),
}));

export const farmMemberships = mysqlTable("saas_farm_memberships", {
  companyId: int("companyId").notNull(),
  companyMembershipId: int("companyMembershipId").notNull(),
  farmId: int("farmId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  pk: primaryKey({
    name: "farm_memberships_pk",
    columns: [table.companyMembershipId, table.farmId],
  }),
  companyFarmFk: foreignKey({
    name: "farm_memberships_company_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("cascade"),
  companyMembershipFk: foreignKey({
    name: "farm_memberships_company_membership_fk",
    columns: [table.companyId, table.companyMembershipId],
    foreignColumns: [companyMemberships.companyId, companyMemberships.id],
  }).onDelete("cascade"),
}));

// Immutable provenance for a legacy-to-SaaS identity import. It is never used
// as an authorization source and never references or modifies legacy tables.
export const legacyUserLinks = mysqlTable("saas_legacy_user_links", {
  companyId: int("companyId").notNull(),
  legacyUserId: int("legacyUserId").notNull(),
  saasUserId: int("saasUserId").notNull(),
  legacyOpenId: varchar("legacyOpenId", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  pk: primaryKey({ name: "saas_legacy_user_links_pk", columns: [table.companyId, table.legacyUserId] }),
  companyUserUnique: uniqueIndex("saas_legacy_user_links_company_user_unique").on(table.companyId, table.saasUserId),
  companyFk: foreignKey({ name: "saas_legacy_user_links_company_fk", columns: [table.companyId], foreignColumns: [companies.id] }).onDelete("restrict"),
  userFk: foreignKey({ name: "saas_legacy_user_links_user_fk", columns: [table.saasUserId], foreignColumns: [users.id] }).onDelete("restrict"),
}));

export const companyInvitations = mysqlTable("saas_company_invitations", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  normalizedEmail: varchar("normalizedEmail", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["owner", "supervisor", "staff", "admin", "user", "viewer"]).default("viewer").notNull(),
  farmAccessMode: mysqlEnum("farmAccessMode", ["all", "restricted"]).default("restricted").notNull(),
  farmPublicIds: json("farmPublicIds"),
  provider: varchar("provider", { length: 50 }).default("manus").notNull(),
  providerSubjectHash: binary("providerSubjectHash", { length: 32 }).notNull(),
  tokenHash: binary("tokenHash", { length: 32 }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "accepted", "revoked", "expired"]).default("pending").notNull(),
  invitedByMembershipId: int("invitedByMembershipId"),
  invitedByPlatformAdministratorId: int("invitedByPlatformAdministratorId"),
  acceptedByUserId: int("acceptedByUserId"),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  revokedAt: timestamp("revokedAt"),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  activeEmail: varchar("activeEmail", { length: 320 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`status\` = 'pending' THEN \`normalizedEmail\` ELSE NULL END`, { mode: "stored" }),
}, table => ({
  activeEmailUnique: uniqueIndex("company_invitations_active_email_unique").on(table.companyId, table.activeEmail),
  companyStatusIdx: index("company_invitations_company_status_idx").on(table.companyId, table.status, table.expiresAt),
  companyFk: foreignKey({
    name: "company_invitations_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
  inviterFk: foreignKey({
    name: "company_invitations_inviter_fk",
    columns: [table.companyId, table.invitedByMembershipId],
    foreignColumns: [companyMemberships.companyId, companyMemberships.id],
  }).onDelete("restrict"),
  platformInviterFk: foreignKey({
    name: "company_invitations_platform_inviter_fk",
    columns: [table.invitedByPlatformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
  acceptedByFk: foreignKey({
    name: "company_invitations_accepted_by_fk",
    columns: [table.acceptedByUserId],
    foreignColumns: [users.id],
  }).onDelete("restrict"),
}));

export const companyRolePermissions = mysqlTable("saas_company_role_permissions", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  role: mysqlEnum("role", ["owner", "supervisor", "staff", "admin", "user", "viewer"]).notNull(),
  resource: varchar("resource", { length: 100 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  effect: mysqlEnum("effect", ["allow", "deny"]).notNull(),
  version: int("version").default(1).notNull(),
  updatedByMembershipId: int("updatedByMembershipId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  roleResourceActionUnique: uniqueIndex("company_role_permissions_scope_unique")
    .on(table.companyId, table.role, table.resource, table.action),
  companyFk: foreignKey({
    name: "company_role_permissions_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("cascade"),
  updatedByFk: foreignKey({
    name: "company_role_permissions_updated_by_fk",
    columns: [table.companyId, table.updatedByMembershipId],
    foreignColumns: [companyMemberships.companyId, companyMemberships.id],
  }).onDelete("restrict"),
}));

export const companySecurityPolicies = mysqlTable("saas_company_security_policies", {
  companyId: int("companyId").primaryKey(),
  requireMfa: boolean("requireMfa").default(false).notNull(),
  allowedMfaMethods: json("allowedMfaMethods"),
  privilegedSessionMaxAgeSeconds: int("privilegedSessionMaxAgeSeconds").default(900).notNull(),
  requireMfaForOwners: boolean("requireMfaForOwners").default(true).notNull(),
  requireMfaForBilling: boolean("requireMfaForBilling").default(true).notNull(),
  requireMfaForDataExport: boolean("requireMfaForDataExport").default(false).notNull(),
  updatedByMembershipId: int("updatedByMembershipId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  companyFk: foreignKey({
    name: "company_security_policies_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("cascade"),
  updatedByFk: foreignKey({
    name: "company_security_policies_updated_by_fk",
    columns: [table.companyId, table.updatedByMembershipId],
    foreignColumns: [companyMemberships.companyId, companyMemberships.id],
  }).onDelete("restrict"),
}));

// ─── AUTHENTICATION DATA ────────────────────────────────────────────────────

export const authIdentities = mysqlTable("saas_auth_identities", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  providerSubject: varchar("providerSubject", { length: 255 }),
  providerEmail: varchar("providerEmail", { length: 320 }),
  providerEmailVerified: boolean("providerEmailVerified").default(false).notNull(),
  linkedAt: timestamp("linkedAt"),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  providerSubjectUnique: uniqueIndex("auth_identities_provider_subject_unique")
    .on(table.provider, table.providerSubject),
  userProviderUnique: uniqueIndex("auth_identities_user_provider_unique")
    .on(table.userId, table.provider),
  userIdUnique: uniqueIndex("auth_identities_user_id_id_unique").on(table.userId, table.id),
  userFk: foreignKey({
    name: "auth_identities_user_fk",
    columns: [table.userId],
    foreignColumns: [users.id],
  }).onDelete("cascade"),
}));

export const passwordCredentials = mysqlTable("saas_password_credentials", {
  userId: int("userId").primaryKey(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  passwordChangedAt: timestamp("passwordChangedAt").defaultNow().notNull(),
  passwordNeedsRehash: boolean("passwordNeedsRehash").default(false).notNull(),
}, table => ({
  userFk: foreignKey({
    name: "password_credentials_user_fk",
    columns: [table.userId],
    foreignColumns: [users.id],
  }).onDelete("cascade"),
}));

export const authenticationTokens = mysqlTable("saas_authentication_tokens", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  authIdentityId: int("authIdentityId"),
  purpose: mysqlEnum("purpose", ["verify_email", "reset_password", "change_email", "identity_link"]).notNull(),
  tokenHash: binary("tokenHash", { length: 32 }).notNull().unique(),
  targetValue: varchar("targetValue", { length: 320 }),
  attempts: int("attempts").default(0).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  lookupIdx: index("authentication_tokens_lookup_idx").on(table.userId, table.purpose, table.expiresAt),
  userFk: foreignKey({
    name: "authentication_tokens_user_fk",
    columns: [table.userId],
    foreignColumns: [users.id],
  }).onDelete("cascade"),
  identityFk: foreignKey({
    name: "authentication_tokens_identity_fk",
    columns: [table.authIdentityId],
    foreignColumns: [authIdentities.id],
  }).onDelete("cascade"),
}));

export const mfaCredentials = mysqlTable("saas_mfa_credentials", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  method: mysqlEnum("method", ["totp"]).notNull(),
  encryptedSecret: text("encryptedSecret").notNull(),
  encryptionKeyVersion: varchar("encryptionKeyVersion", { length: 50 }).notNull(),
  lastUsedTotpStep: bigint("lastUsedTotpStep", { mode: "number" }),
  enabledAt: timestamp("enabledAt"),
  disabledAt: timestamp("disabledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  userMethodUnique: uniqueIndex("mfa_credentials_user_method_unique").on(table.userId, table.method),
  userFk: foreignKey({
    name: "mfa_credentials_user_fk",
    columns: [table.userId],
    foreignColumns: [users.id],
  }).onDelete("cascade"),
}));

export const mfaRecoveryCodes = mysqlTable("saas_mfa_recovery_codes", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  mfaCredentialId: bigint("mfaCredentialId", { mode: "number" }).notNull(),
  codeHash: varchar("codeHash", { length: 255 }).notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  credentialIdx: index("mfa_recovery_codes_credential_idx").on(table.mfaCredentialId, table.usedAt),
  credentialFk: foreignKey({
    name: "mfa_recovery_codes_credential_fk",
    columns: [table.mfaCredentialId],
    foreignColumns: [mfaCredentials.id],
  }).onDelete("cascade"),
}));

export const tenantSessions = mysqlTable("saas_tenant_sessions", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  tokenFamilyId: varchar("tokenFamilyId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  lastSelectedCompanyId: int("lastSelectedCompanyId"),
  authLevel: mysqlEnum("authLevel", ["primary", "mfa", "step_up"]).default("primary").notNull(),
  mfaVerifiedAt: timestamp("mfaVerifiedAt"),
  authenticationMethods: json("authenticationMethods"),
  userAuthVersion: int("userAuthVersion").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  idleExpiresAt: timestamp("idleExpiresAt").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  idleTimeoutMs: int("idleTimeoutMs"),
  revokedAt: timestamp("revokedAt"),
  revokedReason: varchar("revokedReason", { length: 200 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: varchar("userAgent", { length: 500 }),
}, table => ({
  activeUserIdx: index("tenant_sessions_active_user_idx").on(table.userId, table.revokedAt, table.expiresAt),
  familyIdx: index("tenant_sessions_family_idx").on(table.tokenFamilyId, table.revokedAt),
  userFk: foreignKey({
    name: "tenant_sessions_user_fk",
    columns: [table.userId],
    foreignColumns: [users.id],
  }).onDelete("cascade"),
  lastCompanyFk: foreignKey({
    name: "tenant_sessions_last_company_fk",
    columns: [table.lastSelectedCompanyId],
    foreignColumns: [companies.id],
  }).onDelete("set null"),
}));

export const authRateLimits = mysqlTable("saas_auth_rate_limits", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  keyHash: varchar("keyHash", { length: 64 }).notNull(),
  bucketStart: timestamp("bucketStart").notNull(),
  count: int("count").default(0).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
}, table => ({
  bucketUnique: uniqueIndex("auth_rate_limits_bucket_unique").on(table.keyHash, table.bucketStart),
  expiryIdx: index("auth_rate_limits_expiry_idx").on(table.expiresAt),
}));

export const oauthStates = mysqlTable("saas_oauth_states", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  stateHash: varchar("stateHash", { length: 64 }).notNull().unique(),
  audience: mysqlEnum("audience", ["tenant", "platform"]).notNull(),
  redirectUri: varchar("redirectUri", { length: 500 }).notNull(),
  returnTo: varchar("returnTo", { length: 500 }).notNull(),
  browserBindingHash: varchar("browserBindingHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
}, table => ({
  expiryIdx: index("oauth_states_expiry_idx").on(table.expiresAt, table.consumedAt),
}));

// ─── PLATFORM ADMINISTRATION AUTHORITY ──────────────────────────────────────

export const platformAdministrators = mysqlTable("saas_platform_administrators", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  userId: int("userId").notNull().unique(),
  status: mysqlEnum("status", ["invited", "active", "suspended", "revoked"]).default("invited").notNull(),
  authVersion: int("authVersion").default(1).notNull(),
  mfaRequired: boolean("mfaRequired").default(true).notNull(),
  version: int("version").default(1).notNull(),
  grantedByPlatformAdministratorId: int("grantedByPlatformAdministratorId"),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  statusIdx: index("platform_administrators_status_idx").on(table.status, table.id),
  userFk: foreignKey({
    name: "platform_administrators_user_fk",
    columns: [table.userId],
    foreignColumns: [users.id],
  }).onDelete("restrict"),
  grantedByFk: foreignKey({
    name: "platform_administrators_granted_by_fk",
    columns: [table.grantedByPlatformAdministratorId],
    foreignColumns: [table.id],
  }).onDelete("restrict"),
}));

export const platformIdentities = mysqlTable("saas_platform_identities", {
  id: int("id").autoincrement().primaryKey(),
  platformAdministratorId: int("platformAdministratorId").notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  providerSubject: varchar("providerSubject", { length: 255 }).notNull(),
  providerEmail: varchar("providerEmail", { length: 320 }),
  providerEmailVerified: boolean("providerEmailVerified").default(false).notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  providerSubjectUnique: uniqueIndex("platform_identities_provider_subject_unique")
    .on(table.provider, table.providerSubject),
  adminProviderUnique: uniqueIndex("platform_identities_admin_provider_unique")
    .on(table.platformAdministratorId, table.provider),
  administratorFk: foreignKey({
    name: "platform_identities_administrator_fk",
    columns: [table.platformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("cascade"),
}));

export const platformRoles = mysqlTable("saas_platform_roles", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 150 }).notNull(),
  description: text("description"),
  isSystem: boolean("isSystem").default(false).notNull(),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const platformPermissions = mysqlTable("saas_platform_permissions", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 120 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const platformAdministratorRoles = mysqlTable("saas_platform_administrator_roles", {
  platformAdministratorId: int("platformAdministratorId").notNull(),
  platformRoleId: int("platformRoleId").notNull(),
  grantedByPlatformAdministratorId: int("grantedByPlatformAdministratorId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  pk: primaryKey({
    name: "platform_administrator_roles_pk",
    columns: [table.platformAdministratorId, table.platformRoleId],
  }),
  administratorFk: foreignKey({
    name: "platform_administrator_roles_administrator_fk",
    columns: [table.platformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("cascade"),
  roleFk: foreignKey({
    name: "platform_administrator_roles_role_fk",
    columns: [table.platformRoleId],
    foreignColumns: [platformRoles.id],
  }).onDelete("cascade"),
  grantedByFk: foreignKey({
    name: "platform_administrator_roles_granted_by_fk",
    columns: [table.grantedByPlatformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
}));

export const platformRolePermissions = mysqlTable("saas_platform_role_permissions", {
  platformRoleId: int("platformRoleId").notNull(),
  platformPermissionId: int("platformPermissionId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  pk: primaryKey({
    name: "platform_role_permissions_pk",
    columns: [table.platformRoleId, table.platformPermissionId],
  }),
  roleFk: foreignKey({
    name: "platform_role_permissions_role_fk",
    columns: [table.platformRoleId],
    foreignColumns: [platformRoles.id],
  }).onDelete("cascade"),
  permissionFk: foreignKey({
    name: "platform_role_permissions_permission_fk",
    columns: [table.platformPermissionId],
    foreignColumns: [platformPermissions.id],
  }).onDelete("cascade"),
}));

export const platformSessions = mysqlTable("saas_platform_sessions", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  tokenFamilyId: varchar("tokenFamilyId", { length: 64 }).notNull(),
  platformAdministratorId: int("platformAdministratorId").notNull(),
  authLevel: mysqlEnum("authLevel", ["primary", "mfa", "step_up"]).default("primary").notNull(),
  mfaVerifiedAt: timestamp("mfaVerifiedAt"),
  authenticationMethods: json("authenticationMethods"),
  authVersion: int("authVersion").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  idleExpiresAt: timestamp("idleExpiresAt").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
  revokedReason: varchar("revokedReason", { length: 200 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: varchar("userAgent", { length: 500 }),
}, table => ({
  activeAdminIdx: index("platform_sessions_active_admin_idx")
    .on(table.platformAdministratorId, table.revokedAt, table.expiresAt),
  familyIdx: index("platform_sessions_family_idx").on(table.tokenFamilyId, table.revokedAt),
  administratorFk: foreignKey({
    name: "platform_sessions_administrator_fk",
    columns: [table.platformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("cascade"),
}));

// ─── FEATURES, PLANS, SUBSCRIPTIONS, AND USAGE ───────────────────────────────

export const featureCatalog = mysqlTable("saas_feature_catalog", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  code: varchar("code", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 150 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["active", "deprecated"]).default("active").notNull(),
  disabledDataMode: mysqlEnum("disabledDataMode", ["read_only", "hidden", "inaccessible"])
    .default("read_only").notNull(),
  limitUnit: mysqlEnum("limitUnit", ["boolean", "count", "bytes", "requests"])
    .default("boolean").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const subscriptionPlans = mysqlTable("saas_subscription_plans", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  code: varchar("code", { length: 80 }).notNull(),
  name: varchar("name", { length: 150 }).notNull(),
  description: text("description"),
  planVersion: int("planVersion").default(1).notNull(),
  status: mysqlEnum("status", ["draft", "active", "retired"]).default("draft").notNull(),
  priceMonthly: decimal("priceMonthly", { precision: 12, scale: 2 }).default("0").notNull(),
  priceYearly: decimal("priceYearly", { precision: 12, scale: 2 }).default("0").notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  version: int("version").default(1).notNull(),
  createdByPlatformAdministratorId: int("createdByPlatformAdministratorId"),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  codeVersionUnique: uniqueIndex("subscription_plans_code_version_unique").on(table.code, table.planVersion),
  statusIdx: index("subscription_plans_status_idx").on(table.status, table.code, table.planVersion),
  createdByFk: foreignKey({
    name: "subscription_plans_created_by_fk",
    columns: [table.createdByPlatformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
}));

export const planEntitlements = mysqlTable("saas_plan_entitlements", {
  id: int("id").autoincrement().primaryKey(),
  subscriptionPlanId: int("subscriptionPlanId").notNull(),
  featureId: int("featureId").notNull(),
  accessMode: mysqlEnum("accessMode", ["enabled", "read_only", "disabled"]).default("disabled").notNull(),
  limitValue: bigint("limitValue", { mode: "number" }),
  configuration: json("configuration"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  planFeatureUnique: uniqueIndex("plan_entitlements_plan_feature_unique")
    .on(table.subscriptionPlanId, table.featureId),
  planFk: foreignKey({
    name: "plan_entitlements_plan_fk",
    columns: [table.subscriptionPlanId],
    foreignColumns: [subscriptionPlans.id],
  }).onDelete("cascade"),
  featureFk: foreignKey({
    name: "plan_entitlements_feature_fk",
    columns: [table.featureId],
    foreignColumns: [featureCatalog.id],
  }).onDelete("restrict"),
}));

export const companySubscriptions = mysqlTable("saas_company_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  subscriptionPlanId: int("subscriptionPlanId").notNull(),
  planSnapshot: json("planSnapshot").notNull(),
  status: mysqlEnum("status", ["trialing", "active", "past_due", "suspended", "canceled", "expired"])
    .default("trialing").notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  trialEndsAt: timestamp("trialEndsAt"),
  graceEndsAt: timestamp("graceEndsAt"),
  canceledAt: timestamp("canceledAt"),
  isCurrent: boolean("isCurrent").default(true).notNull(),
  version: int("version").default(1).notNull(),
  changedByPlatformAdministratorId: int("changedByPlatformAdministratorId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  currentCompanyGuard: int("currentCompanyGuard")
    .generatedAlwaysAs(() => sql`CASE WHEN \`isCurrent\` = TRUE THEN \`companyId\` ELSE NULL END`, { mode: "stored" }),
}, table => ({
  currentCompanyUnique: uniqueIndex("company_subscriptions_current_company_unique").on(table.currentCompanyGuard),
  companyHistoryIdx: index("company_subscriptions_history_idx").on(table.companyId, table.createdAt, table.id),
  expiryIdx: index("company_subscriptions_expiry_idx").on(table.status, table.periodEnd, table.id),
  trialExpiryIdx: index("company_subscriptions_trial_expiry_idx").on(table.status, table.trialEndsAt, table.id),
  graceExpiryIdx: index("company_subscriptions_grace_expiry_idx").on(table.status, table.graceEndsAt, table.id),
  companyFk: foreignKey({
    name: "company_subscriptions_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
  planFk: foreignKey({
    name: "company_subscriptions_plan_fk",
    columns: [table.subscriptionPlanId],
    foreignColumns: [subscriptionPlans.id],
  }).onDelete("restrict"),
  changedByFk: foreignKey({
    name: "company_subscriptions_changed_by_fk",
    columns: [table.changedByPlatformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
}));

export const companyFeatureOverrides = mysqlTable("saas_company_feature_overrides", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  featureId: int("featureId").notNull(),
  accessMode: mysqlEnum("accessMode", ["enabled", "read_only", "disabled"]),
  limitValue: bigint("limitValue", { mode: "number" }),
  configuration: json("configuration"),
  reason: text("reason").notNull(),
  startsAt: timestamp("startsAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  isCurrent: boolean("isCurrent").default(true).notNull(),
  version: int("version").default(1).notNull(),
  createdByPlatformAdministratorId: int("createdByPlatformAdministratorId").notNull(),
  revokedByPlatformAdministratorId: int("revokedByPlatformAdministratorId"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  currentCompanyFeatureGuard: varchar("currentCompanyFeatureGuard", { length: 80 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`isCurrent\` = TRUE THEN CONCAT(\`companyId\`, ':', \`featureId\`) ELSE NULL END`, { mode: "stored" }),
}, table => ({
  currentOverrideUnique: uniqueIndex("company_feature_overrides_current_unique")
    .on(table.currentCompanyFeatureGuard),
  companyExpiryIdx: index("company_feature_overrides_company_expiry_idx")
    .on(table.companyId, table.isCurrent, table.expiresAt),
  companyFk: foreignKey({
    name: "company_feature_overrides_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("cascade"),
  featureFk: foreignKey({
    name: "company_feature_overrides_feature_fk",
    columns: [table.featureId],
    foreignColumns: [featureCatalog.id],
  }).onDelete("restrict"),
  createdByFk: foreignKey({
    name: "company_feature_overrides_created_by_fk",
    columns: [table.createdByPlatformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
  revokedByFk: foreignKey({
    name: "company_feature_overrides_revoked_by_fk",
    columns: [table.revokedByPlatformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
}));

export const usageCounters = mysqlTable("saas_usage_counters", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  featureId: int("featureId"),
  metricCode: varchar("metricCode", { length: 100 }).notNull(),
  periodType: mysqlEnum("periodType", ["lifetime", "daily", "monthly", "billing_period"]).notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  usedValue: bigint("usedValue", { mode: "number" }).default(0).notNull(),
  reservedValue: bigint("reservedValue", { mode: "number" }).default(0).notNull(),
  version: int("version").default(1).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  metricPeriodUnique: uniqueIndex("usage_counters_metric_period_unique")
    .on(table.companyId, table.metricCode, table.periodType, table.periodStart, table.periodEnd),
  periodIdx: index("usage_counters_period_idx").on(table.periodType, table.periodEnd, table.companyId),
  companyFk: foreignKey({
    name: "usage_counters_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("cascade"),
  featureFk: foreignKey({
    name: "usage_counters_feature_fk",
    columns: [table.featureId],
    foreignColumns: [featureCatalog.id],
  }).onDelete("restrict"),
}));

// ─── SUPPORT ACCESS, SECURITY, AND OPERATIONS ────────────────────────────────

export const supportAccessGrants = mysqlTable("saas_support_access_grants", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  requestedByPlatformAdministratorId: int("requestedByPlatformAdministratorId").notNull(),
  accessMode: mysqlEnum("accessMode", ["read_only", "write"]).default("read_only").notNull(),
  allowedScopes: json("allowedScopes").notNull(),
  reason: text("reason").notNull(),
  ticketReference: varchar("ticketReference", { length: 150 }).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "active", "expired", "revoked", "rejected"])
    .default("pending").notNull(),
  activatedAt: timestamp("activatedAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
  revokedByPlatformAdministratorId: int("revokedByPlatformAdministratorId"),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  activeCompanyTicketGuard: varchar("activeCompanyTicketGuard", { length: 200 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`status\` IN ('pending','approved','active') THEN CONCAT(\`companyId\`, ':', LOWER(\`ticketReference\`)) ELSE NULL END`, { mode: "stored" }),
}, table => ({
  companyIdUnique: uniqueIndex("support_access_grants_company_id_id_unique")
    .on(table.companyId, table.id),
  activeTicketUnique: uniqueIndex("support_access_grants_active_ticket_unique")
    .on(table.activeCompanyTicketGuard),
  companyStatusIdx: index("support_access_grants_company_status_idx")
    .on(table.companyId, table.status, table.expiresAt),
  requesterStatusIdx: index("support_access_grants_requester_status_idx")
    .on(table.requestedByPlatformAdministratorId, table.status, table.createdAt),
  companyFk: foreignKey({
    name: "support_access_grants_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
  requesterFk: foreignKey({
    name: "support_access_grants_requester_fk",
    columns: [table.requestedByPlatformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
  revokedByFk: foreignKey({
    name: "support_access_grants_revoked_by_fk",
    columns: [table.revokedByPlatformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
}));

export const supportAccessApprovals = mysqlTable("saas_support_access_approvals", {
  id: int("id").autoincrement().primaryKey(),
  supportAccessGrantId: int("supportAccessGrantId").notNull(),
  platformAdministratorId: int("platformAdministratorId").notNull(),
  decision: mysqlEnum("decision", ["approved", "rejected"]).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  approverUnique: uniqueIndex("support_access_approvals_approver_unique")
    .on(table.supportAccessGrantId, table.platformAdministratorId),
  grantFk: foreignKey({
    name: "support_access_approvals_grant_fk",
    columns: [table.supportAccessGrantId],
    foreignColumns: [supportAccessGrants.id],
  }).onDelete("cascade"),
  administratorFk: foreignKey({
    name: "support_access_approvals_administrator_fk",
    columns: [table.platformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
}));

export const securityEvents = mysqlTable("saas_security_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId"),
  actorType: mysqlEnum("actorType", ["anonymous", "tenant_user", "platform_admin", "support", "system_job"]).notNull(),
  userId: int("userId"),
  platformAdministratorId: int("platformAdministratorId"),
  supportAccessGrantId: int("supportAccessGrantId"),
  eventType: varchar("eventType", { length: 120 }).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "high", "critical"]).default("info").notNull(),
  outcome: mysqlEnum("outcome", ["success", "denied", "error"]).notNull(),
  requestId: varchar("requestId", { length: 64 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: varchar("userAgent", { length: 500 }),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  companyTimeIdx: index("security_events_company_time_idx").on(table.companyId, table.createdAt, table.id),
  severityTimeIdx: index("security_events_severity_time_idx").on(table.severity, table.createdAt, table.id),
  requestIdx: index("security_events_request_idx").on(table.requestId),
  companyFk: foreignKey({
    name: "security_events_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
  platformAdministratorFk: foreignKey({
    name: "security_events_platform_admin_fk",
    columns: [table.platformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
  supportGrantFk: foreignKey({
    name: "security_events_support_grant_fk",
    columns: [table.companyId, table.supportAccessGrantId],
    foreignColumns: [supportAccessGrants.companyId, supportAccessGrants.id],
  }).onDelete("restrict"),
}));

export const tenantFiles = mysqlTable("saas_tenant_files", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  farmId: int("farmId"),
  storageKey: varchar("storageKey", { length: 500 }).notNull().unique(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  contentType: varchar("contentType", { length: 100 }).notNull(),
  sizeBytes: bigint("sizeBytes", { mode: "number" }).notNull(),
  checksumSha256: varchar("checksumSha256", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["reserved", "uploading", "quarantine", "clean", "rejected", "deleted"])
    .default("reserved").notNull(),
  uploadedByMembershipId: int("uploadedByMembershipId"),
  generatedByBackgroundJobId: bigint("generatedByBackgroundJobId", { mode: "number" }),
  generatedByExportJobId: bigint("generatedByExportJobId", { mode: "number" }),
  scanResult: json("scanResult"),
  verifiedAt: timestamp("verifiedAt"),
  deletedAt: timestamp("deletedAt"),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  companyIdUnique: uniqueIndex("tenant_files_company_id_id_unique").on(table.companyId, table.id),
  companyStatusIdx: index("tenant_files_company_status_idx").on(table.companyId, table.status, table.createdAt),
  generatedJobUnique: uniqueIndex("tenant_files_generated_job_unique").on(table.generatedByBackgroundJobId),
  generatedExportUnique: uniqueIndex("tenant_files_generated_export_unique").on(table.generatedByExportJobId),
  companyFk: foreignKey({
    name: "tenant_files_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
  uploaderFk: foreignKey({
    name: "tenant_files_uploader_fk",
    columns: [table.companyId, table.uploadedByMembershipId],
    foreignColumns: [companyMemberships.companyId, companyMemberships.id],
  }).onDelete("restrict"),
  farmFk: foreignKey({
    name: "tenant_files_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
  generatedJobFk: foreignKey({
    name: "tenant_files_generated_job_fk",
    columns: [table.companyId, table.generatedByBackgroundJobId],
    foreignColumns: [backgroundJobs.companyId, backgroundJobs.id],
  }).onDelete("restrict"),
  attributionCheck: check(
    "tenant_files_attribution_check",
    sql`((\`uploadedByMembershipId\` IS NOT NULL) + (\`generatedByBackgroundJobId\` IS NOT NULL)) = 1 AND (\`generatedByExportJobId\` IS NULL OR \`generatedByBackgroundJobId\` IS NOT NULL)`,
  ),
}));

// Tenant-facing brand state is kept separate from the control-plane company
// record so logo ownership and lifecycle stay referentially constrained.
export const companyBranding = mysqlTable("saas_company_branding", {
  companyId: int("companyId").primaryKey(),
  logoTenantFileId: int("logoTenantFileId"),
  faviconTenantFileId: int("faviconTenantFileId"),
  version: int("version").default(1).notNull(),
  updatedByMembershipId: int("updatedByMembershipId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  logoFileIdx: index("company_branding_logo_file_idx").on(table.logoTenantFileId),
  faviconFileIdx: index("company_branding_favicon_file_idx").on(table.faviconTenantFileId),
  companyFk: foreignKey({
    name: "company_branding_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
  logoFileFk: foreignKey({
    name: "company_branding_logo_file_fk",
    columns: [table.companyId, table.logoTenantFileId],
    foreignColumns: [tenantFiles.companyId, tenantFiles.id],
  }).onDelete("restrict"),
  faviconFileFk: foreignKey({
    name: "company_branding_favicon_file_fk",
    columns: [table.companyId, table.faviconTenantFileId],
    foreignColumns: [tenantFiles.companyId, tenantFiles.id],
  }).onDelete("restrict"),
  updatedByFk: foreignKey({
    name: "company_branding_updated_by_fk",
    columns: [table.companyId, table.updatedByMembershipId],
    foreignColumns: [companyMemberships.companyId, companyMemberships.id],
  }).onDelete("restrict"),
}));

export const outboxEvents = mysqlTable("saas_outbox_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  companyId: int("companyId"),
  eventType: varchar("eventType", { length: 120 }).notNull(),
  payload: json("payload"),
  encryptedPayload: text("encryptedPayload"),
  encryptionKeyVersion: varchar("encryptionKeyVersion", { length: 50 }),
  status: mysqlEnum("status", ["pending", "processing", "sent", "failed", "dead_letter"])
    .default("pending").notNull(),
  attempts: int("attempts").default(0).notNull(),
  maxAttempts: int("maxAttempts").default(5).notNull(),
  nextAttemptAt: timestamp("nextAttemptAt").defaultNow().notNull(),
  lockedBy: varchar("lockedBy", { length: 100 }),
  lockedUntil: timestamp("lockedUntil"),
  deduplicationKey: varchar("deduplicationKey", { length: 200 }),
  deduplicationCompanyId: int("deduplicationCompanyId")
    .generatedAlwaysAs(() => sql`COALESCE(\`companyId\`, 0)`, { mode: "stored" }),
  lastError: text("lastError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
}, table => ({
  deduplicationUnique: uniqueIndex("outbox_events_deduplication_unique")
    .on(table.deduplicationCompanyId, table.eventType, table.deduplicationKey),
  claimIdx: index("outbox_events_claim_idx").on(table.status, table.nextAttemptAt, table.lockedUntil, table.id),
  companyFk: foreignKey({
    name: "outbox_events_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("cascade"),
  payloadCheck: check("outbox_payload_check", sql`\`payload\` IS NOT NULL OR \`encryptedPayload\` IS NOT NULL`),
}));

export const backgroundJobs = mysqlTable("saas_background_jobs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId"),
  jobType: varchar("jobType", { length: 120 }).notNull(),
  payload: json("payload").notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed", "dead_letter", "canceled"])
    .default("pending").notNull(),
  priority: int("priority").default(0).notNull(),
  attempts: int("attempts").default(0).notNull(),
  maxAttempts: int("maxAttempts").default(5).notNull(),
  runAt: timestamp("runAt").defaultNow().notNull(),
  lockedBy: varchar("lockedBy", { length: 100 }),
  lockedUntil: timestamp("lockedUntil"),
  deduplicationKey: varchar("deduplicationKey", { length: 200 }),
  deduplicationCompanyId: int("deduplicationCompanyId")
    .generatedAlwaysAs(() => sql`COALESCE(\`companyId\`, 0)`, { mode: "stored" }),
  lastError: text("lastError"),
  requestId: varchar("requestId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
}, table => ({
  deduplicationUnique: uniqueIndex("background_jobs_deduplication_unique")
    .on(table.deduplicationCompanyId, table.jobType, table.deduplicationKey),
  claimIdx: index("background_jobs_claim_idx").on(table.status, table.runAt, table.priority, table.lockedUntil, table.id),
  companyHistoryIdx: index("background_jobs_company_history_idx").on(table.companyId, table.createdAt, table.id),
  companyIdUnique: uniqueIndex("background_jobs_company_id_id_unique").on(table.companyId, table.id),
  companyFk: foreignKey({
    name: "background_jobs_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("cascade"),
}));

export const idempotencyKeys = mysqlTable("saas_idempotency_keys", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  companyId: int("companyId"),
  scopeCompanyId: int("scopeCompanyId")
    .generatedAlwaysAs(() => sql`COALESCE(\`companyId\`, 0)`, { mode: "stored" }),
  userId: int("userId").notNull(),
  keyHash: varchar("keyHash", { length: 128 }).notNull(),
  requestMethod: varchar("requestMethod", { length: 10 }).notNull(),
  requestPathHash: varchar("requestPathHash", { length: 128 }).notNull(),
  requestBodyHash: varchar("requestBodyHash", { length: 128 }).notNull(),
  responseStatus: int("responseStatus"),
  responseBody: json("responseBody"),
  status: mysqlEnum("status", ["processing", "completed", "failed"]).default("processing").notNull(),
  lockedUntil: timestamp("lockedUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
}, table => ({
  scopeUnique: uniqueIndex("idempotency_keys_scope_unique")
    .on(table.scopeCompanyId, table.userId, table.requestMethod, table.requestPathHash, table.keyHash),
  expiryIdx: index("idempotency_keys_expiry_idx").on(table.expiresAt),
  companyFk: foreignKey({
    name: "idempotency_keys_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("cascade"),
  userFk: foreignKey({
    name: "idempotency_keys_user_fk",
    columns: [table.userId],
    foreignColumns: [users.id],
  }).onDelete("cascade"),
}));

export const exportJobs = mysqlTable("saas_export_jobs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  farmId: int("farmId"),
  requestedByMembershipId: int("requestedByMembershipId"),
  requestedByPlatformAdministratorId: int("requestedByPlatformAdministratorId"),
  supportAccessGrantId: int("supportAccessGrantId"),
  exportType: varchar("exportType", { length: 80 }).notNull(),
  filters: json("filters"),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed", "expired", "canceled"])
    .default("pending").notNull(),
  tenantFileId: int("tenantFileId"),
  failureReason: text("failureReason"),
  expiresAt: timestamp("expiresAt").notNull(),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, table => ({
  companyIdUnique: uniqueIndex("export_jobs_company_id_id_unique").on(table.companyId, table.id),
  companyStatusIdx: index("export_jobs_company_status_idx").on(table.companyId, table.status, table.createdAt),
  companyFk: foreignKey({
    name: "export_jobs_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
  farmFk: foreignKey({
    name: "export_jobs_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
  membershipFk: foreignKey({
    name: "export_jobs_membership_fk",
    columns: [table.companyId, table.requestedByMembershipId],
    foreignColumns: [companyMemberships.companyId, companyMemberships.id],
  }).onDelete("restrict"),
  platformAdministratorFk: foreignKey({
    name: "export_jobs_platform_admin_fk",
    columns: [table.requestedByPlatformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
  supportGrantFk: foreignKey({
    name: "export_jobs_support_grant_fk",
    columns: [table.companyId, table.supportAccessGrantId],
    foreignColumns: [supportAccessGrants.companyId, supportAccessGrants.id],
  }).onDelete("restrict"),
  tenantFileFk: foreignKey({
    name: "export_jobs_file_fk",
    columns: [table.companyId, table.tenantFileId],
    foreignColumns: [tenantFiles.companyId, tenantFiles.id],
  }).onDelete("restrict"),
}));

export const deletionRequests = mysqlTable("saas_deletion_requests", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  requestedByMembershipId: int("requestedByMembershipId"),
  requestedByPlatformAdministratorId: int("requestedByPlatformAdministratorId"),
  approvedByPlatformAdministratorId: int("approvedByPlatformAdministratorId"),
  reason: text("reason").notNull(),
  status: mysqlEnum("status", ["requested", "exported", "legal_hold", "approved", "purging", "completed", "canceled"])
    .default("requested").notNull(),
  retentionUntil: timestamp("retentionUntil").notNull(),
  approvedAt: timestamp("approvedAt"),
  purgedAt: timestamp("purgedAt"),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  companyStatusIdx: index("deletion_requests_company_status_idx").on(table.companyId, table.status, table.createdAt),
  companyFk: foreignKey({
    name: "deletion_requests_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
  membershipFk: foreignKey({
    name: "deletion_requests_membership_fk",
    columns: [table.companyId, table.requestedByMembershipId],
    foreignColumns: [companyMemberships.companyId, companyMemberships.id],
  }).onDelete("restrict"),
  requestedByPlatformAdministratorFk: foreignKey({
    name: "deletion_requests_request_admin_fk",
    columns: [table.requestedByPlatformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
  approvedByPlatformAdministratorFk: foreignKey({
    name: "deletion_requests_approval_admin_fk",
    columns: [table.approvedByPlatformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
}));

export const tenantRestoreJobs = mysqlTable("saas_tenant_restore_jobs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  sourceTenantFileId: int("sourceTenantFileId").notNull(),
  preRestoreExportJobId: bigint("preRestoreExportJobId", { mode: "number" }),
  requestedByPlatformAdministratorId: int("requestedByPlatformAdministratorId").notNull(),
  approvedByPlatformAdministratorId: int("approvedByPlatformAdministratorId"),
  status: mysqlEnum("status", ["pending", "validating", "ready", "restoring", "completed", "failed", "rolled_back", "canceled"])
    .default("pending").notNull(),
  validationResult: json("validationResult"),
  failureReason: text("failureReason"),
  maintenanceLeaseUntil: timestamp("maintenanceLeaseUntil"),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, table => ({
  companyStatusIdx: index("tenant_restore_jobs_company_status_idx").on(table.companyId, table.status, table.createdAt),
  companyFk: foreignKey({
    name: "tenant_restore_jobs_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
  sourceFileFk: foreignKey({
    name: "tenant_restore_jobs_source_file_fk",
    columns: [table.companyId, table.sourceTenantFileId],
    foreignColumns: [tenantFiles.companyId, tenantFiles.id],
  }).onDelete("restrict"),
  preRestoreExportFk: foreignKey({
    name: "tenant_restore_jobs_pre_export_fk",
    columns: [table.companyId, table.preRestoreExportJobId],
    foreignColumns: [exportJobs.companyId, exportJobs.id],
  }).onDelete("restrict"),
  requestedByPlatformAdministratorFk: foreignKey({
    name: "tenant_restore_jobs_request_admin_fk",
    columns: [table.requestedByPlatformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
  approvedByPlatformAdministratorFk: foreignKey({
    name: "tenant_restore_jobs_approval_admin_fk",
    columns: [table.approvedByPlatformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
}));

// ─── PER-USER SETTINGS ─────────────────────────────────────────────────────────
// Durable per-user preferences (design version, theme, saved views, density…).
// Key/value so new prefs need no migration. `companyId` is nullable today and
// becomes the tenant scope when multi-farm SaaS lands (docs/TENANCY_DESIGN.md).
export const userSettings = mysqlTable("saas_azal_user_settings", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  userId: int("userId").notNull(),
  companyId: int("companyId").notNull(),
  settingKey: varchar("settingKey", { length: 100 }).notNull(),
  settingValue: text("settingValue").notNull(),
  version: int("version").default(1).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  companyUserKeyUnique: uniqueIndex("user_settings_company_user_key_unique")
    .on(table.companyId, table.userId, table.settingKey),
  userCompanyIdx: index("user_settings_user_company_idx").on(table.userId, table.companyId),
  companyFk: foreignKey({
    name: "user_settings_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("cascade"),
  userFk: foreignKey({
    name: "user_settings_user_fk",
    columns: [table.userId],
    foreignColumns: [users.id],
  }).onDelete("cascade"),
}));

export type UserSetting = typeof userSettings.$inferSelect;
export type InsertUserSetting = typeof userSettings.$inferInsert;

// ─── ROLE PERMISSIONS ────────────────────────────────────────────────────────
// Rows are explicit overrides. Missing rows fall back to the legacy role
// hierarchy defined in shared/permissions.ts.
export const rolePermissions = mysqlTable("saas_azal_role_permissions", {
  id: int("id").autoincrement().primaryKey(),
  role: mysqlEnum("role", ["owner", "supervisor", "staff", "admin", "user", "viewer"]).notNull(),
  page: varchar("page", { length: 64 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  allowed: boolean("allowed").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedBy: int("updatedBy"),
}, table => ({
  rolePageActionUnique: uniqueIndex("role_permissions_role_page_action_unique")
    .on(table.role, table.page, table.action),
}));

export type RolePermission = typeof rolePermissions.$inferSelect;

// ─── CONFIGURATION TABLES ─────────────────────────────────────────────────────

export const species = mysqlTable("saas_azal_species", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  // Average gestation length in days for this species, used to compute a
  // pregnancy's expected delivery date (confirmationDate + gestationDays).
  gestationDays: int("gestationDays").default(150).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
  activeName: varchar("activeName", { length: 100 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`deletedAt\` IS NULL THEN LOWER(\`name\`) ELSE NULL END`, { mode: "virtual" }),
}, table => ({
  companyIdUnique: uniqueIndex("species_company_id_id_unique").on(table.companyId, table.id),
  activeNameUnique: uniqueIndex("species_company_active_name_unique").on(table.companyId, table.activeName),
  companyActiveIdx: index("species_company_active_idx").on(table.companyId, table.isActive, table.deletedAt),
  companyFk: foreignKey({
    name: "species_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
}));

export const animalCategories = mysqlTable("saas_azal_animal_categories", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  speciesId: int("speciesId").notNull(),
  idPrefix: varchar("idPrefix", { length: 10 }).notNull(),
  idSequence: int("idSequence").default(0).notNull(),
  lambIdSequence: int("lambIdSequence").default(0).notNull(),
  targetWeightKg: decimal("targetWeightKg", { precision: 8, scale: 2 }),
  expectedCycleDays: int("expectedCycleDays"),
  autoStageWeightKg: decimal("autoStageWeightKg", { precision: 8, scale: 2 }),
  autoStageTargetCategoryId: int("autoStageTargetCategoryId"),
  // Percentage of target weight to mark animal as ready to sell (e.g., 80 = 80%)
  readyToSellThreshold: decimal("readyToSellThreshold", { precision: 5, scale: 2 }).default("80.00").notNull(),
  isExitStatus: boolean("isExitStatus").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
  activeName: varchar("activeName", { length: 100 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`deletedAt\` IS NULL THEN LOWER(\`name\`) ELSE NULL END`, { mode: "virtual" }),
  activePrefix: varchar("activePrefix", { length: 10 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`deletedAt\` IS NULL THEN UPPER(\`idPrefix\`) ELSE NULL END`, { mode: "virtual" }),
}, table => ({
  companyIdUnique: uniqueIndex("animal_categories_company_id_id_unique").on(table.companyId, table.id),
  activeNameUnique: uniqueIndex("animal_categories_company_active_name_unique").on(table.companyId, table.activeName),
  activePrefixUnique: uniqueIndex("animal_categories_company_active_prefix_unique").on(table.companyId, table.activePrefix),
  companyFk: foreignKey({
    name: "animal_categories_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
  speciesFk: foreignKey({
    name: "animal_categories_species_fk",
    columns: [table.companyId, table.speciesId],
    foreignColumns: [species.companyId, species.id],
  }).onDelete("restrict"),
  autoStageTargetFk: foreignKey({
    name: "animal_categories_auto_target_fk",
    columns: [table.companyId, table.autoStageTargetCategoryId],
    foreignColumns: [table.companyId, table.id],
  }).onDelete("restrict"),
}));

export const companyCategorySequences = mysqlTable("saas_azal_company_category_sequences", {
  companyId: int("companyId").notNull(),
  categoryId: int("categoryId").notNull(),
  animalIdSequence: int("animalIdSequence").default(0).notNull(),
  lambIdSequence: int("lambIdSequence").default(0).notNull(),
  version: int("version").default(1).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  pk: primaryKey({
    name: "company_category_sequences_pk",
    columns: [table.companyId, table.categoryId],
  }),
  categoryFk: foreignKey({
    name: "company_category_sequences_category_fk",
    columns: [table.companyId, table.categoryId],
    foreignColumns: [animalCategories.companyId, animalCategories.id],
  }).onDelete("cascade"),
  companyFk: foreignKey({
    name: "company_category_sequences_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("cascade"),
}));

export const animalStatuses = mysqlTable("saas_azal_animal_statuses", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isExitStatus: boolean("isExitStatus").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
  activeName: varchar("activeName", { length: 100 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`deletedAt\` IS NULL THEN LOWER(\`name\`) ELSE NULL END`, { mode: "virtual" }),
}, table => ({
  companyIdUnique: uniqueIndex("animal_statuses_company_id_id_unique").on(table.companyId, table.id),
  activeNameUnique: uniqueIndex("animal_statuses_company_active_name_unique").on(table.companyId, table.activeName),
  companyFk: foreignKey({
    name: "animal_statuses_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
}));

export const groups = mysqlTable("saas_azal_groups", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  farmId: int("farmId").notNull(),
  groupCode: varchar("groupCode", { length: 20 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  speciesId: int("speciesId"),
  categoryId: int("categoryId"),
  description: text("description"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  mapShape: json("mapShape"),
  color: varchar("color", { length: 20 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
  activeCode: varchar("activeCode", { length: 20 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`deletedAt\` IS NULL THEN UPPER(\`groupCode\`) ELSE NULL END`, { mode: "virtual" }),
}, table => ({
  companyIdUnique: uniqueIndex("groups_company_id_id_unique").on(table.companyId, table.id),
  activeCodeUnique: uniqueIndex("groups_farm_active_code_unique").on(table.companyId, table.farmId, table.activeCode),
  farmActiveIdx: index("groups_farm_active_idx").on(table.companyId, table.farmId, table.isActive, table.deletedAt),
  farmFk: foreignKey({
    name: "groups_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
  speciesFk: foreignKey({
    name: "groups_species_fk",
    columns: [table.companyId, table.speciesId],
    foreignColumns: [species.companyId, species.id],
  }).onDelete("restrict"),
  categoryFk: foreignKey({
    name: "groups_category_fk",
    columns: [table.companyId, table.categoryId],
    foreignColumns: [animalCategories.companyId, animalCategories.id],
  }).onDelete("restrict"),
}));

// ─── OWNERS ───────────────────────────────────────────────────────────────────
// People (or entities) who own one or more animals on the farm. Animals link
// to an owner via animals.ownerId. Used to filter the animal registry,
// expenses, sales, and P&L by owner.
export const owners = mysqlTable("saas_azal_owners", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 100 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
}, table => ({
  companyIdUnique: uniqueIndex("owners_company_id_id_unique").on(table.companyId, table.id),
  companyActiveIdx: index("owners_company_active_idx").on(table.companyId, table.isActive, table.deletedAt),
  companyFk: foreignKey({
    name: "owners_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
}));

// ─── CAPITAL MANAGEMENT ──────────────────────────────────────────────────────
// Capital is deliberately nested under an animal owner.  An owner can have
// multiple investors; financial events are immutable ledger rows so historic
// ownership and closed allocations remain reproducible.
export const capitalInvestors = mysqlTable("capital_investors", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 100 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
}, table => ({
  ownerActiveIdx: index("capital_investors_owner_active_idx").on(table.ownerId, table.isActive),
}));

export const capitalFundingBatches = mysqlTable("capital_funding_batches", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  kind: mysqlEnum("kind", ["pro_rata", "reversal"]).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  effectiveDate: date("effectiveDate").notNull(),
  notes: text("notes"),
  reversalOfBatchId: int("reversalOfBatchId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy").notNull(),
}, table => ({
  ownerDateIdx: index("capital_funding_batches_owner_date_idx").on(table.ownerId, table.effectiveDate),
  reversalUnique: uniqueIndex("capital_funding_batches_reversal_unique").on(table.reversalOfBatchId),
}));

export const capitalContributions = mysqlTable("capital_contributions", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  investorId: int("investorId").notNull(),
  batchId: int("batchId"),
  kind: mysqlEnum("kind", ["initial", "direct", "pro_rata", "reversal"]).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  effectiveDate: date("effectiveDate").notNull(),
  notes: text("notes"),
  reversalOfContributionId: int("reversalOfContributionId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy").notNull(),
}, table => ({
  ownerDateIdx: index("capital_contributions_owner_date_idx").on(table.ownerId, table.effectiveDate),
  investorDateIdx: index("capital_contributions_investor_date_idx").on(table.investorId, table.effectiveDate),
  reversalUnique: uniqueIndex("capital_contributions_reversal_unique").on(table.reversalOfContributionId),
}));

export const capitalProfitAllocations = mysqlTable("capital_profit_allocations", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  kind: mysqlEnum("kind", ["monthly", "adjustment"]).notNull(),
  status: mysqlEnum("status", ["draft", "finalized"]).default("draft").notNull(),
  periodStart: date("periodStart").notNull(),
  periodEnd: date("periodEnd").notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  adjustmentOfAllocationId: int("adjustmentOfAllocationId"),
  notes: text("notes"),
  finalizedAt: timestamp("finalizedAt"),
  finalizedBy: int("finalizedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy").notNull(),
}, table => ({
  ownerPeriodIdx: index("capital_profit_allocations_owner_period_idx").on(table.ownerId, table.periodStart, table.periodEnd),
  ownerKindPeriodUnique: uniqueIndex("capital_profit_allocations_owner_kind_period_unique").on(table.ownerId, table.kind, table.periodStart, table.periodEnd),
}));

export const capitalProfitAllocationLines = mysqlTable("capital_profit_allocation_lines", {
  id: int("id").autoincrement().primaryKey(),
  allocationId: int("allocationId").notNull(),
  investorId: int("investorId").notNull(),
  ownershipPct: decimal("ownershipPct", { precision: 9, scale: 6 }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  allocationInvestorUnique: uniqueIndex("capital_profit_lines_allocation_investor_unique").on(table.allocationId, table.investorId),
}));

export const birthTypes = mysqlTable("saas_azal_birth_types", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
  activeName: varchar("activeName", { length: 50 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`deletedAt\` IS NULL THEN LOWER(\`name\`) ELSE NULL END`, { mode: "virtual" }),
}, table => ({
  companyIdUnique: uniqueIndex("birth_types_company_id_id_unique").on(table.companyId, table.id),
  activeNameUnique: uniqueIndex("birth_types_company_active_name_unique").on(table.companyId, table.activeName),
  companyFk: foreignKey({
    name: "birth_types_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
}));

export const feedItems = mysqlTable("saas_azal_feed_items", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull().default("kg"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
  activeName: varchar("activeName", { length: 100 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`deletedAt\` IS NULL THEN LOWER(\`name\`) ELSE NULL END`, { mode: "virtual" }),
}, table => ({
  deletedNameIdx: index("feed_items_deleted_name_idx").on(table.deletedAt, table.name),
  companyIdUnique: uniqueIndex("feed_items_company_id_id_unique").on(table.companyId, table.id),
  activeNameUnique: uniqueIndex("feed_items_company_active_name_unique").on(table.companyId, table.activeName),
  companyFk: foreignKey({
    name: "feed_items_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
}));

export const feedItemPriceHistory = mysqlTable("saas_azal_feed_item_price_history", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  farmId: int("farmId"),
  feedItemId: int("feedItemId").notNull(),
  effectiveDate: date("effectiveDate").notNull(),
  pricePerUnit: decimal("pricePerUnit", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy"),
  version: int("version").default(1).notNull(),
}, table => ({
  itemDateIdIdx: index("feed_item_price_history_item_date_id_idx").on(table.feedItemId, table.effectiveDate, table.id),
  scopeDateIdx: index("feed_item_price_history_scope_date_idx")
    .on(table.companyId, table.farmId, table.feedItemId, table.effectiveDate, table.id),
  companyFk: foreignKey({
    name: "feed_item_price_history_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
  farmFk: foreignKey({
    name: "feed_item_price_history_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
  feedItemFk: foreignKey({
    name: "feed_item_price_history_feed_item_fk",
    columns: [table.companyId, table.feedItemId],
    foreignColumns: [feedItems.companyId, feedItems.id],
  }).onDelete("restrict"),
}));

export const vaccines = mysqlTable("saas_azal_vaccines", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  validityPeriod: int("validityPeriod").notNull(),
  validityUnit: mysqlEnum("validityUnit", ["days", "months"]).default("days").notNull(),
  boosterRequired: boolean("boosterRequired").default(false).notNull(),
  boosterInterval: int("boosterInterval"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
  activeName: varchar("activeName", { length: 100 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`deletedAt\` IS NULL THEN LOWER(\`name\`) ELSE NULL END`, { mode: "virtual" }),
}, table => ({
  companyIdUnique: uniqueIndex("vaccines_company_id_id_unique").on(table.companyId, table.id),
  activeNameUnique: uniqueIndex("vaccines_company_active_name_unique").on(table.companyId, table.activeName),
  companyFk: foreignKey({
    name: "vaccines_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
}));

export const vaccinationRecords = mysqlTable("saas_azal_vaccination_records", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  farmId: int("farmId").notNull(),
  animalId: int("animalId").notNull(),
  vaccineId: int("vaccineId").notNull(),
  vaccinationDate: date("vaccinationDate").notNull(),
  nextDueDate: date("nextDueDate"),
  boosterDueDate: date("boosterDueDate"),
  notifyBeforeNext: int("notifyBeforeNext").default(7),
  notifyBeforeBooster: int("notifyBeforeBooster").default(7),
  batchNumber: varchar("batchNumber", { length: 50 }),
  notes: text("notes"),
  veterinarian: varchar("veterinarian", { length: 100 }),
  isCompleted: boolean("isCompleted").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
}, table => ({
  animalDueIdx: index("vaccination_records_tenant_animal_due_idx")
    .on(table.companyId, table.farmId, table.animalId, table.nextDueDate),
  animalFk: foreignKey({
    name: "vaccination_records_animal_fk",
    columns: [table.companyId, table.animalId],
    foreignColumns: [animals.companyId, animals.id],
  }).onDelete("restrict"),
  vaccineFk: foreignKey({
    name: "vaccination_records_vaccine_fk",
    columns: [table.companyId, table.vaccineId],
    foreignColumns: [vaccines.companyId, vaccines.id],
  }).onDelete("restrict"),
  farmFk: foreignKey({
    name: "vaccination_records_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
}));

export const expenseCategories = mysqlTable("saas_azal_expense_categories", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
  activeName: varchar("activeName", { length: 100 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`deletedAt\` IS NULL THEN LOWER(\`name\`) ELSE NULL END`, { mode: "virtual" }),
}, table => ({
  companyIdUnique: uniqueIndex("expense_categories_company_id_id_unique").on(table.companyId, table.id),
  activeNameUnique: uniqueIndex("expense_categories_company_active_name_unique").on(table.companyId, table.activeName),
  companyFk: foreignKey({
    name: "expense_categories_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
}));

export const expenseSubCategories = mysqlTable("saas_azal_expense_sub_categories", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  categoryId: int("categoryId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
  activeName: varchar("activeName", { length: 100 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`deletedAt\` IS NULL THEN LOWER(\`name\`) ELSE NULL END`, { mode: "virtual" }),
}, table => ({
  companyIdUnique: uniqueIndex("expense_sub_categories_company_id_id_unique").on(table.companyId, table.id),
  activeNameUnique: uniqueIndex("expense_sub_categories_parent_active_name_unique")
    .on(table.companyId, table.categoryId, table.activeName),
  categoryFk: foreignKey({
    name: "expense_sub_categories_category_fk",
    columns: [table.companyId, table.categoryId],
    foreignColumns: [expenseCategories.companyId, expenseCategories.id],
  }).onDelete("restrict"),
}));

export const systemSettings = mysqlTable("saas_azal_system_settings", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  settingKey: varchar("settingKey", { length: 100 }).notNull(),
  settingValue: text("settingValue").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedBy: int("updatedBy"),
  version: int("version").default(1).notNull(),
}, table => ({
  companyKeyUnique: uniqueIndex("system_settings_company_key_unique").on(table.companyId, table.settingKey),
  companyFk: foreignKey({
    name: "system_settings_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("cascade"),
}));

// ─── ANIMAL REGISTRY ──────────────────────────────────────────────────────────

export const animals = mysqlTable("saas_azal_animals", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  farmId: int("farmId").notNull(),
  animalId: varchar("animalId", { length: 20 }).notNull(),
  speciesId: int("speciesId").notNull(),
  categoryId: int("categoryId").notNull(),
  groupId: int("groupId").notNull(),
  statusId: int("statusId").notNull(),
  sex: mysqlEnum("sex", ["male", "female"]).notNull(),
  acquisitionType: mysqlEnum("acquisitionType", ["purchased", "born"]).notNull(),
  acquisitionDate: date("acquisitionDate").notNull(),
  birthDate: date("birthDate").notNull(),
  damId: int("damId"),
  sireId: int("sireId"),
  ownerId: int("ownerId"),
  photoUrl: varchar("photoUrl", { length: 500 }),
  purchaseCost: decimal("purchaseCost", { precision: 10, scale: 2 }).default("0"),
  weightAtAcquisition: decimal("weightAtAcquisition", { precision: 8, scale: 2 }),
  exitDate: date("exitDate"),
  exitReason: text("exitReason"),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
  activeAnimalCode: varchar("activeAnimalCode", { length: 20 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`deletedAt\` IS NULL THEN UPPER(\`animalId\`) ELSE NULL END`, { mode: "virtual" }),
}, table => ({
  companyIdUnique: uniqueIndex("animals_company_id_id_unique").on(table.companyId, table.id),
  activeAnimalCodeUnique: uniqueIndex("animals_farm_active_code_unique")
    .on(table.companyId, table.farmId, table.activeAnimalCode),
  farmStatusIdx: index("animals_farm_status_idx").on(table.companyId, table.farmId, table.statusId, table.deletedAt),
  ownerIdx: index("animals_company_owner_idx").on(table.companyId, table.ownerId, table.deletedAt),
  farmFk: foreignKey({
    name: "animals_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
  speciesFk: foreignKey({
    name: "animals_species_fk",
    columns: [table.companyId, table.speciesId],
    foreignColumns: [species.companyId, species.id],
  }).onDelete("restrict"),
  categoryFk: foreignKey({
    name: "animals_category_fk",
    columns: [table.companyId, table.categoryId],
    foreignColumns: [animalCategories.companyId, animalCategories.id],
  }).onDelete("restrict"),
  groupFk: foreignKey({
    name: "animals_group_fk",
    columns: [table.companyId, table.groupId],
    foreignColumns: [groups.companyId, groups.id],
  }).onDelete("restrict"),
  statusFk: foreignKey({
    name: "animals_status_fk",
    columns: [table.companyId, table.statusId],
    foreignColumns: [animalStatuses.companyId, animalStatuses.id],
  }).onDelete("restrict"),
  ownerFk: foreignKey({
    name: "animals_owner_fk",
    columns: [table.companyId, table.ownerId],
    foreignColumns: [owners.companyId, owners.id],
  }).onDelete("restrict"),
  damFk: foreignKey({
    name: "animals_dam_fk",
    columns: [table.companyId, table.damId],
    foreignColumns: [table.companyId, table.id],
  }).onDelete("restrict"),
  sireFk: foreignKey({
    name: "animals_sire_fk",
    columns: [table.companyId, table.sireId],
    foreignColumns: [table.companyId, table.id],
  }).onDelete("restrict"),
}));

export const animalStatusHistory = mysqlTable("saas_azal_animal_status_history", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  farmId: int("farmId").notNull(),
  animalId: int("animalId"),
  legacyAnimalId: int("legacyAnimalId"),
  animalPublicIdSnapshot: varchar("animalPublicIdSnapshot", { length: 26 }),
  animalCodeSnapshot: varchar("animalCodeSnapshot", { length: 20 }),
  previousStatusId: int("previousStatusId"),
  newStatusId: int("newStatusId").notNull(),
  changedAt: timestamp("changedAt").defaultNow().notNull(),
  changedBy: int("changedBy"),
  notes: text("notes"),
  version: int("version").default(1).notNull(),
}, table => ({
  animalTimeIdx: index("animal_status_history_tenant_animal_time_idx")
    .on(table.companyId, table.animalId, table.changedAt, table.id),
  animalFk: foreignKey({
    name: "animal_status_history_animal_fk",
    columns: [table.companyId, table.animalId],
    foreignColumns: [animals.companyId, animals.id],
  }).onDelete("restrict"),
  farmFk: foreignKey({
    name: "animal_status_history_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
  previousStatusFk: foreignKey({
    name: "animal_status_history_previous_status_fk",
    columns: [table.companyId, table.previousStatusId],
    foreignColumns: [animalStatuses.companyId, animalStatuses.id],
  }).onDelete("restrict"),
  newStatusFk: foreignKey({
    name: "animal_status_history_new_status_fk",
    columns: [table.companyId, table.newStatusId],
    foreignColumns: [animalStatuses.companyId, animalStatuses.id],
  }).onDelete("restrict"),
}));

// ─── SALES ────────────────────────────────────────────────────────────────────

export const sales = mysqlTable("saas_azal_sales", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  farmId: int("farmId").notNull(),
  animalId: int("animalId").notNull(),
  saleDate: date("saleDate").notNull(),
  salePrice: decimal("salePrice", { precision: 10, scale: 2 }).notNull(),
  amountPaid: decimal("amountPaid", { precision: 10, scale: 2 }).default("0").notNull(),
  weightAtSale: decimal("weightAtSale", { precision: 8, scale: 2 }),
  pricePerKg: decimal("pricePerKg", { precision: 10, scale: 2 }),
  buyerName: varchar("buyerName", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
}, table => ({
  animalUnique: uniqueIndex("sales_tenant_animal_unique").on(table.companyId, table.animalId),
  farmDateIdx: index("sales_farm_date_idx").on(table.companyId, table.farmId, table.saleDate, table.id),
  animalFk: foreignKey({
    name: "sales_animal_fk",
    columns: [table.companyId, table.animalId],
    foreignColumns: [animals.companyId, animals.id],
  }).onDelete("restrict"),
  farmFk: foreignKey({
    name: "sales_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
}));

// ─── BREEDING & LAMBING ───────────────────────────────────────────────────────

export const lambingLog = mysqlTable("saas_azal_lambing_log", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  farmId: int("farmId").notNull(),
  lambId: varchar("lambId", { length: 20 }).notNull(),
  speciesId: int("speciesId"),
  categoryId: int("categoryId"),
  birthDate: date("birthDate").notNull(),
  damId: int("damId"),
  sireId: int("sireId"),
  sex: mysqlEnum("sex", ["male", "female"]).notNull(),
  birthTypeId: int("birthTypeId").notNull(),
  birthWeightKg: decimal("birthWeightKg", { precision: 8, scale: 2 }),
  valueUsed: decimal("valueUsed", { precision: 10, scale: 2 }),
  groupId: int("groupId"),
  notes: text("notes"),
  isPromoted: boolean("isPromoted").default(false).notNull(),
  promotedHeadId: int("promotedHeadId"),
  promotedAnimalCode: varchar("promotedAnimalCode", { length: 20 }),
  promotedAnimalPurgedAt: timestamp("promotedAnimalPurgedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
  activeLambCode: varchar("activeLambCode", { length: 20 })
    .generatedAlwaysAs(() => sql`CASE WHEN \`deletedAt\` IS NULL THEN UPPER(\`lambId\`) ELSE NULL END`, { mode: "virtual" }),
}, table => ({
  companyIdUnique: uniqueIndex("lambing_log_company_id_id_unique").on(table.companyId, table.id),
  promotedHeadUnique: uniqueIndex("lambing_log_promoted_head_unique")
    .on(table.promotedHeadId),
  activeLambCodeUnique: uniqueIndex("lambing_log_farm_active_code_unique")
    .on(table.companyId, table.farmId, table.activeLambCode),
  farmDateIdx: index("lambing_log_farm_date_idx").on(table.companyId, table.farmId, table.birthDate, table.id),
  farmFk: foreignKey({
    name: "lambing_log_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
  damFk: foreignKey({
    name: "lambing_log_dam_fk",
    columns: [table.companyId, table.damId],
    foreignColumns: [animals.companyId, animals.id],
  }).onDelete("restrict"),
  sireFk: foreignKey({
    name: "lambing_log_sire_fk",
    columns: [table.companyId, table.sireId],
    foreignColumns: [animals.companyId, animals.id],
  }).onDelete("restrict"),
  speciesFk: foreignKey({
    name: "lambing_log_species_fk",
    columns: [table.companyId, table.speciesId],
    foreignColumns: [species.companyId, species.id],
  }).onDelete("restrict"),
  categoryFk: foreignKey({
    name: "lambing_log_category_fk",
    columns: [table.companyId, table.categoryId],
    foreignColumns: [animalCategories.companyId, animalCategories.id],
  }).onDelete("restrict"),
  groupFk: foreignKey({
    name: "lambing_log_group_fk",
    columns: [table.companyId, table.groupId],
    foreignColumns: [groups.companyId, groups.id],
  }).onDelete("restrict"),
  birthTypeFk: foreignKey({
    name: "lambing_log_birth_type_fk",
    columns: [table.companyId, table.birthTypeId],
    foreignColumns: [birthTypes.companyId, birthTypes.id],
  }).onDelete("restrict"),
  promotedAnimalFk: foreignKey({
    name: "lambing_log_promoted_animal_fk",
    columns: [table.companyId, table.promotedHeadId],
    foreignColumns: [animals.companyId, animals.id],
  }).onDelete("restrict"),
}));

// ─── FATTENING / WEIGHT LOG ───────────────────────────────────────────────────

export const weightLog = mysqlTable("saas_azal_weight_log", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  farmId: int("farmId").notNull(),
  animalId: int("animalId").notNull(),
  weighDate: date("weighDate").notNull(),
  weightKg: decimal("weightKg", { precision: 8, scale: 2 }).notNull(),
  sessionId: varchar("sessionId", { length: 36 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
}, table => ({
  animalDateIdx: index("weight_log_tenant_animal_date_idx")
    .on(table.companyId, table.animalId, table.weighDate, table.id),
  sessionUnique: uniqueIndex("weight_log_tenant_session_animal_unique")
    .on(table.companyId, table.sessionId, table.animalId),
  animalFk: foreignKey({
    name: "weight_log_animal_fk",
    columns: [table.companyId, table.animalId],
    foreignColumns: [animals.companyId, animals.id],
  }).onDelete("restrict"),
  farmFk: foreignKey({
    name: "weight_log_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
}));

// ─── FEED MANAGEMENT ──────────────────────────────────────────────────────────

export const rationPlans = mysqlTable("saas_azal_ration_plans", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  farmId: int("farmId"),
  categoryId: int("categoryId").notNull(),
  feedItemId: int("feedItemId").notNull(),
  qtyPerHeadPerDay: decimal("qtyPerHeadPerDay", { precision: 8, scale: 3 }).notNull(),
  effectiveDate: date("effectiveDate").notNull(),
  endDate: date("endDate"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
}, table => ({
  scopeActiveIdx: index("ration_plans_scope_active_idx")
    .on(table.companyId, table.farmId, table.categoryId, table.feedItemId, table.isActive, table.deletedAt),
  categoryFk: foreignKey({
    name: "ration_plans_category_fk",
    columns: [table.companyId, table.categoryId],
    foreignColumns: [animalCategories.companyId, animalCategories.id],
  }).onDelete("restrict"),
  feedItemFk: foreignKey({
    name: "ration_plans_feed_item_fk",
    columns: [table.companyId, table.feedItemId],
    foreignColumns: [feedItems.companyId, feedItems.id],
  }).onDelete("restrict"),
  farmFk: foreignKey({
    name: "ration_plans_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
}));

export const feedStockLedger = mysqlTable("saas_azal_feed_stock_ledger", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  farmId: int("farmId").notNull(),
  feedItemId: int("feedItemId").notNull(),
  transactionDate: date("transactionDate").notNull(),
  transactionType: mysqlEnum("transactionType", ["purchase", "stock_count", "adjustment"]).notNull(),
  qty: decimal("qty", { precision: 10, scale: 3 }).notNull(),
  unitCost: decimal("unitCost", { precision: 10, scale: 2 }),
  totalCost: decimal("totalCost", { precision: 10, scale: 2 }),
  supplierName: varchar("supplierName", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
}, table => ({
  farmItemDateIdx: index("feed_stock_ledger_farm_item_date_idx")
    .on(table.companyId, table.farmId, table.feedItemId, table.transactionDate, table.id),
  feedItemFk: foreignKey({
    name: "feed_stock_ledger_feed_item_fk",
    columns: [table.companyId, table.feedItemId],
    foreignColumns: [feedItems.companyId, feedItems.id],
  }).onDelete("restrict"),
  farmFk: foreignKey({
    name: "feed_stock_ledger_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
}));

// ─── EXPENSE LOG ──────────────────────────────────────────────────────────────

export const expenses = mysqlTable("saas_azal_expenses", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  farmId: int("farmId"),
  scopeType: mysqlEnum("scopeType", ["company", "farm"]).default("company").notNull(),
  expenseDate: date("expenseDate").notNull(),
  categoryId: int("categoryId").notNull(),
  subCategoryId: int("subCategoryId"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  targetType: mysqlEnum("targetType", ["general", "category", "head", "herd"]).notNull(),
  categoryTarget: int("categoryTarget"),
  headId: int("headId"),
  vendorName: varchar("vendorName", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
}, table => ({
  scopeDateIdx: index("expenses_scope_date_idx")
    .on(table.companyId, table.scopeType, table.farmId, table.expenseDate, table.id),
  categoryFk: foreignKey({
    name: "expenses_category_fk",
    columns: [table.companyId, table.categoryId],
    foreignColumns: [expenseCategories.companyId, expenseCategories.id],
  }).onDelete("restrict"),
  subCategoryFk: foreignKey({
    name: "expenses_sub_category_fk",
    columns: [table.companyId, table.subCategoryId],
    foreignColumns: [expenseSubCategories.companyId, expenseSubCategories.id],
  }).onDelete("restrict"),
  headFk: foreignKey({
    name: "expenses_head_fk",
    columns: [table.companyId, table.headId],
    foreignColumns: [animals.companyId, animals.id],
  }).onDelete("restrict"),
  farmFk: foreignKey({
    name: "expenses_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
  scopeCheck: check(
    "expenses_scope_check",
    sql`(\`scopeType\` = 'company' AND \`farmId\` IS NULL) OR (\`scopeType\` = 'farm' AND \`farmId\` IS NOT NULL)`,
  ),
}));

// ─── PREGNANCY TRACKING ───────────────────────────────────────────────────────
// One record per pregnancy of a female animal. The user records a confirmation
// date; the system treats it as gestation day 0 and computes the expected
// delivery date as confirmationDate + gestationDays (snapshotted from the
// animal's species at creation, so historical records stay stable). Closed
// automatically when a birth is registered against the dam.
export const pregnancyRecords = mysqlTable("saas_azal_pregnancy_records", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  farmId: int("farmId").notNull(),
  animalId: int("animalId").notNull(),
  sireId: int("sireId"),
  confirmationDate: date("confirmationDate").notNull(),
  gestationDays: int("gestationDays").notNull(),
  expectedDueDate: date("expectedDueDate").notNull(),
  notifyBeforeDue: int("notifyBeforeDue").default(7).notNull(),
  checkupDate: date("checkupDate"),
  notifyBeforeCheckup: int("notifyBeforeCheckup").default(3).notNull(),
  status: mysqlEnum("status", ["active", "delivered", "aborted", "lost"]).default("active").notNull(),
  outcomeLambingLogId: int("outcomeLambingLogId"),
  completedDate: date("completedDate"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  version: int("version").default(1).notNull(),
  activeAnimalGuard: int("activeAnimalGuard")
    .generatedAlwaysAs(() => sql`CASE WHEN \`status\` = 'active' AND \`deletedAt\` IS NULL THEN \`animalId\` ELSE NULL END`, { mode: "virtual" }),
}, table => ({
  activeAnimalUnique: uniqueIndex("pregnancy_records_tenant_active_animal_unique")
    .on(table.companyId, table.activeAnimalGuard),
  dueIdx: index("pregnancy_records_tenant_due_idx")
    .on(table.companyId, table.farmId, table.status, table.expectedDueDate),
  animalFk: foreignKey({
    name: "pregnancy_records_animal_fk",
    columns: [table.companyId, table.animalId],
    foreignColumns: [animals.companyId, animals.id],
  }).onDelete("restrict"),
  sireFk: foreignKey({
    name: "pregnancy_records_sire_fk",
    columns: [table.companyId, table.sireId],
    foreignColumns: [animals.companyId, animals.id],
  }).onDelete("restrict"),
  farmFk: foreignKey({
    name: "pregnancy_records_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
  outcomeFk: foreignKey({
    name: "pregnancy_records_outcome_fk",
    columns: [table.companyId, table.outcomeLambingLogId],
    foreignColumns: [lambingLog.companyId, lambingLog.id],
  }).onDelete("restrict"),
}));

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export const notifications = mysqlTable("saas_azal_notifications", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  farmId: int("farmId"),
  userId: int("userId"),
  alertType: varchar("alertType", { length: 50 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  relatedEntityType: varchar("relatedEntityType", { length: 50 }),
  relatedEntityId: varchar("relatedEntityId", { length: 50 }),
  isRead: boolean("isRead").default(false).notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  deduplicationKey: varchar("deduplicationKey", { length: 200 }),
  version: int("version").default(1).notNull(),
}, table => ({
  companyIdUnique: uniqueIndex("notifications_company_id_id_unique").on(table.companyId, table.id),
  deduplicationUnique: uniqueIndex("notifications_tenant_deduplication_unique")
    .on(table.companyId, table.alertType, table.deduplicationKey),
  companyTimeIdx: index("notifications_company_time_idx").on(table.companyId, table.createdAt, table.id),
  companyFk: foreignKey({
    name: "notifications_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("cascade"),
  farmFk: foreignKey({
    name: "notifications_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
  recipientFk: foreignKey({
    name: "notifications_recipient_fk",
    columns: [table.companyId, table.userId],
    foreignColumns: [companyMemberships.companyId, companyMemberships.userId],
  }).onDelete("restrict"),
}));

export const notificationReceipts = mysqlTable("saas_azal_notification_receipts", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  notificationId: int("notificationId").notNull(),
  companyMembershipId: int("companyMembershipId").notNull(),
  deliveredAt: timestamp("deliveredAt"),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  recipientUnique: uniqueIndex("notification_receipts_recipient_unique")
    .on(table.notificationId, table.companyMembershipId),
  unreadIdx: index("notification_receipts_unread_idx")
    .on(table.companyId, table.companyMembershipId, table.readAt, table.id),
  membershipFk: foreignKey({
    name: "notification_receipts_membership_fk",
    columns: [table.companyId, table.companyMembershipId],
    foreignColumns: [companyMemberships.companyId, companyMemberships.id],
  }).onDelete("cascade"),
  notificationFk: foreignKey({
    name: "notification_receipts_notification_fk",
    columns: [table.companyId, table.notificationId],
    foreignColumns: [notifications.companyId, notifications.id],
  }).onDelete("cascade"),
}));

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────

export const auditLog = mysqlTable("saas_azal_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: int("companyId"),
  farmId: int("farmId"),
  userId: int("userId"),
  membershipId: int("membershipId"),
  platformAdministratorId: int("platformAdministratorId"),
  supportAccessGrantId: int("supportAccessGrantId"),
  actorType: mysqlEnum("actorType", ["tenant_user", "platform_admin", "support", "system_job", "migration"]).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  actionCategory: mysqlEnum("actionCategory", ["auth", "crud", "config", "membership", "billing", "security", "data_export", "data_delete", "company"]).notNull(),
  entityType: varchar("entityType", { length: 50 }).notNull(),
  entityId: varchar("entityId", { length: 50 }),
  oldValues: json("oldValues"),
  newValues: json("newValues"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: varchar("userAgent", { length: 500 }),
  requestId: varchar("requestId", { length: 64 }),
  outcome: mysqlEnum("outcome", ["success", "denied", "error"]).default("success").notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Revert tracking: when this action was undone, by whom, and (on a "revert"
  // entry) which original audit row it undoes.
  revertedAt: timestamp("revertedAt"),
  revertedByUserId: int("revertedByUserId"),
  revertOfAuditId: int("revertOfAuditId"),
  version: int("version").default(1).notNull(),
}, table => ({
  companyTimeIdx: index("audit_log_company_time_idx").on(table.companyId, table.createdAt, table.id),
  actorTimeIdx: index("audit_log_actor_time_idx")
    .on(table.actorType, table.platformAdministratorId, table.userId, table.createdAt),
  requestIdx: index("audit_log_request_idx").on(table.requestId),
  entityIdx: index("audit_log_entity_v2_idx").on(table.companyId, table.entityType, table.entityId, table.createdAt),
  companyFk: foreignKey({
    name: "audit_log_company_fk",
    columns: [table.companyId],
    foreignColumns: [companies.id],
  }).onDelete("restrict"),
  farmFk: foreignKey({
    name: "audit_log_farm_fk",
    columns: [table.companyId, table.farmId],
    foreignColumns: [farms.companyId, farms.id],
  }).onDelete("restrict"),
  membershipFk: foreignKey({
    name: "audit_log_membership_fk",
    columns: [table.companyId, table.membershipId],
    foreignColumns: [companyMemberships.companyId, companyMemberships.id],
  }).onDelete("restrict"),
  platformAdministratorFk: foreignKey({
    name: "audit_log_platform_admin_fk",
    columns: [table.platformAdministratorId],
    foreignColumns: [platformAdministrators.id],
  }).onDelete("restrict"),
  supportGrantFk: foreignKey({
    name: "audit_log_support_grant_fk",
    columns: [table.companyId, table.supportAccessGrantId],
    foreignColumns: [supportAccessGrants.companyId, supportAccessGrants.id],
  }).onDelete("restrict"),
}));

// ─── TYPE EXPORTS ─────────────────────────────────────────────────────────────

export type Species = typeof species.$inferSelect;
export type AnimalCategory = typeof animalCategories.$inferSelect;
export type AnimalStatus = typeof animalStatuses.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Owner = typeof owners.$inferSelect;
export type InsertOwner = typeof owners.$inferInsert;
export type BirthType = typeof birthTypes.$inferSelect;
export type FeedItem = typeof feedItems.$inferSelect;
export type FeedItemPriceHistory = typeof feedItemPriceHistory.$inferSelect;
export type Vaccine = typeof vaccines.$inferSelect;
export type VaccinationRecord = typeof vaccinationRecords.$inferSelect;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type ExpenseSubCategory = typeof expenseSubCategories.$inferSelect;
export type Animal = typeof animals.$inferSelect;
export type AnimalStatusHistory = typeof animalStatusHistory.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type LambingLog = typeof lambingLog.$inferSelect;
export type WeightLog = typeof weightLog.$inferSelect;
export type RationPlan = typeof rationPlans.$inferSelect;
export type FeedStockLedger = typeof feedStockLedger.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type PregnancyRecord = typeof pregnancyRecords.$inferSelect;
export type InsertPregnancyRecord = typeof pregnancyRecords.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;
export type Farm = typeof farms.$inferSelect;
export type InsertFarm = typeof farms.$inferInsert;
export type CompanyMembership = typeof companyMemberships.$inferSelect;
export type InsertCompanyMembership = typeof companyMemberships.$inferInsert;
export type FarmMembership = typeof farmMemberships.$inferSelect;
export type CompanyInvitation = typeof companyInvitations.$inferSelect;
export type TenantSession = typeof tenantSessions.$inferSelect;
export type PlatformAdministrator = typeof platformAdministrators.$inferSelect;
export type PlatformSession = typeof platformSessions.$inferSelect;
export type FeatureCatalogEntry = typeof featureCatalog.$inferSelect;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type PlanEntitlement = typeof planEntitlements.$inferSelect;
export type CompanySubscription = typeof companySubscriptions.$inferSelect;
export type CompanyFeatureOverride = typeof companyFeatureOverrides.$inferSelect;
export type UsageCounter = typeof usageCounters.$inferSelect;
export type SupportAccessGrant = typeof supportAccessGrants.$inferSelect;
export type SecurityEvent = typeof securityEvents.$inferSelect;
export type TenantFile = typeof tenantFiles.$inferSelect;
export type BackgroundJob = typeof backgroundJobs.$inferSelect;
export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type ExportJob = typeof exportJobs.$inferSelect;
export type DeletionRequest = typeof deletionRequests.$inferSelect;
export type TenantRestoreJob = typeof tenantRestoreJobs.$inferSelect;
