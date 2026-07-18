import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  companies,
  companyInvitations,
  companyMemberships,
  companySubscriptions,
  farms,
  planEntitlements,
  tenantRestoreJobs,
  users,
} from "../../../drizzle/schema";

const mocks = vi.hoisted(() => ({
  appendPlatformAudit: vi.fn(),
  affectedRows: vi.fn(),
  findCompanyByPublicId: vi.fn(),
  findPlanByPublicId: vi.fn(),
  insertCompany: vi.fn(),
  requirePlatformDb: vi.fn(),
}));

vi.mock("../repositories/audit", () => ({
  appendPlatformAudit: mocks.appendPlatformAudit,
}));
vi.mock("../repositories/companies", () => ({
  findCompanyByPublicId: mocks.findCompanyByPublicId,
  insertCompany: mocks.insertCompany,
}));
vi.mock("../repositories/db", () => ({
  affectedRows: mocks.affectedRows,
  requirePlatformDb: mocks.requirePlatformDb,
}));
vi.mock("../repositories/plans", () => ({
  findPlanByPublicId: mocks.findPlanByPublicId,
}));
vi.mock("../idempotency", () => ({
  executeIdempotent: (_tx: unknown, _input: unknown, operation: () => Promise<unknown>) => operation(),
}));

import { changeCompanyLifecycle, createCompany } from "./companies";

const actor = {
  platformAdminId: 7,
  userId: 8,
  permissions: new Set(["companies.write"]),
  sessionId: 9,
  authenticationLevel: "mfa" as const,
  requestId: "company-service-test",
};

const createInput = {
  name: " Example Company ",
  slug: " Example-Company ",
  initialFarmName: " Main Farm ",
  initialFarmCode: " main ",
  ownerEmail: " Owner@Example.Test ",
  idempotencyKey: "company-create-test-key",
};

function makeTransaction(readRows: Map<unknown, unknown[]> = new Map()) {
  const writes: Array<{ table: unknown; value: Record<string, unknown> }> = [];
  const readOrder: unknown[] = [];
  const lockModes: string[] = [];
  let activeReads = 0;
  let maxConcurrentReads = 0;

  const terminal = (table: unknown) => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.innerJoin = chain;
    builder.where = chain;
    builder.limit = chain;
    builder.for = async (mode: string) => {
      readOrder.push(table);
      lockModes.push(mode);
      activeReads += 1;
      maxConcurrentReads = Math.max(maxConcurrentReads, activeReads);
      await new Promise(resolve => setTimeout(resolve, 1));
      activeReads -= 1;
      return readRows.get(table) ?? [];
    };
    builder.then = (
      resolve: (rows: unknown[]) => unknown,
      reject: (error: unknown) => unknown,
    ) => Promise.resolve(readRows.get(table) ?? []).then(resolve, reject);
    return builder;
  };

  const tx = {
    select: () => ({ from: (table: unknown) => terminal(table) }),
    insert: (table: unknown) => ({
      values: async (value: Record<string, unknown>) => {
        writes.push({ table, value });
        const insertId = table === users ? 501 : table === companyMemberships ? 601 : 701;
        return [{ insertId }];
      },
    }),
    update: (table: unknown) => ({
      set: (value: Record<string, unknown>) => ({
        where: async () => {
          writes.push({ table, value });
          return [{ affectedRows: 1 }];
        },
      }),
    }),
  };

  return {
    tx,
    writes,
    readOrder,
    lockModes,
    getMaxConcurrentReads: () => maxConcurrentReads,
  };
}

function useTransaction(transaction: ReturnType<typeof makeTransaction>) {
  const root = {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(transaction.tx)),
  };
  mocks.requirePlatformDb.mockResolvedValue(root);
  return root;
}

describe("company onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertCompany.mockResolvedValue(101);
    mocks.appendPlatformAudit.mockResolvedValue(undefined);
    mocks.affectedRows.mockImplementation(result => Number(result?.affectedRows ?? 0));
  });

  it("creates an owner invitation, initial farm, and trial without pre-activating an identity", async () => {
    const transaction = makeTransaction(new Map([
      [users, []],
      [planEntitlements, [{ featureId: 11, accessMode: "write", limitValue: 50, configuration: null }]],
    ]));
    const root = useTransaction(transaction);
    mocks.findPlanByPublicId.mockResolvedValue({
      id: 13,
      publicId: "01J00000000000000000000000",
      code: "standard",
      name: "Standard",
      planVersion: 2,
      status: "active",
      currency: "USD",
      priceMonthly: "49.00",
      priceYearly: "490.00",
    });

    const result = await createCompany({
      ...createInput,
      planPublicId: "01J00000000000000000000000",
    }, actor);

    expect(root.transaction).toHaveBeenCalledOnce();
    expect(mocks.insertCompany).toHaveBeenCalledWith(transaction.tx, expect.objectContaining({
      name: "Example Company",
      slug: "example-company",
      lifecycleStatus: "provisioning",
    }));
    expect(transaction.writes.some(write => write.table === users)).toBe(false);
    expect(transaction.writes.some(write => write.table === companyMemberships)).toBe(false);
    expect(transaction.writes.find(write => write.table === companyInvitations)?.value).toMatchObject({
      companyId: 101,
      normalizedEmail: "owner@example.test",
      role: "owner",
      status: "pending",
      farmAccessMode: "all",
      invitedByPlatformAdministratorId: actor.platformAdminId,
    });
    expect(transaction.writes.find(write => write.table === farms)?.value).toMatchObject({
      companyId: 101,
      name: "Main Farm",
      code: "MAIN",
      createdByMembershipId: null,
    });
    const subscription = transaction.writes.find(write => write.table === companySubscriptions)?.value;
    expect(subscription).toMatchObject({
      companyId: 101,
      subscriptionPlanId: 13,
      status: "trialing",
      changedByPlatformAdministratorId: actor.platformAdminId,
    });
    expect(subscription?.trialEndsAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({ status: "provisioning", ownerInvitationToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    const storedInvitation = transaction.writes.find(write => write.table === companyInvitations)?.value;
    expect(storedInvitation?.tokenHash).not.toEqual(result.ownerInvitationToken);
    expect(mocks.appendPlatformAudit).toHaveBeenCalledTimes(2);
  });

  it("does not trust or activate a preexisting account during owner invitation", async () => {
    const transaction = makeTransaction(new Map([[users, [{
      id: 55,
      normalizedEmail: "different@example.test",
      status: "active",
    }]]]));
    useTransaction(transaction);

    const result = await createCompany(createInput, actor);
    expect(result.status).toBe("provisioning");
    expect(transaction.writes.some(write => write.table === users)).toBe(false);
    expect(transaction.writes.some(write => write.table === companyMemberships)).toBe(false);
  });
});

describe("company activation readiness", () => {
  const company = {
    id: 101,
    publicId: "01J00000000000000000000001",
    lifecycleStatus: "provisioning",
    version: 3,
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCompanyByPublicId.mockResolvedValue(company);
    mocks.appendPlatformAudit.mockResolvedValue(undefined);
    mocks.affectedRows.mockImplementation(result => Number(result?.affectedRows ?? 0));
  });

  function readyRows(missing?: "owner" | "farm" | "subscription") {
    return new Map<unknown, unknown[]>([
      [companies, [company]],
      [companyMemberships, missing === "owner" ? [] : [{ id: 201 }]],
      [farms, missing === "farm" ? [] : [{ id: 301 }]],
      [companySubscriptions, missing === "subscription" ? [] : [{ id: 401 }]],
    ]);
  }

  it("locks and checks owner, farm, and subscription sequentially before activation", async () => {
    const transaction = makeTransaction(readyRows());
    useTransaction(transaction);

    const result = await changeCompanyLifecycle({
      publicId: company.publicId,
      status: "active",
      expectedVersion: 3,
    }, actor);

    expect(transaction.readOrder).toEqual([companies, companyMemberships, farms, companySubscriptions, tenantRestoreJobs]);
    expect(transaction.lockModes).toEqual(["update", "update", "update", "update", "update"]);
    expect(transaction.getMaxConcurrentReads()).toBe(1);
    expect(transaction.writes.find(write => write.table === companies)?.value).toMatchObject({
      lifecycleStatus: "active",
      suspendedAt: null,
      suspendedReason: null,
    });
    expect(result).toEqual({ publicId: company.publicId, status: "active", version: 4 });
  });

  it.each(["owner", "farm", "subscription"] as const)("blocks activation without a ready %s", async missing => {
    const transaction = makeTransaction(readyRows(missing));
    useTransaction(transaction);

    await expect(changeCompanyLifecycle({
      publicId: company.publicId,
      status: "active",
      expectedVersion: 3,
    }, actor)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Activation requires an active owner, farm, and nonexpired subscription",
    });
    expect(transaction.writes.some(write => write.table === companies)).toBe(false);
  });
});
