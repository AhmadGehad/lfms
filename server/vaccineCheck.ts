import {
  getDb,
  getUpcomingBoosterVaccinations,
  getUpcomingVaccinations,
} from "./db";
import { notificationDayBucket, vaccinationCandidates } from "./notifications/decisions";
import { insertNotificationOnce } from "./notifications/repository";
import { logger } from "./observability/logger";
import { requireTenantUserContext } from "./tenancy/runtime";

export async function checkVaccinationsAndNotify(): Promise<void> {
  try {
    const [upcoming, boosters, db] = await Promise.all([
      getUpcomingVaccinations(365),
      getUpcomingBoosterVaccinations(365),
      getDb(),
    ]);
    if (!db) return;
    const tenant = requireTenantUserContext();
    const bucket = notificationDayBucket();

    for (const candidate of vaccinationCandidates(upcoming, boosters)) {
      const inserted = await insertNotificationOnce(db, {
        companyId: tenant.companyId,
        farmId: tenant.selectedFarmId,
      }, candidate, bucket);
      if (inserted) {
        logger.info("notification.vaccination_created", {
          companyId: tenant.companyId,
          farmId: tenant.selectedFarmId,
          alertType: candidate.alertType,
          entityId: candidate.relatedEntityId,
        });
      }
    }
  } catch (error) {
    logger.error("notification.vaccination_check_failed", {
      errorName: error instanceof Error ? error.name : "NonErrorThrown",
    });
  }
}

/** @deprecated Web replicas must not start schedulers. Use the worker process. */
export function startVaccineScheduler(): void {
  logger.warn("scheduler.web_start_ignored", { scheduler: "vaccination" });
}
