import { describe, expect, it } from "vitest";
import {
  assertLifecycleJobPayload,
  handleLifecycleJob,
  lifecycleExportStorageKey,
  LIFECYCLE_JOB_TYPES,
  type LifecycleJobRepository,
} from "./lifecycleJobTypes";

const job = {
  id: 1,
  publicId: "01J00000000000000000000000",
  companyId: 7,
  type: LIFECYCLE_JOB_TYPES.dataExport,
  payload: { companyId: 7, resourcePublicId: "01J00000000000000000000001" },
  attempts: 1,
  maxAttempts: 5,
};

describe("lifecycle job payload", () => {
  it("accepts a scoped registered lifecycle job", () => {
    expect(assertLifecycleJobPayload(job)).toEqual(job.payload);
  });

  it("rejects company mismatch", () => {
    expect(() => assertLifecycleJobPayload({
      ...job,
      payload: { ...job.payload, companyId: 8 },
    })).toThrow("INVALID_LIFECYCLE_JOB_PAYLOAD");
  });

  it("rejects unknown job types and malformed public IDs", () => {
    expect(() => assertLifecycleJobPayload({
      ...job,
      type: "tenant.data_export.typo",
      payload: { ...job.payload, resourcePublicId: "1" },
    })).toThrow("INVALID_LIFECYCLE_JOB_PAYLOAD");
  });
});

describe("lifecycle export storage fencing", () => {
  it("uses immutable keys when a lost lease is reclaimed", () => {
    const base = {
      companyPublicId: "01J00000000000000000000002",
      exportPublicId: job.payload.resourcePublicId,
      backgroundJobPublicId: job.publicId,
    };
    const staleWorkerKey = lifecycleExportStorageKey({ ...base, attempt: 1 });
    const reclaimedWorkerKey = lifecycleExportStorageKey({ ...base, attempt: 2 });
    const objects = new Map<string, string>();
    objects.set(reclaimedWorkerKey, "winner");
    objects.set(staleWorkerKey, "stale");

    expect(staleWorkerKey).not.toBe(reclaimedWorkerKey);
    expect(objects.get(reclaimedWorkerKey)).toBe("winner");
  });

  it("rejects invalid attempt fences", () => {
    expect(() => lifecycleExportStorageKey({
      companyPublicId: "01J00000000000000000000002",
      exportPublicId: job.payload.resourcePublicId,
      backgroundJobPublicId: job.publicId,
      attempt: 0,
    })).toThrow("INVALID_LIFECYCLE_EXPORT_STORAGE_KEY");
  });
});

describe("lifecycle worker dispatch", () => {
  it("registers export and restore phases without any purge handler", () => {
    expect(Object.values(LIFECYCLE_JOB_TYPES).sort()).toEqual([
      "tenant.data_export",
      "tenant.restore.execute",
      "tenant.restore.validate",
    ]);
    expect(Object.values(LIFECYCLE_JOB_TYPES).some(type => type.includes("purge"))).toBe(false);
  });

  it("dispatches only the leased lifecycle type", async () => {
    const calls: string[] = [];
    const repository: LifecycleJobRepository = {
      processExport: async () => { calls.push("export"); },
      validateRestore: async () => { calls.push("validate"); },
      executeRestore: async () => { calls.push("execute"); },
      recordFailure: async () => { calls.push("failure"); },
    };
    await handleLifecycleJob(repository, job, new AbortController().signal);
    expect(calls).toEqual(["export"]);
  });

  it("records a scoped failure before retry", async () => {
    const calls: string[] = [];
    const repository: LifecycleJobRepository = {
      processExport: async () => { throw new Error("storage unavailable"); },
      validateRestore: async () => undefined,
      executeRestore: async () => undefined,
      recordFailure: async (leased, error) => { calls.push(`${leased.companyId}:${error.message}`); },
    };
    await expect(handleLifecycleJob(repository, job, new AbortController().signal))
      .rejects.toThrow("storage unavailable");
    expect(calls).toEqual(["7:storage unavailable"]);
  });
});
