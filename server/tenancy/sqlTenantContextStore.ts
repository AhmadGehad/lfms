import { and, eq, isNull } from "drizzle-orm";
import {
  companies,
  companyMemberships,
  companyRolePermissions,
  farms,
  farmMemberships,
} from "../../drizzle/schema";
import {
  isKnownPermission,
  permissionKey,
  type AppRole,
  type PermissionOverrides,
} from "../../shared/permissions";
import { getDb } from "../db";
import type { TenantContextStore } from "./resolveTenantContext";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

export class SqlTenantContextStore implements TenantContextStore {
  async findCompanyBySlug(slug: string) {
    const db = await requireDb();
    const [row] = await db
      .select({
        id: companies.id,
        publicId: companies.publicId,
        slug: companies.slug,
        lifecycleStatus: companies.lifecycleStatus,
        entitlementVersion: companies.entitlementVersion,
      })
      .from(companies)
      .where(eq(companies.slug, slug))
      .limit(1);
    return row ?? null;
  }

  async findMembership(companyId: number, userId: number) {
    const db = await requireDb();
    const [row] = await db
      .select({
        id: companyMemberships.id,
        companyId: companyMemberships.companyId,
        userId: companyMemberships.userId,
        role: companyMemberships.role,
        status: companyMemberships.status,
        farmAccessMode: companyMemberships.farmAccessMode,
        authorizationVersion: companyMemberships.authorizationVersion,
      })
      .from(companyMemberships)
      .where(and(
        eq(companyMemberships.companyId, companyId),
        eq(companyMemberships.userId, userId),
      ))
      .limit(1);
    return row ?? null;
  }

  async findFarmIdByPublicId(companyId: number, publicId: string) {
    const db = await requireDb();
    const [row] = await db.select({ id: farms.id }).from(farms).where(and(
      eq(farms.companyId, companyId),
      eq(farms.publicId, publicId),
      eq(farms.status, "active"),
      isNull(farms.deletedAt),
    )).limit(1);
    return row?.id ?? null;
  }

  async listAccessibleFarmIds(companyId: number, membershipId: number) {
    const db = await requireDb();
    const rows = await db
      .select({ farmId: farmMemberships.farmId })
      .from(farmMemberships)
      .innerJoin(farms, and(
        eq(farms.companyId, farmMemberships.companyId),
        eq(farms.id, farmMemberships.farmId),
        eq(farms.status, "active"),
        isNull(farms.deletedAt),
      ))
      .where(and(
        eq(farmMemberships.companyId, companyId),
        eq(farmMemberships.companyMembershipId, membershipId),
      ));
    return rows.map(row => row.farmId);
  }

  async listCompanyFarmIds(companyId: number) {
    const db = await requireDb();
    const rows = await db
      .select({ id: farms.id })
      .from(farms)
      .where(and(
        eq(farms.companyId, companyId),
        eq(farms.status, "active"),
        isNull(farms.deletedAt),
      ));
    return rows.map(row => row.id);
  }

  async loadPermissionOverrides(companyId: number, role: AppRole) {
    const db = await requireDb();
    const rows = await db
      .select({
        resource: companyRolePermissions.resource,
        action: companyRolePermissions.action,
        effect: companyRolePermissions.effect,
      })
      .from(companyRolePermissions)
      .where(and(
        eq(companyRolePermissions.companyId, companyId),
        eq(companyRolePermissions.role, role),
      ));

    const overrides: PermissionOverrides = {};
    for (const row of rows) {
      if (!isKnownPermission(row.resource, row.action)) continue;
      overrides[permissionKey(row.resource, row.action as never)] = row.effect === "allow";
    }
    return overrides;
  }
}
