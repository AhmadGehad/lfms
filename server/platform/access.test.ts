import { describe, expect, it, vi } from "vitest";
import type { PlatformContext } from "../../shared/tenancy";
import { platformRouter } from "./router";
import type { PlatformTrpcContext } from "./context";

function context(platform: PlatformContext | null, requireCsrf = vi.fn()): PlatformTrpcContext {
  return {
    req: {} as PlatformTrpcContext["req"],
    res: {} as PlatformTrpcContext["res"],
    platform,
    csrfToken: null,
    requireCsrf,
    revokeSession: vi.fn(),
  };
}

function principal(overrides: Partial<PlatformContext> = {}): PlatformContext {
  return {
    platformAdminId: 10,
    userId: 20,
    permissions: new Set(),
    sessionId: 30,
    authenticationLevel: "primary",
    requestId: "request-1",
    ...overrides,
  };
}

const companyInput = {
  name: "Example",
  slug: "example",
  initialFarmName: "Main Farm",
  initialFarmCode: "MAIN",
  ownerName: "Tenant Owner",
  ownerEmail: "owner@example.test",
  idempotencyKey: "company-create-test-key",
};

describe("platform API boundary", () => {
  it("rejects calls without a platform session before repository access", async () => {
    const caller = platformRouter.createCaller(context(null));
    await expect(caller.companies.list({ limit: 25, sortDirection: "desc" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("requires the exact platform permission", async () => {
    const caller = platformRouter.createCaller(context(principal()));
    await expect(caller.companies.list({ limit: 25, sortDirection: "desc" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires MFA for sensitive writes", async () => {
    const caller = platformRouter.createCaller(context(principal({ permissions: new Set(["companies.write"]) })));
    await expect(caller.companies.create(companyInput)).rejects.toMatchObject({ code: "FORBIDDEN", message: "MFA verification required" });
  });

  it("allows explicitly non-MFA administrators past the MFA gate", async () => {
    const caller = platformRouter.createCaller(context(principal({
      permissions: new Set(["companies.write"]),
      mfaRequired: false,
    })));
    await expect(caller.companies.create(companyInput)).rejects.not.toMatchObject({
      message: "MFA verification required",
    });
  });

  it("validates CSRF before mutation authorization", async () => {
    const requireCsrf = vi.fn(() => { throw new Error("csrf denied"); });
    const caller = platformRouter.createCaller(context(principal({ permissions: new Set(["companies.write"]), authenticationLevel: "mfa" }), requireCsrf));
    await expect(caller.companies.create(companyInput)).rejects.toThrow("csrf denied");
    expect(requireCsrf).toHaveBeenCalledOnce();
  });

  it("requires security read authority to inspect platform administrators", async () => {
    const caller = platformRouter.createCaller(context(principal()));
    await expect(caller.administrators.list({ limit: 25, sortDirection: "desc" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires MFA and platform management authority for administrator changes", async () => {
    const input = {
      name: "Security Operator",
      email: "security@example.test",
      oidcSubject: "workforce-subject-1",
      status: "invited" as const,
      roleCodes: ["platform_support"],
      idempotencyKey: "administrator-create-test-key",
    };
    const noPermission = platformRouter.createCaller(context(principal({
      permissions: new Set(["administrators.read"]),
      authenticationLevel: "mfa",
    })));
    await expect(noPermission.administrators.create(input)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const noMfa = platformRouter.createCaller(context(principal({
      permissions: new Set(["administrators.write"]),
    })));
    await expect(noMfa.administrators.create(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "MFA verification required",
    });
  });
});
