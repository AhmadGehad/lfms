import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateTime } from "./format";

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
