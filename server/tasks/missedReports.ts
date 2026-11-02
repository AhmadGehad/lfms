import { and, eq, isNull } from "drizzle-orm";
import { companies, farms, notifications } from "../../drizzle/schema";
import { farmReports, workers } from "../../drizzle/schema.workerTasks";
import { taskNotificationText, type NotificationParams } from "../../shared/notificationText";
import { farmHour, farmToday, missingDailyReports } from "../../shared/tasks";
import { getDb } from "../db";
import { sendTaskAlert } from "../notifications/fanout";
import { logger } from "../observability/logger";
import { generatePublicId } from "../tenancy/publicIds";
import { taskRecipients } from "./service";

const ALERT_TYPE = "task_report_missing";
const LAST_HOUR_OF_DAY = 23;

/**
 * Tells the owner when a farm's day is ending with its daily report unanswered.
 * A deleted report counts as unanswered, so the worker has until then to redo it.
 * Runs hourly and only acts on farms in their last hour, and each person's
 * notification carries a key for that day, so a repeated run sends nothing twice.
 * Only farms with workers on a tablet are asked for reports at all.
 */
export async function sendMissedReportAlerts(now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db.select({
    companyId: farms.companyId,
    farmId: farms.id,
    timezone: farms.timezone,
    workerName: workers.name,
  }).from(workers)
    .innerJoin(farms, and(eq(workers.farmId, farms.id), eq(workers.companyId, farms.companyId)))
    .innerJoin(companies, eq(companies.id, farms.companyId))
    .where(and(
      eq(workers.isActive, true),
      eq(farms.status, "active"),
      isNull(farms.deletedAt),
      eq(companies.lifecycleStatus, "active"),
      isNull(companies.deletedAt),
    ));

  const byFarm = new Map<number, { companyId: number; timezone: string; names: string[] }>();
  for (const row of rows) {
    if (farmHour(row.timezone, now) !== LAST_HOUR_OF_DAY) continue;
    const farm = byFarm.get(row.farmId);
    if (farm) farm.names.push(row.workerName);
    else byFarm.set(row.farmId, { companyId: row.companyId, timezone: row.timezone, names: [row.workerName] });
  }

  let alerted = 0;
  for (const [farmId, farm] of byFarm) {
    const date = farmToday(farm.timezone, now);
    // One failed farm mustn't cost the others their alert.
    try {
      const answered = await db.select({ type: farmReports.type }).from(farmReports).where(and(
        eq(farmReports.companyId, farm.companyId),
        eq(farmReports.farmId, farmId),
        eq(farmReports.reportDate, date),
        isNull(farmReports.deletedAt),
      ));
      const missing = missingDailyReports(answered);
      if (missing.length === 0) continue;

      const params: NotificationParams = {
        date,
        missing,
        // With several workers it isn't known whose job it was.
        worker: farm.names.length === 1 ? farm.names[0] : undefined,
      };
      const { title, message } = taskNotificationText(ALERT_TYPE, params, "en")!;
      const recipients = await taskRecipients(db, { companyId: farm.companyId }, farmId);
      if (recipients.length === 0) continue;
      const inserted = await db.insert(notifications).values(recipients.map(userId => ({
        publicId: generatePublicId(),
        companyId: farm.companyId,
        farmId,
        userId,
        alertType: ALERT_TYPE,
        title,
        message,
        params,
        relatedEntityType: "farm_report",
        relatedEntityId: `${farmId}:${date}`,
        priority: "high" as const,
        deduplicationKey: `${farmId}:${date}:${userId}`,
      }))).onConflictDoNothing().returning({ userId: notifications.userId });
      if (inserted.length === 0) continue;
      alerted += 1;
      sendTaskAlert({
        companyId: farm.companyId,
        alertType: ALERT_TYPE,
        relatedEntityType: "farm_report",
        priority: "high",
        params,
        recipientUserIds: inserted.flatMap(row => row.userId ?? []),
      });
    } catch (error) {
      logger.error("tasks.missed_report_check_failed", {
        farmId,
        errorName: error instanceof Error ? error.name : "NonErrorThrown",
      });
    }
  }
  return { checked: byFarm.size, alerted };
}
