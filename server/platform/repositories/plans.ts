import { and, desc, eq, like, lt, or, sql, type SQL } from "drizzle-orm";
import { companySubscriptions, planEntitlements, subscriptionPlans } from "../../../drizzle/schema";
import { decodeCursor } from "../../../shared/platformApi";
import { publicCursorPage, requirePlatformDb, type PlatformDb } from "./db";

export async function listPlanRecords(input: {
  cursor?: string | null;
  limit: number;
  search?: string;
  status?: typeof subscriptionPlans.$inferSelect.status;
}) {
  const db = await requirePlatformDb();
  const cursor = decodeCursor<{ id?: unknown }>(input.cursor);
  const conditions: SQL[] = [];
  if (typeof cursor?.id === "number") conditions.push(lt(subscriptionPlans.id, cursor.id));
  if (input.status) conditions.push(eq(subscriptionPlans.status, input.status));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(like(subscriptionPlans.name, term), like(subscriptionPlans.code, term))!);
  }
  const rows = await db.select({
    cursorId: subscriptionPlans.id,
    publicId: subscriptionPlans.publicId,
    code: subscriptionPlans.code,
    name: subscriptionPlans.name,
    description: subscriptionPlans.description,
    planVersion: subscriptionPlans.planVersion,
    version: subscriptionPlans.version,
    status: subscriptionPlans.status,
    priceMonthly: subscriptionPlans.priceMonthly,
    priceYearly: subscriptionPlans.priceYearly,
    currency: subscriptionPlans.currency,
    companyCount: sql<number>`(SELECT COUNT(*) FROM ${companySubscriptions} cs WHERE cs.subscriptionPlanId = ${subscriptionPlans.id} AND cs.isCurrent = TRUE)`,
    entitlementCount: sql<number>`(SELECT COUNT(*) FROM ${planEntitlements} pe WHERE pe.subscriptionPlanId = ${subscriptionPlans.id})`,
    publishedAt: subscriptionPlans.publishedAt,
    createdAt: subscriptionPlans.createdAt,
  }).from(subscriptionPlans)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(subscriptionPlans.id))
    .limit(input.limit + 1);
  return publicCursorPage(rows, input.limit);
}

export async function findPlanByPublicId(publicId: string, db?: PlatformDb) {
  const handle = db ?? await requirePlatformDb();
  const query = handle.select().from(subscriptionPlans)
    .where(eq(subscriptionPlans.publicId, publicId))
    .limit(1);
  // TiDB does not support FOR SHARE. The stronger row lock prevents retirement
  // between the active-status check and company assignment.
  const [plan] = db ? await query.for("update") : await query;
  return plan ?? null;
}
