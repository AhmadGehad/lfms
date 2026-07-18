import { describe, expect, it } from "vitest";
import type { NotificationCandidate } from "../notifications/decisions";
import {
  handleTenantNotificationJob,
  NOTIFICATION_JOB_TYPES,
  scheduleTenantNotificationJobs,
  type NotificationJobPayload,
  type NotificationJobRepository,
  type NotificationJobType,
} from "./notificationJobs";
import type { LeasedJob } from "./leasedWorker";

class FakeRepository implements NotificationJobRepository {
  scopes = [{ companyId: 1, farmId: 11 }];
  active = true;
  enqueued = new Set<string>();
  inserted = new Set<string>();
  reads: Array<{ companyId: number; farmId: number; type: string }> = [];

  async listActiveTenantFarms() { return this.scopes; }
  async isActiveTenantFarm() { return this.active; }
  async enqueue(input: {
    companyId: number;
    type: NotificationJobType;
    payload: NotificationJobPayload;
    deduplicationKey: string;
    runAt: Date;
  }) {
    const key = `${input.companyId}:${input.type}:${input.deduplicationKey}`;
    if (this.enqueued.has(key)) return false;
    this.enqueued.add(key);
    return true;
  }
  async listLowStock(companyId: number, farmId: number) {
    this.reads.push({ companyId, farmId, type: "low_stock" });
    return [{
      feedItemId: 5,
      feedItemName: "Hay",
      unit: "kg",
      stockOnHand: 3,
      daysRemaining: 1,
      status: "critical",
    }];
  }
  async listVaccinations(companyId: number, farmId: number) {
    this.reads.push({ companyId, farmId, type: "vaccination" });
    return { next: [], boosters: [] };
  }
  async listPregnancies(companyId: number, farmId: number) {
    this.reads.push({ companyId, farmId, type: "pregnancy" });
    return { due: [], checkups: [] };
  }
  async insertNotification(
    companyId: number,
    farmId: number,
    candidate: NotificationCandidate,
    bucket: string,
  ) {
    const key = `${companyId}:${farmId}:${candidate.alertType}:${candidate.relatedEntityId}:${bucket}`;
    if (this.inserted.has(key)) return false;
    this.inserted.add(key);
    return true;
  }
}

function job(companyId: number, farmId: number, id = companyId): LeasedJob<NotificationJobPayload> {
  return {
    id,
    publicId: `job-${id}`,
    companyId,
    type: NOTIFICATION_JOB_TYPES.lowStock,
    payload: { companyId, farmId, scheduledAt: "2026-07-12T10:00:00.000Z" },
    attempts: 1,
    maxAttempts: 5,
  };
}

describe("tenant notification jobs", () => {
  it("deduplicates schedules produced concurrently", async () => {
    const repository = new FakeRepository();
    const now = new Date("2026-07-12T10:15:00.000Z");
    const results = await Promise.all([
      scheduleTenantNotificationJobs(repository, now),
      scheduleTenantNotificationJobs(repository, now),
    ]);
    expect(repository.enqueued.size).toBe(3);
    expect(results[0].inserted + results[1].inserted).toBe(3);
  });

  it("rejects a payload whose company differs from the leased row", async () => {
    const repository = new FakeRepository();
    const invalid = job(1, 11);
    invalid.payload = { ...invalid.payload, companyId: 2 };
    await expect(handleTenantNotificationJob(
      repository,
      invalid,
      new AbortController().signal,
    )).rejects.toThrow("INVALID_TENANT_JOB_PAYLOAD");
    expect(repository.reads).toEqual([]);
  });

  it("keeps parallel company jobs in their own company and farm scope", async () => {
    const repository = new FakeRepository();
    await Promise.all([
      handleTenantNotificationJob(repository, job(1, 11, 101), new AbortController().signal),
      handleTenantNotificationJob(repository, job(2, 22, 202), new AbortController().signal),
    ]);
    expect(repository.reads).toEqual(expect.arrayContaining([
      { companyId: 1, farmId: 11, type: "low_stock" },
      { companyId: 2, farmId: 22, type: "low_stock" },
    ]));
    expect([...repository.inserted]).toEqual(expect.arrayContaining([
      expect.stringMatching(/^1:11:/),
      expect.stringMatching(/^2:22:/),
    ]));
    expect([...repository.inserted].some(key => key.startsWith("1:22:"))).toBe(false);
    expect([...repository.inserted].some(key => key.startsWith("2:11:"))).toBe(false);
  });

  it("makes replayed job side effects idempotent", async () => {
    const repository = new FakeRepository();
    const leased = job(1, 11);
    const now = new Date("2026-07-12T10:15:00.000Z");
    const first = await handleTenantNotificationJob(
      repository,
      leased,
      new AbortController().signal,
      now,
    );
    const replay = await handleTenantNotificationJob(
      repository,
      leased,
      new AbortController().signal,
      now,
    );
    expect(first.inserted).toBe(1);
    expect(replay.inserted).toBe(0);
    expect(repository.inserted.size).toBe(1);
  });

  it("does not read or write suspended tenant data", async () => {
    const repository = new FakeRepository();
    repository.active = false;
    await expect(handleTenantNotificationJob(
      repository,
      job(1, 11),
      new AbortController().signal,
    )).resolves.toEqual({ skipped: "inactive_scope", inserted: 0 });
    expect(repository.reads).toEqual([]);
    expect(repository.inserted.size).toBe(0);
  });
});
