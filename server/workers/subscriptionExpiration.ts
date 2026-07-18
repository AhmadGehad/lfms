import type { SubscriptionWindow } from "../entitlements/subscriptionLifecycle";
import type { LeasedJob } from "./leasedWorker";

export const SUBSCRIPTION_EXPIRATION_JOB_TYPE = "platform.subscriptions.expire";
const BATCH_SIZE = 100;
const MAX_SUBSCRIPTIONS_PER_JOB = 10_000;

export type SubscriptionExpirationJobPayload = Readonly<{
  scheduledAt: string;
}>;

export type DueSubscription = SubscriptionWindow & Readonly<{
  id: number;
  publicId: string;
  companyId: number;
  version: number;
}>;

export interface SubscriptionExpirationRepository {
  enqueue(input: {
    payload: SubscriptionExpirationJobPayload;
    deduplicationKey: string;
    runAt: Date;
  }): Promise<boolean>;
  listDue(now: Date, limit: number): Promise<readonly DueSubscription[]>;
  expireIfDue(input: {
    candidate: DueSubscription;
    now: Date;
    jobId: number;
    jobPublicId: string;
  }): Promise<boolean>;
}

function hourBucket(now: Date) {
  return new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000).toISOString();
}

export function scheduleSubscriptionExpirationJob(
  repository: SubscriptionExpirationRepository,
  now = new Date(),
) {
  const scheduledAt = hourBucket(now);
  return repository.enqueue({
    payload: { scheduledAt },
    deduplicationKey: scheduledAt,
    runAt: now,
  });
}

function assertJob(job: LeasedJob<SubscriptionExpirationJobPayload>) {
  if (
    job.companyId !== null ||
    job.type !== SUBSCRIPTION_EXPIRATION_JOB_TYPE ||
    !job.payload ||
    typeof job.payload.scheduledAt !== "string" ||
    !Number.isFinite(Date.parse(job.payload.scheduledAt))
  ) {
    throw new Error("INVALID_SUBSCRIPTION_EXPIRATION_JOB");
  }
}

export async function handleSubscriptionExpirationJob(
  repository: SubscriptionExpirationRepository,
  job: LeasedJob<SubscriptionExpirationJobPayload>,
  signal: AbortSignal,
  now = new Date(),
) {
  assertJob(job);
  let scanned = 0;
  let expired = 0;

  while (scanned < MAX_SUBSCRIPTIONS_PER_JOB) {
    if (signal.aborted) throw new Error("JOB_ABORTED");
    const limit = Math.min(BATCH_SIZE, MAX_SUBSCRIPTIONS_PER_JOB - scanned);
    const candidates = await repository.listDue(now, limit);
    if (candidates.length === 0) break;

    for (const candidate of candidates) {
      if (signal.aborted) throw new Error("JOB_ABORTED");
      scanned += 1;
      if (await repository.expireIfDue({
        candidate,
        now,
        jobId: job.id,
        jobPublicId: job.publicId,
      })) expired += 1;
    }
    if (candidates.length < limit) break;
  }

  return {
    scanned,
    expired,
    truncated: scanned >= MAX_SUBSCRIPTIONS_PER_JOB,
  };
}
