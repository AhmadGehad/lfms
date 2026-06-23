import { describe, expect, it } from "vitest";
import { allocateOwnerExpensesPure } from "./db";

/**
 * Pure owner-expense allocation math (no DB). Verifies that an owner is charged:
 *  - head expenses on their animals in full,
 *  - their SHARE of category/herd expenses (by head count on the expense date),
 *  - and nothing for general/overhead.
 * This must match the per-animal allocation used by getAllAnimalsPnL so the
 * Dashboard, Income Statement and P&L reconcile.
 */
describe("allocateOwnerExpensesPure", () => {
  const D = "2026-03-01";
  // a1,a2 owned by the target owner; a3,a4 same category; a5 a different category.
  const animals = [
    { id: 1, categoryId: 1, acq: "2026-01-01", exit: null },
    { id: 2, categoryId: 1, acq: "2026-01-01", exit: null },
    { id: 3, categoryId: 1, acq: "2026-01-01", exit: null },
    { id: 4, categoryId: 1, acq: "2026-01-01", exit: null },
    { id: 5, categoryId: 2, acq: "2026-01-01", exit: null },
  ];
  const owned = new Set([1, 2]);

  it("counts head expenses on owned animals in full, ignores others", () => {
    const r = allocateOwnerExpensesPure({
      ownedAnimalIds: owned,
      animals,
      expenses: [
        { targetType: "head", headId: 1, categoryTarget: null, amountMinor: 3000, date: D, categoryName: "Vet" },
        { targetType: "head", headId: 3, categoryTarget: null, amountMinor: 9999, date: D, categoryName: "Vet" },
      ],
    });
    expect(r.headMinor).toBe(3000);
    expect(r.byCategory.get("Vet")).toBe(3000);
  });

  it("splits a category expense by the owner's share of heads in that category", () => {
    // 10000 over 4 heads in category 1, owner holds 2 → 2 × floor(10000/4) = 5000
    const r = allocateOwnerExpensesPure({
      ownedAnimalIds: owned,
      animals,
      expenses: [
        { targetType: "category", headId: null, categoryTarget: 1, amountMinor: 10000, date: D, categoryName: "Supplement" },
      ],
    });
    expect(r.categoryMinor).toBe(5000);
    expect(r.byCategory.get("Supplement")).toBe(5000);
  });

  it("splits a herd expense by the owner's share of all heads alive", () => {
    // 10000 over 5 heads alive, owner holds 2 → 2 × floor(10000/5) = 4000
    const r = allocateOwnerExpensesPure({
      ownedAnimalIds: owned,
      animals,
      expenses: [
        { targetType: "herd", headId: null, categoryTarget: null, amountMinor: 10000, date: D, categoryName: "Water" },
      ],
    });
    expect(r.herdMinor).toBe(4000);
    expect(r.byCategory.get("Water")).toBe(4000);
  });

  it("excludes general/overhead entirely", () => {
    const r = allocateOwnerExpensesPure({
      ownedAnimalIds: owned,
      animals,
      expenses: [
        { targetType: "general", headId: null, categoryTarget: null, amountMinor: 5000, date: D, categoryName: "Electricity" },
      ],
    });
    expect(r.headMinor + r.categoryMinor + r.herdMinor).toBe(0);
    expect(r.byCategory.has("Electricity")).toBe(false);
  });

  it("groups mixed targets by expense category and totals correctly", () => {
    const r = allocateOwnerExpensesPure({
      ownedAnimalIds: owned,
      animals,
      expenses: [
        { targetType: "head", headId: 1, categoryTarget: null, amountMinor: 3000, date: D, categoryName: "Vet" },
        { targetType: "head", headId: 3, categoryTarget: null, amountMinor: 9999, date: D, categoryName: "Vet" },
        { targetType: "category", headId: null, categoryTarget: 1, amountMinor: 10000, date: D, categoryName: "Supplement" },
        { targetType: "herd", headId: null, categoryTarget: null, amountMinor: 10000, date: D, categoryName: "Vet" },
        { targetType: "general", headId: null, categoryTarget: null, amountMinor: 5000, date: D, categoryName: "Electricity" },
      ],
    });
    expect(r.headMinor).toBe(3000);
    expect(r.categoryMinor).toBe(5000);
    expect(r.herdMinor).toBe(4000);
    // Vet = 3000 (head) + 4000 (herd share); Supplement = 5000
    expect(r.byCategory.get("Vet")).toBe(7000);
    expect(r.byCategory.get("Supplement")).toBe(5000);
    expect(r.headMinor + r.categoryMinor + r.herdMinor).toBe(12000);
  });

  it("charges nothing for a category/date where the owner has no live animals", () => {
    // Owner's animals exited before the expense date.
    const exited = [
      { id: 1, categoryId: 1, acq: "2026-01-01", exit: "2026-02-01" },
      { id: 2, categoryId: 1, acq: "2026-01-01", exit: "2026-02-01" },
      { id: 3, categoryId: 1, acq: "2026-01-01", exit: null },
    ];
    const r = allocateOwnerExpensesPure({
      ownedAnimalIds: owned,
      animals: exited,
      expenses: [
        { targetType: "category", headId: null, categoryTarget: 1, amountMinor: 10000, date: D, categoryName: "Supplement" },
      ],
    });
    expect(r.categoryMinor).toBe(0);
  });
});
