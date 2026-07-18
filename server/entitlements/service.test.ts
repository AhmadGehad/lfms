import { describe, expect, it } from "vitest";
import type { TenantContext } from "../../shared/tenancy";
import {
  EntitlementError,
  EntitlementService,
  QuotaService,
  type EntitlementSnapshot,
} from "./service";

const snapshot: EntitlementSnapshot = {
  companyId: 1,
  version: 2,
  features: new Map([
    ["animals", { key: "animals", mode: "enabled", expiresAt: null }],
    ["breeding", { key: "breeding", mode: "read_only", expiresAt: null }],
    ["billing", { key: "billing", mode: "disabled", expiresAt: null }],
  ]),
  limits: new Map([["animals", 2]]),
};

const ctx = {
  companyId: 1,
  companyLifecycleStatus: "active",
} as TenantContext;

describe("entitlement service", () => {
  it("allows enabled reads and writes", async () => {
    const service = new EntitlementService({ load: async () => snapshot });
    await expect(service.assertAccess(ctx, "animals", "write")).resolves.toMatchObject({
      effectiveMode: "enabled",
    });
  });

  it("allows history reads but blocks writes for read-only features", async () => {
    const service = new EntitlementService({ load: async () => snapshot });
    await expect(service.assertAccess(ctx, "breeding", "read")).resolves.toBeDefined();
    await expect(service.assertAccess(ctx, "breeding", "write")).rejects.toMatchObject({
      code: "FEATURE_READ_ONLY",
    });
  });

  it("blocks writes for suspended companies regardless of feature", async () => {
    const service = new EntitlementService({ load: async () => snapshot });
    await expect(service.assertAccess(
      { ...ctx, companyLifecycleStatus: "suspended" },
      "animals",
      "write",
    )).rejects.toMatchObject({ code: "COMPANY_SUSPENDED" });
  });

  it("keeps an expired disabled feature disabled", async () => {
    const expired: EntitlementSnapshot = {
      ...snapshot,
      features: new Map([
        ["billing", {
          key: "billing",
          mode: "disabled",
          expiresAt: new Date("2026-07-12T00:00:00.000Z"),
        }],
      ]),
    };
    const service = new EntitlementService(
      { load: async () => expired },
      () => new Date("2026-07-12T00:00:00.000Z"),
    );
    await expect(service.assertAccess(ctx, "billing", "read"))
      .rejects.toMatchObject({ code: "FEATURE_DISABLED" });
  });
});

describe("quota service", () => {
  it("passes the authoritative limit to the atomic usage update", async () => {
    const calls: unknown[] = [];
    const quotas = new QuotaService(
      { load: async () => snapshot },
      {
        consume: async input => { calls.push(input); return { consumed: true, current: 2 }; },
        release: async () => 1,
      },
    );
    await expect(quotas.consume(ctx, "animals", 1, "tx")).resolves.toBe(2);
    expect(calls).toEqual([expect.objectContaining({ companyId: 1, limit: 2, transaction: "tx" })]);
  });

  it("returns a stable quota error when the atomic update loses the race", async () => {
    const quotas = new QuotaService(
      { load: async () => snapshot },
      {
        consume: async () => ({ consumed: false, current: 2 }),
        release: async () => 2,
      },
    );
    await expect(quotas.consume(ctx, "animals", 1, "tx"))
      .rejects.toBeInstanceOf(EntitlementError);
  });
});
