import { describe, expect, it } from "vitest";
import { daysUntil, fmtDate, fmtDateTime } from "./format";

describe("fmtDate", () => {
  it("formats calendar dates as dd/mm/yyyy without timezone shift", () => {
    expect(fmtDate("2026-10-03")).toBe("03/10/2026");
  });

  it("formats Date instances and ISO timestamps", () => {
    expect(fmtDate(new Date(2026, 0, 9, 15, 30))).toBe("09/01/2026");
    expect(fmtDateTime(new Date(2026, 0, 9, 15, 5))).toBe("09/01/2026 15:05");
  });

  it("returns the empty marker for missing or invalid values", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("", "-")).toBe("-");
    expect(fmtDate("not a date")).toBe("—");
  });
});

describe("daysUntil", () => {
  const now = new Date(2026, 9, 26, 15, 0); // 26 Oct 2026, afternoon local time

  it("counts whole calendar days, ignoring DST changes in between", () => {
    expect(daysUntil("2026-11-20", now)).toBe(25);
    expect(daysUntil(new Date(Date.UTC(2026, 10, 20)), now)).toBe(25);
  });

  it("returns 0 for today and negative values for past dates", () => {
    expect(daysUntil("2026-10-26", now)).toBe(0);
    expect(daysUntil("2026-10-24T00:00:00.000Z", now)).toBe(-2);
  });

  it("returns null for missing or invalid values", () => {
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil("", now)).toBeNull();
    expect(daysUntil("not a date", now)).toBeNull();
    expect(daysUntil(new Date("x"), now)).toBeNull();
  });
});
