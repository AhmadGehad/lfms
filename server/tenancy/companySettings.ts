import { eq } from "drizzle-orm";
import { companies } from "../../drizzle/schema";
import { getDb } from "../db";

export const SESSION_IDLE_TIMEOUT_MINUTES_OPTIONS = [60, 120, 480, 10_080] as const;
export type SessionIdleTimeoutMinutes = typeof SESSION_IDLE_TIMEOUT_MINUTES_OPTIONS[number];

type CompanySettings = {
  sessionIdleTimeoutMinutes?: number;
};

function parseCompanySettings(value: unknown): CompanySettings {
  if (!value || typeof value !== "object") return {};
  const settings = value as Record<string, unknown>;
  const minutes = settings.sessionIdleTimeoutMinutes;
  if (typeof minutes === "number" && SESSION_IDLE_TIMEOUT_MINUTES_OPTIONS.includes(minutes as SessionIdleTimeoutMinutes)) {
    return { sessionIdleTimeoutMinutes: minutes };
  }
  return {};
}

/** Read-only lookup used at tenant login time to compute the session's idle timeout. */
export async function getCompanySessionIdleTimeoutMs(companySlug: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({ settings: companies.settings })
    .from(companies)
    .where(eq(companies.slug, companySlug))
    .limit(1);
  if (!row) return null;
  const settings = parseCompanySettings(row.settings);
  return settings.sessionIdleTimeoutMinutes ? settings.sessionIdleTimeoutMinutes * 60_000 : null;
}
