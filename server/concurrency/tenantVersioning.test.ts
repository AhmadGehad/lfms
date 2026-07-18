import { describe, expect, it } from "vitest";
import { getTableConfig, MySqlDialect } from "drizzle-orm/mysql-core";
import { expenses, feedStockLedger, rationPlans } from "../../drizzle/schema";
import type { TenantContext } from "../../shared/tenancy";
import { versionedTenantUpdateScope } from "./tenantVersioning";

const context = {
  companyId: 7,
  farmAccessMode: "restricted",
  accessibleFarmIds: [11],
  selectedFarmId: 11,
} as TenantContext;

describe("versioned tenant update SQL", () => {
  it.each([
    ["expenses", expenses],
    ["ration_plans", rationPlans],
    ["feed_stock_ledger", feedStockLedger],
  ] as const)(
    "scopes %s by tenant, farm, id, and expected version",
    (tableName, table) => {
      const query = new MySqlDialect().sqlToQuery(
        versionedTenantUpdateScope(context, table, 23, 4)
      );
      const physicalTableName = getTableConfig(table).name;
      expect(query.sql).toContain(`\`${physicalTableName}\`.\`companyId\` = ?`);
      expect(query.sql).toContain(`\`${physicalTableName}\`.\`farmId\` = ?`);
      expect(query.sql).toContain(`\`${physicalTableName}\`.\`id\` = ?`);
      expect(query.sql).toContain(`\`${physicalTableName}\`.\`version\` = ?`);
      expect(query.params).toEqual(expect.arrayContaining([7, 11, 23, 4]));
    }
  );
});
