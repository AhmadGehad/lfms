import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { animals, expenses } from "../../drizzle/schema";
import type { TenantContext } from "../../shared/tenancy";
import { assertFarmAccess, tenantScope, tenantValues } from "./scope";

const context = {
  companyId: 7,
  farmAccessMode: "restricted",
  accessibleFarmIds: [11, 12],
} as TenantContext;

describe("tenant SQL scope", () => {
  it("overwrites untrusted company and farm values", () => {
    expect(tenantValues(context, { companyId: 99, name: "A" }, 11)).toEqual({
      companyId: 7,
      farmId: 11,
      name: "A",
    });
  });

  it("rejects a farm outside the membership grant", () => {
    expect(() => assertFarmAccess(context, 99)).toThrow("FARM_ACCESS_DENIED");
  });

  it("always returns a company-scoped SQL predicate", () => {
    expect(tenantScope(context, animals)).toBeTruthy();
  });

  it("includes company-wide rows for nullable farm scopes", () => {
    const dialect = new MySqlDialect();
    const predicate = tenantScope({ ...context, selectedFarmId: 11 }, expenses);
    const query = dialect.sqlToQuery(predicate);
    expect(query.sql).toContain("`saas_azal_expenses`.`companyId` = ?");
    expect(query.sql).toContain("`saas_azal_expenses`.`farmId` is null");
    expect(query.sql).toContain("`saas_azal_expenses`.`farmId` = ?");
    expect(query.params).toEqual([7, 11]);
  });

  it("does not include unassigned farm rows when only company scope remains", () => {
    const dialect = new MySqlDialect();
    const predicate = tenantScope(
      { ...context, accessibleFarmIds: [] },
      expenses
    );
    const query = dialect.sqlToQuery(predicate);
    expect(query.sql).toContain("`saas_azal_expenses`.`farmId` is null");
    expect(query.sql).not.toContain("false");
  });
});
