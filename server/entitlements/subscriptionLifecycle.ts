export const USABLE_SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due"] as const;

export type SubscriptionStatus =
  | (typeof USABLE_SUBSCRIPTION_STATUSES)[number]
  | "suspended"
  | "canceled"
  | "expired";

export type SubscriptionWindow = Readonly<{
  status: SubscriptionStatus;
  periodStart: Date;
  periodEnd: Date;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
}>;

function earlier(left: Date, right: Date | null) {
  if (!right) return left;
  return left.getTime() <= right.getTime() ? left : right;
}

/** Returns the exclusive access cutoff for statuses that can grant access. */
export function subscriptionEffectiveEnd(subscription: SubscriptionWindow): Date | null {
  switch (subscription.status) {
    case "trialing":
      return subscription.trialEndsAt
        ? earlier(subscription.periodEnd, subscription.trialEndsAt)
        : null;
    case "active":
      return subscription.periodEnd;
    case "past_due":
      return subscription.graceEndsAt;
    default:
      return null;
  }
}

export function isSubscriptionEffective(
  subscription: SubscriptionWindow,
  now = new Date(),
) {
  const end = subscriptionEffectiveEnd(subscription);
  return end !== null &&
    subscription.periodStart.getTime() <= now.getTime() &&
    end.getTime() > now.getTime();
}

export function isSubscriptionDueForExpiration(
  subscription: SubscriptionWindow,
  now = new Date(),
) {
  const end = subscriptionEffectiveEnd(subscription);
  if (end) return end.getTime() <= now.getTime();
  return (
    subscription.status === "trialing" ||
    subscription.status === "active" ||
    subscription.status === "past_due"
  ) &&
    subscription.periodStart.getTime() <= now.getTime();
}
