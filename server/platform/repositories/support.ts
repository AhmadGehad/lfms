import { and, desc, eq, like, lt, or, type SQL } from "drizzle-orm";
import { companies, platformAdministrators, supportAccessGrants, users } from "../../../drizzle/schema";
import { decodeCursor } from "../../../shared/platformApi";
import { publicCursorPage, requirePlatformDb, type PlatformDb } from "./db";

export async function listSupportGrants(input: {
  cursor?: string | null;
  limit: number;
  search?: string;
  status?: typeof supportAccessGrants.$inferSelect.status;
  companyPublicId?: string;
}) {
  const db = await requirePlatformDb();
  const cursor = decodeCursor<{ id?: unknown }>(input.cursor);
  const conditions: SQL[] = [];
  if (typeof cursor?.id === "number") conditions.push(lt(supportAccessGrants.id, cursor.id));
  if (input.status) conditions.push(eq(supportAccessGrants.status, input.status));
  if (input.companyPublicId) conditions.push(eq(companies.publicId, input.companyPublicId));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(like(companies.name, term), like(supportAccessGrants.ticketReference, term), like(users.name, term))!);
  }
  const rows = await db.select({
    cursorId: supportAccessGrants.id,
    publicId: supportAccessGrants.publicId,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    requestedByName: users.name,
    accessMode: supportAccessGrants.accessMode,
    allowedScopes: supportAccessGrants.allowedScopes,
    reason: supportAccessGrants.reason,
    ticketReference: supportAccessGrants.ticketReference,
    status: supportAccessGrants.status,
    expiresAt: supportAccessGrants.expiresAt,
    version: supportAccessGrants.version,
    createdAt: supportAccessGrants.createdAt,
  }).from(supportAccessGrants)
    .innerJoin(companies, eq(supportAccessGrants.companyId, companies.id))
    .innerJoin(platformAdministrators, eq(supportAccessGrants.requestedByPlatformAdministratorId, platformAdministrators.id))
    .innerJoin(users, eq(platformAdministrators.userId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(supportAccessGrants.id))
    .limit(input.limit + 1);
  return publicCursorPage(rows, input.limit);
}

export async function findSupportGrant(publicId: string, db?: PlatformDb) {
  const handle = db ?? await requirePlatformDb();
  const [grant] = await handle.select().from(supportAccessGrants).where(eq(supportAccessGrants.publicId, publicId)).limit(1);
  return grant ?? null;
}
