import { getDb, getFeedStockStatus } from "./db";
import { lowStockCandidates, notificationDayBucket } from "./notifications/decisions";
import { insertNotificationOnce } from "./notifications/repository";
import { logger } from "./observability/logger";
import { requireTenantUserContext } from "./tenancy/runtime";

export async function checkLowStockAndNotify(): Promise<void> {
  try {
    const stockStatus = await getFeedStockStatus();
    const db = await getDb();
    if (!db) return;
    const tenant = requireTenantUserContext();
    const bucket = notificationDayBucket();

    for (const candidate of lowStockCandidates(stockStatus)) {
      const inserted = await insertNotificationOnce(db, {
        companyId: tenant.companyId,
        farmId: tenant.selectedFarmId,
      }, candidate, bucket);
      if (inserted) {
        logger.info("notification.low_stock_created", {
          companyId: tenant.companyId,
          farmId: tenant.selectedFarmId,
          entityId: candidate.relatedEntityId,
        });
      }
    }
  } catch (error) {
    logger.error("notification.low_stock_check_failed", {
      errorName: error instanceof Error ? error.name : "NonErrorThrown",
    });
  }
}

/** @deprecated Web replicas must not start schedulers. Use the worker process. */
export function startLowStockScheduler(): void {
  logger.warn("scheduler.web_start_ignored", { scheduler: "low_stock" });
}
