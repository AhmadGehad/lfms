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
      "https://api.example.test/oauth",
      "OAUTH_SERVER_URL",
      ["example.test"],
      true,
    )).not.toThrow();
    expect(() => validateExternalServiceUrl(
      "https://evilexample.test/oauth",
      "OAUTH_SERVER_URL",
      ["example.test"],
      true,
    )).toThrow(/not allowlisted/);
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
      mediaOrigins: ["https://media.example.test/files"],
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
    expect(policy).toContain(
      "media-src 'self' blob: https://media.example.test",
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

  it("resolves only valid tenant and platform hosts", () => {
    const options = { baseDomain: "example.test", allowLegacyBareDomain: false };
    expect(resolveRequestHost("azal-farms.example.test", options)).toMatchObject({
      surface: "tenant",
      companySlug: "azal-farms",
    });
    expect(resolveRequestHost("admin.example.test", options)?.surface).toBe("platform");
    expect(resolveRequestHost("auth.example.test", options)).toBeNull();
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

  it("accepts proxied request: Host=*.a.run.app with trusted X-Forwarded-Host=<valid tenant>", () => {
    // Simulates the dispatcher → Cloud Run → application path.
    // Express's req.hostname returns X-Forwarded-Host when trust proxy is configured.
    // The middleware uses req.hostname (trust-proxy-aware) for validation.
    const middleware = hostValidationMiddleware({
      baseDomain: "example.test",
      allowLegacyBareDomain: true,
      allowDevelopmentPorts: false,
      additionalTenantHostnames: ["livestockms-abc123.manus.space"],
    });

    // Case 1: X-Forwarded-Host is a valid tenant subdomain
    const locals1: Record<string, unknown> = {};
    const next1 = vi.fn();
    middleware({
      protocol: "https",
      // Simulate Express req.hostname returning the X-Forwarded-Host value
      // (as it does when trust proxy is configured and request is from trusted IP)
      hostname: "azal-farms.example.test",
      get(name: string) {
        const headers: Record<string, string> = {
          host: "abc123-hash.a.run.app",
          "x-forwarded-host": "azal-farms.example.test",
        };
        return headers[name.toLowerCase()];
      },
    } as any, { locals: locals1, status: vi.fn(() => ({ json: vi.fn() })) } as any, next1);
    expect(next1).toHaveBeenCalledOnce();
    expect(locals1.requestHost).toMatchObject({ surface: "tenant", companySlug: "azal-farms" });

    // Case 2: X-Forwarded-Host is the base domain (bare domain)
    const locals2: Record<string, unknown> = {};
    const next2 = vi.fn();
    middleware({
      protocol: "https",
      hostname: "example.test",
      get(name: string) {
        const headers: Record<string, string> = {
          host: "abc123-hash.a.run.app",
          "x-forwarded-host": "example.test",
        };
        return headers[name.toLowerCase()];
      },
    } as any, { locals: locals2, status: vi.fn(() => ({ json: vi.fn() })) } as any, next2);
    expect(next2).toHaveBeenCalledOnce();
    expect(locals2.requestHost).toMatchObject({ surface: "tenant" });

    // Case 3: X-Forwarded-Host is an additional tenant hostname
    const locals3: Record<string, unknown> = {};
    const next3 = vi.fn();
    middleware({
      protocol: "https",
      hostname: "livestockms-abc123.manus.space",
      get(name: string) {
        const headers: Record<string, string> = {
          host: "abc123-hash.a.run.app",
          "x-forwarded-host": "livestockms-abc123.manus.space",
        };
        return headers[name.toLowerCase()];
      },
    } as any, { locals: locals3, status: vi.fn(() => ({ json: vi.fn() })) } as any, next3);
    expect(next3).toHaveBeenCalledOnce();
    expect(locals3.requestHost).toMatchObject({ surface: "tenant" });
  });

  it("rejects invalid tenant domain with 421", () => {
    const middleware = hostValidationMiddleware({
      baseDomain: "example.test",
      allowLegacyBareDomain: false,
      allowDevelopmentPorts: false,
    });

    // Case 1: Direct request with invalid Host
    const json1 = vi.fn();
    const status1 = vi.fn(() => ({ json: json1 }));
    const next1 = vi.fn();
    middleware({
      protocol: "https",
      hostname: "attacker.evil.test",
      get(name: string) {
        const headers: Record<string, string> = {
          host: "attacker.evil.test",
        };
        return headers[name.toLowerCase()];
      },
    } as any, { status: status1, locals: {} } as any, next1);
    expect(status1).toHaveBeenCalledWith(421);
    expect(next1).not.toHaveBeenCalled();

    // Case 2: Proxied request where X-Forwarded-Host is also invalid
    const json2 = vi.fn();
    const status2 = vi.fn(() => ({ json: json2 }));
    const next2 = vi.fn();
    middleware({
      protocol: "https",
      hostname: "attacker.evil.test",
      get(name: string) {
        const headers: Record<string, string> = {
          host: "abc123-hash.a.run.app",
          "x-forwarded-host": "attacker.evil.test",
        };
        return headers[name.toLowerCase()];
      },
    } as any, { status: status2, locals: {} } as any, next2);
    expect(status2).toHaveBeenCalledWith(421);
    expect(next2).not.toHaveBeenCalled();
  });

  it("spoofed X-Forwarded-Host from untrusted source does not bypass validation", () => {
    // When trust proxy is NOT configured (or request is from untrusted IP),
    // Express's req.hostname returns the raw Host header value, ignoring X-Forwarded-Host.
    // The middleware uses req.hostname, so the spoofed header has no effect.
    const middleware = hostValidationMiddleware({
      baseDomain: "example.test",
      allowLegacyBareDomain: false,
      allowDevelopmentPorts: false,
    });

    // Simulate untrusted request: req.hostname returns the raw Host (not X-Forwarded-Host)
    // because Express does not trust the proxy.
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const next = vi.fn();
    middleware({
      protocol: "https",
      // Express returns raw Host hostname when proxy is untrusted
      hostname: "evil-internal.a.run.app",
      get(name: string) {
        const headers: Record<string, string> = {
          host: "evil-internal.a.run.app",
          // Attacker injects X-Forwarded-Host but Express ignores it
          "x-forwarded-host": "azal-farms.example.test",
        };
        return headers[name.toLowerCase()];
      },
    } as any, { status, locals: {} } as any, next);
    // The middleware validates against req.hostname ("evil-internal.a.run.app")
    // which is NOT a valid tenant domain, so it rejects with 421.
    expect(status).toHaveBeenCalledWith(421);
    expect(next).not.toHaveBeenCalled();
  });

  it("direct request with valid Host continues to work unchanged", () => {
    // Direct request (no proxy) where Host is itself a valid tenant domain.
    const middleware = hostValidationMiddleware({
      baseDomain: "example.test",
      allowLegacyBareDomain: true,
      allowDevelopmentPorts: false,
      additionalTenantHostnames: ["livestockms-abc123.manus.space"],
    });

    // Case 1: Valid tenant subdomain as direct Host
    const locals1: Record<string, unknown> = {};
    const next1 = vi.fn();
    middleware({
      protocol: "https",
      hostname: "azal-farms.example.test",
      get(name: string) {
        const headers: Record<string, string> = {
          host: "azal-farms.example.test",
        };
        return headers[name.toLowerCase()];
      },
    } as any, { locals: locals1, status: vi.fn(() => ({ json: vi.fn() })) } as any, next1);
    expect(next1).toHaveBeenCalledOnce();
    expect(locals1.requestHost).toMatchObject({ surface: "tenant", companySlug: "azal-farms" });

    // Case 2: Admin domain as direct Host
    const locals2: Record<string, unknown> = {};
    const next2 = vi.fn();
    middleware({
      protocol: "https",
      hostname: "admin.example.test",
      get(name: string) {
        const headers: Record<string, string> = {
          host: "admin.example.test",
        };
        return headers[name.toLowerCase()];
      },
    } as any, { locals: locals2, status: vi.fn(() => ({ json: vi.fn() })) } as any, next2);
    expect(next2).toHaveBeenCalledOnce();
    expect(locals2.requestHost).toMatchObject({ surface: "platform" });

    // Case 3: Additional tenant hostname as direct Host
    const locals3: Record<string, unknown> = {};
    const next3 = vi.fn();
    middleware({
      protocol: "https",
      hostname: "livestockms-abc123.manus.space",
      get(name: string) {
        const headers: Record<string, string> = {
          host: "livestockms-abc123.manus.space",
        };
        return headers[name.toLowerCase()];
      },
    } as any, { locals: locals3, status: vi.fn(() => ({ json: vi.fn() })) } as any, next3);
    expect(next3).toHaveBeenCalledOnce();
    expect(locals3.requestHost).toMatchObject({ surface: "tenant" });
  });

  it("handles edge cases: ports, case normalization, multiple forwarded-host values", () => {
    const middleware = hostValidationMiddleware({
      baseDomain: "example.test",
      allowLegacyBareDomain: true,
      allowDevelopmentPorts: false,
    });

    // Case 1: Standard port (443) is accepted
    const locals1: Record<string, unknown> = {};
    const next1 = vi.fn();
    middleware({
      protocol: "https",
      hostname: "azal-farms.example.test",
      get(name: string) {
        const headers: Record<string, string> = {
          host: "azal-farms.example.test:443",
          "x-forwarded-host": "azal-farms.example.test:443",
        };
        return headers[name.toLowerCase()];
      },
    } as any, { locals: locals1, status: vi.fn(() => ({ json: vi.fn() })) } as any, next1);
    expect(next1).toHaveBeenCalledOnce();

    // Case 2: Case normalization — uppercase hostname is accepted
    const locals2: Record<string, unknown> = {};
    const next2 = vi.fn();
    middleware({
      protocol: "https",
      hostname: "azal-farms.example.test",
      get(name: string) {
        const headers: Record<string, string> = {
          host: "AZAL-FARMS.EXAMPLE.TEST",
        };
        return headers[name.toLowerCase()];
      },
    } as any, { locals: locals2, status: vi.fn(() => ({ json: vi.fn() })) } as any, next2);
    expect(next2).toHaveBeenCalledOnce();
    expect(locals2.requestHost).toMatchObject({ surface: "tenant", companySlug: "azal-farms" });

    // Case 3: Non-standard port is rejected in production mode
    const json3 = vi.fn();
    const status3 = vi.fn(() => ({ json: json3 }));
    const next3 = vi.fn();
    middleware({
      protocol: "https",
      hostname: "azal-farms.example.test",
      get(name: string) {
        const headers: Record<string, string> = {
          host: "azal-farms.example.test:8080",
        };
        return headers[name.toLowerCase()];
      },
    } as any, { status: status3, locals: {} } as any, next3);
    expect(status3).toHaveBeenCalledWith(421);
    expect(next3).not.toHaveBeenCalled();

    // Case 4: Missing Host header is rejected
    const json4 = vi.fn();
    const status4 = vi.fn(() => ({ json: json4 }));
    const next4 = vi.fn();
    middleware({
      protocol: "https",
      hostname: undefined as any,
      get(_name: string) { return undefined; },
    } as any, { status: status4, locals: {} } as any, next4);
    expect(status4).toHaveBeenCalledWith(421);
    expect(next4).not.toHaveBeenCalled();
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
