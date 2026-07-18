import { describe, expect, it } from "vitest";
import {
  isSubscriptionDueForExpiration,
  isSubscriptionEffective,
  subscriptionEffectiveEnd,
  type SubscriptionWindow,
} from "./subscriptionLifecycle";

const start = new Date("2026-07-01T00:00:00.000Z");
const periodEnd = new Date("2027-07-01T00:00:00.000Z");
const now = new Date("2026-07-12T00:00:00.000Z");

function window(overrides: Partial<SubscriptionWindow>): SubscriptionWindow {
  return {
    status: "active",
    periodStart: start,
    periodEnd,
    trialEndsAt: null,
    graceEndsAt: null,
    ...overrides,
  };
}

describe("subscription lifecycle", () => {
  it("uses the earlier trial and billing period cutoff", () => {
    const subscription = window({
      status: "trialing",
      trialEndsAt: new Date("2026-07-10T00:00:00.000Z"),
    });
    expect(subscriptionEffectiveEnd(subscription)?.toISOString())
      .toBe("2026-07-10T00:00:00.000Z");
    expect(isSubscriptionEffective(subscription, now)).toBe(false);
    expect(isSubscriptionDueForExpiration(subscription, now)).toBe(true);
  });

  it("uses period end for active and explicit grace for past due", () => {
    const active = window({ status: "active", periodEnd: now });
    const pastDue = window({
      status: "past_due",
      periodEnd: new Date("2026-07-01T00:00:00.000Z"),
      graceEndsAt: now,
    });
    expect(isSubscriptionEffective(active, now)).toBe(false);
    expect(isSubscriptionDueForExpiration(active, now)).toBe(true);
    expect(isSubscriptionEffective(pastDue, now)).toBe(false);
    expect(isSubscriptionDueForExpiration(pastDue, now)).toBe(true);
  });

  it("fails closed when trial or grace expiration is missing", () => {
    const trial = window({ status: "trialing", trialEndsAt: null });
    const pastDue = window({ status: "past_due", graceEndsAt: null });
    expect(isSubscriptionEffective(trial, now)).toBe(false);
    expect(isSubscriptionDueForExpiration(trial, now)).toBe(true);
    expect(isSubscriptionEffective(pastDue, now)).toBe(false);
    expect(isSubscriptionDueForExpiration(pastDue, now)).toBe(true);
  });

  it("does not expire a future subscription before its start", () => {
    const future = window({
      status: "trialing",
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      trialEndsAt: null,
    });
    expect(isSubscriptionEffective(future, now)).toBe(false);
    expect(isSubscriptionDueForExpiration(future, now)).toBe(false);
  });
});
