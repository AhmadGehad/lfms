import { and, desc, eq, isNull, like, lt, or, sql, type SQL } from "drizzle-orm";
import { companies, farmMemberships, farms } from "../../../drizzle/schema";
import { decodeCursor } from "../../../shared/platformApi";
import { publicCursorPage, requirePlatformDb, type PlatformDb } from "./db";

export async function listFarmRecords(input: {
  cursor?: string | null;
  limit: number;
  search?: string;
  status?: typeof farms.$inferSelect.status;
  companyPublicId?: string;
}) {
  const db = await requirePlatformDb();
  const cursor = decodeCursor<{ id?: unknown }>(input.cursor);
  const conditions: SQL[] = [isNull(farms.deletedAt)];
  if (typeof cursor?.id === "number") conditions.push(lt(farms.id, cursor.id));
  if (input.status) conditions.push(eq(farms.status, input.status));
  if (input.companyPublicId) conditions.push(eq(companies.publicId, input.companyPublicId));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(like(farms.name, term), like(farms.code, term), like(companies.name, term))!);
  }
  const rows = await db.select({
    cursorId: farms.id,
    publicId: farms.publicId,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    name: farms.name,
    code: farms.code,
    timezone: farms.timezone,
    status: farms.status,
    version: farms.version,
    memberCount: sql<number>`(SELECT COUNT(*) FROM ${farmMemberships} fm WHERE fm.farmId = ${farms.id} AND fm.companyId = ${farms.companyId})`,
    createdAt: farms.createdAt,
    updatedAt: farms.updatedAt,
  }).from(farms)
    .innerJoin(companies, eq(farms.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(desc(farms.id))
    .limit(input.limit + 1);
  return publicCursorPage(rows, input.limit);
}

export async function findFarmByPublicId(publicId: string, db?: PlatformDb) {
  const handle = db ?? await requirePlatformDb();
  const [farm] = await handle.select().from(farms).where(eq(farms.publicId, publicId)).limit(1);
  return farm ?? null;
}

export async function getFarmRecord(publicId: string) {
  const db = await requirePlatformDb();
  const [row] = await db.select({
    publicId: farms.publicId,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    name: farms.name,
    code: farms.code,
    timezone: farms.timezone,
    latitude: farms.latitude,
    longitude: farms.longitude,
    status: farms.status,
    settings: farms.settings,
    version: farms.version,
    memberCount: sql<number>`(SELECT COUNT(*) FROM ${farmMemberships} fm WHERE fm.farmId = ${farms.id} AND fm.companyId = ${farms.companyId})`,
    createdAt: farms.createdAt,
    updatedAt: farms.updatedAt,
  }).from(farms)
    .innerJoin(companies, eq(farms.companyId, companies.id))
    .where(and(eq(farms.publicId, publicId), isNull(farms.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function listFarmExportRows(input: {
  search?: string;
  status?: typeof farms.$inferSelect.status;
  companyPublicId?: string;
  limit: number;
}) {
  const db = await requirePlatformDb();
  const conditions: SQL[] = [isNull(farms.deletedAt)];
  if (input.status) conditions.push(eq(farms.status, input.status));
  if (input.companyPublicId) conditions.push(eq(companies.publicId, input.companyPublicId));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(like(farms.name, term), like(farms.code, term), like(companies.name, term))!);
  }
  return db.select({
    publicId: farms.publicId,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    name: farms.name,
    code: farms.code,
    timezone: farms.timezone,
    status: farms.status,
    memberCount: sql<number>`(SELECT COUNT(*) FROM ${farmMemberships} fm WHERE fm.farmId = ${farms.id} AND fm.companyId = ${farms.companyId})`,
    createdAt: farms.createdAt,
    updatedAt: farms.updatedAt,
  }).from(farms)
    .innerJoin(companies, eq(farms.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(desc(farms.id))
    .limit(input.limit);
}

export async function insertFarm(db: PlatformDb, input: typeof farms.$inferInsert) {
  const [result] = await db.insert(farms).values(input);
  return Number(result.insertId);
}

export async function countFarmTotal() {
  const db = await requirePlatformDb();
  const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(farms).where(isNull(farms.deletedAt));
  return Number(row?.count ?? 0);
}
