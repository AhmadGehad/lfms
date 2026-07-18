import { and, desc, eq, like, lt, or, sql, type SQL } from "drizzle-orm";
import { companies, companyMemberships, farmMemberships, farms, users } from "../../../drizzle/schema";
import { decodeCursor } from "../../../shared/platformApi";
import { publicCursorPage, requirePlatformDb, type PlatformDb } from "./db";

export async function listMembershipRecords(input: {
  cursor?: string | null;
  limit: number;
  search?: string;
  status?: typeof companyMemberships.$inferSelect.status;
  companyPublicId?: string;
}) {
  const db = await requirePlatformDb();
  const cursor = decodeCursor<{ id?: unknown }>(input.cursor);
  const conditions: SQL[] = [];
  if (typeof cursor?.id === "number") conditions.push(lt(companyMemberships.id, cursor.id));
  if (input.status) conditions.push(eq(companyMemberships.status, input.status));
  if (input.companyPublicId) conditions.push(eq(companies.publicId, input.companyPublicId));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(like(users.name, term), like(users.email, term), like(companies.name, term))!);
  }
  const rows = await db.select({
    cursorId: companyMemberships.id,
    publicId: companyMemberships.publicId,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    userPublicId: users.publicId,
    userName: users.name,
    email: users.email,
    role: companyMemberships.role,
    status: companyMemberships.status,
    farmAccessMode: companyMemberships.farmAccessMode,
    version: companyMemberships.version,
    farmCount: sql<number>`(SELECT COUNT(*) FROM ${farmMemberships} fm WHERE fm.companyMembershipId = ${companyMemberships.id} AND fm.companyId = ${companyMemberships.companyId})`,
    assignedFarmPublicIds: sql<string>`COALESCE((
      SELECT GROUP_CONCAT(f.publicId ORDER BY f.name SEPARATOR ',')
      FROM ${farmMemberships} fm
      INNER JOIN ${farms} f ON f.id = fm.farmId AND f.companyId = fm.companyId
      WHERE fm.companyMembershipId = ${companyMemberships.id}
        AND fm.companyId = ${companyMemberships.companyId}
    ), '')`,
    lastSignedIn: users.lastSignedIn,
    createdAt: companyMemberships.createdAt,
  }).from(companyMemberships)
    .innerJoin(companies, eq(companyMemberships.companyId, companies.id))
    .innerJoin(users, eq(companyMemberships.userId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(companyMemberships.id))
    .limit(input.limit + 1);
  return publicCursorPage(rows, input.limit);
}

export async function findMembershipByPublicId(publicId: string, db?: PlatformDb) {
  const handle = db ?? await requirePlatformDb();
  const [membership] = await handle.select().from(companyMemberships).where(eq(companyMemberships.publicId, publicId)).limit(1);
  return membership ?? null;
}

export async function countMembershipTotal() {
  const db = await requirePlatformDb();
  const [row] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(companyMemberships)
    .where(eq(companyMemberships.status, "active"));
  return Number(row?.count ?? 0);
}
