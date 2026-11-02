import { describe, expect, it } from "vitest";
import {
  addDays,
  ALL_WEEKDAYS,
  canUndo,
  farmToday,
  isDueOnWeekday,
  nextTaskProgress,
  UNDO_WINDOW_MS,
  type TaskProgress,
} from "./tasks";
import { farmHour, isDeathStatusName, matchAnimalTag, missingDailyReports, normalizeDigits, parseReportAmount, reportDay, tapTime } from "./tasks";

const NOW = new Date("2026-11-02T10:00:00Z");
const todo: TaskProgress = {
  status: "todo", startedByWorkerId: null, startedAt: null,
  finishedByWorkerId: null, finishedAt: null, blockedReason: null,
};
const started: TaskProgress = { ...todo, status: "started", startedByWorkerId: 1, startedAt: new Date("2026-11-02T09:00:00Z") };
const done: TaskProgress = { ...started, status: "done", finishedByWorkerId: 2, finishedAt: NOW };
const blocked: TaskProgress = { ...todo, status: "blocked", finishedByWorkerId: 2, finishedAt: NOW, blockedReason: "no_time" };

describe("farmToday", () => {
  it("uses the farm's wall clock, not UTC", () => {
    const lateUtc = new Date("2026-11-02T23:30:00Z");
    expect(farmToday("UTC", lateUtc)).toBe("2026-11-02");
    expect(farmToday("Africa/Cairo", lateUtc)).toBe("2026-11-03");
  });

  it("falls back to UTC for a missing or invalid zone", () => {
    expect(farmToday(null, NOW)).toBe("2026-11-02");
    expect(farmToday("Not/AZone", NOW)).toBe("2026-11-02");
  });
});

describe("weekdays", () => {
  it("matches the chosen days only", () => {
    // 2026-11-02 is a Monday, bit 1.
    expect(isDueOnWeekday(0b0000010, "2026-11-02")).toBe(true);
    expect(isDueOnWeekday(0b1111101, "2026-11-02")).toBe(false);
    expect(isDueOnWeekday(ALL_WEEKDAYS, "2026-11-02")).toBe(true);
  });

  it("crosses month ends", () => {
    expect(addDays("2026-11-01", -14)).toBe("2026-10-18");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("nextTaskProgress", () => {
  it("starts a task once", () => {
    expect(nextTaskProgress(todo, { action: "start", workerId: 1 }, NOW))
      .toMatchObject({ status: "started", startedByWorkerId: 1, startedAt: NOW });
    expect(nextTaskProgress(started, { action: "start", workerId: 2 }, NOW)).toBeNull();
  });

  it("lets done beat started, so a late start can't reopen a finished task", () => {
    expect(nextTaskProgress(done, { action: "start", workerId: 3 }, NOW)).toBeNull();
    expect(nextTaskProgress(started, { action: "done", workerId: null }, NOW))
      .toMatchObject({ status: "done", finishedByWorkerId: 1, startedByWorkerId: 1 });
  });

  it("does not record done twice", () => {
    expect(nextTaskProgress(done, { action: "done", workerId: 3 }, NOW)).toBeNull();
  });

  it("lets done overtake can't-do, not the other way round", () => {
    expect(nextTaskProgress(blocked, { action: "done", workerId: 3 }, NOW))
      .toMatchObject({ status: "done", blockedReason: null, finishedByWorkerId: 3 });
    expect(nextTaskProgress(done, { action: "blocked", workerId: 3, reason: "other" }, NOW)).toBeNull();
    expect(nextTaskProgress(blocked, { action: "blocked", workerId: 3, reason: "other" }, NOW)).toBeNull();
  });

  it("undo returns to the previous state within the window", () => {
    expect(nextTaskProgress(done, { action: "undo", workerId: null }, new Date(NOW.getTime() + 30_000)))
      .toMatchObject({ status: "started", startedByWorkerId: 1, finishedAt: null, finishedByWorkerId: null });
    expect(nextTaskProgress(blocked, { action: "undo", workerId: null }, new Date(NOW.getTime() + 30_000)))
      .toMatchObject({ status: "todo", blockedReason: null });
  });

  it("refuses undo after the window or on an unfinished task", () => {
    const late = new Date(NOW.getTime() + UNDO_WINDOW_MS + 1);
    expect(canUndo(done, late)).toBe(false);
    expect(nextTaskProgress(done, { action: "undo", workerId: null }, late)).toBeNull();
    expect(nextTaskProgress(started, { action: "undo", workerId: null }, NOW)).toBeNull();
  });
});

describe("daily report input", () => {
  it("reads Arabic digits as Western ones", () => {
    expect(normalizeDigits("EW-٠١٤٢")).toBe("EW-0142");
    expect(normalizeDigits("۱۲")).toBe("12");
  });

  it("accepts a price typed either way and refuses the rest", () => {
    expect(parseReportAmount("150")).toBe(150);
    expect(parseReportAmount("١٥٠٫٥")).toBe(150.5);
    expect(parseReportAmount("1,500")).toBe(1500);
    expect(parseReportAmount("150,5")).toBe(150.5);
    for (const bad of ["", "0", "-5", "abc", "1.234", "100000000"]) expect(parseReportAmount(bad)).toBeNull();
  });

  it("keeps an offline report on its own day, within reason", () => {
    expect(reportDay("2026-11-01", "2026-11-02")).toBe("2026-11-01");
    expect(reportDay(null, "2026-11-02")).toBe("2026-11-02");
    expect(reportDay("2026-11-03", "2026-11-02")).toBe("2026-11-02");
    expect(reportDay("2026-10-01", "2026-11-02")).toBe("2026-11-02");
  });
});

describe("matching a typed animal number", () => {
  const herd = [
    { tag: "EW-0142", isActive: true },
    { tag: "RM-0007", isActive: true },
    { tag: "EW-0007", isActive: true },
    { tag: "EW-0900", isActive: false },
  ];

  it("takes the full tag, in any case", () => {
    expect(matchAnimalTag("ew-0142", herd)?.tag).toBe("EW-0142");
  });

  it("takes just the number when one live animal has it", () => {
    expect(matchAnimalTag("142", herd)?.tag).toBe("EW-0142");
    expect(matchAnimalTag("0142", herd)?.tag).toBe("EW-0142");
  });

  it("refuses to guess between two animals", () => {
    expect(matchAnimalTag("7", herd)).toBeNull();
  });

  it("doesn't match a number to an animal already gone, or an unknown tag", () => {
    expect(matchAnimalTag("900", herd)).toBeNull();
    expect(matchAnimalTag("XX-1", herd)).toBeNull();
  });

  it("still finds a gone animal by its full tag, so the owner can see why", () => {
    expect(matchAnimalTag("EW-0900", herd)).toMatchObject({ isActive: false });
  });
});

describe("isDeathStatusName", () => {
  it("recognises death statuses in both languages", () => {
    for (const name of ["Dead", "Mortality", "نفوق", "نافق"]) expect(isDeathStatusName(name)).toBe(true);
    for (const name of ["Sold", "Active", "بيع"]) expect(isDeathStatusName(name)).toBe(false);
  });
});

describe("daily report helpers", () => {
  it("asks for the yes/no questions and nothing else", () => {
    expect(missingDailyReports([])).toEqual(["doctor_visit", "stock_needed"]);
    expect(missingDailyReports([{ type: "doctor_visit" }, { type: "purchase" }])).toEqual(["stock_needed"]);
    expect(missingDailyReports([{ type: "doctor_visit" }, { type: "stock_needed" }])).toEqual([]);
  });

  it("reads the hour on the farm's clock", () => {
    const now = new Date("2026-11-02T21:30:00Z");
    expect(farmHour("UTC", now)).toBe(21);
    expect(farmHour("Africa/Cairo", now)).toBe(23);
    expect(farmHour("Not/AZone", now)).toBe(21);
  });

  it("trusts a tablet's tap time only when it's believable", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    expect(tapTime("2026-11-02T09:00:00.000Z", now).toISOString()).toBe("2026-11-02T09:00:00.000Z");
    expect(tapTime(null, now)).toBe(now);
    expect(tapTime("2026-11-02T13:00:00.000Z", now)).toBe(now);
    expect(tapTime("2026-10-01T09:00:00.000Z", now)).toBe(now);
    expect(tapTime("garbage", now)).toBe(now);
  });
});
