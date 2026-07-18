import { describe, expect, it, vi } from "vitest";
import {
  MemoryOAuthStateStore,
  OAuthStateManager,
} from "./_core/auth/oauthState";
import {
  MemoryOpaqueSessionStore,
  OpaqueSessionManager,
} from "./_core/auth/opaqueSessions";
import { createCsrfToken, verifyCsrfToken } from "./_core/security/csrf";
import {
  buildContentSecurityPolicy,
  getRequestOrigin,
  isAllowedRequestOrigin,
  hostValidationMiddleware,
  parseAllowedOrigins,
  resolveRequestHost,
} from "./_core/security/httpSecurity";
import { MemoryRateLimitStore } from "./_core/security/rateLimit";
import type { Request } from "express";
import { validateExternalServiceUrl, validateProductionDatabaseUrl } from "./_core/auth/runtime";

const SECRET = "test-secret-that-is-at-least-32-characters-long";

describe("opaque sessions", () => {
  it("issues audience-bound opaque tokens and revokes them", async () => {
    const store = new MemoryOpaqueSessionStore();
    store.setAuthVersion(42, 3);
    const tenant = new OpaqueSessionManager({
      audience: "tenant",
      pepper: SECRET,
      store,
    });
    const platform = new OpaqueSessionManager({
      audience: "platform",
      pepper: SECRET,
      store,
    });

    const issued = await tenant.issue({
      subjectId: 42,
      authVersion: 3,
      authLevel: "mfa",
      authenticationMethods: ["manus", "totp"],
    });

    expect(issued.token).toMatch(/^lfms_t_[A-Za-z0-9_-]{43}$/);
    await expect(tenant.authenticate(issued.token)).resolves.toMatchObject({
      audience: "tenant",
      subjectId: 42,
      authLevel: "mfa",
    });
    await expect(platform.authenticate(issued.token)).resolves.toBeNull();
    await expect(tenant.revoke(issued.token)).resolves.toBe(true);
    await expect(tenant.authenticate(issued.token)).resolves.toBeNull();
  });

  it("rejects idle, absolute, and auth-version expired sessions", async () => {
    let clock = new Date("2026-01-01T00:00:00.000Z");
    const store = new MemoryOpaqueSessionStore();
    store.setAuthVersion(7, 1);
    const manager = new OpaqueSessionManager({
      audience: "tenant",
      pepper: SECRET,
      store,
      idleTimeoutMs: 1_000,
      absoluteTimeoutMs: 10_000,
      now: () => clock,
    });

    const idle = await manager.issue({ subjectId: 7, authVersion: 1 });
    clock = new Date(clock.getTime() + 1_001);
    await expect(manager.authenticate(idle.token)).resolves.toBeNull();

    clock = new Date("2026-01-01T01:00:00.000Z");
    const versioned = await manager.issue({ subjectId: 7, authVersion: 1 });
    store.setAuthVersion(7, 2);
    await expect(manager.authenticate(versioned.token)).resolves.toBeNull();
  });

  it("enforces a bounded number of active sessions", async () => {
    const store = new MemoryOpaqueSessionStore();
    store.setAuthVersion(5, 1);
    const manager = new OpaqueSessionManager({
      audience: "tenant",
      pepper: SECRET,
      store,
      maximumActiveSessions: 2,
    });

    const first = await manager.issue({ subjectId: 5, authVersion: 1 });
    await manager.issue({ subjectId: 5, authVersion: 1 });
    await manager.issue({ subjectId: 5, authVersion: 1 });
    await expect(manager.authenticate(first.token)).resolves.toBeNull();
  });
});

describe("OAuth state", () => {
  it("requires production OAuth endpoints to use an approved HTTPS host", () => {
    expect(() => validateExternalServiceUrl(
      "https://api.example.test/oauth",
      "OAUTH_SERVER_URL",
      ["api.example.test"],
      true,
    )).not.toThrow();
    expect(() => validateExternalServiceUrl(
      "http://api.example.test/oauth",
      "OAUTH_SERVER_URL",
      ["api.example.test"],
      true,
    )).toThrow(/HTTPS/);
    expect(() => validateExternalServiceUrl(
      "https://127.0.0.1/oauth",
      "OAUTH_SERVER_URL",
      ["api.example.test"],
      true,
    )).toThrow(/allowlisted/);
  });

  it("requires verified TLS in the production database URL", () => {
    expect(() => validateProductionDatabaseUrl(
      "mysql://db.example.test/lfms?ssl=true",
    )).not.toThrow();
    expect(() => validateProductionDatabaseUrl(
      "mysql://db.example.test/lfms",
    )).toThrow(/verified TLS/);
    expect(() => validateProductionDatabaseUrl(
      "mysql://db.example.test/lfms?ssl=%7B%22rejectUnauthorized%22%3Afalse%7D",
    )).toThrow(/verified TLS/);
  });
  it("allows one exact, browser-bound callback", async () => {
    const store = new MemoryOAuthStateStore();
    const manager = new OAuthStateManager({
      secret: SECRET,
      store,
      allowedRedirectUris: new Set(["https://tenant.example.test/api/oauth/callback"]),
    });
    const issued = await manager.issue({
      audience: "tenant",
      redirectUri: "https://tenant.example.test/api/oauth/callback",
      returnTo: "/animals",
    });

    await expect(
      manager.consume({
        audience: "tenant",
        state: issued.state,
        browserBinding: issued.browserBinding,
      }),
    ).resolves.toMatchObject({ returnTo: "/animals" });
    await expect(
      manager.consume({
        audience: "tenant",
        state: issued.state,
        browserBinding: issued.browserBinding,
      }),
    ).resolves.toBeNull();

    const mismatched = await manager.issue({
      audience: "tenant",
      redirectUri: "https://tenant.example.test/api/oauth/callback",
    });
    await expect(
      manager.consume({
        audience: "tenant",
        state: mismatched.state,
        browserBinding: "wrong",
      }),
    ).resolves.toBeNull();
  });

  it("rejects unallowlisted redirects and normalizes external return paths", async () => {
    const manager = new OAuthStateManager({
      secret: SECRET,
      store: new MemoryOAuthStateStore(),
      allowedRedirectUris: new Set(["https://tenant.example.test/api/oauth/callback"]),
    });
    await expect(
      manager.issue({
        audience: "tenant",
        redirectUri: "https://attacker.test/callback",
      }),
    ).rejects.toThrow("not allowlisted");

    const issued = await manager.issue({
      audience: "tenant",
      redirectUri: "https://tenant.example.test/api/oauth/callback",
      returnTo: "//attacker.test",
    });
    const consumed = await manager.consume({
      audience: "tenant",
      state: issued.state,
      browserBinding: issued.browserBinding,
    });
    expect(consumed?.returnTo).toBe("/");

    for (const returnTo of [
      "/\\evil.example",
      "/%2f%2fevil.example",
      "/api",
      "/API/trpc",
      "/%61pi/trpc",
      "/api/platform/auth/callback",
    ]) {
      const unsafe = await manager.issue({
        audience: "tenant",
        redirectUri: "https://tenant.example.test/api/oauth/callback",
        returnTo,
      });
      const unsafeConsumed = await manager.consume({
        audience: "tenant",
        state: unsafe.state,
        browserBinding: unsafe.browserBinding,
      });
      expect(unsafeConsumed?.returnTo).toBe("/");
    }
  });
});

describe("HTTP security", () => {
  it("keeps production script policy strict and allows only configured HTTPS analytics", () => {
    const policy = buildContentSecurityPolicy({
      isProduction: true,
      analyticsEndpoint: "https://analytics.example.test/umami",
      scriptOrigins: ["https://maps.example.test/sdk", "http://unsafe.example.test"],
      connectOrigins: ["https://api.example.test/v1"],
      imageOrigins: ["https://images.example.test/assets"],
    });
    expect(policy).toContain(
      "script-src 'self' https://analytics.example.test https://maps.example.test",
    );
    expect(policy).toContain(
      "connect-src 'self' https://analytics.example.test https://api.example.test",
    );
    expect(policy).toContain(
      "img-src 'self' data: blob: https://images.example.test",
    );
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(policy).not.toMatch(/connect-src[^;]*(?:^|\s)(?:https:|wss:)(?:\s|;|$)/);
    expect(policy).not.toMatch(/img-src[^;]*(?:^|\s)https:(?:\s|;|$)/);
    expect(policy).not.toContain("unsafe.example.test");
    expect(policy).toContain("upgrade-insecure-requests");

    const unsafeEndpointPolicy = buildContentSecurityPolicy({
      isProduction: true,
      analyticsEndpoint: "http://analytics.example.test/umami",
    });
    expect(unsafeEndpointPolicy).not.toContain("http://analytics.example.test");
  });

  it("allows only the script and socket capabilities required by the Vite dev client", () => {
    const policy = buildContentSecurityPolicy({
      isProduction: false,
      analyticsEndpoint: "https://analytics.example.test/umami",
    });
    expect(policy).toContain(
      "script-src 'self' 'unsafe-inline' https://analytics.example.test",
    );
    expect(policy).toContain("connect-src 'self' https: wss: ws:");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("resolves only valid tenant, auth, and platform hosts", () => {
    const options = { baseDomain: "example.test", allowLegacyBareDomain: false };
    expect(resolveRequestHost("azal-farms.example.test", options)).toMatchObject({
      surface: "tenant",
      companySlug: "azal-farms",
    });
    expect(resolveRequestHost("admin.example.test", options)?.surface).toBe("platform");
    expect(resolveRequestHost("auth.example.test", options)?.surface).toBe("auth");
    expect(resolveRequestHost("admin.attacker.test", options)).toBeNull();
    expect(resolveRequestHost("bad.slug.example.test", options)).toBeNull();
  });

  it("allows loopback IP hosts only for local legacy development", () => {
    const local = { baseDomain: "localhost", allowLegacyBareDomain: true };
    expect(resolveRequestHost("127.0.0.1", local)?.surface).toBe("tenant");
    expect(resolveRequestHost("[::1]", local)).toBeNull();
    expect(resolveRequestHost("127.0.0.1", {
      baseDomain: "localhost",
      allowLegacyBareDomain: false,
    })).toBeNull();
  });

  it("accepts loopback IP requests through the development host middleware", () => {
    const middleware = hostValidationMiddleware({
      baseDomain: "localhost",
      allowLegacyBareDomain: true,
      allowDevelopmentPorts: true,
    });
    for (const host of ["127.0.0.1:3000"]) {
      const locals: Record<string, unknown> = {};
      const next = vi.fn();
      middleware({
        protocol: "http",
        get(name: string) {
          return name.toLowerCase() === "host" ? host : undefined;
        },
      } as any, {
        locals,
        status: vi.fn(),
      } as any, next);
      expect(next).toHaveBeenCalledOnce();
      expect(locals.requestHost).toMatchObject({ surface: "tenant" });
    }
  });

  it("canonicalizes default ports when comparing request origins", () => {
    const request = {
      protocol: "https",
      get(name: string) {
        const headers: Record<string, string> = {
          host: "azal-farms.example.test:443",
          origin: "https://azal-farms.example.test",
        };
        return headers[name.toLowerCase()];
      },
    } as Request;
    expect(getRequestOrigin(request)).toBe("https://azal-farms.example.test");
    expect(isAllowedRequestOrigin(request, new Set())).toBe(true);
  });

  it("requires an exact same-origin or allowlisted origin", () => {
    const allowed = parseAllowedOrigins(["https://admin.example.test"]);
    const request = {
      protocol: "https",
      get(name: string) {
        const headers: Record<string, string> = {
          host: "azal-farms.example.test",
          origin: "https://azal-farms.example.test",
        };
        return headers[name.toLowerCase()];
      },
    } as Request;
    expect(isAllowedRequestOrigin(request, allowed)).toBe(true);
    request.get = name => name.toLowerCase() === "host"
      ? "azal-farms.example.test"
      : name.toLowerCase() === "origin"
        ? "https://attacker.test"
        : undefined;
    expect(isAllowedRequestOrigin(request, allowed)).toBe(false);
  });

  it("rejects a forwarded host that disagrees with the validated Host header", () => {
    const middleware = hostValidationMiddleware({
      baseDomain: "example.test",
      allowLegacyBareDomain: false,
      allowDevelopmentPorts: false,
    });
    const req = {
      protocol: "https",
      get(name: string) {
        const headers: Record<string, string> = {
          host: "alpha.example.test",
          "x-forwarded-host": "bravo.example.test",
        };
        return headers[name.toLowerCase()];
      },
    };
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const next = vi.fn();
    middleware(req as any, { status, locals: {} } as any, next);
    expect(status).toHaveBeenCalledWith(421);
    expect(next).not.toHaveBeenCalled();
  });

  it("binds CSRF tokens to audience and session", () => {
    const token = createCsrfToken("tenant", "session-a", SECRET);
    expect(verifyCsrfToken(token, "tenant", "session-a", SECRET)).toBe(true);
    expect(verifyCsrfToken(token, "tenant", "session-b", SECRET)).toBe(false);
    expect(verifyCsrfToken(token, "platform", "session-a", SECRET)).toBe(false);
    expect(verifyCsrfToken(`${token}x`, "tenant", "session-a", SECRET)).toBe(false);
  });

  it("increments independent rate-limit buckets atomically in memory", async () => {
    const store = new MemoryRateLimitStore();
    const bucket = new Date("2026-01-01T00:00:00.000Z");
    const expiry = new Date("2099-01-01T00:00:00.000Z");
    await expect(store.increment("a", bucket, expiry)).resolves.toBe(1);
    await expect(store.increment("a", bucket, expiry)).resolves.toBe(2);
    await expect(store.increment("b", bucket, expiry)).resolves.toBe(1);
  });
});
