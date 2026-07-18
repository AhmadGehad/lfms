import { TENANCY_ERROR_CODES } from "../../shared/tenancy";

export class VersionConflictError extends Error {
  readonly code = TENANCY_ERROR_CODES.versionConflict;

  constructor() {
    super("Resource changed. Reload and retry with the latest version.");
    this.name = "VersionConflictError";
  }
}

export function assertExpectedVersion(expectedVersion: number) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error("expectedVersion must be a positive integer");
  }
}

export function assertVersionedUpdate(affectedRows: number) {
  if (affectedRows !== 1) throw new VersionConflictError();
}

export type VersionedUpdateSteps<T> = Readonly<{
  expectedVersion: number;
  lockCurrent: () => Promise<T | null>;
  compareAndSwap: () => Promise<number>;
  appendAudit: (current: T) => Promise<void>;
}>;

/**
 * Runs inside the caller's database transaction. `lockCurrent` must acquire a
 * row lock that remains held through the compare-and-swap and audit insert.
 */
export async function executeVersionedUpdate<T>(steps: VersionedUpdateSteps<T>) {
  assertExpectedVersion(steps.expectedVersion);
  const current = await steps.lockCurrent();
  if (!current) throw new VersionConflictError();
  assertVersionedUpdate(await steps.compareAndSwap());
  await steps.appendAudit(current);
  return { version: steps.expectedVersion + 1 };
}
