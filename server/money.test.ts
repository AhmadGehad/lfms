import { describe, expect, it } from "vitest";
import { toMinor, toMajor, sumMinor, mulMoney, feedLineMinor, divMinor } from "./_core/money";

describe("money helpers", () => {
  it("toMinor / toMajor round-trip", () => {
    expect(toMinor("12.34")).toBe(1234);
    expect(toMinor(12.34)).toBe(1234);
    expect(toMajor(1234)).toBe(12.34);
    expect(toMinor(null)).toBe(0);
    expect(toMinor("")).toBe(0);
    expect(toMinor("abc")).toBe(0);
  });

  it("sums exactly where floats would drift", () => {
    // 0.1 + 0.2 in float = 0.30000000000000004
    expect(toMajor(sumMinor(["0.10", "0.20"]))).toBe(0.3);
    // ten 0.1s
    expect(toMajor(sumMinor(Array(10).fill("0.10")))).toBe(1);
    // realistic expense list
    expect(toMajor(sumMinor(["1999.99", "0.01", "500.50"]))).toBe(2500.5);
  });

  it("multiplies money by a factor with single rounding", () => {
    // 19.99 × 3 = 59.97
    expect(toMajor(mulMoney("19.99", 3))).toBe(59.97);
    // price 5.00 × 7 days = 35.00
    expect(toMajor(mulMoney("5.00", 7))).toBe(35);
  });

  it("feed line: qty × days × price rounds once", () => {
    // 1.25 kg/day × 30 days × 16.00 = 600.00
    expect(toMajor(feedLineMinor(1.25, 30, "16.00"))).toBe(600);
    // 0.5 × 5 × 12.5 = 31.25
    expect(toMajor(feedLineMinor(0.5, 5, "12.5"))).toBe(31.25);
  });

  it("allocates across head count exactly", () => {
    // 100.00 across 3 head = 33.33 each (rounded)
    expect(toMajor(divMinor(toMinor("100.00"), 3))).toBe(33.33);
    expect(divMinor(1000, 0)).toBe(0);
  });
});
