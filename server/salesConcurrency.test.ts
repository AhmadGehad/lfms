import { describe, expect, it } from "vitest";
import type { TenantContext } from "../shared/tenancy";
import { sales } from "../drizzle/schema";
import { updateSale } from "./db";
import { runWithTenantContext } from "./tenancy/runtime";

const tenant: TenantContext = {
  companyId: 11,
  companyPublicId: "01J00000000000000000000000",
  companySlug: "sales-cas",
  companyLifecycleStatus: "active",
  userId: 21,
  membershipId: 31,
  membershipRole: "admin",
  membershipStatus: "active",
  authorizationVersion: 1,
  farmAccessMode: "restricted",
  accessibleFarmIds: [41],
  selectedFarmId: 41,
  permissionOverrides: {},
  sessionId: 51,
  authenticationLevel: "primary",
  entitlementVersion: 1,
  requestId: "sales-cas-test",
};

function updateHandle(affectedRows: number) {
  let written: Record<string, unknown> | null = null;
  const tx = {
    update: (table: unknown) => {
      expect(table).toBe(sales);
      return {
        set: (data: Record<string, unknown>) => {
          written = data;
          return { where: async () => [{ affectedRows }] };
        },
      };
    },
  };
  return { tx, getWritten: () => written };
}

describe("sale optimistic concurrency", () => {
  it("increments version when the expected version wins", async () => {
    const handle = updateHandle(1);
    const affected = await runWithTenantContext(tenant, () =>
      updateSale(7, 3, { amountPaid: "12.00" }, handle.tx as any));

    expect(affected).toBe(1);
    expect(handle.getWritten()).toEqual(expect.objectContaining({
      amountPaid: "12.00",
      version: expect.anything(),
    }));
  });

  it("reports a stale compare-and-swap without claiming success", async () => {
    const handle = updateHandle(0);
    const affected = await runWithTenantContext(tenant, () =>
      updateSale(7, 3, { amountPaid: "12.00" }, handle.tx as any));

    expect(affected).toBe(0);
  });
});
