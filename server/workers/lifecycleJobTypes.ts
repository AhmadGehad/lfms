import type { LeasedJob } from "./leasedWorker";

export const LIFECYCLE_JOB_TYPES = {
  dataExport: "tenant.data_export",
  restoreValidate: "tenant.restore.validate",
  restoreExecute: "tenant.restore.execute",
} as const;

export type LifecycleJobType = (typeof LIFECYCLE_JOB_TYPES)[keyof typeof LIFECYCLE_JOB_TYPES];

export type LifecycleJobPayload = Readonly<{
  companyId: number;
  resourcePublicId: string;
}>;

const publicIdPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function lifecycleExportStorageKey(input: {
  companyPublicId: string;
  exportPublicId: string;
  backgroundJobPublicId: string;
  attempt: number;
}) {
  if (
    !publicIdPattern.test(input.companyPublicId) ||
    !publicIdPattern.test(input.exportPublicId) ||
    !publicIdPattern.test(input.backgroundJobPublicId) ||
    !Number.isSafeInteger(input.attempt) ||
    input.attempt <= 0
  ) {
    throw new Error("INVALID_LIFECYCLE_EXPORT_STORAGE_KEY");
  }
  return `tenants/${input.companyPublicId}/exports/${input.exportPublicId}/${input.backgroundJobPublicId}-attempt-${input.attempt}.json`;
}

export function assertLifecycleJobPayload(job: LeasedJob<LifecycleJobPayload>) {
  if (
    job.companyId === null ||
    !Object.values(LIFECYCLE_JOB_TYPES).includes(job.type as LifecycleJobType) ||
    !job.payload ||
    !Number.isInteger(job.payload.companyId) ||
    job.payload.companyId <= 0 ||
    job.payload.companyId !== job.companyId ||
    !publicIdPattern.test(job.payload.resourcePublicId)
  ) {
    throw new Error("INVALID_LIFECYCLE_JOB_PAYLOAD");
  }
  return job.payload;
}

export interface LifecycleJobRepository {
  processExport(job: LeasedJob<LifecycleJobPayload>, signal: AbortSignal): Promise<unknown>;
  validateRestore(job: LeasedJob<LifecycleJobPayload>, signal: AbortSignal): Promise<unknown>;
  executeRestore(job: LeasedJob<LifecycleJobPayload>, signal: AbortSignal): Promise<unknown>;
  recordFailure(job: LeasedJob<LifecycleJobPayload>, error: Error): Promise<void>;
}

export async function handleLifecycleJob(
  repository: LifecycleJobRepository,
  job: LeasedJob<LifecycleJobPayload>,
  signal: AbortSignal,
) {
  assertLifecycleJobPayload(job);
  if (signal.aborted) throw new Error("JOB_ABORTED");
  try {
    switch (job.type as LifecycleJobType) {
      case LIFECYCLE_JOB_TYPES.dataExport:
        return await repository.processExport(job, signal);
      case LIFECYCLE_JOB_TYPES.restoreValidate:
        return await repository.validateRestore(job, signal);
      case LIFECYCLE_JOB_TYPES.restoreExecute:
        return await repository.executeRestore(job, signal);
      default:
        throw new Error("INVALID_LIFECYCLE_JOB_PAYLOAD");
    }
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    try {
      await repository.recordFailure(job, failure);
    } catch (recordError) {
      if (failure.cause === undefined) failure.cause = recordError;
    }
    throw failure;
  }
}
