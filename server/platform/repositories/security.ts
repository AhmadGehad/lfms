import { and, desc, eq, like, lt, or, type SQL } from "drizzle-orm";
import { companies, securityEvents, users } from "../../../drizzle/schema";
import { decodeCursor } from "../../../shared/platformApi";
import { publicCursorPage, requirePlatformDb } from "./db";

export async function listSecurityEventRecords(input: {
  cursor?: string | null;
  limit: number;
  search?: string;
  severity?: typeof securityEvents.$inferSelect.severity;
  outcome?: typeof securityEvents.$inferSelect.outcome;
  companyPublicId?: string;
}) {
  const db = await requirePlatformDb();
  const cursor = decodeCursor<{ id?: unknown }>(input.cursor);
  const conditions: SQL[] = [];
  if (typeof cursor?.id === "number") conditions.push(lt(securityEvents.id, cursor.id));
  if (input.severity) conditions.push(eq(securityEvents.severity, input.severity));
  if (input.outcome) conditions.push(eq(securityEvents.outcome, input.outcome));
  if (input.companyPublicId) conditions.push(eq(companies.publicId, input.companyPublicId));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(
      like(securityEvents.eventType, term),
      like(securityEvents.requestId, term),
      like(companies.name, term),
      like(users.name, term),
      like(users.email, term),
    )!);
  }

  const rows = await db.select({
    cursorId: securityEvents.id,
    publicId: securityEvents.publicId,
    createdAt: securityEvents.createdAt,
    eventType: securityEvents.eventType,
    severity: securityEvents.severity,
    outcome: securityEvents.outcome,
    actorType: securityEvents.actorType,
    actorName: users.name,
    actorEmail: users.email,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    ipAddress: securityEvents.ipAddress,
    requestId: securityEvents.requestId,
    metadata: securityEvents.metadata,
  })
    .from(securityEvents)
    .leftJoin(companies, eq(securityEvents.companyId, companies.id))
    .leftJoin(users, eq(securityEvents.userId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(securityEvents.id))
    .limit(input.limit + 1);
  return publicCursorPage(rows, input.limit);
}
