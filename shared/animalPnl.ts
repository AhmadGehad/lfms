/**
 * Shared Animal P&L calculations used by both design systems' PnL pages, so
 * the formula lives in one place and is unit-testable (the pages themselves
 * have no test harness — this repo has no client component test infra).
 */

export type PurchaseFundingSource = "revenue" | "investment" | null | undefined;

export interface FundedPurchaseRow {
  purchaseFundingSource?: PurchaseFundingSource;
  purchaseCost?: number | null;
}

/**
 * Total purchase cost of animals bought using farm revenue (as opposed to new
 * investment, or unclassified — both of which are excluded).
 *
 * All-time, across active and closed rows alike: the cash left the
 * "available revenue" pool the moment it was spent, regardless of what later
 * happened to the animal it bought.
 */
export function sumReinvestedRevenue(rows: readonly FundedPurchaseRow[]): number {
  return rows
    .filter(row => row.purchaseFundingSource === "revenue")
    .reduce((sum, row) => sum + (row.purchaseCost ?? 0), 0);
}

/**
 * Realised revenue minus what's been reinvested into new stock.
 *
 * This is the fix for a real double-count in "Current Account Value"
 * (`totalRevenue + capitalOnHoof - operatingCost`): `capitalOnHoof` already
 * counts every active animal's purchase cost as value on the books, so if a
 * sale's cash was spent buying a new animal, the un-deducted formula counted
 * that same dollar twice — once as still-available revenue, once as the new
 * animal's asset value.
 */
export function computeNetRevenue(totalRevenue: number, rows: readonly FundedPurchaseRow[]): number {
  return totalRevenue - sumReinvestedRevenue(rows);
}
