import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  db: null as any,
  events: [] as string[],
}));

vi.mock("../repositories/db", async importOriginal => {
  const actual = await importOriginal<typeof import("../repositories/db")>();
  return {
    ...actual,
    requirePlatformDb: vi.fn(async () => testState.db),
  };
});

vi.mock("../repositories/audit", async importOriginal => {
  const actual = await importOriginal<typeof import("../repositories/audit")>();
  return {
    ...actual,
    appendPlatformAudit: vi.fn(async () => undefined),
  };
});

vi.mock("../repositories/farms", async importOriginal => {
  const actual = await importOriginal<typeof import("../repositories/farms")>();
  return {
    ...actual,
    findFarmByPublicId: vi.fn(),
  };
});

vi.mock("../../entitlements/limits", async importOriginal => {
  const actual = await importOriginal<typeof import("../../entitlements/limits")>();
  return {
    ...actual,
    lockCompanyQuota: vi.fn(async () => {
      testState.events.push("lock:company:update");
    }),
  };
});

import { lockCompanyQuota } from "../../entitlements/limits";
import { findFarmByPublicId } from "../repositories/farms";
import { changeFarmStatus } from "./farms";
import { updateSubscription } from "./subscriptions";

const actor = {
  platformAdminId: 1,
  userId: 2,
  permissions: new Set<string>(),
  sessionId: 3,
  authenticationLevel: "mfa" as const,
  requestId: "concurrency-guard-test",
};

function thenableRows(rows: unknown[], label: string) {
  const builder: any = {
    from: () => builder,
    where: () => builder,
    limit: () => builder,
    for: async (mode: string) => {
      testState.events.push(`lock:${label}:${mode}`);
      return rows;
    },
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return builder;
}

function transactionDb(selects: Array<{ label: string; rows: unknown[] }>) {
  const update = vi.fn(() => {
    const query = thenableRows([{ affectedRows: 1 }], "update");
    query.set = () => query;
    return query;
  });
  const tx = {
    select: vi.fn(() => {
      const next = selects.shift();
      if (!next) throw new Error("Unexpected select");
      testState.events.push(`select:${next.label}`);
      return thenableRows(next.rows, next.label);
    }),
    update,
  };
  return {
    tx,
    db: { transaction: async (operation: (scope: typeof tx) => unknown) => operation(tx) },
  };
}

describe("platform lifecycle concurrency guards", () => {
  beforeEach(() => {
    testState.events.length = 0;
    vi.clearAllMocks();
  });

  it("locks the company before the current subscription", async () => {
    const { db } = transactionDb([
      { label: "candidate", rows: [{ id: 9, companyId: 7 }] },
      { label: "company", rows: [{ id: 7, version: 3, deletedAt: null }] },
      { label: "subscription", rows: [{
        id: 9,
        publicId: "01J00000000000000000000009",
        companyId: 7,
        status: "active",
        isCurrent: true,
        version: 4,
        periodStart: new Date("2026-07-01T00:00:00Z"),
        periodEnd: new Date("2026-08-01T00:00:00Z"),
        trialEndsAt: null,
        graceEndsAt: null,
      }] },
    ]);
    testState.db = db;

    await updateSubscription({
      publicId: "01J00000000000000000000009",
      status: "suspended",
      expectedVersion: 4,
    }, actor);

    expect(testState.events.slice(0, 5)).toEqual([
      "select:candidate",
      "select:company",
      "lock:company:update",
      "select:subscription",
      "lock:subscription:update",
    ]);
  });

  it("does not suspend the last active farm of an active company", async () => {
    vi.mocked(findFarmByPublicId).mockResolvedValue({
      id: 11,
      publicId: "01J00000000000000000000011",
      companyId: 7,
      status: "active",
      version: 2,
      deletedAt: null,
    } as any);
    const { db, tx } = transactionDb([
      { label: "company", rows: [{ lifecycleStatus: "active" }] },
      { label: "farm", rows: [{
        id: 11,
        publicId: "01J00000000000000000000011",
        companyId: 7,
        status: "active",
        version: 2,
        deletedAt: null,
      }] },
      { label: "active-farm-count", rows: [{ count: 1 }] },
    ]);
    testState.db = db;

    await expect(changeFarmStatus({
      publicId: "01J00000000000000000000011",
      status: "suspended",
      expectedVersion: 2,
    }, actor)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(lockCompanyQuota).toHaveBeenCalledWith(tx, 7);
    expect(tx.update).not.toHaveBeenCalled();
  });
});
