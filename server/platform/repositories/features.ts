import { and, desc, eq, like, lt, or, sql, type SQL } from "drizzle-orm";
import {
  companyFeatureOverrides,
  featureCatalog,
  planEntitlements,
} from "../../../drizzle/schema";
import { decodeCursor } from "../../../shared/platformApi";
import { publicCursorPage, requirePlatformDb, type PlatformDb } from "./db";

// Drizzle omits a table qualifier for interpolated columns in a nested SQL
// fragment. Use a fixed, local identifier so the correlated subqueries bind to
// the feature row, not to an `id` column inside their own table.
const featureCatalogId = sql.raw("`saas_feature_catalog`.`id`");
export const activePlanCountSql = sql<number>`(SELECT COUNT(*) FROM ${planEntitlements} pe WHERE pe.featureId = ${featureCatalogId} AND pe.accessMode != 'disabled')`;
export const activeOverrideCountSql = sql<number>`(SELECT COUNT(*) FROM ${companyFeatureOverrides} cfo WHERE cfo.featureId = ${featureCatalogId} AND cfo.isCurrent = TRUE)`;

export async function listFeatureRecords(input: {
  cursor?: string | null;
  limit: number;
  search?: string;
  status?: typeof featureCatalog.$inferSelect.status;
}) {
  const db = await requirePlatformDb();
  const cursor = decodeCursor<{ id?: unknown }>(input.cursor);
  const conditions: SQL[] = [];
  if (typeof cursor?.id === "number")
    conditions.push(lt(featureCatalog.id, cursor.id));
  if (input.status) conditions.push(eq(featureCatalog.status, input.status));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(
      or(like(featureCatalog.name, term), like(featureCatalog.code, term))!
    );
  }
  const rows = await db
    .select({
      cursorId: featureCatalog.id,
      publicId: featureCatalog.publicId,
      code: featureCatalog.code,
      name: featureCatalog.name,
      description: featureCatalog.description,
      status: featureCatalog.status,
      disabledDataMode: featureCatalog.disabledDataMode,
      limitUnit: featureCatalog.limitUnit,
      planCount: activePlanCountSql,
      activeOverrideCount: activeOverrideCountSql,
      updatedAt: featureCatalog.updatedAt,
    })
    .from(featureCatalog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(featureCatalog.id))
    .limit(input.limit + 1);
  return publicCursorPage(rows, input.limit);
}

export async function findFeatureByPublicId(publicId: string, db?: PlatformDb) {
  const handle = db ?? (await requirePlatformDb());
  const [feature] = await handle
    .select()
    .from(featureCatalog)
    .where(eq(featureCatalog.publicId, publicId))
    .limit(1);
  return feature ?? null;
}
