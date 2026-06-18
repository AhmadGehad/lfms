import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { rolePermissions } from "../drizzle/schema";
import {
  isKnownPermission,
  permissionKey,
  type AppRole,
  type PermissionAction,
  type PermissionOverrides,
  type PermissionPage,
} from "../shared/permissions";
import { createAuditEntry, getDb } from "./db";

export async function getRolePermissionOverrides(
  role: AppRole,
): Promise<PermissionOverrides> {
  return (await getRolePermissionState(role)).overrides;
}

function permissionRevision(rows: Array<typeof rolePermissions.$inferSelect>) {
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

  const rows = await db
    .select()
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

  await db.transaction(async tx => {
    const beforeRows = await tx
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.role, role))
      .for("update");
    if (
      expectedRevision !== undefined &&
      permissionRevision(beforeRows) !== expectedRevision
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Role permissions changed. Reload and try again.",
      });
    }
    const before = Object.fromEntries(
      beforeRows.map(row => [`${row.page}:${row.action}`, row.allowed]),
    );
    await tx.delete(rolePermissions).where(eq(rolePermissions.role, role));
    if (entries.length > 0) {
      await tx.insert(rolePermissions).values(
        entries.map(entry => ({
          role,
          page: entry.page,
          action: entry.action,
          allowed: entry.allowed,
          updatedBy,
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
  await db.delete(rolePermissions).where(and(
    eq(rolePermissions.role, role),
    eq(rolePermissions.page, page),
    eq(rolePermissions.action, action),
  ));
}
