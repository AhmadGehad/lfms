import {
  getDb,
  getUpcomingPregnancyCheckups,
  getUpcomingPregnancyDueDates,
} from "./db";
import { notificationDayBucket, pregnancyCandidates } from "./notifications/decisions";
import { insertNotificationOnce } from "./notifications/repository";
import { logger } from "./observability/logger";
import { requireTenantUserContext } from "./tenancy/runtime";

export async function checkPregnanciesAndNotify(): Promise<void> {
  try {
    const [upcoming, checkups, db] = await Promise.all([
      getUpcomingPregnancyDueDates(365),
      getUpcomingPregnancyCheckups(365),
      getDb(),
    ]);
    if (!db) return;
    const tenant = requireTenantUserContext();
    const bucket = notificationDayBucket();

    for (const candidate of pregnancyCandidates(upcoming, checkups)) {
      const inserted = await insertNotificationOnce(db, {
        companyId: tenant.companyId,
        farmId: tenant.selectedFarmId,
      }, candidate, bucket);
      if (inserted) {
        logger.info("notification.pregnancy_created", {
          companyId: tenant.companyId,
          farmId: tenant.selectedFarmId,
          alertType: candidate.alertType,
          entityId: candidate.relatedEntityId,
        });
      }
    }
  } catch (error) {
    logger.error("notification.pregnancy_check_failed", {
      errorName: error instanceof Error ? error.name : "NonErrorThrown",
    });
  }
}

/** @deprecated Web replicas must not start schedulers. Use the worker process. */
export function startPregnancyScheduler(): void {
  logger.warn("scheduler.web_start_ignored", { scheduler: "pregnancy" });
}
