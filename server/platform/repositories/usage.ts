import { and, desc, eq, like, lt, or, sql, type SQL } from "drizzle-orm";
import {
  companies,
  companyFeatureOverrides,
  companySubscriptions,
  featureCatalog,
  planEntitlements,
  usageCounters,
} from "../../../drizzle/schema";
import { decodeCursor } from "../../../shared/platformApi";
import { publicCursorPage, requirePlatformDb } from "./db";

export async function listUsageRecords(input: {
  cursor?: string | null;
  limit: number;
  search?: string;
  companyPublicId?: string;
  periodType?: typeof usageCounters.$inferSelect.periodType;
}) {
  const db = await requirePlatformDb();
  const cursor = decodeCursor<{ id?: unknown }>(input.cursor);
  const conditions: SQL[] = [];
  if (typeof cursor?.id === "number") conditions.push(lt(usageCounters.id, cursor.id));
  if (input.companyPublicId) conditions.push(eq(companies.publicId, input.companyPublicId));
  if (input.periodType) conditions.push(eq(usageCounters.periodType, input.periodType));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(like(companies.name, term), like(usageCounters.metricCode, term), like(featureCatalog.name, term))!);
  }
  const rows = await db.select({
    cursorId: usageCounters.id,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    featureCode: featureCatalog.code,
    featureName: featureCatalog.name,
    metricCode: usageCounters.metricCode,
    periodType: usageCounters.periodType,
    periodStart: usageCounters.periodStart,
    periodEnd: usageCounters.periodEnd,
    usedValue: usageCounters.usedValue,
    reservedValue: usageCounters.reservedValue,
    limitValue: sql<number | null>`COALESCE(${companyFeatureOverrides.limitValue}, ${planEntitlements.limitValue})`,
    updatedAt: usageCounters.updatedAt,
  }).from(usageCounters)
    .innerJoin(companies, eq(usageCounters.companyId, companies.id))
    .leftJoin(featureCatalog, eq(usageCounters.featureId, featureCatalog.id))
    .leftJoin(companySubscriptions, and(eq(companySubscriptions.companyId, companies.id), eq(companySubscriptions.isCurrent, true)))
    .leftJoin(planEntitlements, and(
      eq(planEntitlements.subscriptionPlanId, companySubscriptions.subscriptionPlanId),
      eq(planEntitlements.featureId, usageCounters.featureId),
    ))
    .leftJoin(companyFeatureOverrides, and(
      eq(companyFeatureOverrides.companyId, companies.id),
      eq(companyFeatureOverrides.featureId, usageCounters.featureId),
      eq(companyFeatureOverrides.isCurrent, true),
    ))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(usageCounters.id))
    .limit(input.limit + 1);

  const page = publicCursorPage(rows, input.limit);
  return {
    ...page,
    items: page.items.map(item => {
      const consumed = Number(item.usedValue) + Number(item.reservedValue);
      const limit = item.limitValue === null ? null : Number(item.limitValue);
      return { ...item, usedValue: Number(item.usedValue), reservedValue: Number(item.reservedValue), limitValue: limit, percentUsed: limit && limit > 0 ? Math.round((consumed / limit) * 1000) / 10 : null };
    }),
  };
}
