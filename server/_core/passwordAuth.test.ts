import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticationTokens,
  companies,
  companyMemberships,
  passwordCredentials,
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
  recordOAuthIdentity: vi.fn(),
  setOpaqueSessionCookie: vi.fn(),
  setCsrfCookie: vi.fn(),
  isEmailConfigured: vi.fn(),
  sendTemplatedEmail: vi.fn(),
  getRequestOrigin: vi.fn(),
  getResolvedRequestHost: vi.fn(),
  getCompanySessionIdleTimeoutMs: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: mocks.getDb }));

vi.mock("./auth/runtime", () => ({
  getOAuthStateSecret: () => "test-oauth-state-secret",
  getRateLimitStore: () => ({}),
  getTenantSessionManager: () => ({ issue: mocks.issueSession }),
}));

// `isPasswordStrongEnough` stays real (it is the actual policy under test);
// the scrypt-backed helpers are stubbed so the suite does not spend seconds
// hashing, and so "did we burn time on an unknown email" is assertable.
vi.mock("./auth/password", async importOriginal => {
  const original = await importOriginal<typeof import("./auth/password")>();
  return {
    ...original,
    burnPasswordVerificationTime: mocks.burnPasswordVerificationTime,
    hashPassword: mocks.hashPassword,
    verifyPassword: mocks.verifyPassword,
  };
});

vi.mock("./auth/sqlStores", () => ({ recordOAuthIdentity: mocks.recordOAuthIdentity }));
vi.mock("./auth/cookies", () => ({ setOpaqueSessionCookie: mocks.setOpaqueSessionCookie }));
vi.mock("./security/csrf", () => ({ setCsrfCookie: mocks.setCsrfCookie }));

vi.mock("./security/rateLimit", () => ({
  createRateLimitMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getClientAddress: () => "203.0.113.10",
}));

vi.mock("./security/httpSecurity", () => ({
  getRequestOrigin: mocks.getRequestOrigin,
  getResolvedRequestHost: mocks.getResolvedRequestHost,
}));

vi.mock("../tenancy/companySettings", () => ({
  getCompanySessionIdleTimeoutMs: mocks.getCompanySessionIdleTimeoutMs,
}));

vi.mock("./email", () => ({
  isEmailConfigured: mocks.isEmailConfigured,
  getEmailConfigurationStatus: () => ({ configured: false }),
}));

vi.mock("./sendTemplatedEmail", () => ({ sendTemplatedEmail: mocks.sendTemplatedEmail }));

import { registerPasswordAuthRoutes } from "./passwordAuth";

const MAX_FAILED_LOGIN_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1_000;
const GENERIC_LOGIN_ERROR = "Invalid email or password";
const GENERIC_RESET_MESSAGE = "If that email has an account, a password reset link has been sent.";

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    email: "farmer@azal-farms.test",
    normalizedEmail: "farmer@azal-farms.test",
    status: "active",
    authVersion: 3,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastSignedIn: null,
    ...overrides,
  };
}

/**
 * `getResolvedRequestHost` defaults to `companySlug: "azal-farms"` for every
 * test in this file, so any test whose login is expected to succeed must
 * queue a matching row here — `hasActiveMembership` joins on `companyMemberships`
 * (the fake keys queued rows by the `.from()` table, ignoring the join).
 */
function queueActiveMembership(fakeDb: FakeDb, overrides: Record<string, unknown> = {}) {
  fakeDb.queue(companyMemberships, [{ id: 501, ...overrides }]);
}

let fake: FakeDb;
let http: FakeExpress;

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeDb();
  mocks.getDb.mockResolvedValue(fake.db);
  mocks.issueSession.mockResolvedValue({
    token: "session-token",
    absoluteExpiresAt: new Date(Date.now() + 3_600_000),
  });
  mocks.hashPassword.mockResolvedValue("hashed:new");
  mocks.verifyPassword.mockResolvedValue(true);
  mocks.isEmailConfigured.mockReturnValue(true);
  mocks.sendTemplatedEmail.mockResolvedValue(undefined);
  mocks.getRequestOrigin.mockReturnValue("https://azal-farms.l-fms.com");
  mocks.getResolvedRequestHost.mockReturnValue({ surface: "tenant", companySlug: "azal-farms" });
  mocks.getCompanySessionIdleTimeoutMs.mockResolvedValue(null);

  http = createFakeExpress();
  registerPasswordAuthRoutes(http.app);
});

describe("POST /api/auth/login", () => {
  const login = (body: Record<string, unknown>) => http.post("/api/auth/login", { body });

  it("rejects a missing email or password without touching the database", async () => {
    const response = await login({ email: "", password: "" });
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: GENERIC_LOGIN_ERROR });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("burns verification time on an unknown email so latency cannot enumerate accounts", async () => {
    fake.queue(users, []);
    const response = await login({ email: "nobody@azal-farms.test", password: "correct-horse-battery" });
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: GENERIC_LOGIN_ERROR });
    expect(mocks.burnPasswordVerificationTime).toHaveBeenCalledOnce();
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });

  it("refuses a locked account before verifying the password", async () => {
    fake.queue(users, [activeUser({ lockedUntil: new Date(Date.now() + 60_000) })]);
    const response = await login({ email: "farmer@azal-farms.test", password: "correct-horse-battery" });
    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ error: "Account temporarily locked. Try again later." });
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });

  it("treats a user with no password credential as a failed login", async () => {
    fake.queue(users, [activeUser()]);
    fake.queue(passwordCredentials, []);
    const response = await login({ email: "farmer@azal-farms.test", password: "correct-horse-battery" });
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: GENERIC_LOGIN_ERROR });
    expect(mocks.burnPasswordVerificationTime).toHaveBeenCalledOnce();
  });

  it("counts a wrong password without locking below the threshold", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    fake.queue(users, [activeUser({ failedLoginAttempts: 2 })]);
    fake.queue(passwordCredentials, [{ userId: 42, passwordHash: "hashed:old", passwordNeedsRehash: false }]);

    const response = await login({ email: "farmer@azal-farms.test", password: "wrong-password-here" });

    expect(response.statusCode).toBe(401);
    expect(fake.writesFor(users)).toEqual([
      { kind: "update", table: users, value: { failedLoginAttempts: 3, lockedUntil: null } },
    ]);
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });

  it("locks the account on the tenth consecutive failure", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    fake.queue(users, [activeUser({ failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS - 1 })]);
    fake.queue(passwordCredentials, [{ userId: 42, passwordHash: "hashed:old", passwordNeedsRehash: false }]);

    const before = Date.now();
    await login({ email: "farmer@azal-farms.test", password: "wrong-password-here" });

    const [write] = fake.writesFor(users);
    const value = write.value as { failedLoginAttempts: number; lockedUntil: Date | null };
    expect(value.failedLoginAttempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
    expect(value.lockedUntil).toBeInstanceOf(Date);
    expect(value.lockedUntil!.getTime()).toBeGreaterThanOrEqual(before + LOCKOUT_DURATION_MS);
  });

  it("issues a session and clears the failure counters on success", async () => {
    fake.queue(users, [activeUser({ failedLoginAttempts: 4, lockedUntil: new Date(Date.now() - 1_000) })]);
    fake.queue(passwordCredentials, [{ userId: 42, passwordHash: "hashed:old", passwordNeedsRehash: false }]);
    queueActiveMembership(fake);

    const response = await login({ email: "farmer@azal-farms.test", password: "correct-horse-battery" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(mocks.issueSession).toHaveBeenCalledOnce();
    expect(mocks.setOpaqueSessionCookie).toHaveBeenCalledOnce();
    expect(mocks.setCsrfCookie).toHaveBeenCalledOnce();

    const userWrites = fake.writesFor(users).map(write => write.value as Record<string, unknown>);
    expect(userWrites[0]).toEqual({ failedLoginAttempts: 0, lockedUntil: null });
    expect(userWrites[1]).toHaveProperty("lastSignedIn");
  });

  it("rehashes a legacy credential during a successful login", async () => {
    fake.queue(users, [activeUser()]);
    fake.queue(passwordCredentials, [{ userId: 42, passwordHash: "hashed:legacy", passwordNeedsRehash: true }]);
    queueActiveMembership(fake);

    await login({ email: "farmer@azal-farms.test", password: "correct-horse-battery" });

    const [write] = fake.writesFor(passwordCredentials);
    expect(write.kind).toBe("update");
    expect(write.value).toMatchObject({ passwordHash: "hashed:new", passwordNeedsRehash: false });
  });

  it("normalises the submitted email before lookup", async () => {
    fake.queue(users, [activeUser()]);
    fake.queue(passwordCredentials, [{ userId: 42, passwordHash: "hashed:old", passwordNeedsRehash: false }]);
    queueActiveMembership(fake);
    const response = await login({ email: "  FARMER@Azal-Farms.test  ", password: "correct-horse-battery" });
    expect(response.statusCode).toBe(200);
  });

  it("refuses a correct password on a subdomain the user has no membership in, without locking the account", async () => {
    // Also covers "the only membership is in a deleted company": the real
    // query excludes deleted companies at the SQL level (ne(lifecycleStatus,
    // "deleted")), which this fake — no WHERE evaluation, just queued rows —
    // models the same way as no membership at all: an empty result.
    //
    // The password is right — this is a wrong-tenant attempt, not a
    // credential-guessing one, so no failedLoginAttempts increment.
    fake.queue(users, [activeUser({ failedLoginAttempts: 2 })]);
    fake.queue(passwordCredentials, [{ userId: 42, passwordHash: "hashed:old", passwordNeedsRehash: false }]);
    fake.queue(companyMemberships, []);

    const response = await login({ email: "farmer@azal-farms.test", password: "correct-horse-battery" });

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: GENERIC_LOGIN_ERROR });
    expect(mocks.issueSession).not.toHaveBeenCalled();
    expect(fake.writesFor(users)).toHaveLength(0);
  });

  it("still logs in a member of a suspended company", async () => {
    // Suspension is surfaced post-login via the existing CompanySuspended
    // screen, not as a login failure — mirrors resolveTenantContext, which
    // treats only a deleted company as "not found", not a suspended one.
    fake.queue(users, [activeUser()]);
    fake.queue(passwordCredentials, [{ userId: 42, passwordHash: "hashed:old", passwordNeedsRehash: false }]);
    queueActiveMembership(fake);

    const response = await login({ email: "farmer@azal-farms.test", password: "correct-horse-battery" });

    expect(response.statusCode).toBe(200);
    expect(mocks.issueSession).toHaveBeenCalledOnce();
  });

  it("treats a request with no resolvable company slug as no membership", async () => {
    mocks.getResolvedRequestHost.mockReturnValue({ surface: "tenant", companySlug: null });
    fake.queue(users, [activeUser()]);
    fake.queue(passwordCredentials, [{ userId: 42, passwordHash: "hashed:old", passwordNeedsRehash: false }]);

    const response = await login({ email: "farmer@azal-farms.test", password: "correct-horse-battery" });

    expect(response.statusCode).toBe(401);
    expect(mocks.issueSession).not.toHaveBeenCalled();
    // A null slug is rejected before any membership query runs.
    expect(fake.writesFor(companyMemberships)).toHaveLength(0);
  });
});

describe("POST /api/auth/forgot-password", () => {
  const forgot = (body: Record<string, unknown>) => http.post("/api/auth/forgot-password", { body });

  it("returns the generic message and sends nothing for an unknown email", async () => {
    fake.queue(users, []);
    const response = await forgot({ email: "nobody@azal-farms.test" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ message: GENERIC_RESET_MESSAGE });
    expect(fake.writesFor(authenticationTokens)).toHaveLength(0);
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("returns the same generic message for a blank email", async () => {
    const response = await forgot({ email: "   " });
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ message: GENERIC_RESET_MESSAGE });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("issues a single-use token and emails an origin-scoped reset link", async () => {
    fake.queue(users, [activeUser()]);

    const response = await forgot({ email: "farmer@azal-farms.test" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ message: GENERIC_RESET_MESSAGE });

    const [tokenWrite] = fake.writesFor(authenticationTokens);
    expect(tokenWrite.kind).toBe("insert");
    expect(tokenWrite.value).toMatchObject({ userId: 42, purpose: "reset_password" });

    expect(mocks.sendTemplatedEmail).toHaveBeenCalledOnce();
    const sent = mocks.sendTemplatedEmail.mock.calls[0][0];
    expect(sent).toMatchObject({ template: "password_reset", to: "farmer@azal-farms.test" });
    expect(sent.html).toContain("https://azal-farms.l-fms.com/reset-password?token=");
  });

  it("skips the send but still issues a token when email is unconfigured", async () => {
    mocks.isEmailConfigured.mockReturnValue(false);
    fake.queue(users, [activeUser()]);

    const response = await forgot({ email: "farmer@azal-farms.test" });

    expect(response.statusCode).toBe(200);
    expect(fake.writesFor(authenticationTokens)).toHaveLength(1);
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("still returns the generic message when the lookup throws", async () => {
    mocks.getDb.mockRejectedValue(new Error("database offline"));
    const response = await forgot({ email: "farmer@azal-farms.test" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ message: GENERIC_RESET_MESSAGE });
  });
});

describe("POST /api/auth/reset-password", () => {
  const reset = (body: Record<string, unknown>) => http.post("/api/auth/reset-password", { body });
  const validToken = { id: 77, userId: 42 };

  it("rejects a missing token", async () => {
    const response = await reset({ token: "", password: "correct-horse-battery" });
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: "Invalid token or password does not meet requirements" });
  });

  it("rejects a password below the minimum length", async () => {
    const response = await reset({ token: "reset-token", password: "short" });
    expect(response.statusCode).toBe(400);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejects an unknown, expired, or already-used token", async () => {
    fake.queue(authenticationTokens, []);
    const response = await reset({ token: "reset-token", password: "correct-horse-battery" });
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: "Invalid or expired reset token" });
    expect(fake.writesFor(passwordCredentials)).toHaveLength(0);
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });

  it("rejects a token whose user is no longer active", async () => {
    fake.queue(authenticationTokens, [validToken]);
    fake.queue(users, []);
    const response = await reset({ token: "reset-token", password: "correct-horse-battery" });
    expect(response.statusCode).toBe(400);
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });

  it("burns the token, bumps authVersion, and confirms by email", async () => {
    fake.queue(authenticationTokens, [validToken]);
    fake.queue(users, [activeUser({ authVersion: 3, failedLoginAttempts: 5 })]);
    fake.queue(passwordCredentials, [{ userId: 42 }]);

    const response = await reset({ token: "reset-token", password: "correct-horse-battery" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(response.headers["cache-control"]).toBe("no-store");

    const [tokenWrite] = fake.writesFor(authenticationTokens);
    expect(tokenWrite.kind).toBe("update");
    expect(tokenWrite.value).toHaveProperty("usedAt");

    const [credentialWrite] = fake.writesFor(passwordCredentials);
    expect(credentialWrite.kind).toBe("update");
    expect(credentialWrite.value).toMatchObject({ passwordHash: "hashed:new", passwordNeedsRehash: false });

    // authVersion bump is what invalidates every live session for this user.
    const [userWrite] = fake.writesFor(users);
    expect(userWrite.value).toMatchObject({ authVersion: 4, failedLoginAttempts: 0, lockedUntil: null });

    expect(mocks.issueSession).toHaveBeenCalledOnce();
    expect(mocks.sendTemplatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ template: "password_changed", to: "farmer@azal-farms.test" }),
    );
  });

  it("inserts a credential row when the user never had one", async () => {
    fake.queue(authenticationTokens, [validToken]);
    fake.queue(users, [activeUser()]);
    fake.queue(passwordCredentials, []);

    const response = await reset({ token: "reset-token", password: "correct-horse-battery" });

    expect(response.statusCode).toBe(200);
    const [credentialWrite] = fake.writesFor(passwordCredentials);
    expect(credentialWrite.kind).toBe("insert");
    expect(credentialWrite.value).toMatchObject({ userId: 42, passwordHash: "hashed:new" });
  });
});
