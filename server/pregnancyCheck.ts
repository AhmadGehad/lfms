/**
 * Pregnancy Check Service
 * Runs on server startup and every hour to detect pregnancies that are due
 * (or overdue) to deliver, and checkups that are due. Mirrors vaccineCheck.ts.
 * Avoids duplicate notifications by checking for an unread alert for the same
 * pregnancy record within the last 24 hours.
 */

import { createNotification, getUpcomingPregnancyDueDates, getUpcomingPregnancyCheckups, getDb } from "./db";
import { notifications } from "../drizzle/schema";
import { and, eq, gte } from "drizzle-orm";

export async function checkPregnanciesAndNotify(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const alreadyNotified = async (alertType: string, recordId: number) => {
      const existing = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.alertType, alertType),
            eq(notifications.relatedEntityId, String(recordId)),
            eq(notifications.isRead, false),
            gte(notifications.createdAt, cutoff),
          ),
        )
        .limit(1);
      return existing.length > 0;
    };

    // ─── Delivery due / overdue ──────────────────────────────────────────────
    const upcoming = await getUpcomingPregnancyDueDates(365);
    for (const record of upcoming) {
      if (!record.expectedDueDate) continue;
      const dueDate = new Date(record.expectedDueDate instanceof Date ? record.expectedDueDate.toISOString() : record.expectedDueDate);
      dueDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);

      let alertType: string;
      let title: string;
      let message: string;
      let priority: "low" | "medium" | "high" | "critical";

      if (diffDays < 0) {
        alertType = "pregnancy_overdue";
        title = "Delivery Overdue";
        message = `${record.animalIdStr} is overdue to give birth (expected ${dueDate.toLocaleDateString()})`;
        priority = "critical";
      } else if (diffDays <= (record.notifyBeforeDue ?? 7)) {
        alertType = "pregnancy_due";
        title = "Delivery Due Soon";
        message = `${record.animalIdStr} is expected to give birth on ${dueDate.toLocaleDateString()} (${diffDays} day(s))`;
        priority = "high";
      } else {
        continue;
      }

      if (await alreadyNotified(alertType, record.id)) continue;
      await createNotification({
        alertType,
        title,
        message,
        relatedEntityType: "pregnancy_record",
        relatedEntityId: String(record.id),
        priority,
      });
      console.log(`[PregnancyCheck] Notification created for ${record.animalIdStr} (${alertType})`);
    }

    // ─── Checkup due / overdue ───────────────────────────────────────────────
    const checkups = await getUpcomingPregnancyCheckups(365);
    for (const record of checkups) {
      if (!record.checkupDate) continue;
      const checkupDate = new Date(record.checkupDate instanceof Date ? record.checkupDate.toISOString() : record.checkupDate);
      checkupDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((checkupDate.getTime() - today.getTime()) / 86400000);

      let alertType: string;
      let title: string;
      let message: string;
      let priority: "low" | "medium" | "high" | "critical";

      if (diffDays < 0) {
        alertType = "pregnancy_checkup_overdue";
        title = "Pregnancy Checkup Overdue";
        message = `${record.animalIdStr} missed a pregnancy checkup (was due ${checkupDate.toLocaleDateString()})`;
        priority = "high";
      } else if (diffDays <= (record.notifyBeforeCheckup ?? 3)) {
        alertType = "pregnancy_checkup_due";
        title = "Pregnancy Checkup Due Soon";
        message = `${record.animalIdStr} has a pregnancy checkup on ${checkupDate.toLocaleDateString()}`;
        priority = "medium";
      } else {
        continue;
      }

      if (await alreadyNotified(alertType, record.id)) continue;
      await createNotification({
        alertType,
        title,
        message,
        relatedEntityType: "pregnancy_record",
        relatedEntityId: String(record.id),
        priority,
      });
      console.log(`[PregnancyCheck] Checkup notification created for ${record.animalIdStr} (${alertType})`);
    }
  } catch (err) {
    console.error("[PregnancyCheck] Check failed:", err);
  }
}

export function startPregnancyScheduler(): void {
  setTimeout(() => {
    checkPregnanciesAndNotify();
  }, 5000);

  setInterval(() => {
    checkPregnanciesAndNotify();
  }, 60 * 60 * 1000);

  console.log("[PregnancyCheck] Scheduler started — checking every hour");
}
