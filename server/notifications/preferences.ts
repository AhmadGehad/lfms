import { and, eq } from "drizzle-orm";
import { companyMemberships } from "../../drizzle/schema";
import { getDb } from "../db";
import type { DbOrTx } from "../db";

export const NOTIFICATION_CATEGORIES = ["feed_stock", "vaccination", "pregnancy", "growth"] as const;
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];

const ALERT_TYPE_TO_CATEGORY: Record<string, NotificationCategory> = {
  low_feed_stock: "feed_stock",
  vaccination_due: "vaccination",
  vaccination_overdue: "vaccination",
  vaccination_recorded: "vaccination",
  booster_due: "vaccination",
  booster_overdue: "vaccination",
  pregnancy_due: "pregnancy",
  pregnancy_overdue: "pregnancy",
  pregnancy_checkup_due: "pregnancy",
  pregnancy_checkup_overdue: "pregnancy",
  pregnancy_recorded: "pregnancy",
  target_weight_reached: "growth",
  ready_to_sell: "growth",
};

export function categoryForAlertType(alertType: string): NotificationCategory | null {
  return ALERT_TYPE_TO_CATEGORY[alertType] ?? null;
}

export type ChannelPreference = { inApp: boolean; email: boolean };
export type NotificationPreferences = Partial<Record<NotificationCategory, ChannelPreference>>;

const DEFAULT_CHANNEL_PREFERENCE: ChannelPreference = { inApp: true, email: true };

function isChannelPreferenceShaped(value: unknown): value is Partial<ChannelPreference> {
  return typeof value === "object" && value !== null;
}

export function parseNotificationPreferences(value: unknown): NotificationPreferences {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const result: NotificationPreferences = {};
  for (const category of NOTIFICATION_CATEGORIES) {
    const raw = source[category];
    if (isChannelPreferenceShaped(raw)) {
      result[category] = {
        inApp: typeof raw.inApp === "boolean" ? raw.inApp : true,
        email: typeof raw.email === "boolean" ? raw.email : true,
      };
    }
  }
  return result;
}

export function getChannelPreference(
  preferences: NotificationPreferences,
  category: NotificationCategory,
): ChannelPreference {
  return preferences[category] ?? DEFAULT_CHANNEL_PREFERENCE;
}

export async function getMembershipNotificationPreferences(
  membershipId: number,
  db?: DbOrTx,
): Promise<NotificationPreferences> {
  const handle = db ?? await getDb();
  if (!handle) return {};
  const [row] = await handle.select({ notificationPreferences: companyMemberships.notificationPreferences })
    .from(companyMemberships)
    .where(eq(companyMemberships.id, membershipId))
    .limit(1);
  return parseNotificationPreferences(row?.notificationPreferences);
}

export async function updateMembershipNotificationPreferences(
  membershipId: number,
  preferences: NotificationPreferences,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(companyMemberships)
    .set({ notificationPreferences: preferences })
    .where(eq(companyMemberships.id, membershipId));
}

/** Send-time check: does this specific user want email for this category, at this company? */
export async function getUserEmailPreferenceForCompany(
  userId: number,
  companyId: number,
  category: NotificationCategory,
  db?: DbOrTx,
): Promise<boolean> {
  const handle = db ?? await getDb();
  if (!handle) return DEFAULT_CHANNEL_PREFERENCE.email;
  const [row] = await handle.select({ notificationPreferences: companyMemberships.notificationPreferences })
    .from(companyMemberships)
    .where(and(eq(companyMemberships.userId, userId), eq(companyMemberships.companyId, companyId)))
    .limit(1);
  return getChannelPreference(parseNotificationPreferences(row?.notificationPreferences), category).email;
}
