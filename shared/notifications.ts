/**
 * Shared notification presentation semantics.
 *
 * Both design systems render the same notification rows but with different
 * visual vocabularies (old design: Tailwind colour classes, new design:
 * StatusBadge tones). What they must agree on is *meaning* — which priorities
 * read as urgent — so the mapping lives here rather than being duplicated.
 */

export const NOTIFICATION_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

/** Matches the `StatusTone` union in the new design's StatusBadge. */
export type NotificationTone = "danger" | "warning" | "info" | "neutral";

const PRIORITY_TONES: Record<NotificationPriority, NotificationTone> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

export function priorityTone(priority: string | null | undefined): NotificationTone {
  return PRIORITY_TONES[priority as NotificationPriority] ?? "info";
}

/** `low_feed_stock` → `low feed stock` */
export function formatAlertType(alertType: string | null | undefined): string {
  if (!alertType) return "Alert";
  return alertType.replace(/_/g, " ");
}
