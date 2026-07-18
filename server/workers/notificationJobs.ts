import {
  lowStockCandidates,
  notificationDayBucket,
  pregnancyCandidates,
  vaccinationCandidates,
  type BoosterDueRow,
  type LowStockRow,
  type NotificationCandidate,
  type PregnancyCheckupRow,
  type PregnancyDueRow,
  type VaccinationDueRow,
} from "../notifications/decisions";
import { runWithTenantContext } from "../tenancy/runtime";
import type { LeasedJob } from "./leasedWorker";

export const NOTIFICATION_JOB_TYPES = {
  lowStock: "tenant.notifications.low_stock",
  vaccination: "tenant.notifications.vaccination",
  pregnancy: "tenant.notifications.pregnancy",
} as const;

export type NotificationJobType =
  (typeof NOTIFICATION_JOB_TYPES)[keyof typeof NOTIFICATION_JOB_TYPES];

export type NotificationJobPayload = Readonly<{
  companyId: number;
  farmId: number;
  scheduledAt: string;
}>;

export type ActiveTenantFarm = Readonly<{ companyId: number; farmId: number }>;

export interface NotificationJobRepository {
  listActiveTenantFarms(): Promise<readonly ActiveTenantFarm[]>;
  isActiveTenantFarm(companyId: number, farmId: number): Promise<boolean>;
  enqueue(input: {
    companyId: number;
    type: NotificationJobType;
    payload: NotificationJobPayload;
    deduplicationKey: string;
    runAt: Date;
  }): Promise<boolean>;
  listLowStock(
    companyId: number,
    farmId: number
  ): Promise<readonly LowStockRow[]>;
  listVaccinations(
    companyId: number,
    farmId: number
  ): Promise<{
    next: readonly VaccinationDueRow[];
    boosters: readonly BoosterDueRow[];
  }>;
  listPregnancies(
    companyId: number,
    farmId: number
  ): Promise<{
    due: readonly PregnancyDueRow[];
    checkups: readonly PregnancyCheckupRow[];
  }>;
  insertNotification(
    companyId: number,
    farmId: number,
    candidate: NotificationCandidate,
    bucket: string
  ): Promise<boolean>;
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

export async function scheduleTenantNotificationJobs(
  repository: NotificationJobRepository,
  now = new Date()
) {
  const scopes = await repository.listActiveTenantFarms();
  const scheduledAt = hourBucket(now);
  let inserted = 0;
  for (const scope of scopes) {
    for (const type of Object.values(NOTIFICATION_JOB_TYPES)) {
      const created = await repository.enqueue({
        companyId: scope.companyId,
        type,
        payload: { ...scope, scheduledAt },
        deduplicationKey: `${scope.farmId}:${scheduledAt}`,
        runAt: now,
      });
      if (created) inserted += 1;
    }
  }
  return { scopes: scopes.length, inserted };
}

function assertPayload(job: LeasedJob<NotificationJobPayload>) {
  const payload = job.payload;
  if (
    job.companyId === null ||
    !payload ||
    !Number.isInteger(payload.companyId) ||
    !Number.isInteger(payload.farmId) ||
    payload.companyId <= 0 ||
    payload.farmId <= 0 ||
    typeof payload.scheduledAt !== "string" ||
    !Number.isFinite(Date.parse(payload.scheduledAt)) ||
    payload.companyId !== job.companyId
  ) {
    throw new Error("INVALID_TENANT_JOB_PAYLOAD");
  }
  if (
    !Object.values(NOTIFICATION_JOB_TYPES).includes(
      job.type as NotificationJobType
    )
  ) {
    throw new Error("UNSUPPORTED_TENANT_JOB_TYPE");
  }
  return payload;
}

export async function handleTenantNotificationJob(
  repository: NotificationJobRepository,
  job: LeasedJob<NotificationJobPayload>,
  signal: AbortSignal,
  now = new Date()
) {
  const payload = assertPayload(job);
  throwIfAborted(signal);
  if (
    !(await repository.isActiveTenantFarm(payload.companyId, payload.farmId))
  ) {
    return { skipped: "inactive_scope" as const, inserted: 0 };
  }
  throwIfAborted(signal);

  return runWithTenantContext(
    {
      actorType: "system_job",
      jobId: job.id,
      companyId: payload.companyId,
      requestId: `job:${job.publicId}`,
    },
    async () => {
      let candidates: readonly NotificationCandidate[];
      switch (job.type as NotificationJobType) {
        case NOTIFICATION_JOB_TYPES.lowStock:
          candidates = lowStockCandidates(
            await repository.listLowStock(payload.companyId, payload.farmId)
          );
          throwIfAborted(signal);
          break;
        case NOTIFICATION_JOB_TYPES.vaccination: {
          const rows = await repository.listVaccinations(
            payload.companyId,
            payload.farmId
          );
          throwIfAborted(signal);
          candidates = vaccinationCandidates(rows.next, rows.boosters, now);
          break;
        }
        case NOTIFICATION_JOB_TYPES.pregnancy: {
          const rows = await repository.listPregnancies(
            payload.companyId,
            payload.farmId
          );
          throwIfAborted(signal);
          candidates = pregnancyCandidates(rows.due, rows.checkups, now);
          break;
        }
        default:
          throw new Error("UNSUPPORTED_TENANT_JOB_TYPE");
      }

      const bucket = notificationDayBucket(now);
      let inserted = 0;
      for (const candidate of candidates) {
        throwIfAborted(signal);
        if (
          await repository.insertNotification(
            payload.companyId,
            payload.farmId,
            candidate,
            bucket
          )
        )
          inserted += 1;
        throwIfAborted(signal);
      }
      return { skipped: null, inserted };
    }
  );
}
