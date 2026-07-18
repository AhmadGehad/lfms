import { and, desc, eq, isNull, like, lt, or, sql, type SQL } from "drizzle-orm";
import { companies, companyMemberships, companySubscriptions, farms, subscriptionPlans } from "../../../drizzle/schema";
import { decodeCursor } from "../../../shared/platformApi";
import { publicCursorPage, requirePlatformDb, type PlatformDb } from "./db";

export async function listCompanyRecords(input: {
  cursor?: string | null;
  limit: number;
  search?: string;
  status?: typeof companies.$inferSelect.lifecycleStatus;
}) {
  const db = await requirePlatformDb();
  const cursor = decodeCursor<{ id?: unknown }>(input.cursor);
  const conditions: SQL[] = [isNull(companies.deletedAt)];
  if (typeof cursor?.id === "number") conditions.push(lt(companies.id, cursor.id));
  if (input.status) conditions.push(eq(companies.lifecycleStatus, input.status));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(like(companies.name, term), like(companies.slug, term), like(companies.publicId, term))!);
  }

  const rows = await db.select({
    cursorId: companies.id,
    publicId: companies.publicId,
    name: companies.name,
    slug: companies.slug,
    status: companies.lifecycleStatus,
    version: companies.version,
    entitlementVersion: companies.entitlementVersion,
    planName: subscriptionPlans.name,
    subscriptionStatus: companySubscriptions.status,
    farmCount: sql<number>`(SELECT COUNT(*) FROM ${farms} f WHERE f.companyId = ${companies.id} AND f.deletedAt IS NULL)`,
    memberCount: sql<number>`(SELECT COUNT(*) FROM ${companyMemberships} m WHERE m.companyId = ${companies.id} AND m.status != 'removed')`,
    createdAt: companies.createdAt,
    updatedAt: companies.updatedAt,
  })
    .from(companies)
    .leftJoin(companySubscriptions, and(eq(companySubscriptions.companyId, companies.id), eq(companySubscriptions.isCurrent, true)))
    .leftJoin(subscriptionPlans, eq(companySubscriptions.subscriptionPlanId, subscriptionPlans.id))
    .where(and(...conditions))
    .orderBy(desc(companies.id))
    .limit(input.limit + 1);
  return publicCursorPage(rows, input.limit);
}

export async function findCompanyByPublicId(publicId: string, db?: PlatformDb) {
  const handle = db ?? await requirePlatformDb();
  const [company] = await handle.select().from(companies).where(eq(companies.publicId, publicId)).limit(1);
  return company ?? null;
}

export async function getCompanyRecord(publicId: string) {
  const db = await requirePlatformDb();
  const [row] = await db.select({
    publicId: companies.publicId,
    name: companies.name,
    slug: companies.slug,
    status: companies.lifecycleStatus,
    settings: companies.settings,
    version: companies.version,
    entitlementVersion: companies.entitlementVersion,
    suspendedAt: companies.suspendedAt,
    suspendedReason: companies.suspendedReason,
    planPublicId: subscriptionPlans.publicId,
    planName: subscriptionPlans.name,
    subscriptionPublicId: companySubscriptions.publicId,
    subscriptionStatus: companySubscriptions.status,
    subscriptionPeriodEnd: companySubscriptions.periodEnd,
    farmCount: sql<number>`(SELECT COUNT(*) FROM ${farms} f WHERE f.companyId = ${companies.id} AND f.deletedAt IS NULL)`,
    activeFarmCount: sql<number>`(SELECT COUNT(*) FROM ${farms} f WHERE f.companyId = ${companies.id} AND f.deletedAt IS NULL AND f.status = 'active')`,
    memberCount: sql<number>`(SELECT COUNT(*) FROM ${companyMemberships} m WHERE m.companyId = ${companies.id} AND m.status != 'removed')`,
    activeMemberCount: sql<number>`(SELECT COUNT(*) FROM ${companyMemberships} m WHERE m.companyId = ${companies.id} AND m.status = 'active')`,
    createdAt: companies.createdAt,
    updatedAt: companies.updatedAt,
  }).from(companies)
    .leftJoin(companySubscriptions, and(eq(companySubscriptions.companyId, companies.id), eq(companySubscriptions.isCurrent, true)))
    .leftJoin(subscriptionPlans, eq(companySubscriptions.subscriptionPlanId, subscriptionPlans.id))
    .where(and(eq(companies.publicId, publicId), isNull(companies.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function listCompanyExportRows(input: {
  search?: string;
  status?: typeof companies.$inferSelect.lifecycleStatus;
  limit: number;
}) {
  const db = await requirePlatformDb();
  const conditions: SQL[] = [isNull(companies.deletedAt)];
  if (input.status) conditions.push(eq(companies.lifecycleStatus, input.status));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(like(companies.name, term), like(companies.slug, term), like(companies.publicId, term))!);
  }
  return db.select({
    publicId: companies.publicId,
    name: companies.name,
    slug: companies.slug,
    status: companies.lifecycleStatus,
    planName: subscriptionPlans.name,
    subscriptionStatus: companySubscriptions.status,
    farmCount: sql<number>`(SELECT COUNT(*) FROM ${farms} f WHERE f.companyId = ${companies.id} AND f.deletedAt IS NULL)`,
    memberCount: sql<number>`(SELECT COUNT(*) FROM ${companyMemberships} m WHERE m.companyId = ${companies.id} AND m.status != 'removed')`,
    createdAt: companies.createdAt,
    updatedAt: companies.updatedAt,
  }).from(companies)
    .leftJoin(companySubscriptions, and(eq(companySubscriptions.companyId, companies.id), eq(companySubscriptions.isCurrent, true)))
    .leftJoin(subscriptionPlans, eq(companySubscriptions.subscriptionPlanId, subscriptionPlans.id))
    .where(and(...conditions))
    .orderBy(desc(companies.id))
    .limit(input.limit);
}

export async function insertCompany(
  db: PlatformDb,
  input: Pick<typeof companies.$inferInsert, "publicId" | "name" | "slug" | "lifecycleStatus">,
) {
  const [result] = await db.insert(companies).values(input);
  return Number(result.insertId);
}

export async function countCompanyTotals() {
  const db = await requirePlatformDb();
  const [row] = await db.select({
    total: sql<number>`COUNT(*)`,
    active: sql<number>`SUM(CASE WHEN ${companies.lifecycleStatus} = 'active' THEN 1 ELSE 0 END)`,
    suspended: sql<number>`SUM(CASE WHEN ${companies.lifecycleStatus} = 'suspended' THEN 1 ELSE 0 END)`,
  }).from(companies).where(isNull(companies.deletedAt));
  return { total: Number(row?.total ?? 0), active: Number(row?.active ?? 0), suspended: Number(row?.suspended ?? 0) };
}
