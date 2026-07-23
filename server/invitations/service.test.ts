import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  authIdentities,
  companies,
  companyInvitations,
  companyMemberships,
  companySubscriptions,
  farms,
} from "../../drizzle/schema";

const mocks = vi.hoisted(() => ({
  appendPlatformAudit: vi.fn(),
  findCompanyByPublicId: vi.fn(),
  getEffectiveLimit: vi.fn(),
  lockCompanyQuota: vi.fn(),
  requirePlatformDb: vi.fn(),
}));

vi.mock("../platform/repositories/audit", () => ({
  appendPlatformAudit: mocks.appendPlatformAudit,
}));
vi.mock("../platform/repositories/companies", () => ({
  findCompanyByPublicId: mocks.findCompanyByPublicId,
}));
vi.mock("../platform/repositories/db", async importOriginal => {
  const original = await importOriginal<typeof import("../platform/repositories/db")>();
  return { ...original, requirePlatformDb: mocks.requirePlatformDb };
});
vi.mock("../entitlements/limits", async importOriginal => {
  const original = await importOriginal<typeof import("../entitlements/limits")>();
  return {
    ...original,
    getEffectiveLimit: mocks.getEffectiveLimit,
    lockCompanyQuota: mocks.lockCompanyQuota,
  };
});
vi.mock("../platform/idempotency", () => ({
  executeIdempotent: (_tx: unknown, _input: unknown, operation: () => Promise<unknown>) => operation(),
}));

import {
  acceptInvitation,
  createPlatformInvitation,
  hashInvitationToken,
  hashProviderSubject,
  revokePlatformInvitation,
} from "./service";

const actor = {
  platformAdminId: 7,
  userId: 8,
  permissions: new Set(["memberships.write"]),
  sessionId: 9,
  authenticationLevel: "mfa" as const,
  requestId: "invitation-service-test",
};

type QueueMap = Map<unknown, unknown[][]>;

function makeTransaction(queues: QueueMap = new Map(), updateAffectedRows = 1) {
  const writes: Array<{ kind: "insert" | "update"; table: unknown; value: unknown }> = [];
  const take = (table: unknown) => queues.get(table)?.shift() ?? [];
  const terminal = (table: unknown) => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.innerJoin = chain;
    builder.leftJoin = chain;
    builder.where = chain;
    builder.orderBy = chain;
    builder.limit = chain;
    builder.for = async () => take(table);
    builder.then = (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(take(table)).then(resolve, reject);
    return builder;
  };
  const tx = {
    select: () => ({ from: (table: unknown) => terminal(table) }),
    insert: (table: unknown) => ({
      values: async (value: unknown) => {
        writes.push({ kind: "insert", table, value });
        return [{ insertId: table === companyMemberships ? 901 : 801 }];
      },
    }),
    update: (table: unknown) => ({
      set: (value: unknown) => ({
        where: async () => {
          writes.push({ kind: "update", table, value });
          return [{ affectedRows: updateAffectedRows }];
        },
      }),
    }),
  };
  return { tx, writes };
}

function useTransaction(transaction: ReturnType<typeof makeTransaction>) {
  mocks.requirePlatformDb.mockResolvedValue({
    transaction: async (callback: (tx: unknown) => unknown) => callback(transaction.tx),
  });
}

describe("secure company invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appendPlatformAudit.mockResolvedValue(undefined);
    mocks.getEffectiveLimit.mockResolvedValue(100);
    mocks.lockCompanyQuota.mockResolvedValue(undefined);
    mocks.findCompanyByPublicId.mockResolvedValue({
      id: 101,
      publicId: "01J00000000000000000000001",
      slug: "example-company",
      lifecycleStatus: "active",
      deletedAt: null,
    });
  });

  it("stores only hashes and does not put the raw credential in audit data", async () => {
    const transaction = makeTransaction(new Map([
      [companyMemberships, [[{ count: 0 }]]],
      [companyInvitations, [[{ count: 0 }]]],
    ]));
    useTransaction(transaction);

    const result = await createPlatformInvitation({
      companyPublicId: "01J00000000000000000000001",
      email: "Invitee@Example.Test",
      role: "viewer",
      farmAccessMode: "all",
      farmPublicIds: [],
      expiresInHours: 24,
      idempotencyKey: "invitation-test-idempotency",
    }, actor);

    expect(result.invitationToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const inserted = transaction.writes.find(write => write.kind === "insert" && write.table === companyInvitations)?.value as Record<string, unknown>;
    expect(Buffer.isBuffer(inserted.tokenHash)).toBe(true);
    expect(inserted.tokenHash).toEqual(hashInvitationToken(result.invitationToken!));
    expect(inserted.providerSubjectHash).toEqual(hashProviderSubject("password", "email:invitee@example.test"));
    expect(JSON.stringify(inserted)).not.toContain(result.invitationToken!);
    expect(JSON.stringify(mocks.appendPlatformAudit.mock.calls)).not.toContain(result.invitationToken!);
  });

  it("binds acceptance to the authenticated verified email and atomically activates membership", async () => {
    const token = "A".repeat(43);
    const invitation = {
      id: 501,
      publicId: "01J00000000000000000000002",
      companyId: 101,
      normalizedEmail: "invitee@example.test",
      role: "staff" as const,
      farmAccessMode: "restricted" as const,
      farmPublicIds: ["01J00000000000000000000003"],
      provider: "manus",
      providerSubjectHash: hashProviderSubject("manus", "email:invitee@example.test"),
      status: "pending" as const,
      expiresAt: new Date(Date.now() + 60_000),
      version: 4,
    };
    const transaction = makeTransaction(new Map([
      [companyInvitations, [[{ invitation, companySlug: "example-company", companyStatus: "active" }]]],
      [authIdentities, [[{
        providerSubject: "manus-subject-1",
        providerEmail: "invitee@example.test",
        providerEmailVerified: true,
        userStatus: "active",
        normalizedEmail: "invitee@example.test",
        openId: "manus-subject-1",
      }]]],
      [companyMemberships, [[{ count: 0 }], []]],
      [farms, [[{ id: 301, publicId: "01J00000000000000000000003" }]]],
    ]));
    useTransaction(transaction);

    const result = await acceptInvitation({ token, companySlug: "example-company" }, {
      userId: 44,
      requestId: "accept-request",
      ipAddress: "127.0.0.1",
      userAgent: "test",
    });

    expect(result).toMatchObject({ kind: "accepted", companySlug: "example-company" });
    expect(transaction.writes.find(write => write.kind === "insert" && write.table === companyMemberships)?.value).toMatchObject({
      companyId: 101,
      userId: 44,
      role: "staff",
      status: "active",
      farmAccessMode: "restricted",
    });
    expect(transaction.writes.find(write => write.kind === "update" && write.table === companyInvitations)?.value).toMatchObject({
      status: "accepted",
      acceptedByUserId: 44,
    });
    expect(transaction.writes.some(write => write.kind === "insert" && write.table === auditLog)).toBe(true);
  });

  it("activates a provisioning company only after its owner accepts with an active farm and subscription", async () => {
    const invitation = {
      id: 502,
      publicId: "01J00000000000000000000004",
      companyId: 101,
      normalizedEmail: "owner@example.test",
      role: "owner" as const,
      farmAccessMode: "all" as const,
      farmPublicIds: [],
      provider: "manus",
      providerSubjectHash: hashProviderSubject("manus", "email:owner@example.test"),
      status: "pending" as const,
      expiresAt: new Date(Date.now() + 60_000),
      version: 1,
    };
    const transaction = makeTransaction(new Map([
      [companyInvitations, [[{ invitation, companySlug: "example-company", companyStatus: "provisioning" }]]],
      [authIdentities, [[{
        providerEmail: "owner@example.test",
        providerEmailVerified: true,
        userStatus: "active",
        normalizedEmail: "owner@example.test",
      }]]],
      [companyMemberships, [[{ count: 0 }], []]],
      [farms, [[{ id: 301 }]]],
      [companySubscriptions, [[{ id: 401 }]]],
    ]));
    useTransaction(transaction);

    await expect(acceptInvitation({ token: "E".repeat(43), companySlug: "example-company" }, {
      userId: 56,
      requestId: "owner-activation-request",
    })).resolves.toMatchObject({ kind: "accepted" });

    expect(transaction.writes.find(write => write.kind === "update" && write.table === companies)?.value).toMatchObject({
      lifecycleStatus: "active",
    });
    expect(transaction.writes.filter(write => write.kind === "insert" && write.table === auditLog)).toHaveLength(2);
  });

  it("denies a signed-in identity with a different verified email without creating membership", async () => {
    const invitation = {
      id: 501,
      publicId: "01J00000000000000000000002",
      companyId: 101,
      normalizedEmail: "invitee@example.test",
      role: "viewer" as const,
      farmAccessMode: "all" as const,
      farmPublicIds: [],
      provider: "manus",
      providerSubjectHash: hashProviderSubject("manus", "email:invitee@example.test"),
      status: "pending" as const,
      expiresAt: new Date(Date.now() + 60_000),
      version: 1,
    };
    const transaction = makeTransaction(new Map([
      [companyInvitations, [[{ invitation, companySlug: "example-company", companyStatus: "active" }]]],
      [authIdentities, [[{
        providerSubject: "attacker-subject",
        providerEmail: "attacker@example.test",
        providerEmailVerified: true,
        userStatus: "active",
        normalizedEmail: "attacker@example.test",
        openId: "attacker-subject",
      }]]],
    ]));
    useTransaction(transaction);

    await expect(acceptInvitation({ token: "B".repeat(43), companySlug: "example-company" }, {
      userId: 55,
      requestId: "denied-request",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(transaction.writes.some(write => write.kind === "insert" && write.table === companyMemberships)).toBe(false);
    expect(transaction.writes.find(write => write.kind === "insert" && write.table === auditLog)?.value).toMatchObject({ outcome: "denied" });
  });

  it("denies an unverified provider email even when it otherwise matches", async () => {
    const invitation = {
      id: 501,
      publicId: "01J00000000000000000000002",
      companyId: 101,
      normalizedEmail: "invitee@example.test",
      role: "viewer" as const,
      farmAccessMode: "all" as const,
      farmPublicIds: [],
      provider: "manus",
      providerSubjectHash: hashProviderSubject("manus", "email:invitee@example.test"),
      status: "pending" as const,
      expiresAt: new Date(Date.now() + 60_000),
      version: 1,
    };
    const transaction = makeTransaction(new Map([
      [companyInvitations, [[{ invitation, companySlug: "example-company", companyStatus: "active" }]]],
      [authIdentities, [[{
        providerSubject: "manus-subject-1",
        providerEmail: "invitee@example.test",
        providerEmailVerified: false,
        userStatus: "active",
        normalizedEmail: "invitee@example.test",
        openId: "manus-subject-1",
      }]]],
    ]));
    useTransaction(transaction);

    await expect(acceptInvitation({ token: "D".repeat(43), companySlug: "example-company" }, {
      userId: 55,
      requestId: "unverified-request",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(transaction.writes.some(write => write.kind === "insert" && write.table === companyMemberships)).toBe(false);
  });

  it("rejects replay after the invitation is no longer pending", async () => {
    const transaction = makeTransaction(new Map([
      [companyInvitations, [[{
        invitation: { status: "accepted", companyId: 101, publicId: "01J00000000000000000000002" },
        companySlug: "example-company",
        companyStatus: "active",
      }]]],
    ]));
    useTransaction(transaction);

    await expect(acceptInvitation({ token: "C".repeat(43), companySlug: "example-company" }, {
      userId: 55,
      requestId: "replay-request",
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(transaction.writes.find(write => write.kind === "insert" && write.table === auditLog)?.value).toMatchObject({ outcome: "denied" });
    expect(transaction.writes.some(write => write.kind === "insert" && write.table === companyMemberships)).toBe(false);
  });

  it("uses version CAS when revoking a pending invitation", async () => {
    const transaction = makeTransaction(new Map([
      [companyInvitations, [[{
        id: 501,
        publicId: "01J00000000000000000000002",
        companyId: 101,
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
        version: 3,
      }]]],
    ]), 0);
    useTransaction(transaction);

    await expect(revokePlatformInvitation({
      publicId: "01J00000000000000000000002",
      expectedVersion: 2,
    }, actor)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.appendPlatformAudit).not.toHaveBeenCalled();
  });
});
