import { describe, expect, it } from "vitest";
import { allocateMinor, computeExpenseSplits } from "./expenseSplit";

const sum = (rows: { amountMinor: number }[]) => rows.reduce((a, r) => a + r.amountMinor, 0);

describe("allocateMinor", () => {
  it("splits evenly with the remainder going to the earliest parts", () => {
    expect(allocateMinor(10001, [1, 1, 1])).toEqual([3334, 3334, 3333]);
  });
  it("weights proportionally and sums exactly", () => {
    const parts = allocateMinor(10000, [3, 1]);
    expect(parts).toEqual([7500, 2500]);
  });
  it("handles zero weights and empty input", () => {
    expect(allocateMinor(500, [0, 0])).toEqual([0, 0]);
    expect(allocateMinor(500, [])).toEqual([]);
  });
});

describe("computeExpenseSplits", () => {
  it("no targets → one row with a null categoryTarget and the full amount", () => {
    expect(computeExpenseSplits(12345, null, "headcount")).toEqual([
      { categoryTarget: null, amountMinor: 12345 },
    ]);
    expect(computeExpenseSplits(12345, [], "equal")).toEqual([
      { categoryTarget: null, amountMinor: 12345 },
    ]);
  });

  it("headcount mode weighs by heads and drops zero-head categories", () => {
    const rows = computeExpenseSplits(
      10000,
      [
        { categoryId: 1, headCount: 3 },
        { categoryId: 2, headCount: 1 },
        { categoryId: 3, headCount: 0 },
      ],
      "headcount",
    );
    expect(rows).toEqual([
      { categoryTarget: 1, amountMinor: 7500 },
      { categoryTarget: 2, amountMinor: 2500 },
    ]);
    expect(sum(rows)).toBe(10000);
  });

  it("distributes rounding remainder without losing a minor unit", () => {
    const rows = computeExpenseSplits(
      10,
      [
        { categoryId: 1, headCount: 1 },
        { categoryId: 2, headCount: 1 },
        { categoryId: 3, headCount: 1 },
      ],
      "headcount",
    );
    expect(rows.map(r => r.amountMinor)).toEqual([4, 3, 3]);
    expect(sum(rows)).toBe(10);
  });

  it("falls back to an equal split when every category has zero heads", () => {
    const rows = computeExpenseSplits(
      9000,
      [
        { categoryId: 1, headCount: 0 },
        { categoryId: 2, headCount: 0 },
        { categoryId: 3, headCount: 0 },
      ],
      "headcount",
    );
    expect(rows.map(r => r.amountMinor)).toEqual([3000, 3000, 3000]);
  });

  it("equal mode ignores head counts", () => {
    const rows = computeExpenseSplits(
      10001,
      [
        { categoryId: 1, headCount: 99 },
        { categoryId: 2, headCount: 1 },
        { categoryId: 3, headCount: 0 },
      ],
      "equal",
    );
    expect(rows.map(r => r.amountMinor)).toEqual([3334, 3334, 3333]);
    expect(sum(rows)).toBe(10001);
  });

  it("drops rows that round to zero while preserving the total", () => {
    const rows = computeExpenseSplits(
      1,
      [
        { categoryId: 1, headCount: 1 },
        { categoryId: 2, headCount: 1 },
      ],
      "equal",
    );
    expect(rows).toEqual([{ categoryTarget: 1, amountMinor: 1 }]);
  });

  it("keeps input order deterministically", () => {
    const rows = computeExpenseSplits(
      300,
      [
        { categoryId: 7, headCount: 1 },
        { categoryId: 5, headCount: 1 },
        { categoryId: 9, headCount: 1 },
      ],
      "equal",
    );
    expect(rows.map(r => r.categoryTarget)).toEqual([7, 5, 9]);
  });
});
