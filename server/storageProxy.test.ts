import { describe, expect, it } from "vitest";
import type { TenantContext } from "../shared/tenancy";
import { canProxyTenantFile } from "./_core/storageProxy";

const tenant: TenantContext = {
  companyId: 7,
  companyPublicId: "01J00000000000000000000000",
  companySlug: "tenant-seven",
  companyLifecycleStatus: "active",
  membershipId: 11,
  userId: 13,
  membershipRole: "staff",
  membershipStatus: "active",
  authorizationVersion: 1,
  accessibleFarmIds: [17],
  farmAccessMode: "restricted",
  selectedFarmId: 17,
  permissionOverrides: {},
  sessionId: 19,
  authenticationLevel: "primary",
  entitlementVersion: 1,
  requestId: "storage-proxy-test",
};

describe("tenant storage proxy authorization", () => {
  it("never exposes system-generated exports to tenant sessions", () => {
    expect(canProxyTenantFile(tenant, {
      farmId: null,
      status: "clean",
      generatedByBackgroundJobId: 23,
      deletedAt: null,
    })).toBe(false);
  });

  it("allows only clean uploads inside the tenant farm scope", () => {
    expect(canProxyTenantFile(tenant, {
      farmId: 17,
      status: "clean",
      generatedByBackgroundJobId: null,
      deletedAt: null,
    })).toBe(true);
    expect(canProxyTenantFile(tenant, {
      farmId: 18,
      status: "clean",
      generatedByBackgroundJobId: null,
      deletedAt: null,
    })).toBe(false);
  });
});
