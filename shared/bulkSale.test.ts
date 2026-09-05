import { describe, expect, it } from "vitest";
import { calculateBulkSale } from "./bulkSale";

describe("bulk sale quote", () => {
  it("calculates weighted prices, adds one charge, and defaults blank payments to the inclusive price", () => {
    const quote = calculateBulkSale([
      { id: 1, weightAtSale: "10.25", salePrice: "999", amountPaid: "100" },
      { id: 2, weightAtSale: "20.50" },
    ], "12.34", "10.01");
    expect(quote).toMatchObject({ subtotal: 379.46, extraCharge: 10.01, total: 389.47, paid: 359.64, weight: 30.75 });
    expect(quote.rows).toMatchObject([
      { salePrice: "129.83", amountPaid: "100.00", extraCharge: "3.34" },
      { salePrice: "259.64", amountPaid: undefined, extraCharge: "6.67" },
    ]);
  });

  it("keeps exact cents when charge cannot be evenly divided, including zero-price animals", () => {
    for (const salePrice of ["0", "10"]) {
      const quote = calculateBulkSale([1, 2, 3].map(id => ({ id, salePrice })), undefined, "0.01");
      expect(quote.rows.map(row => row.extraCharge)).toEqual(["0.01", "0.00", "0.00"]);
      expect(quote.total).toBe(Number(salePrice) * 3 + 0.01);
    }
  });

  it("preserves manual pricing, unpaid sales, and unpriced exits", () => {
    const quote = calculateBulkSale([{ id: 1, salePrice: "50", amountPaid: "0" }, { id: 2 }]);
    expect(quote).toMatchObject({ total: 50, paid: 0 });
    expect(quote.rows[1].salePrice).toBeUndefined();
    expect(calculateBulkSale([{ id: 1, salePrice: "50" }], undefined, "10").rows[0].salePrice).toBe("60.00");
  });

  it("recalculates when rate, weight, or selection changes", () => {
    expect(calculateBulkSale([{ id: 1, weightAtSale: "10" }], "2", "5").total).toBe(25);
    expect(calculateBulkSale([{ id: 1, weightAtSale: "20" }], "3", "5").total).toBe(65);
    expect(calculateBulkSale([{ id: 2, weightAtSale: "5" }], "3", "5").total).toBe(20);
  });

  it("rounds exact half cents up when fractional weights are not binary-exact", () => {
    expect(calculateBulkSale([{ id: 1, weightAtSale: "4.10" }], "0.15").total).toBe(0.62);
  });

  it("rejects incomplete, malformed, negative, overflowing, duplicate, and overpaid quotes", () => {
    const invalid: Parameters<typeof calculateBulkSale>[] = [
      [[{ id: 1 }], "10"],
      [[{ id: 1, weightAtSale: "0" }], "10"],
      [[{ id: 1, weightAtSale: "2001" }], "10"],
      [[{ id: 1, weightAtSale: "10" }], "0"],
      [[{ id: 1, weightAtSale: "10" }], "10abc"],
      [[{ id: 1, weightAtSale: "10" }], "Infinity"],
      [[{ id: 1, weightAtSale: "1.001" }], "10"],
      [[{ id: 1, salePrice: "10" }], undefined, "-1"],
      [[{ id: 1, salePrice: "10" }], undefined, "0.001"],
      [[{ id: 1, salePrice: "10", amountPaid: "11" }]],
      [[{ id: 1, weightAtSale: "2000" }], "99999999.99"],
      [[{ id: 1, weightAtSale: "0.01" }], "99999999.99"],
      [[{ id: 1, weightAtSale: "0.01" }], "1", "1000000"],
      [[{ id: 1, salePrice: "99999999.99" }], undefined, "0.01"],
      [[{ id: 1 }, { id: 1 }]],
      [[{ id: 1 }], undefined, "1"],
      [[], undefined, "1"],
    ];
    for (const args of invalid) expect(() => calculateBulkSale(...args)).toThrow();
  });
});
