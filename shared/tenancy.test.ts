import { describe, expect, it } from "vitest";
import {
  canAccessFarm,
  PLATFORM_PERMISSIONS,
  type TenantContext,
} from "./tenancy";

function context(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    companyId: 1,
    companyPublicId: "01J00000000000000000000000",
    companySlug: "azal-farms",
    companyLifecycleStatus: "active",
    userId: 1,
    membershipId: 1,
    membershipRole: "owner",
    membershipStatus: "active",
    authorizationVersion: 1,
    farmAccessMode: "restricted",
    accessibleFarmIds: [11, 12],
    permissionOverrides: {},
    sessionId: 1,
    authenticationLevel: "primary",
    entitlementVersion: 1,
    requestId: "request-1",
    ...overrides,
  };
}

describe("tenant contracts", () => {
  it("allows only explicitly assigned farms for restricted members", () => {
    const ctx = context();
    expect(canAccessFarm(ctx, 11)).toBe(true);
    expect(canAccessFarm(ctx, 13)).toBe(false);
  });

  it("allows every farm for all-farm members", () => {
    expect(canAccessFarm(context({ farmAccessMode: "all", accessibleFarmIds: "all" }), 999)).toBe(true);
  });

  it("keeps platform permissions explicit and unique", () => {
    expect(new Set(PLATFORM_PERMISSIONS).size).toBe(PLATFORM_PERMISSIONS.length);
    expect(PLATFORM_PERMISSIONS).toContain("support.approve");
  });
});
