/**
 * Low Stock Check Service
 * Runs on server startup and every hour to detect feed items below threshold.
 * Avoids duplicate notifications by checking if an unread alert already exists
 * for the same feed item within the last 24 hours.
 */

import { createNotification, getFeedStockStatus, getDb } from "./db";
import { notifications } from "../drizzle/schema";
import { and, eq, gte, isNull } from "drizzle-orm";

export async function checkLowStockAndNotify(): Promise<void> {
  try {
    const stockStatus = await getFeedStockStatus();
    const db = await getDb();
    if (!db) return;

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    for (const item of stockStatus) {
      if (item.status !== "critical" && item.status !== "low") continue;

      // Check if an unread notification for this feed item already exists in last 24h
      const existing = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.alertType, "low_feed_stock"),
            eq(notifications.relatedEntityId, String(item.feedItemId)),
            eq(notifications.isRead, false),
            gte(notifications.createdAt, cutoff)
          )
        )
        .limit(1);

      if (existing.length > 0) continue; // Already notified recently

      const isCritical = item.status === "critical";
      await createNotification({
        alertType: "low_feed_stock",
        title: isCritical ? "Critical Feed Stock" : "Low Feed Stock",
        message: isCritical
          ? `${item.feedItemName} stock is critically low — only ${item.daysRemaining} days remaining (${item.stockOnHand.toFixed(0)} ${item.unit})`
          : `${item.feedItemName} stock is running low — ${item.daysRemaining} days remaining (${item.stockOnHand.toFixed(0)} ${item.unit})`,
        relatedEntityType: "feed_item",
        relatedEntityId: String(item.feedItemId),
        priority: isCritical ? "critical" : "high",
      });

      console.log(`[LowStock] Notification created for ${item.feedItemName} (${item.status})`);
    }
  } catch (err) {
    console.error("[LowStock] Check failed:", err);
  }
}

export function startLowStockScheduler(): void {
  // Run once on startup (after a short delay to let DB connect)
  setTimeout(() => {
    checkLowStockAndNotify();
  }, 5000);

  // Run every hour
  setInterval(() => {
    checkLowStockAndNotify();
  }, 60 * 60 * 1000);

  console.log("[LowStock] Scheduler started — checking every hour");
}
