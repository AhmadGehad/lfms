import { describe, expect, it, vi } from "vitest";
import type { LeasedJob } from "./leasedWorker";
import {
  handleUsageSnapshotJob,
  scheduleUsageSnapshotJob,
  USAGE_SNAPSHOT_JOB_TYPE,
  type UsageSnapshotJobPayload,
  type UsageSnapshotRepository,
} from "./usageSnapshot";

function repository(): UsageSnapshotRepository {
  return { enqueue: vi.fn().mockResolvedValue(true), refresh: vi.fn().mockResolvedValue(undefined) };
}

describe("usage snapshot worker", () => {
  it("uses one idempotent hourly schedule key", async () => {
    const repo = repository();
    const now = new Date("2026-07-12T10:42:00.000Z");
    await scheduleUsageSnapshotJob(repo, now);
    expect(repo.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      deduplicationKey: "2026-07-12T10:00:00.000Z",
      payload: { scheduledAt: "2026-07-12T10:00:00.000Z" },
    }));
  });

  it("refreshes counters only through a valid leased global job", async () => {
    const repo = repository();
    const job: LeasedJob<UsageSnapshotJobPayload> = {
      id: 1,
      publicId: "01J00000000000000000000000",
      companyId: null,
      type: USAGE_SNAPSHOT_JOB_TYPE,
      payload: { scheduledAt: "2026-07-12T10:00:00.000Z" },
      attempts: 1,
      maxAttempts: 5,
    };
    await handleUsageSnapshotJob(repo, job, new AbortController().signal);
    expect(repo.refresh).toHaveBeenCalledOnce();
  });

  it("rejects tenant-scoped and aborted jobs without refreshing", async () => {
    const repo = repository();
    const job: LeasedJob<UsageSnapshotJobPayload> = {
      id: 1,
      publicId: "01J00000000000000000000000",
      companyId: 4,
      type: USAGE_SNAPSHOT_JOB_TYPE,
      payload: { scheduledAt: "2026-07-12T10:00:00.000Z" },
      attempts: 1,
      maxAttempts: 5,
    };
    await expect(handleUsageSnapshotJob(repo, job, new AbortController().signal))
      .rejects.toThrow("INVALID_USAGE_SNAPSHOT_JOB");

    const controller = new AbortController();
    controller.abort();
    await expect(handleUsageSnapshotJob(repo, { ...job, companyId: null }, controller.signal))
      .rejects.toThrow("JOB_ABORTED");
    expect(repo.refresh).not.toHaveBeenCalled();
  });
});
