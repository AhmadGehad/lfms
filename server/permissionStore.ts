import { and, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { companyRolePermissions, rolePermissions } from "../drizzle/schema";
import {
  isKnownPermission,
  permissionKey,
  type AppRole,
  type PermissionAction,
  type PermissionOverrides,
  type PermissionPage,
} from "../shared/permissions";
import { createAuditEntry, getDb } from "./db";
import { getTenantActorContext, isTenantUserContext } from "./tenancy/runtime";

export async function getRolePermissionOverrides(
  role: AppRole,
): Promise<PermissionOverrides> {
  return (await getRolePermissionState(role)).overrides;
}

type PermissionRevisionRow = {
  page: string;
  action: string;
  allowed: boolean;
  updatedAt: Date;
};

function permissionRevision(rows: PermissionRevisionRow[]) {
  return JSON.stringify(
    rows
      .map(row => [
        row.page,
        row.action,
        row.allowed,
        new Date(row.updatedAt).getTime(),
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])) ||
        String(a[1]).localeCompare(String(b[1]))),
  );
}

export async function getRolePermissionState(role: AppRole) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const actor = getTenantActorContext();
  const rows: PermissionRevisionRow[] = actor && isTenantUserContext(actor)
    ? await db.select({
        page: companyRolePermissions.resource,
        action: companyRolePermissions.action,
        allowed: sql<boolean>`${companyRolePermissions.effect} = 'allow'`,
        updatedAt: companyRolePermissions.updatedAt,
      })
        .from(companyRolePermissions)
        .where(and(
          eq(companyRolePermissions.companyId, actor.companyId),
          eq(companyRolePermissions.role, role),
        ))
    : await db.select({
        page: rolePermissions.page,
        action: rolePermissions.action,
        allowed: rolePermissions.allowed,
        updatedAt: rolePermissions.updatedAt,
      })
        .from(rolePermissions)
        .where(eq(rolePermissions.role, role));

  const overrides: PermissionOverrides = {};
  for (const row of rows) {
    if (!isKnownPermission(row.page, row.action)) continue;
    overrides[permissionKey(
      row.page as PermissionPage,
      row.action as PermissionAction,
    )] = row.allowed;
  }
  return { overrides, revision: permissionRevision(rows) };
}

export async function replaceRolePermissions(
  role: AppRole,
  entries: Array<{
    page: PermissionPage;
    action: PermissionAction;
    allowed: boolean;
  }>,
  updatedBy: number,
  ipAddress?: string,
  expectedRevision?: string,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const actor = getTenantActorContext();
  if (!actor || !isTenantUserContext(actor)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Company context required" });
  }

  await db.transaction(async tx => {
    const beforeRows = await tx
      .select()
      .from(companyRolePermissions)
      .where(and(
        eq(companyRolePermissions.companyId, actor.companyId),
        eq(companyRolePermissions.role, role),
      ))
      .for("update");
    const beforeRevisionRows: PermissionRevisionRow[] = beforeRows.map(row => ({
      page: row.resource,
      action: row.action,
      allowed: row.effect === "allow",
      updatedAt: row.updatedAt,
    }));
    if (
      expectedRevision !== undefined &&
      permissionRevision(beforeRevisionRows) !== expectedRevision
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Role permissions changed. Reload and try again.",
      });
    }
    const before = Object.fromEntries(
      beforeRows.map(row => [`${row.resource}:${row.action}`, row.effect === "allow"]),
    );
    await tx.delete(companyRolePermissions).where(and(
      eq(companyRolePermissions.companyId, actor.companyId),
      eq(companyRolePermissions.role, role),
    ));
    if (entries.length > 0) {
      await tx.insert(companyRolePermissions).values(
        entries.map(entry => ({
          companyId: actor.companyId,
          role,
          resource: entry.page,
          action: entry.action,
          effect: entry.allowed ? "allow" as const : "deny" as const,
          updatedByMembershipId: actor.membershipId,
        })),
      );
    }
    await createAuditEntry({
      userId: updatedBy,
      entityType: "role_permissions",
      entityId: role,
      action: "update",
      oldValues: before,
      newValues: Object.fromEntries(
        entries.map(entry => [
          `${entry.page}:${entry.action}`,
          entry.allowed,
        ]),
      ),
      ipAddress,
    }, tx);
  });
}

export async function clearInvalidRolePermission(
  role: AppRole,
  page: string,
  action: string,
) {
  const db = await getDb();
  if (!db) return;
  const actor = getTenantActorContext();
  if (actor && isTenantUserContext(actor)) {
    await db.delete(companyRolePermissions).where(and(
      eq(companyRolePermissions.companyId, actor.companyId),
      eq(companyRolePermissions.role, role),
      eq(companyRolePermissions.resource, page),
      eq(companyRolePermissions.action, action),
    ));
    return;
  }
  await db.delete(rolePermissions).where(and(
      eq(rolePermissions.role, role),
      eq(rolePermissions.page, page),
      eq(rolePermissions.action, action),
    ));
}
