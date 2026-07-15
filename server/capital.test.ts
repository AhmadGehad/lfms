import { describe, expect, it } from "vitest";
import { allocateByWeightsMinor, dayWeightedOwnership, ownershipAtDate } from "./capital";

const investors = [{ id: 1, name: "A" }, { id: 2, name: "B" }];

describe("capital ledger math", () => {
  it("splits a pro-rata batch exactly, including piastre remainders", () => {
    const split = allocateByWeightsMinor(5, [{ investorId: 1, weight: 60 }, { investorId: 2, weight: 40 }]);
    expect(split).toEqual([{ investorId: 1, amountMinor: 3 }, { investorId: 2, amountMinor: 2 }]);
    expect(split.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(5);
  });

  it("keeps ownership after pro-rata funding and changes it for a direct top-up", () => {
    const ledger = [
      { investorId: 1, kind: "initial" as const, amount: "600.00", effectiveDate: "2026-01-01" },
      { investorId: 2, kind: "initial" as const, amount: "400.00", effectiveDate: "2026-01-01" },
      { investorId: 1, kind: "pro_rata" as const, amount: "300.00", effectiveDate: "2026-02-01" },
      { investorId: 2, kind: "pro_rata" as const, amount: "200.00", effectiveDate: "2026-02-01" },
      { investorId: 2, kind: "direct" as const, amount: "500.00", effectiveDate: "2026-03-01" },
    ];
    expect(ownershipAtDate(investors, ledger, "2026-02-01").map(x => x.ownershipPct)).toEqual([60, 40]);
    expect(ownershipAtDate(investors, ledger, "2026-03-01").map(x => x.ownershipPct)).toEqual([45, 55]);
  });

  it("uses effective daily ownership in a month with a mid-month contribution", () => {
    const shares = dayWeightedOwnership(investors, [
      { investorId: 1, kind: "initial" as const, amount: "100.00", effectiveDate: "2026-04-01" },
      { investorId: 2, kind: "direct" as const, amount: "100.00", effectiveDate: "2026-04-16" },
    ], "2026-04-01", "2026-04-30");
    expect(shares[0].ownershipPct).toBeCloseTo(75, 5);
    expect(shares[1].ownershipPct).toBeCloseTo(25, 5);
  });

  it("removes capital only through a reversal ledger row", () => {
    const shares = ownershipAtDate(investors, [
      { investorId: 1, kind: "initial" as const, amount: "100.00", effectiveDate: "2026-01-01" },
      { investorId: 2, kind: "initial" as const, amount: "100.00", effectiveDate: "2026-01-01" },
      { investorId: 1, kind: "reversal" as const, amount: "100.00", effectiveDate: "2026-02-01" },
    ], "2026-02-01");
    expect(shares.map(x => x.contributedMinor)).toEqual([0, 10000]);
    expect(shares.map(x => x.ownershipPct)).toEqual([0, 100]);
  });
});
