import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { backgroundJobs, securityEvents } from "../../../drizzle/schema";
import { requirePlatformDb } from "./db";

export async function countJobTotals() {
  const db = await requirePlatformDb();
  const [row] = await db.select({
    pending: sql<number>`SUM(CASE WHEN ${backgroundJobs.status} = 'pending' THEN 1 ELSE 0 END)`,
    processing: sql<number>`SUM(CASE WHEN ${backgroundJobs.status} = 'processing' THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN ${backgroundJobs.status} IN ('failed', 'dead_letter') THEN 1 ELSE 0 END)`,
  }).from(backgroundJobs);
  return { pending: Number(row?.pending ?? 0), processing: Number(row?.processing ?? 0), failed: Number(row?.failed ?? 0) };
}

export async function countSecurityTotals(since: Date) {
  const db = await requirePlatformDb();
  const [row] = await db.select({
    high: sql<number>`SUM(CASE WHEN ${securityEvents.severity} IN ('high', 'critical') THEN 1 ELSE 0 END)`,
    denied: sql<number>`SUM(CASE WHEN ${securityEvents.outcome} = 'denied' THEN 1 ELSE 0 END)`,
  }).from(securityEvents).where(gte(securityEvents.createdAt, since));
  return { high: Number(row?.high ?? 0), denied: Number(row?.denied ?? 0) };
}

export async function checkDatabase() {
  const db = await requirePlatformDb();
  await db.execute(sql`SELECT 1`);
}
