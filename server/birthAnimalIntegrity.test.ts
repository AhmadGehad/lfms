import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { animals, lambingLog } from "../drizzle/schema";
import type { TenantContext } from "../shared/tenancy";
import { updateAnimal } from "./db";
import { runWithTenantContext } from "./tenancy/runtime";

const tenantContext: TenantContext = {
  companyId: 11,
  companyPublicId: "01J00000000000000000000000",
  companySlug: "test-company",
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
  requestId: "birth-animal-integrity-test",
};

function createUpdateTx(affectedRows = 1) {
  const writes: Array<{ table: unknown; data: Record<string, unknown> }> = [];
  const tx = {
    update: (table: unknown) => ({
      set: (data: Record<string, unknown>) => ({
        where: async () => {
          writes.push({ table, data });
          return [{ affectedRows }];
        },
      }),
    }),
  };
  return { tx, writes };
}

describe("birth-to-animal integrity", () => {
  it("synchronizes parent corrections to the linked birth record", async () => {
    const { tx, writes } = createUpdateTx();

    await runWithTenantContext(tenantContext, () =>
      updateAnimal(12, { damId: 4, sireId: null }, tx as any));

    expect(writes).toEqual([
      {
        table: animals,
        data: expect.objectContaining({ damId: 4, sireId: null, version: expect.anything() }),
      },
      {
        table: lambingLog,
        data: { damId: 4, sireId: null },
      },
    ]);
  });

  it("does not touch birth history for unrelated animal edits", async () => {
    const { tx, writes } = createUpdateTx();

    await runWithTenantContext(tenantContext, () =>
      updateAnimal(12, { notes: "health check" }, tx as any));

    expect(writes).toEqual([
      {
        table: animals,
        data: expect.objectContaining({ notes: "health check", version: expect.anything() }),
      },
    ]);
  });

  it("does not synchronize parentage after a stale version loses the CAS", async () => {
    const { tx, writes } = createUpdateTx(0);

    const affected = await runWithTenantContext(tenantContext, () =>
      updateAnimal(12, { damId: 4 }, tx as any, 3));

    expect(affected).toBe(0);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.table).toBe(animals);
  });

  it("allows only one birth record to reference a promoted animal", () => {
    const index = getTableConfig(lambingLog).indexes.find(
      item => item.config.name === "lambing_log_promoted_head_unique",
    );

    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns).toContain(lambingLog.promotedHeadId);
  });
});
