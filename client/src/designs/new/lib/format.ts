/**
 * Shared display formatting for the tenant UI. Dates are always dd/mm/yyyy so
 * tables match the date pickers regardless of the browser's locale.
 */

const pad = (n: number) => String(n).padStart(2, "0");

function toDate(d: unknown): Date | null {
  if (d == null || d === "") return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  if (typeof d === "string") {
    // Plain calendar dates ("2026-10-23") are not instants: read them as-is so
    // a negative UTC offset can't shift them to the previous day.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const x = new Date(d as string);
  return Number.isNaN(x.getTime()) ? null : x;
}

/** dd/mm/yyyy, or `empty` when the value is missing or invalid. */
export function fmtDate(d: unknown, empty = "—"): string {
  const x = toDate(d);
  return x ? `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}` : empty;
}

/** dd/mm/yyyy HH:mm (24h), or `empty` when the value is missing or invalid. */
export function fmtDateTime(d: unknown, empty = "—"): string {
  const x = toDate(d);
  return x ? `${fmtDate(x)} ${pad(x.getHours())}:${pad(x.getMinutes())}` : empty;
}

/**
 * Whole calendar days from today to `d` (negative = past), or null when the
 * value is missing or invalid. Both ends are compared as UTC midnights, like
 * the server's pregnancyProgress(): local midnights drift by an hour across a
 * DST change, which used to make a ceil-based count report one extra day.
 */
export function daysUntil(d: unknown, now: Date = new Date()): number | null {
  if (d == null || d === "") return null;
  if (d instanceof Date && Number.isNaN(d.getTime())) return null;
  const iso = d instanceof Date ? d.toISOString() : String(d);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const due = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / 86400000);
}
