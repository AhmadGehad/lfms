import type { LeasedJob } from "./leasedWorker";

export const USAGE_SNAPSHOT_JOB_TYPE = "platform.usage.snapshot";

export type UsageSnapshotJobPayload = Readonly<{ scheduledAt: string }>;

export interface UsageSnapshotRepository {
  enqueue(input: {
    payload: UsageSnapshotJobPayload;
    deduplicationKey: string;
    runAt: Date;
  }): Promise<boolean>;
  refresh(now: Date, job: LeasedJob<UsageSnapshotJobPayload>): Promise<void>;
}

function throwIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  if (
    signal.reason instanceof Error &&
    signal.reason.message === "JOB_LEASE_LOST"
  ) {
    throw signal.reason;
  }
  throw new Error("JOB_ABORTED", { cause: signal.reason });
}

function hourBucket(now: Date) {
  return new Date(
    Math.floor(now.getTime() / 3_600_000) * 3_600_000
  ).toISOString();
}

export function scheduleUsageSnapshotJob(
  repository: UsageSnapshotRepository,
  now = new Date()
) {
  const scheduledAt = hourBucket(now);
  return repository.enqueue({
    payload: { scheduledAt },
    deduplicationKey: scheduledAt,
    runAt: now,
  });
}

export async function handleUsageSnapshotJob(
  repository: UsageSnapshotRepository,
  job: LeasedJob<UsageSnapshotJobPayload>,
  signal: AbortSignal,
  now = new Date()
) {
  if (
    job.companyId !== null ||
    job.type !== USAGE_SNAPSHOT_JOB_TYPE ||
    typeof job.payload?.scheduledAt !== "string" ||
    !Number.isFinite(Date.parse(job.payload.scheduledAt))
  ) {
    throw new Error("INVALID_USAGE_SNAPSHOT_JOB");
  }
  throwIfAborted(signal);
  await repository.refresh(now, job);
  throwIfAborted(signal);
}
