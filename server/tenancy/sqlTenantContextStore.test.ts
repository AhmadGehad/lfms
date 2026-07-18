import { describe, expect, it } from "vitest";
import { SqlTenantContextStore } from "./sqlTenantContextStore";

describe("SQL tenant context store", () => {
  it("exposes only explicit tenant-resolution methods", () => {
    expect(Object.getOwnPropertyNames(SqlTenantContextStore.prototype).sort()).toEqual([
      "constructor",
      "findCompanyBySlug",
      "findFarmIdByPublicId",
      "findMembership",
      "listAccessibleFarmIds",
      "listCompanyFarmIds",
      "loadPermissionOverrides",
    ]);
  });
});
