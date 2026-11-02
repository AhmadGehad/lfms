import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { pushSubscriptions } from "../../drizzle/schema.workerTasks";
import { notificationLink } from "../../shared/notifications";
import type { NotificationLanguage } from "../../shared/notificationText";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { logger } from "../observability/logger";
import { getCompanyAdmins, getCompanyOwner } from "../platform/repositories/companies";
import { categoryForAlertType, getUserPushPreferenceForCompany } from "./preferences";

const PUSHABLE_PRIORITIES = new Set(["critical", "high"]);
const COOLDOWN_MS = 4 * 60 * 60 * 1_000;
const TIME_TO_LIVE_SECONDS = 24 * 60 * 60;

/** Push services are few and known. The server POSTs to this URL, so nothing else is allowed. */
const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isPushServiceEndpoint(endpoint: string): boolean {
  // web-push parses this address its own way, so an encoded one could mean another host there.
  if (endpoint.split("/").slice(0, 3).join("/").includes("%")) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && PUSH_SERVICE_HOSTS.some(host => host.test(url.hostname));
  } catch {
    return false;
  }
}

export function isPushConfigured(): boolean {
  return Boolean(ENV.vapidPublicKey && ENV.vapidPrivateKey && ENV.vapidSubject);
}

export type PushContent = { title: string; body: string; url: string; language: NotificationLanguage };

type Subscription = typeof pushSubscriptions.$inferSelect;

async function sendToSubscription(subscription: Subscription, content: PushContent) {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(content),
      {
        TTL: TIME_TO_LIVE_SECONDS,
        urgency: "high",
        vapidDetails: { subject: ENV.vapidSubject, publicKey: ENV.vapidPublicKey, privateKey: ENV.vapidPrivateKey },
      },
    );
    return true;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    // The device turned notifications off or the browser dropped the subscription.
    if (status === 404 || status === 410) {
      const db = await getDb();
      await db?.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
    } else {
      logger.error("push.send_failed", { status });
    }
    return false;
  }
}

/** One user's devices, each in the language it was last used in. */
export async function sendPushToUsers(
  companyId: number,
  userIds: readonly number[],
  contentFor: (language: NotificationLanguage) => Omit<PushContent, "language">,
): Promise<number> {
  if (!isPushConfigured() || userIds.length === 0) return 0;
  const db = await getDb();
  if (!db) return 0;
  const subscriptions = await db.select().from(pushSubscriptions).where(and(
    eq(pushSubscriptions.companyId, companyId),
    inArray(pushSubscriptions.userId, [...userIds]),
  ));
  const sent = await Promise.all(subscriptions.map(subscription => {
    const language = subscription.language === "ar" ? "ar" : "en";
    return sendToSubscription(subscription, { ...contentFor(language), language });
  }));
  return sent.filter(Boolean).length;
}

const lastSentAt = new Map<string, number>();

/**
 * Pushes an urgent alert to whoever opted in. Follows the email fan-out: high and
 * critical only, and a repeat of the same alert type is held back unless the caller
 * says each one is its own event, as with two animals dying the same morning.
 */
export async function notifyOperationalAlertByPush(input: {
  companyId: number;
  companySlug?: string;
  alertType: string;
  relatedEntityType?: string | null;
  priority: "low" | "medium" | "high" | "critical";
  recipientUserIds?: readonly number[];
  distinctEvent?: boolean;
  contentFor: (language: NotificationLanguage) => { title: string; body: string };
}): Promise<void> {
  if (!PUSHABLE_PRIORITIES.has(input.priority) || !isPushConfigured()) return;
  const category = categoryForAlertType(input.alertType);
  if (!category) return;

  if (!input.distinctEvent) {
    const key = `${input.companyId}:${input.alertType}`;
    const previous = lastSentAt.get(key);
    if (previous && Date.now() - previous < COOLDOWN_MS) return;
    lastSentAt.set(key, Date.now());
  }

  let recipients = input.recipientUserIds;
  if (!recipients) {
    const owner = await getCompanyOwner(input.companyId);
    const admins = await getCompanyAdmins(input.companyId);
    recipients = [...new Set([...(owner ? [owner.userId] : []), ...admins.map(admin => admin.userId)])];
  }
  const wanted: number[] = [];
  for (const userId of recipients) {
    if (await getUserPushPreferenceForCompany(userId, input.companyId, category)) wanted.push(userId);
  }
  const url = notificationLink({ alertType: input.alertType, relatedEntityType: input.relatedEntityType }) ?? "/notifications";
  await sendPushToUsers(input.companyId, wanted, language => ({ ...input.contentFor(language), url }));
}
