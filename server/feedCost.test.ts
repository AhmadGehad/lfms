import { describe, expect, it } from "vitest";
import { segmentedFeedCostPure } from "./db";

/**
 * These tests exercise the pure feed-cost segmentation math directly (no DB),
 * verifying CRITICAL #5: feed cost must track BOTH ration-plan changes and
 * feed-price changes over an animal's life — not a single frozen snapshot.
 */
describe("segmentedFeedCostPure", () => {
  it("flat plan + flat price = qty × days × price", () => {
    const plans = [
      { feedItemId: 1, qtyPerHeadPerDay: "2", effectiveDate: "2026-01-01", endDate: null, isActive: true },
    ];
    const prices = new Map([[1, [{ eff: "2026-01-01", price: 5 }]]]);
    // 10 days × 2 kg × 5 = 100
    expect(segmentedFeedCostPure(plans, prices, "2026-01-01", "2026-01-11")).toBe(100);
  });

  it("reflects a mid-life price increase", () => {
    const plans = [
      { feedItemId: 1, qtyPerHeadPerDay: "1", effectiveDate: "2026-01-01", endDate: null, isActive: true },
    ];
    // price 5 until Jan 6, then 10 from Jan 6
    const prices = new Map([[1, [
      { eff: "2026-01-01", price: 5 },
      { eff: "2026-01-06", price: 10 },
    ]]]);
    // Jan1-6 = 5 days × 1 × 5 = 25 ; Jan6-11 = 5 days × 1 × 10 = 50 ; total 75
    expect(segmentedFeedCostPure(plans, prices, "2026-01-01", "2026-01-11")).toBe(75);
  });

  it("reflects a ration-plan rate change via endDate + new plan", () => {
    const plans = [
      { feedItemId: 1, qtyPerHeadPerDay: "1", effectiveDate: "2026-01-01", endDate: "2026-01-05", isActive: true },
      { feedItemId: 1, qtyPerHeadPerDay: "3", effectiveDate: "2026-01-06", endDate: null, isActive: true },
    ];
    const prices = new Map([[1, [{ eff: "2026-01-01", price: 2 }]]]);
    // Jan1-6 (5d) × 1 × 2 = 10 ; Jan6-11 (5d) × 3 × 2 = 30 ; total 40
    expect(segmentedFeedCostPure(plans, prices, "2026-01-01", "2026-01-11")).toBe(40);
  });

  it("sums multiple feed items in a plan", () => {
    const plans = [
      { feedItemId: 1, qtyPerHeadPerDay: "1", effectiveDate: "2026-01-01", endDate: null, isActive: true },
      { feedItemId: 2, qtyPerHeadPerDay: "0.5", effectiveDate: "2026-01-01", endDate: null, isActive: true },
    ];
    const prices = new Map([
      [1, [{ eff: "2026-01-01", price: 4 }]],
      [2, [{ eff: "2026-01-01", price: 10 }]],
    ]);
    // 10 days: item1 = 10×1×4 = 40 ; item2 = 10×0.5×10 = 50 ; total 90
    expect(segmentedFeedCostPure(plans, prices, "2026-01-01", "2026-01-11")).toBe(90);
  });

  it("ignores inactive plans and returns 0 for empty/zero-length periods", () => {
    const plans = [
      { feedItemId: 1, qtyPerHeadPerDay: "5", effectiveDate: "2026-01-01", endDate: null, isActive: false },
    ];
    const prices = new Map([[1, [{ eff: "2026-01-01", price: 5 }]]]);
    expect(segmentedFeedCostPure(plans, prices, "2026-01-01", "2026-01-11")).toBe(0);
    expect(segmentedFeedCostPure([], prices, "2026-01-01", "2026-01-11")).toBe(0);
    // end <= start
    expect(segmentedFeedCostPure(plans, prices, "2026-01-11", "2026-01-01")).toBe(0);
  });

  it("falls back to the earliest known price for dates before the first effective price", () => {
    const plans = [
      { feedItemId: 1, qtyPerHeadPerDay: "2", effectiveDate: "2026-01-01", endDate: null, isActive: true },
    ];
    // price only recorded from mid-period; dates before it use the earliest
    // known price (10) instead of 0, so an animal acquired before the first
    // price entry doesn't show falsely-zero feed cost.
    const prices = new Map([[1, [{ eff: "2026-01-06", price: 10 }]]]);
    // Jan1-6 (5d) × 2 × 10 = 100 ; Jan6-11 (5d) × 2 × 10 = 100 ; total 200
    expect(segmentedFeedCostPure(plans, prices, "2026-01-01", "2026-01-11")).toBe(200);
  });
});
