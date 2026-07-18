import { describe, expect, it } from "vitest";
import { isSubscriptionDueForExpiration } from "../entitlements/subscriptionLifecycle";
import type { LeasedJob } from "./leasedWorker";
import {
  handleSubscriptionExpirationJob,
  scheduleSubscriptionExpirationJob,
  SUBSCRIPTION_EXPIRATION_JOB_TYPE,
  type DueSubscription,
  type SubscriptionExpirationJobPayload,
  type SubscriptionExpirationRepository,
} from "./subscriptionExpiration";

const now = new Date("2026-07-12T10:15:00.000Z");

function candidate(overrides: Partial<DueSubscription> = {}): DueSubscription {
  return {
    id: 1,
    publicId: "subscription-1",
    companyId: 7,
    version: 1,
    status: "trialing",
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2027-07-01T00:00:00.000Z"),
    trialEndsAt: new Date("2026-07-10T00:00:00.000Z"),
    graceEndsAt: null,
    ...overrides,
  };
}

class FakeRepository implements SubscriptionExpirationRepository {
  enqueued = new Set<string>();
  expired = new Set<number>();
  candidates: DueSubscription[] = [candidate()];

  async enqueue(input: Parameters<SubscriptionExpirationRepository["enqueue"]>[0]) {
    if (this.enqueued.has(input.deduplicationKey)) return false;
    this.enqueued.add(input.deduplicationKey);
    return true;
  }

  async listDue(at: Date, limit: number) {
    return this.candidates
      .filter(row => !this.expired.has(row.id) && isSubscriptionDueForExpiration(row, at))
      .slice(0, limit);
  }

  async expireIfDue(input: Parameters<SubscriptionExpirationRepository["expireIfDue"]>[0]) {
    if (this.expired.has(input.candidate.id)) return false;
    if (!isSubscriptionDueForExpiration(input.candidate, input.now)) return false;
    this.expired.add(input.candidate.id);
    return true;
  }
}

function job(companyId: number | null = null): LeasedJob<SubscriptionExpirationJobPayload> {
  return {
    id: 99,
    publicId: "job-99",
    companyId,
    type: SUBSCRIPTION_EXPIRATION_JOB_TYPE,
    payload: { scheduledAt: "2026-07-12T10:00:00.000Z" },
    attempts: 1,
    maxAttempts: 5,
  };
}

describe("subscription expiration worker", () => {
  it("deduplicates concurrent hourly schedules", async () => {
    const repository = new FakeRepository();
    const scheduled = await Promise.all([
      scheduleSubscriptionExpirationJob(repository, now),
      scheduleSubscriptionExpirationJob(repository, now),
    ]);
    expect(scheduled.filter(Boolean)).toHaveLength(1);
    expect(repository.enqueued).toEqual(new Set(["2026-07-12T10:00:00.000Z"]));
  });

  it("allows only one concurrent sweep to transition a due subscription", async () => {
    const repository = new FakeRepository();
    const results = await Promise.all([
      handleSubscriptionExpirationJob(repository, job(), new AbortController().signal, now),
      handleSubscriptionExpirationJob(repository, job(), new AbortController().signal, now),
    ]);
    expect(results.reduce((sum, result) => sum + result.expired, 0)).toBe(1);
    expect(repository.expired).toEqual(new Set([1]));
  });

  it("expires due trialing, active, past-due, and malformed current rows", async () => {
    const repository = new FakeRepository();
    repository.candidates = [
      candidate({ id: 1, status: "trialing" }),
      candidate({ id: 2, status: "active", periodEnd: now, trialEndsAt: null }),
      candidate({ id: 3, status: "past_due", graceEndsAt: now, trialEndsAt: null }),
      candidate({ id: 4, status: "trialing", trialEndsAt: null }),
    ];
    await expect(handleSubscriptionExpirationJob(
      repository,
      job(),
      new AbortController().signal,
      now,
    )).resolves.toMatchObject({ expired: 4, truncated: false });
  });

  it("rejects a tenant-scoped global sweep", async () => {
    const repository = new FakeRepository();
    await expect(handleSubscriptionExpirationJob(
      repository,
      job(7),
      new AbortController().signal,
      now,
    )).rejects.toThrow("INVALID_SUBSCRIPTION_EXPIRATION_JOB");
    expect(repository.expired.size).toBe(0);
  });
});
