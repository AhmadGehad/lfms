import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  authIdentities,
  companies,
  companyInvitations,
  companyMemberships,
  companySubscriptions,
  farms,
  passwordCredentials,
  users,
} from "../../drizzle/schema";
import { createFakeDb, type RowQueues } from "../testing/fakeDb";

const mocks = vi.hoisted(() => ({
  appendPlatformAudit: vi.fn(),
  findCompanyByPublicId: vi.fn(),
  getEffectiveLimit: vi.fn(),
  lockCompanyQuota: vi.fn(),
  requirePlatformDb: vi.fn(),
  isEmailConfigured: vi.fn(),
  sendTemplatedEmail: vi.fn(),
  hashPassword: vi.fn(),
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
vi.mock("../_core/email", () => ({ isEmailConfigured: mocks.isEmailConfigured }));
vi.mock("../_core/sendTemplatedEmail", () => ({ sendTemplatedEmail: mocks.sendTemplatedEmail }));
// `isPasswordStrongEnough` stays real (it is the policy under test); scrypt is
// stubbed so activation tests do not pay for a real hash.
vi.mock("../_core/auth/password", async importOriginal => {
  const original = await importOriginal<typeof import("../_core/auth/password")>();
  return { ...original, hashPassword: mocks.hashPassword };
});

import {
  acceptInvitation,
  activateInvitationWithPassword,
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

type QueueMap = RowQueues;

function makeTransaction(queues: QueueMap = new Map(), updateAffectedRows = 1) {
  const fake = createFakeDb({
    rows: queues,
    updateAffectedRows,
    insertIds: new Map([[companyMemberships, 901]]),
    defaultInsertId: 801,
  });
  return { tx: fake.db, writes: fake.writes };
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
    mocks.isEmailConfigured.mockReturnValue(false);
    mocks.sendTemplatedEmail.mockResolvedValue(undefined);
    mocks.hashPassword.mockResolvedValue("hashed:new");
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

describe("activating an invitation with a password", () => {
  const token = "D".repeat(43);
  const activationActor = { requestId: "activate-request", ipAddress: "127.0.0.1", userAgent: "test" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appendPlatformAudit.mockResolvedValue(undefined);
    mocks.getEffectiveLimit.mockResolvedValue(100);
    mocks.lockCompanyQuota.mockResolvedValue(undefined);
    mocks.isEmailConfigured.mockReturnValue(true);
    mocks.sendTemplatedEmail.mockResolvedValue(undefined);
    mocks.hashPassword.mockResolvedValue("hashed:new");
  });

  const pendingInvitation = (overrides: Record<string, unknown> = {}) => ({
    id: 503,
    publicId: "01J00000000000000000000005",
    companyId: 101,
    normalizedEmail: "owner@example.test",
    role: "owner" as const,
    farmAccessMode: "all" as const,
    farmPublicIds: [],
    // Owner invitations are issued for the password provider; a "manus" value
    // here is what made every owner invitation unactivatable before the fix.
    provider: "password",
    providerSubjectHash: hashProviderSubject("password", "email:owner@example.test"),
    status: "pending" as const,
    expiresAt: new Date(Date.now() + 60_000),
    version: 1,
    ...overrides,
  });

  /** Queues both the activation transaction and the acceptInvitation follow-up. */
  function activationQueues(invitation: ReturnType<typeof pendingInvitation>, existingUser: unknown[] = []) {
    const newUser = {
      id: 801,
      normalizedEmail: invitation.normalizedEmail,
      status: "active",
      openId: "password:abc",
    };
    return new Map<unknown, unknown[][]>([
      [companyInvitations, [
        // 1. activation lookup
        [{ invitation, companyName: "Example Company" }],
        // 2. acceptInvitation lookup
        [{
          invitation,
          providerSubjectHashHex: (invitation.providerSubjectHash as Buffer).toString("hex"),
          companyPublicId: "01J00000000000000000000001",
          companySlug: "example-company",
          companyStatus: "provisioning",
        }],
      ]],
      [users, [existingUser, [newUser]]],
      [passwordCredentials, [[]]],
      [authIdentities, [[{
        providerSubject: invitation.normalizedEmail,
        providerEmail: invitation.normalizedEmail,
        providerEmailVerified: true,
        userStatus: "active",
        normalizedEmail: invitation.normalizedEmail,
        openId: "password:abc",
      }]]],
      [companyMemberships, [[{ count: 0 }], []]],
      [farms, [[{ id: 301 }]]],
      [companySubscriptions, [[{ id: 401 }]]],
    ]);
  }

  it("creates the account with the password provider and sends the welcome email", async () => {
    const transaction = makeTransaction(activationQueues(pendingInvitation()));
    useTransaction(transaction);

    const result = await activateInvitationWithPassword({
      token,
      companySlug: "example-company",
      password: "correct-horse-battery",
    }, activationActor);

    expect(result).toMatchObject({ kind: "accepted" });

    // The provider on the identity must match the invitation's provider, or
    // acceptInvitation's identity lookup can never find it.
    const identity = transaction.writes.find(
      write => write.kind === "insert" && write.table === authIdentities,
    )?.value as Record<string, unknown>;
    expect(identity).toMatchObject({ provider: "password", providerEmailVerified: true });

    const credential = transaction.writes.find(
      write => write.kind === "insert" && write.table === passwordCredentials,
    )?.value as Record<string, unknown>;
    expect(credential).toMatchObject({ userId: 801, passwordHash: "hashed:new" });

    expect(transaction.writes.some(write => write.kind === "insert" && write.table === companyMemberships)).toBe(true);
    expect(mocks.sendTemplatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ template: "welcome", to: "owner@example.test" }),
    );
  });

  it("rejects a weak password before touching the database", async () => {
    const transaction = makeTransaction(activationQueues(pendingInvitation()));
    useTransaction(transaction);

    await expect(activateInvitationWithPassword({
      token,
      companySlug: "example-company",
      password: "short",
    }, activationActor)).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(transaction.writes).toHaveLength(0);
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("rejects an invitation that is no longer pending", async () => {
    const transaction = makeTransaction(activationQueues(pendingInvitation({ status: "accepted" })));
    useTransaction(transaction);

    await expect(activateInvitationWithPassword({
      token,
      companySlug: "example-company",
      password: "correct-horse-battery",
    }, activationActor)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(transaction.writes.some(write => write.table === passwordCredentials)).toBe(false);
    expect(transaction.writes.some(write => write.table === authIdentities)).toBe(false);
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("rejects an expired invitation", async () => {
    const transaction = makeTransaction(
      activationQueues(pendingInvitation({ expiresAt: new Date(Date.now() - 60_000) })),
    );
    useTransaction(transaction);

    await expect(activateInvitationWithPassword({
      token,
      companySlug: "example-company",
      password: "correct-horse-battery",
    }, activationActor)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(transaction.writes.some(write => write.table === passwordCredentials)).toBe(false);
  });

  it("refuses to overwrite a password on an account that already has one", async () => {
    const queues = activationQueues(pendingInvitation(), [{
      id: 44,
      normalizedEmail: "owner@example.test",
      status: "active",
    }]);
    queues.set(passwordCredentials, [[{ userId: 44 }]]);
    const transaction = makeTransaction(queues);
    useTransaction(transaction);

    await expect(activateInvitationWithPassword({
      token,
      companySlug: "example-company",
      password: "correct-horse-battery",
    }, activationActor)).rejects.toMatchObject({ code: "CONFLICT" });

    expect(transaction.writes.some(write => write.kind === "insert" && write.table === passwordCredentials)).toBe(false);
  });

  it("does not send a welcome email when email is unconfigured", async () => {
    mocks.isEmailConfigured.mockReturnValue(false);
    const transaction = makeTransaction(activationQueues(pendingInvitation()));
    useTransaction(transaction);

    const result = await activateInvitationWithPassword({
      token,
      companySlug: "example-company",
      password: "correct-horse-battery",
    }, activationActor);

    expect(result).toMatchObject({ kind: "accepted" });
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
  });
});
