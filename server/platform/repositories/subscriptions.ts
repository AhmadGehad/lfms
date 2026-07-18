import { and, desc, eq, like, lt, or, type SQL } from "drizzle-orm";
import { companies, companySubscriptions, subscriptionPlans } from "../../../drizzle/schema";
import { decodeCursor } from "../../../shared/platformApi";
import { publicCursorPage, requirePlatformDb } from "./db";

export async function listSubscriptionRecords(input: {
  cursor?: string | null;
  limit: number;
  search?: string;
  status?: typeof companySubscriptions.$inferSelect.status;
  companyPublicId?: string;
}) {
  const db = await requirePlatformDb();
  const cursor = decodeCursor<{ id?: unknown }>(input.cursor);
  const conditions: SQL[] = [];
  if (typeof cursor?.id === "number") conditions.push(lt(companySubscriptions.id, cursor.id));
  if (input.status) conditions.push(eq(companySubscriptions.status, input.status));
  if (input.companyPublicId) conditions.push(eq(companies.publicId, input.companyPublicId));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(
      like(companies.name, term),
      like(subscriptionPlans.name, term),
      like(subscriptionPlans.code, term),
    )!);
  }
  const rows = await db.select({
    cursorId: companySubscriptions.id,
    publicId: companySubscriptions.publicId,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    planPublicId: subscriptionPlans.publicId,
    planName: subscriptionPlans.name,
    planCode: subscriptionPlans.code,
    status: companySubscriptions.status,
    periodStart: companySubscriptions.periodStart,
    periodEnd: companySubscriptions.periodEnd,
    trialEndsAt: companySubscriptions.trialEndsAt,
    graceEndsAt: companySubscriptions.graceEndsAt,
    isCurrent: companySubscriptions.isCurrent,
    version: companySubscriptions.version,
    createdAt: companySubscriptions.createdAt,
  }).from(companySubscriptions)
    .innerJoin(companies, eq(companySubscriptions.companyId, companies.id))
    .innerJoin(subscriptionPlans, eq(companySubscriptions.subscriptionPlanId, subscriptionPlans.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(companySubscriptions.id))
    .limit(input.limit + 1);
  return publicCursorPage(rows, input.limit);
}
