import { and, desc, eq, like, lt, or, sql, type SQL } from "drizzle-orm";
import {
  platformAdministratorRoles,
  platformAdministrators,
  platformRolePermissions,
  platformRoles,
  users,
} from "../../../drizzle/schema";
import { decodeCursor } from "../../../shared/platformApi";
import { publicCursorPage, requirePlatformDb, type PlatformDb } from "./db";

export async function listAdministratorRecords(input: {
  cursor?: string | null;
  limit: number;
  search?: string;
  status?: typeof platformAdministrators.$inferSelect.status;
}) {
  const db = await requirePlatformDb();
  const cursor = decodeCursor<{ id?: unknown }>(input.cursor);
  const conditions: SQL[] = [];
  if (typeof cursor?.id === "number") conditions.push(lt(platformAdministrators.id, cursor.id));
  if (input.status) conditions.push(eq(platformAdministrators.status, input.status));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(like(users.name, term), like(users.email, term))!);
  }
  const rows = await db.select({
    cursorId: platformAdministrators.id,
    publicId: platformAdministrators.publicId,
    name: users.name,
    email: users.email,
    status: platformAdministrators.status,
    mfaRequired: platformAdministrators.mfaRequired,
    version: platformAdministrators.version,
    roleCodes: sql<string>`COALESCE((
      SELECT GROUP_CONCAT(pr.code ORDER BY pr.code SEPARATOR ',')
      FROM ${platformAdministratorRoles} par
      INNER JOIN ${platformRoles} pr ON pr.id = par.platformRoleId
      WHERE par.platformAdministratorId = ${platformAdministrators.id}
    ), '')`,
    lastSignedIn: users.lastSignedIn,
    updatedAt: platformAdministrators.updatedAt,
  }).from(platformAdministrators)
    .innerJoin(users, eq(platformAdministrators.userId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(platformAdministrators.id))
    .limit(input.limit + 1);
  return publicCursorPage(rows.map(row => ({
    ...row,
    roleCodes: row.roleCodes ? row.roleCodes.split(",").filter(Boolean) : [],
  })), input.limit);
}

export async function listPlatformRoleRecords() {
  const db = await requirePlatformDb();
  return db.select({
    code: platformRoles.code,
    name: platformRoles.name,
    description: platformRoles.description,
    isSystem: platformRoles.isSystem,
    version: platformRoles.version,
    permissionCount: sql<number>`COUNT(${platformRolePermissions.platformPermissionId})`,
  }).from(platformRoles)
    .leftJoin(platformRolePermissions, eq(platformRolePermissions.platformRoleId, platformRoles.id))
    .groupBy(platformRoles.id)
    .orderBy(platformRoles.name);
}

export async function findAdministratorByPublicId(publicId: string, db: PlatformDb) {
  const [administrator] = await db.select().from(platformAdministrators)
    .where(eq(platformAdministrators.publicId, publicId))
    .limit(1);
  return administrator ?? null;
}
