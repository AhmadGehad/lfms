import { and, asc, eq, isNotNull, lt, sql } from "drizzle-orm";
import { tenantFiles } from "../../drizzle/schema";
import { workerCheckins } from "../../drizzle/schema.workerTasks";
import { TABLET_PHOTO_DAYS } from "../../shared/tasks";
import { getDb } from "../db";
import { logger } from "../observability/logger";
import { deletePrivateObject } from "../storageBackend";

const PURGE_BATCH = 200;

/**
 * Deletes tablet photos older than TABLET_PHOTO_DAYS from storage, including those of
 * days the owner already deleted. Runs hourly; whatever a run doesn't reach, or fails
 * on, the next one picks up. Worker profile photos aren't touched.
 */
export async function purgeOldTabletPhotos() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db.select({
    id: workerCheckins.id,
    companyId: workerCheckins.companyId,
    photoKey: workerCheckins.photoKey,
  }).from(workerCheckins).where(and(
    isNotNull(workerCheckins.photoKey),
    // createdAt, not takenAt: that one comes from the tablet's clock.
    lt(workerCheckins.createdAt, sql`localtimestamp - make_interval(days => ${TABLET_PHOTO_DAYS})`),
  )).orderBy(asc(workerCheckins.createdAt)).limit(PURGE_BATCH);

  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await deletePrivateObject(row.photoKey!);
      await db.transaction(async tx => {
        await tx.update(tenantFiles).set({
          status: "deleted",
          deletedAt: new Date(),
          version: sql`${tenantFiles.version} + 1`,
        }).where(and(eq(tenantFiles.companyId, row.companyId), eq(tenantFiles.storageKey, row.photoKey!)));
        await tx.update(workerCheckins).set({ photoKey: null }).where(eq(workerCheckins.id, row.id));
      });
      deleted += 1;
    } catch (error) {
      failed += 1;
      logger.warn("tasks.photo_purge_failed", { error, checkinId: row.id });
    }
  }
  // Every one failing is storage or its credentials, and the cron log should show it.
  if (rows.length > 0 && deleted === 0) throw new Error(`Couldn't delete any of ${failed} tablet photos`);
  return { deleted, failed };
}
