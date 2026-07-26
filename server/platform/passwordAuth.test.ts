import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticationTokens,
  passwordCredentials,
  platformAdministrators,
  securityEvents,
  users,
} from "../../drizzle/schema";
import { createFakeDb, type FakeDb } from "../testing/fakeDb";
import { createFakeExpress, type FakeExpress } from "../testing/fakeExpress";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  burnPasswordVerificationTime: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  issueSession: vi.fn(),
  setOpaqueSessionCookie: vi.fn(),
  setCsrfCookie: vi.fn(),
  isEmailConfigured: vi.fn(),
  sendTemplatedEmail: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: mocks.getDb }));

vi.mock("../_core/auth/runtime", () => ({
  getOAuthStateSecret: () => "test-oauth-state-secret",
  getRateLimitStore: () => ({}),
  getPlatformSessionManager: () => ({ issue: mocks.issueSession }),
}));

vi.mock("../_core/auth/password", async importOriginal => {
  const original = await importOriginal<typeof import("../_core/auth/password")>();
  return {
    ...original,
    burnPasswordVerificationTime: mocks.burnPasswordVerificationTime,
    hashPassword: mocks.hashPassword,
    verifyPassword: mocks.verifyPassword,
  };
});

vi.mock("../_core/auth/cookies", () => ({ setOpaqueSessionCookie: mocks.setOpaqueSessionCookie }));
vi.mock("../_core/security/csrf", () => ({ setCsrfCookie: mocks.setCsrfCookie }));

vi.mock("../_core/security/rateLimit", () => ({
  createRateLimitMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getClientAddress: () => "203.0.113.10",
}));

vi.mock("../_core/security/httpSecurity", () => ({ getRequestId: () => "test-request-id" }));

vi.mock("../_core/email", () => ({ isEmailConfigured: mocks.isEmailConfigured }));
vi.mock("../_core/sendTemplatedEmail", () => ({ sendTemplatedEmail: mocks.sendTemplatedEmail }));

import { registerPlatformPasswordAuthRoutes } from "./passwordAuth";

const GENERIC_LOGIN_ERROR = "Invalid email or password";
const GENERIC_RESET_MESSAGE =
  "If that email has a platform administrator account, a password reset link has been sent.";

function administratorRow(overrides: Record<string, unknown> = {}) {
  return {
    administratorId: 5,
    administratorStatus: "active",
    authVersion: 2,
    mfaRequired: false,
    userId: 42,
    userStatus: "active",
    userFailedAttempts: 0,
    userLockedUntil: null,
    passwordHash: "hashed:old",
    passwordNeedsRehash: false,
    ...overrides,
  };
}

/** Reasons recorded into `securityEvents` by `auditLogin`. */
function auditReasons(fake: FakeDb) {
  return fake
    .writesFor(securityEvents)
    .map(write => (write.value as { metadata: { reason: string } }).metadata.reason);
}

let fake: FakeDb;
let http: FakeExpress;

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeDb();
  mocks.getDb.mockResolvedValue(fake.db);
  mocks.issueSession.mockResolvedValue({
    token: "platform-session-token",
    absoluteExpiresAt: new Date(Date.now() + 3_600_000),
  });
  mocks.hashPassword.mockResolvedValue("hashed:new");
  mocks.verifyPassword.mockResolvedValue(true);
  mocks.isEmailConfigured.mockReturnValue(true);
  mocks.sendTemplatedEmail.mockResolvedValue(undefined);

  http = createFakeExpress();
  registerPlatformPasswordAuthRoutes(http.app);
});

describe("POST /api/platform/auth/login", () => {
  const login = (body: Record<string, unknown>) => http.post("/api/platform/auth/login", { body });

  it("issues a platform session for an active, non-MFA administrator", async () => {
    fake.queue(users, [administratorRow()]);

    const response = await login({ email: "admin@l-fms.com", password: "correct-horse-battery" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(mocks.issueSession).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: 5, authVersion: 2, authLevel: "primary", mfaVerifiedAt: null }),
    );
    expect(mocks.setOpaqueSessionCookie).toHaveBeenCalledOnce();
    expect(auditReasons(fake)).toEqual(["password"]);
  });

  it("burns verification time and audits an unknown administrator email", async () => {
    fake.queue(users, []);

    const response = await login({ email: "nobody@l-fms.com", password: "correct-horse-battery" });

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: GENERIC_LOGIN_ERROR });
    expect(mocks.burnPasswordVerificationTime).toHaveBeenCalledOnce();
    expect(auditReasons(fake)).toEqual(["administrator_not_found"]);
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });

  it("counts a wrong password and audits it without issuing a session", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    fake.queue(users, [administratorRow({ userFailedAttempts: 1 })]);

    const response = await login({ email: "admin@l-fms.com", password: "wrong-password-here" });

    expect(response.statusCode).toBe(401);
    expect(fake.writesFor(users)).toEqual([
      { kind: "update", table: users, value: { failedLoginAttempts: 2, lockedUntil: null } },
    ]);
    expect(auditReasons(fake)).toEqual(["invalid_password"]);
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });

  it("refuses a locked account before verifying the password", async () => {
    fake.queue(users, [administratorRow({ userLockedUntil: new Date(Date.now() + 60_000) })]);

    const response = await login({ email: "admin@l-fms.com", password: "correct-horse-battery" });

    expect(response.statusCode).toBe(403);
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(auditReasons(fake)).toEqual(["account_locked"]);
  });

  it("denies a suspended administrator even with the correct password", async () => {
    fake.queue(users, [administratorRow({ administratorStatus: "suspended" })]);

    const response = await login({ email: "admin@l-fms.com", password: "correct-horse-battery" });

    expect(response.statusCode).toBe(403);
    expect(auditReasons(fake)).toEqual(["administrator_not_authorized"]);
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });

  it("refuses password login for an administrator that requires workforce MFA", async () => {
    fake.queue(users, [administratorRow({ mfaRequired: true })]);

    const response = await login({ email: "admin@l-fms.com", password: "correct-horse-battery" });

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({
      error: "This administrator requires the workforce MFA login provider",
    });
    expect(auditReasons(fake)).toEqual(["workforce_mfa_required"]);
    // Critical: no session at any auth level — MFA is not downgradeable here.
    expect(mocks.issueSession).not.toHaveBeenCalled();
    expect(mocks.setOpaqueSessionCookie).not.toHaveBeenCalled();
  });

  it("rejects missing credentials before any lookup", async () => {
    const response = await login({ email: "", password: "" });
    expect(response.statusCode).toBe(400);
    expect(auditReasons(fake)).toEqual(["missing_credentials"]);
  });
});

describe("POST /api/platform/auth/forgot-password", () => {
  const forgot = (body: Record<string, unknown>) =>
    http.post("/api/platform/auth/forgot-password", { body });

  it("emails an admin-subdomain reset link to an active administrator", async () => {
    fake.queue(users, [administratorRow()]);

    const response = await forgot({ email: "admin@l-fms.com" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ message: GENERIC_RESET_MESSAGE });
    expect(fake.writesFor(authenticationTokens)).toHaveLength(1);

    const sent = mocks.sendTemplatedEmail.mock.calls[0][0];
    expect(sent).toMatchObject({ template: "platform_password_reset", to: "admin@l-fms.com" });
    expect(sent.html).toContain("https://admin.");
    expect(sent.html).toContain("/reset-password?token=");
  });

  it("issues nothing for an unknown email but returns the same message", async () => {
    fake.queue(users, []);

    const response = await forgot({ email: "nobody@l-fms.com" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ message: GENERIC_RESET_MESSAGE });
    expect(fake.writesFor(authenticationTokens)).toHaveLength(0);
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("issues nothing for a suspended administrator", async () => {
    fake.queue(users, [administratorRow({ administratorStatus: "suspended" })]);

    const response = await forgot({ email: "admin@l-fms.com" });

    expect(response.statusCode).toBe(200);
    expect(fake.writesFor(authenticationTokens)).toHaveLength(0);
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("still returns the generic message when the lookup throws", async () => {
    mocks.getDb.mockRejectedValue(new Error("database offline"));
    const response = await forgot({ email: "admin@l-fms.com" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ message: GENERIC_RESET_MESSAGE });
  });
});

describe("POST /api/platform/auth/reset-password", () => {
  const reset = (body: Record<string, unknown>) =>
    http.post("/api/platform/auth/reset-password", { body });
  const validToken = { id: 77, userId: 42 };
  const resetAdministrator = {
    administratorId: 5,
    administratorStatus: "active",
    authVersion: 2,
    userStatus: "active",
    userEmail: "admin@l-fms.com",
  };

  it("rejects a weak password before any database work", async () => {
    const response = await reset({ token: "reset-token", password: "short" });
    expect(response.statusCode).toBe(400);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejects an unknown, expired, or already-used token", async () => {
    fake.queue(authenticationTokens, []);

    const response = await reset({ token: "reset-token", password: "correct-horse-battery" });

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: "Invalid or expired reset token" });
    expect(auditReasons(fake)).toEqual(["invalid_or_expired_reset_token"]);
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });

  it("rejects a valid token belonging to a suspended administrator", async () => {
    fake.queue(authenticationTokens, [validToken]);
    fake.queue(users, [{ ...resetAdministrator, administratorStatus: "suspended" }]);

    const response = await reset({ token: "reset-token", password: "correct-horse-battery" });

    expect(response.statusCode).toBe(400);
    expect(fake.writesFor(passwordCredentials)).toHaveLength(0);
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });

  it("burns the token, bumps the administrator authVersion, and confirms by email", async () => {
    fake.queue(authenticationTokens, [validToken]);
    fake.queue(users, [resetAdministrator]);
    fake.queue(passwordCredentials, [{ userId: 42 }]);

    const response = await reset({ token: "reset-token", password: "correct-horse-battery" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ success: true });

    const [tokenWrite] = fake.writesFor(authenticationTokens);
    expect(tokenWrite.kind).toBe("update");
    expect(tokenWrite.value).toHaveProperty("usedAt");

    const [credentialWrite] = fake.writesFor(passwordCredentials);
    expect(credentialWrite.value).toMatchObject({ passwordHash: "hashed:new", passwordNeedsRehash: false });

    // authVersion lives on platformAdministrators here, not users.
    expect(fake.writesFor(platformAdministrators)).toEqual([
      { kind: "update", table: platformAdministrators, value: { authVersion: 3 } },
    ]);
    expect(fake.writesFor(users)[0].value).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null });

    expect(mocks.issueSession).toHaveBeenCalledWith(expect.objectContaining({ authVersion: 3 }));
    expect(mocks.sendTemplatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ template: "platform_password_changed", to: "admin@l-fms.com" }),
    );
  });

  it("inserts a credential row when the administrator never had one", async () => {
    fake.queue(authenticationTokens, [validToken]);
    fake.queue(users, [resetAdministrator]);
    fake.queue(passwordCredentials, []);

    const response = await reset({ token: "reset-token", password: "correct-horse-battery" });

    expect(response.statusCode).toBe(200);
    const [credentialWrite] = fake.writesFor(passwordCredentials);
    expect(credentialWrite.kind).toBe("insert");
    expect(credentialWrite.value).toMatchObject({ userId: 42, passwordHash: "hashed:new" });
  });
});
