import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const dbSource = readFileSync(resolve(root, "server/db.ts"), "utf8");
const capitalRouterSource = readFileSync(resolve(root, "server/routers/capital.ts"), "utf8");

function section(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Missing source section: ${start}`);
  return source.slice(startIndex, endIndex);
}

describe("tenant isolation regression guards", () => {
  it("scopes all P&L general-expense reads to the resolved tenant", () => {
    const singleAnimalPnl = section(dbSource, "export async function getAnimalPnL", "export async function getAllAnimalsPnL");
    const bulkPnl = dbSource.slice(dbSource.indexOf("export async function getAllAnimalsPnL"));

    expect(singleAnimalPnl).toContain('tenantScope(tenant, expenses), eq(expenses.targetType, "general")');
    expect(singleAnimalPnl).toContain("tenantScope(tenant, expenses),\n      isNull(expenses.deletedAt)");
    expect(singleAnimalPnl).toContain("eq(expenseCategories.companyId, tenant.companyId)");
    expect(singleAnimalPnl).toContain("eq(expenseSubCategories.companyId, tenant.companyId)");
    expect(bulkPnl).toContain('tenantScope(tenant, expenses), eq(expenses.targetType, "general")');
  });

  it("does not route tenant capital requests to the legacy global ledger", () => {
    expect(capitalRouterSource).not.toContain('from "../capital"');
    expect(capitalRouterSource).toContain("legacyCapitalUnavailable");
    expect(capitalRouterSource.match(/legacyCapitalUnavailable\(\)/g)).toHaveLength(10);
  });
});
