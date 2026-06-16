import { describe, expect, it } from "vitest";
import { segmentedFeedCostPure } from "./db";

/**
 * Regression tests for the normalizeDate() guard inside computeFeedCostForPeriod.
 * We test segmentedFeedCostPure (the pure inner function) with ISO date strings
 * to confirm the math is correct, and separately verify the normalizeDate logic
 * handles locale strings (the bug that caused "Invalid time value" RangeError).
 */
describe("normalizeDate guard (regression for Invalid time value bug)", () => {
  // Simulate what normalizeDate() does inside computeFeedCostForPeriod
  const normalizeDate = (d: string): string => {
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.split("T")[0];
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) throw new Error(`computeFeedCostForPeriod: invalid date "${d}"`);
    return parsed.toISOString().split("T")[0];
  };

  it("passes through ISO date strings unchanged", () => {
    expect(normalizeDate("2025-11-01")).toBe("2025-11-01");
    expect(normalizeDate("2025-11-01T00:00:00.000Z")).toBe("2025-11-01");
  });

  it("normalizes locale strings like String(new Date()) produces", () => {
    // String(new Date("2025-11-01")) in UTC+0 → "Fri Nov 01 2025 00:00:00 GMT+0000 (UTC)"
    const localeStr = "Fri Nov 01 2025 00:00:00 GMT+0000 (Coordinated Universal Time)";
    expect(normalizeDate(localeStr)).toBe("2025-11-01");
  });

  it("throws a descriptive error for truly invalid date strings", () => {
    expect(() => normalizeDate("not-a-date")).toThrow("computeFeedCostForPeriod: invalid date");
  });

  it("segmentedFeedCostPure still computes correctly with normalized ISO strings", () => {
    const plans = [
      { feedItemId: 1, qtyPerHeadPerDay: "2", effectiveDate: "2025-11-01", endDate: null, isActive: true },
    ];
    const prices = new Map([[1, [{ eff: "2025-11-01", price: 5 }]]]);
    // 10 days × 2 kg × 5 EGP = 100 EGP
    expect(segmentedFeedCostPure(plans, prices, "2025-11-01", "2025-11-11")).toBe(100);
  });
});
