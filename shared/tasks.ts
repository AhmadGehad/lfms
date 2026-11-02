/**
 * Rules for worker tasks, shared so the tablet's optimistic update and the
 * server can't disagree about what a tap does.
 */

export const TASK_SOURCES = ["manual", "template", "vaccination"] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export const TASK_STATUSES = ["todo", "started", "done", "blocked"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_ACTIONS = ["start", "done", "blocked", "undo"] as const;
export type TaskAction = (typeof TASK_ACTIONS)[number];

export const BLOCKED_REASONS = ["no_supplies", "animal_problem", "no_time", "other"] as const;
export type BlockedReason = (typeof BLOCKED_REASONS)[number];

/** What a worker can tell the owner from the tablet, separate from any task. */
export const YES_NO_REPORTS = ["doctor_visit", "stock_needed"] as const;
export type YesNoReport = (typeof YES_NO_REPORTS)[number];
export const ANIMAL_REPORTS = ["animal_dead", "animal_sick"] as const;
export type AnimalReport = (typeof ANIMAL_REPORTS)[number];
export const REPORT_TYPES = [...YES_NO_REPORTS, ...ANIMAL_REPORTS, "purchase"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const PURCHASE_KINDS = ["vaccine", "medicine", "other"] as const;
export type PurchaseKind = (typeof PURCHASE_KINDS)[number];
export const STOCK_KINDS = ["feed", "vaccine", "medicine", "other"] as const;
export type StockKind = (typeof STOCK_KINDS)[number];

export const MAX_REPORT_AMOUNT = 99_999_999.99;
/** How late an offline report can still land on the day it was written. */
export const REPORT_BACKDATE_DAYS = 7;

export function isYesNoReport(type: ReportType): type is YesNoReport {
  return (YES_NO_REPORTS as readonly string[]).includes(type);
}

/** An Arabic keyboard types ٠١٢, but tags and prices are stored in 012. */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".");
}

/** The typed price as a number, or null unless it's a usable amount. */
export function parseReportAmount(value: string): number | null {
  const typed = normalizeDigits(value).trim().replace(/٬/g, ",");
  // 1,500 is thousands; 150,5 is how many keyboards type a decimal point.
  const text = /^\d{1,3}(,\d{3})+$/.test(typed) ? typed.replace(/,/g, "") : typed.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  return amount > 0 && amount <= MAX_REPORT_AMOUNT ? amount : null;
}

/** The day a report counts for: the day it was written, unless that's implausible. */
export function reportDay(requested: string | null | undefined, today: string): string {
  if (!requested || requested > today || requested < addDays(today, -REPORT_BACKDATE_DAYS)) return today;
  return requested;
}

/** A status that means the animal died, in either of the app's languages. */
export function isDeathStatusName(name: string): boolean {
  return /dead|died|deceased|mortal|نفوق|نافق|ميت|موت/i.test(name);
}

/**
 * The animal a typed number refers to. Workers often write "142" for "EW-0142",
 * so the digits count too, but only when they point at exactly one animal in
 * the herd: a guess here could mark the wrong animal dead.
 */
export function matchAnimalTag<T extends { tag: string; isActive: boolean }>(typed: string, animals: readonly T[]): T | null {
  const wanted = typed.trim().toLowerCase();
  const exact = animals.filter(animal => animal.tag.toLowerCase() === wanted);
  const exactMatch = exact.find(animal => animal.isActive) ?? exact[0];
  if (exactMatch) return exactMatch;
  if (!/^\d+$/.test(wanted)) return null;
  const sameNumber = animals.filter(animal => {
    if (!animal.isActive) return false;
    const digits = animal.tag.match(/(\d+)$/)?.[1];
    return digits !== undefined && Number(digits) === Number(wanted);
  });
  return sameNumber.length === 1 ? sameNumber[0] : null;
}

export const ALL_WEEKDAYS = 0b1111111;
export const UNDO_WINDOW_MS = 60_000;

/** How long an unfinished vaccination keeps generating a task once overdue. */
export const VACCINATION_LOOKBACK_DAYS = 14;

/** The calendar date on the farm's wall clock, as YYYY-MM-DD. */
export function farmToday(timeZone: string | null | undefined, now: Date = new Date()): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  try {
    return format(timeZone || "UTC");
  } catch {
    // A bad zone name must not take the tablet down.
    return format("UTC");
  }
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** 0 is Sunday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function isDueOnWeekday(weekdays: number, date: string): boolean {
  return (weekdays & (1 << weekdayOf(date))) !== 0;
}

export function isFinished(status: TaskStatus): boolean {
  return status === "done" || status === "blocked";
}

/**
 * Repeating tasks don't carry over, because tomorrow has its own. A one-off or
 * vaccination stays on the list until someone deals with it.
 */
export function carriesOver(source: TaskSource): boolean {
  return source !== "template";
}

/** True while the tablet may still offer Undo for a finished task. */
export function canUndo(task: { status: TaskStatus; finishedAt: Date | string | null }, now: Date = new Date()): boolean {
  if (!isFinished(task.status) || !task.finishedAt) return false;
  return now.getTime() - new Date(task.finishedAt).getTime() <= UNDO_WINDOW_MS;
}

export type TaskProgress = {
  status: TaskStatus;
  startedByWorkerId: number | null;
  startedAt: Date | null;
  finishedByWorkerId: number | null;
  finishedAt: Date | null;
  blockedReason: BlockedReason | null;
};

/**
 * What a tap does to a task, or null when it changes nothing.
 *
 * State only moves forward (done beats started), so two tablets, or a queued
 * tap arriving late, settle on the furthest state instead of overwriting it.
 * "Can't do it" is the exception that may be overtaken: if someone did the task
 * after all, done wins. Undo is the only way back, and only briefly.
 */
export function nextTaskProgress(
  current: TaskProgress,
  action: { action: TaskAction; workerId: number | null; reason?: BlockedReason | null },
  now: Date = new Date(),
): TaskProgress | null {
  switch (action.action) {
    case "start":
      if (current.status !== "todo") return null;
      return { ...current, status: "started", startedByWorkerId: action.workerId, startedAt: now };
    case "done":
      if (current.status === "done") return null;
      return {
        ...current,
        status: "done",
        finishedByWorkerId: action.workerId ?? current.startedByWorkerId,
        finishedAt: now,
        blockedReason: null,
      };
    case "blocked":
      if (isFinished(current.status)) return null;
      return {
        ...current,
        status: "blocked",
        finishedByWorkerId: action.workerId,
        finishedAt: now,
        blockedReason: action.reason ?? "other",
      };
    case "undo":
      if (!canUndo(current, now)) return null;
      return {
        ...current,
        status: current.startedAt ? "started" : "todo",
        finishedByWorkerId: null,
        finishedAt: null,
        blockedReason: null,
      };
  }
}

/** The questions every farm day has to answer. Animals and purchases only when they happen. */
export function missingDailyReports(reports: ReadonlyArray<{ type: string }>): YesNoReport[] {
  return YES_NO_REPORTS.filter(type => !reports.some(report => report.type === type));
}

/** The hour on the farm's clock, 0 to 23. */
export function farmHour(timeZone: string | null | undefined, now: Date = new Date()): number {
  const format = (zone: string) =>
    Number(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(now));
  try {
    return format(timeZone || "UTC");
  } catch {
    return format("UTC");
  }
}

/**
 * When a tap really happened. An offline tablet may send it hours later, so it
 * brings its own time, but the clock is the device's: a time in the future or
 * older than a queued tap could be falls back to now.
 */
export function tapTime(tappedAt: string | null | undefined, now: Date = new Date()): Date {
  const time = tappedAt ? new Date(tappedAt) : now;
  const age = now.getTime() - time.getTime();
  return age >= 0 && age <= REPORT_BACKDATE_DAYS * 86_400_000 ? time : now;
}
