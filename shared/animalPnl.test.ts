import { describe, expect, it } from "vitest";
import { computeNetRevenue, sumReinvestedRevenue } from "./animalPnl";

describe("sumReinvestedRevenue", () => {
  it("sums only rows tagged revenue, ignoring investment and unclassified rows", () => {
    const rows = [
      { purchaseFundingSource: "revenue" as const, purchaseCost: 12_000 },
      { purchaseFundingSource: "investment" as const, purchaseCost: 26_500 },
      { purchaseFundingSource: null, purchaseCost: 15_000 },
      { purchaseFundingSource: undefined, purchaseCost: 5_000 },
    ];
    expect(sumReinvestedRevenue(rows)).toBe(12_000);
  });

  it("counts revenue-funded purchases across both active and closed rows", () => {
    // "Reinvested" isn't scoped to active/closed — the cash left the pool the
    // moment it was spent, regardless of what later happened to the animal.
    const rows = [
      { purchaseFundingSource: "revenue" as const, purchaseCost: 1_000, isActive: true },
      { purchaseFundingSource: "revenue" as const, purchaseCost: 2_000, isActive: false },
    ];
    expect(sumReinvestedRevenue(rows)).toBe(3_000);
  });

  it("is zero for a company that hasn't tagged anything yet", () => {
    // This is the safe-rollout guarantee: every existing animal starts
    // unclassified (null), so this must be 0 until a user actively tags one.
    const rows = [
      { purchaseFundingSource: null, purchaseCost: 15_000 },
      { purchaseFundingSource: null, purchaseCost: 26_500 },
    ];
    expect(sumReinvestedRevenue(rows)).toBe(0);
  });

  it("treats a missing purchaseCost as zero rather than throwing", () => {
    expect(sumReinvestedRevenue([{ purchaseFundingSource: "revenue" }])).toBe(0);
  });

  it("returns 0 for an empty herd", () => {
    expect(sumReinvestedRevenue([])).toBe(0);
  });
});

describe("computeNetRevenue", () => {
  it("equals total revenue when nothing is reinvested — the no-op-on-rollout guarantee", () => {
    const rows = [{ purchaseFundingSource: "investment" as const, purchaseCost: 26_500 }];
    expect(computeNetRevenue(256_500, rows)).toBe(256_500);
  });

  it("deducts reinvested purchases from total revenue", () => {
    const rows = [{ purchaseFundingSource: "revenue" as const, purchaseCost: 12_000 }];
    expect(computeNetRevenue(256_500, rows)).toBe(244_500);
  });

  it("can go negative if reinvestment exceeds realised revenue", () => {
    const rows = [{ purchaseFundingSource: "revenue" as const, purchaseCost: 300_000 }];
    expect(computeNetRevenue(256_500, rows)).toBe(-43_500);
  });
});
