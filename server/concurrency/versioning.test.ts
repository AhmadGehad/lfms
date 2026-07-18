import { describe, expect, it } from "vitest";
import {
  executeVersionedUpdate,
  VersionConflictError,
  assertExpectedVersion,
  assertVersionedUpdate,
} from "./versioning";

function serialTransaction() {
  let tail = Promise.resolve();
  return async <T>(work: () => Promise<T>) => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  };
}

describe("optimistic versioning", () => {
  it("accepts exactly one updated row", () => {
    expect(() => assertVersionedUpdate(1)).not.toThrow();
  });

  it("turns lost updates and missing resources into a stable conflict", () => {
    expect(() => assertVersionedUpdate(0)).toThrow(VersionConflictError);
    expect(() => assertVersionedUpdate(2)).toThrow(VersionConflictError);
  });

  it("rejects invalid client versions", () => {
    expect(() => assertExpectedVersion(0)).toThrow(/positive integer/i);
    expect(() => assertExpectedVersion(1)).not.toThrow();
  });

  it("does not append audit data when a stale compare-and-swap loses", async () => {
    let auditCalls = 0;
    await expect(executeVersionedUpdate({
      expectedVersion: 4,
      lockCurrent: async () => ({ version: 5, amount: "12.00" }),
      compareAndSwap: async () => 0,
      appendAudit: async () => { auditCalls += 1; },
    })).rejects.toBeInstanceOf(VersionConflictError);
    expect(auditCalls).toBe(0);
  });

  it("allows only one of two parallel updates using the same version", async () => {
    const transaction = serialTransaction();
    let version = 1;
    let amount = "10.00";
    const auditedVersions: number[] = [];

    const update = (nextAmount: string) => transaction(() => executeVersionedUpdate({
      expectedVersion: 1,
      lockCurrent: async () => ({ version, amount }),
      compareAndSwap: async () => {
        if (version !== 1) return 0;
        amount = nextAmount;
        version += 1;
        return 1;
      },
      appendAudit: async current => { auditedVersions.push(current.version); },
    }));

    const results = await Promise.allSettled([update("20.00"), update("30.00")]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: expect.any(VersionConflictError) });
    expect(version).toBe(2);
    expect(auditedVersions).toEqual([1]);
  });
});
