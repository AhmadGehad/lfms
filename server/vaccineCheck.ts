/**
 * Vaccine Check Service
 * Runs on server startup and every hour to detect upcoming/overdue vaccinations.
 * Avoids duplicate notifications by checking if an unread alert already exists
 * for the same vaccination record within the last 24 hours.
 */

import { createNotification, getUpcomingVaccinations, getDb } from "./db";
import { notifications } from "../drizzle/schema";
import { and, eq, gte, isNull } from "drizzle-orm";

export async function checkVaccinationsAndNotify(): Promise<void> {
  try {
    const upcomingVaccinations = await getUpcomingVaccinations(30); // Check next 30 days
    const db = await getDb();
    if (!db) return;

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const record of upcomingVaccinations) {
      if (!record.nextDueDate) continue;

      const dueDate = new Date(record.nextDueDate instanceof Date ? record.nextDueDate.toISOString() : record.nextDueDate);
      dueDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);

      let alertType: string;
      let title: string;
      let message: string;
      let priority: string;

      if (diffDays < 0) {
        // Overdue
        alertType = "vaccination_overdue";
        title = "Vaccination Overdue";
        message = `${record.animalIdStr} is overdue for ${record.vaccineName} vaccination (was due on ${dueDate.toLocaleDateString()})`;
        priority = "critical";
      } else if (diffDays <= 7) {
        // Due within 7 days
        alertType = "vaccination_due";
        title = "Vaccination Due Soon";
        message = `${record.animalIdStr} is due for ${record.vaccineName} vaccination on ${dueDate.toLocaleDateString()}`;
        priority = "high";
      } else {
        // Upcoming (beyond 7 days) - skip for now to avoid noise
        continue;
      }

      // Check if an unread notification for this vaccination record already exists in last 24h
      const existing = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.alertType, alertType),
            eq(notifications.relatedEntityId, String(record.id)),
            eq(notifications.isRead, false),
            gte(notifications.createdAt, cutoff)
          )
        )
        .limit(1);

      if (existing.length > 0) continue; // Already notified recently

      await createNotification({
        alertType,
        title,
        message,
        relatedEntityType: "vaccination_record",
        relatedEntityId: String(record.id),
        priority,
      });

      console.log(`[VaccineCheck] Notification created for ${record.animalIdStr} - ${record.vaccineName} (${alertType})`);
    }
  } catch (err) {
    console.error("[VaccineCheck] Check failed:", err);
  }
}

export function startVaccineScheduler(): void {
  // Run once on startup (after a short delay to let DB connect)
  setTimeout(() => {
    checkVaccinationsAndNotify();
  }, 5000);

  // Run every hour
  setInterval(() => {
    checkVaccinationsAndNotify();
  }, 60 * 60 * 1000);

  console.log("[VaccineCheck] Scheduler started — checking every hour");
}
