import { describe, expect, it } from "vitest";
import {
  resolveTenantContext,
  type TenantContextStore,
} from "./resolveTenantContext";

function store(overrides: Partial<TenantContextStore> = {}): TenantContextStore {
  return {
    findCompanyBySlug: async slug => ({
      id: 7,
      publicId: "01J00000000000000000000000",
      slug,
      lifecycleStatus: "active",
      entitlementVersion: 3,
    }),
    findFarmIdByPublicId: async (_companyId, publicId) => publicId.endsWith("11") ? 11 : null,
    findMembership: async (companyId, userId) => ({
      id: 9,
      companyId,
      userId,
      role: "staff",
      status: "active",
      farmAccessMode: "restricted",
      authorizationVersion: 4,
    }),
    listCompanyFarmIds: async () => [10, 11],
    listAccessibleFarmIds: async () => [10, 11],
    loadPermissionOverrides: async () => ({ "animals:view": true }),
    ...overrides,
  };
}

const principal = {
  sessionId: 5,
  userId: 2,
  authLevel: "primary" as const,
};

describe("tenant context resolution", () => {
  it("resolves only the company named by the validated host", async () => {
    const result = await resolveTenantContext({
      companySlug: "azal-farms",
      principal,
      requestId: "request-1",
      store: store(),
    });
    expect(result).toMatchObject({
      companyId: 7,
      companySlug: "azal-farms",
      membershipId: 9,
      accessibleFarmIds: [10, 11],
      selectedFarmId: null,
    });
  });

  it("selects an authorized requested farm", async () => {
    const result = await resolveTenantContext({
      companySlug: "azal-farms",
      principal,
      requestedFarmPublicId: "01J00000000000000000000011",
      requestId: "request-1",
      store: store(),
    });
    expect(result.selectedFarmId).toBe(11);
  });

  it("does not reveal an inaccessible requested farm", async () => {
    await expect(resolveTenantContext({
      companySlug: "azal-farms",
      principal,
      requestedFarmPublicId: "01J00000000000000000000099",
      requestId: "request-1",
      store: store(),
    })).rejects.toMatchObject({ code: "FARM_ACCESS_DENIED", httpStatus: 404 });
  });

  it("uses route company membership rather than tenant state in the session", async () => {
    const result = await resolveTenantContext({
      companySlug: "other",
      principal,
      requestId: "request-1",
      store: store(),
    });
    expect(result.companySlug).toBe("other");
  });

  it("returns a non-enumerating 404 without membership in the route company", async () => {
    await expect(resolveTenantContext({
      companySlug: "other",
      principal,
      requestId: "request-1",
      store: store({ findMembership: async () => null }),
    })).rejects.toMatchObject({ httpStatus: 404 });
  });

  it("does not fall back when no company subdomain exists", async () => {
    await expect(resolveTenantContext({
      companySlug: null,
      principal,
      requestId: "request-1",
      store: store(),
    })).rejects.toMatchObject({ code: "COMPANY_SELECTION_REQUIRED" });
  });

  it("denies removed memberships without revealing the company", async () => {
    await expect(resolveTenantContext({
      companySlug: "azal-farms",
      principal,
      requestId: "request-1",
      store: store({
        findMembership: async (companyId, userId) => ({
          id: 9,
          companyId,
          userId,
          role: "staff",
          status: "removed",
          farmAccessMode: "all",
          authorizationVersion: 4,
        }),
      }),
    })).rejects.toMatchObject({ httpStatus: 404 });
  });

  it("rejects a membership returned for another company", async () => {
    await expect(resolveTenantContext({
      companySlug: "azal-farms",
      principal,
      requestId: "request-1",
      store: store({
        findMembership: async (_companyId, userId) => ({
          id: 9,
          companyId: 8,
          userId,
          role: "staff",
          status: "active",
          farmAccessMode: "all",
          authorizationVersion: 4,
        }),
      }),
    })).rejects.toMatchObject({ httpStatus: 404 });
  });

  it("rejects a membership returned for another user", async () => {
    await expect(resolveTenantContext({
      companySlug: "azal-farms",
      principal,
      requestId: "request-1",
      store: store({
        findMembership: async (companyId, _userId) => ({
          id: 9,
          companyId,
          userId: 99,
          role: "staff",
          status: "active",
          farmAccessMode: "all",
          authorizationVersion: 4,
        }),
      }),
    })).rejects.toMatchObject({ httpStatus: 404 });
  });
});
