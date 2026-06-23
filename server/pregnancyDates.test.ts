import { describe, expect, it } from "vitest";
import { calculatePregnancyDueDate, pregnancyProgress } from "./db";

/**
 * Pure pregnancy date math. The user's spec: the confirmation date is treated
 * as gestation day 0, so expected delivery = confirmation date + the species
 * gestation period, and progress = daysPregnant / gestationDays.
 */
describe("calculatePregnancyDueDate", () => {
  it("adds the species gestation to the confirmation date (cow 283 → 11 Oct)", () => {
    expect(calculatePregnancyDueDate("2026-01-01", 283)).toBe("2026-10-11");
  });
  it("works for sheep (147 days)", () => {
    expect(calculatePregnancyDueDate("2026-01-01", 147)).toBe("2026-05-28");
  });
});

describe("pregnancyProgress", () => {
  it("computes days pregnant, remaining and percent (cow 283, confirmed 120d ago = 42%)", () => {
    const conf = new Date();
    conf.setDate(conf.getDate() - 120);
    const confStr = conf.toISOString().split("T")[0];
    const due = calculatePregnancyDueDate(confStr, 283);

    const p = pregnancyProgress(confStr, due, 283, "active");
    expect(p.daysPregnant).toBe(120);
    expect(p.daysRemaining).toBe(164); // 283 + 1 (inclusive) - 120 = 164
    expect(p.progressPct).toBe(42);
    expect(p.displayStatus).toBe("active");
  });

  it("flags overdue and clamps progress at 100% past the due date", () => {
    const conf = new Date();
    conf.setDate(conf.getDate() - 300);
    const confStr = conf.toISOString().split("T")[0];
    const due = calculatePregnancyDueDate(confStr, 283);

    const p = pregnancyProgress(confStr, due, 283, "active");
    expect(p.displayStatus).toBe("overdue");
    expect(p.progressPct).toBe(100);
  });

  it("keeps the stored status when not active", () => {
    const p = pregnancyProgress("2026-01-01", "2026-10-11", 283, "delivered");
    expect(p.displayStatus).toBe("delivered");
  });
});
