import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import {
  animals,
  auditLog,
  backgroundJobs,
  companies,
  companyMemberships,
  companyInvitations,
  companySubscriptions,
  farms,
  featureCatalog,
  idempotencyKeys,
  notificationReceipts,
  platformAdministrators,
  platformSessions,
  supportAccessGrants,
  tenantFiles,
  tenantSessions,
  usageCounters,
} from "../drizzle/schema";

const root = path.resolve(import.meta.dirname, "..");

describe("multi-tenant schema foundation", () => {
  it("exports tenant, platform, entitlement, usage, and operations tables", () => {
    for (const table of [
      companies,
      farms,
      companyMemberships,
      platformAdministrators,
      featureCatalog,
      companySubscriptions,
      usageCounters,
      supportAccessGrants,
      backgroundJobs,
      idempotencyKeys,
      auditLog,
      notificationReceipts,
    ]) {
      expect(getTableConfig(table).name).toBeTruthy();
    }
  });

  it("keeps tenant authorization out of the session record", () => {
    const columns = getTableColumns(tenantSessions);
    expect(columns).toHaveProperty("lastSelectedCompanyId");
    expect(columns).not.toHaveProperty("companyId");
    expect(columns).not.toHaveProperty("companyMembershipId");
    expect(getTableColumns(platformSessions)).not.toHaveProperty("userId");
  });

  it("uses company-scoped composite foreign keys for animal ownership", () => {
    const foreignKeys = getTableConfig(animals).foreignKeys.map(key =>
      key.reference()
    );
    expect(foreignKeys.length).toBeGreaterThanOrEqual(6);
    for (const reference of foreignKeys) {
      expect(reference.columns).toContain(animals.companyId);
    }
  });

  it("keeps Drizzle foreign keys aligned with manual migrations", () => {
    const schemaForeignKeys = new Set<string>();
    for (const value of Object.values(schema)) {
      try {
        for (const foreignKey of getTableConfig(value as any).foreignKeys) {
          schemaForeignKeys.add(foreignKey.getName());
        }
      } catch {
        // Runtime exports also include inferred TypeScript helpers.
      }
    }
    const sql = [
      "0024_saas_control_plane.sql",
      "0026_legacy_azal_backfill.sql",
      "0027_tenant_scope_contract.sql",
      "0028_lifecycle_processors.sql",
      "0029_secure_company_invitations.sql",
      "0032_saas_legacy_user_links.sql",
      "0037_saas_company_branding.sql",
      "0038_saas_company_branding_favicon.sql",
    ]
      .map(file => readFileSync(path.join(root, "drizzle", file), "utf8"))
      .join("\n");
    const migrationForeignKeys = new Set(
      [...sql.matchAll(/CONSTRAINT\s+`([^`]+)`\s+FOREIGN KEY/g)].map(
        match => match[1]
      )
    );
    // This circular export_jobs <-> tenant_files edge is enforced in SQL. It
    // cannot be declared in both Drizzle initializers without circular type
    // inference, so the database migration remains authoritative.
    migrationForeignKeys.delete("tenant_files_generated_export_fk");
    expect([...schemaForeignKeys].sort()).toEqual(
      [...migrationForeignKeys].sort()
    );
  });

  it("has create and rollback coverage for every schema table", () => {
    const schemaTables = new Set<string>();
    for (const value of Object.values(schema)) {
      try {
        const config = getTableConfig(value as any);
        // This suite verifies the additive SaaS schema and its reversible
        // migrations. Legacy LFMS tables are intentionally read-only in this
        // rollout and must not be pulled into the SaaS migration contract.
        if (config.name?.startsWith("saas_")) schemaTables.add(config.name);
      } catch {
        // Non-table runtime exports are ignored.
      }
    }
    const controlPlaneMigration = readFileSync(
      path.join(root, "drizzle", "0024_saas_control_plane.sql"),
      "utf8"
    );
    const legacyControlPlaneTables = new Set(
      [
        ...controlPlaneMigration.matchAll(
          /CREATE TABLE(?: IF NOT EXISTS)?\s+`([^`]+)`/gi
        ),
      ].map(match => match[1])
    );
    const sql = readdirSync(path.join(root, "drizzle"))
      .filter(file => file.endsWith(".sql"))
      .map(file => readFileSync(path.join(root, "drizzle", file), "utf8"))
      .join("\n");
    const createdTables = new Set(
      [...sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+`([^`]+)`/gi)]
        .map(match => match[1])
        .filter(table => table.startsWith("saas_"))
    );
    for (const table of legacyControlPlaneTables) {
      createdTables.add(
        table === "saas_schema_migrations" ? table : `saas_${table}`
      );
    }
    createdTables.add("saas_users");

    // Legacy business tables are copied only into an Azal-prefixed development
    // snapshot. The script is deliberately additive: it never renames or
    // alters the legacy source tables.
    const snapshotScript = readFileSync(
      path.join(root, "scripts", "provision-azal-dev-snapshot.mjs"),
      "utf8"
    );
    const legacyTableBlock =
      snapshotScript.match(/const legacyTables = \[([\s\S]*?)\];/)?.[1] ?? "";
    const snapshotBusinessTables = [
      ...legacyTableBlock.matchAll(/"([^"\n]+)"/g),
    ].map(match => `saas_azal_${match[1]}`);
    for (const table of snapshotBusinessTables) createdTables.add(table);
    for (const table of snapshotScript.matchAll(
      /CREATE TABLE IF NOT EXISTS \\?`(saas_azal_[^\\`]+)\\?`/g
    )) {
      createdTables.add(table[1]);
    }
    const isolatedStageScript = readFileSync(
      path.join(root, "scripts", "bootstrap-isolated-tenant-stage.mjs"),
      "utf8"
    );
    for (const table of isolatedStageScript.matchAll(
      /CREATE TABLE IF NOT EXISTS\s+(saas_azal_[a-z0-9_]+)/gi
    )) {
      createdTables.add(table[1]);
    }
    expect(snapshotScript).toContain(
      "SAAS_AZAL_SNAPSHOT_CONFIRM=read-legacy-write-new"
    );
    expect(isolatedStageScript).toContain(
      "ISOLATED_STAGE_CONFIRM=new-saas-tables-only"
    );
    expect([...createdTables].sort()).toEqual([...schemaTables].sort());

    for (const version of [
      "0024_saas_control_plane",
      "0026_legacy_azal_backfill",
      "0037_saas_company_branding",
    ]) {
      const migration = readFileSync(
        path.join(root, "drizzle", `${version}.sql`),
        "utf8"
      );
      const rollback = readFileSync(
        path.join(root, "drizzle", "rollback", `${version}.sql`),
        "utf8"
      );
      const creates = [
        ...migration.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+`([^`]+)`/gi),
      ]
        .map(match => match[1])
        .sort();
      const drops = [...rollback.matchAll(/DROP TABLE\s+`([^`]+)`/gi)]
        .map(match => match[1])
        .sort();
      expect(drops).toEqual(creates);
    }
  });

  it("guards concurrent support grants for the same active ticket", () => {
    const index = getTableConfig(supportAccessGrants).indexes.find(
      item => item.config.name === "support_access_grants_active_ticket_unique"
    );
    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns).toContain(
      supportAccessGrants.activeCompanyTicketGuard
    );
  });

  it("supports global and tenant-scoped idempotency without storing raw keys", () => {
    const columns = getTableColumns(idempotencyKeys);
    expect(columns.companyId.notNull).toBe(false);
    const index = getTableConfig(idempotencyKeys).indexes.find(
      item => item.config.name === "idempotency_keys_scope_unique"
    );
    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns).toContain(idempotencyKeys.scopeCompanyId);
    expect(columns).toHaveProperty("keyHash");
    expect(columns).not.toHaveProperty("rawKey");
  });

  it("stores invitation credentials as hashes with one inviter and a bound pending subject", () => {
    const columns = getTableColumns(companyInvitations);
    expect(columns).toHaveProperty("tokenHash");
    expect(columns).not.toHaveProperty("token");
    expect(columns.providerSubjectHash.notNull).toBe(true);
    expect(columns.invitedByMembershipId.notNull).toBe(false);
    expect(columns.invitedByPlatformAdministratorId.notNull).toBe(false);
    const config = getTableConfig(companyInvitations);
    expect(
      config.indexes.find(
        index => index.config.name === "company_invitations_active_email_unique"
      )?.config.unique
    ).toBe(true);
    const migration = readFileSync(
      path.join(root, "drizzle/0034_saas_company_invitation_subject_required.sql"),
      "utf8"
    );
    expect(migration).toContain("providerSubjectHash");
    expect(migration).toContain("NOT NULL");
  });

  it("ships ordered migration and reverse-order rollback gates", () => {
    const migrations = [
      "0024_saas_control_plane.sql",
      "0025_tenant_scope_expand.sql",
      "0026_legacy_azal_backfill.sql",
      "0027_tenant_scope_contract.sql",
      "0028_lifecycle_processors.sql",
      "0029_secure_company_invitations.sql",
      "0030_platform_administrator_permissions.sql",
    ];
    for (const file of migrations) {
      expect(
        readFileSync(path.join(root, "drizzle", file), "utf8").length
      ).toBeGreaterThan(500);
      expect(
        readFileSync(path.join(root, "drizzle", "rollback", file), "utf8")
          .length
      ).toBeGreaterThan(200);
    }
  });

  it("attributes system exports to their durable job rather than a tenant member", () => {
    const columns = getTableColumns(tenantFiles);
    expect(columns.uploadedByMembershipId.notNull).toBe(false);
    expect(columns).toHaveProperty("generatedByBackgroundJobId");
    expect(columns).toHaveProperty("generatedByExportJobId");
    const jobIndex = getTableConfig(tenantFiles).indexes.find(
      item => item.config.name === "tenant_files_generated_job_unique"
    );
    expect(jobIndex?.config.unique).toBe(true);
    const migration = readFileSync(
      path.join(root, "drizzle/0028_lifecycle_processors.sql"),
      "utf8"
    );
    expect(migration).toContain("tenant_files_attribution_check");
    expect(migration).toContain("tenant_files_generated_export_fk");
  });

  it("grants dedicated administrator permissions only to the platform admin role", () => {
    const migration = readFileSync(
      path.join(root, "drizzle/0030_platform_administrator_permissions.sql"),
      "utf8"
    );
    const rollback = readFileSync(
      path.join(
        root,
        "drizzle/rollback/0030_platform_administrator_permissions.sql"
      ),
      "utf8"
    );
    expect(migration).toContain("'administrators.read'");
    expect(migration).toContain("'administrators.write'");
    expect(migration).toContain("WHERE r.`code` = 'platform_admin'");
    expect(migration).not.toContain("WHERE r.`code` = 'platform_support'");
    expect(rollback).toContain("'administrators.read','administrators.write'");
  });

  it("backfills the approved LFMS feature codes and hard tenant constraints", () => {
    const backfill = readFileSync(
      path.join(root, "drizzle/0026_legacy_azal_backfill.sql"),
      "utf8"
    );
    const contract = readFileSync(
      path.join(root, "drizzle/0027_tenant_scope_contract.sql"),
      "utf8"
    );
    for (const code of [
      "core",
      "animals",
      "breeding",
      "pregnancy",
      "fattening",
      "feed",
      "vaccinations",
      "expenses",
      "reporting",
      "sales",
      "notifications",
      "audit",
      "user_management",
      "configuration",
      "farm_map",
      "data_transfer",
      "data_recovery",
    ]) {
      expect(backfill).toContain(`'${code}'`);
    }
    expect(contract).toContain("MODIFY COLUMN `companyId` int NOT NULL");
    expect(contract).toContain("FOREIGN KEY (`companyId`,`farmId`)");
  });
});
