import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { backgroundJobs } from "../../drizzle/schema";
import { getDb } from "../db";
import type { JobLeaseStore, LeasedJob } from "./leasedWorker";

function affectedRows(result: unknown) {
  return Number((result as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
}

function safeJobError(error: Error) {
  return `${error.name}: ${error.message}`
    .replace(/:\/\/[^@\s]+@/g, "://[REDACTED]@")
    .replace(/(authorization|cookie|password|secret|token|api[-_]?key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .slice(0, 2_000);
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

function jobTypeFilter(allowedJobTypes: readonly string[]) {
  return allowedJobTypes.length > 0
    ? inArray(backgroundJobs.jobType, [...allowedJobTypes])
    : undefined;
}

function claimable(now: Date, allowedJobTypes: readonly string[]) {
  return and(
    jobTypeFilter(allowedJobTypes),
    lte(backgroundJobs.runAt, now),
    lt(backgroundJobs.attempts, backgroundJobs.maxAttempts),
    or(
      eq(backgroundJobs.status, "pending"),
      eq(backgroundJobs.status, "failed"),
      and(
        eq(backgroundJobs.status, "processing"),
        or(isNull(backgroundJobs.lockedUntil), lte(backgroundJobs.lockedUntil, now)),
      ),
    ),
  );
}

function exhausted(now: Date, allowedJobTypes: readonly string[]) {
  return and(
    jobTypeFilter(allowedJobTypes),
    gte(backgroundJobs.attempts, backgroundJobs.maxAttempts),
    or(
      and(
        or(eq(backgroundJobs.status, "pending"), eq(backgroundJobs.status, "failed")),
        lte(backgroundJobs.runAt, now),
      ),
      and(
        eq(backgroundJobs.status, "processing"),
        or(isNull(backgroundJobs.lockedUntil), lte(backgroundJobs.lockedUntil, now)),
      ),
    ),
  );
}

export class SqlJobLeaseStore<TPayload = unknown> implements JobLeaseStore<TPayload> {
  constructor(private readonly allowedJobTypes: readonly string[] = []) {}

  async claim(workerId: string, leaseMs: number): Promise<LeasedJob<TPayload> | null> {
    const db = await requireDb();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const now = new Date();
      const [exhaustedJob] = await db
        .select({ id: backgroundJobs.id })
        .from(backgroundJobs)
        .where(exhausted(now, this.allowedJobTypes))
        .orderBy(asc(backgroundJobs.id))
        .limit(1);
      if (exhaustedJob) {
        await db
          .update(backgroundJobs)
          .set({
            status: "dead_letter",
            completedAt: now,
            lockedBy: null,
            lockedUntil: null,
            lastError: "Job exhausted its attempts before completion",
          })
          .where(and(eq(backgroundJobs.id, exhaustedJob.id), exhausted(now, this.allowedJobTypes)));
        continue;
      }
      const [candidate] = await db
        .select({
          id: backgroundJobs.id,
          publicId: backgroundJobs.publicId,
          companyId: backgroundJobs.companyId,
          type: backgroundJobs.jobType,
          payload: backgroundJobs.payload,
          attempts: backgroundJobs.attempts,
          maxAttempts: backgroundJobs.maxAttempts,
        })
        .from(backgroundJobs)
        .where(claimable(now, this.allowedJobTypes))
        .orderBy(desc(backgroundJobs.priority), asc(backgroundJobs.runAt), asc(backgroundJobs.id))
        .limit(1);
      if (!candidate) return null;

      const lockedUntil = new Date(now.getTime() + leaseMs);
      const [result] = await db
        .update(backgroundJobs)
        .set({
          status: "processing",
          lockedBy: workerId,
          lockedUntil,
          attempts: sql`${backgroundJobs.attempts} + 1`,
          startedAt: now,
        })
        .where(and(eq(backgroundJobs.id, candidate.id), claimable(now, this.allowedJobTypes)));
      if (affectedRows(result) !== 1) continue;

      return {
        id: candidate.id,
        publicId: candidate.publicId,
        companyId: candidate.companyId,
        type: candidate.type,
        payload: candidate.payload as TPayload,
        attempts: candidate.attempts + 1,
        maxAttempts: candidate.maxAttempts,
      };
    }
    return null;
  }

  async complete(job: LeasedJob<TPayload>, workerId: string) {
    const db = await requireDb();
    const [result] = await db
      .update(backgroundJobs)
      .set({
        status: "completed",
        completedAt: new Date(),
        lockedBy: null,
        lockedUntil: null,
        lastError: null,
      })
      .where(and(
        eq(backgroundJobs.id, job.id),
        eq(backgroundJobs.status, "processing"),
        eq(backgroundJobs.lockedBy, workerId),
      ));
    if (affectedRows(result) !== 1) throw new Error("JOB_LEASE_LOST");
  }

  async fail(job: LeasedJob<TPayload>, workerId: string, error: Error) {
    const db = await requireDb();
    const deadLetter = job.attempts >= job.maxAttempts;
    const retryDelayMs = Math.min(3_600_000, 5_000 * (2 ** Math.max(0, job.attempts - 1)));
    const [result] = await db
      .update(backgroundJobs)
      .set({
        status: deadLetter ? "dead_letter" : "failed",
        runAt: deadLetter ? new Date() : new Date(Date.now() + retryDelayMs),
        lockedBy: null,
        lockedUntil: null,
        lastError: safeJobError(error),
        completedAt: deadLetter ? new Date() : null,
      })
      .where(and(
        eq(backgroundJobs.id, job.id),
        eq(backgroundJobs.status, "processing"),
        eq(backgroundJobs.lockedBy, workerId),
      ));
    if (affectedRows(result) !== 1) throw new Error("JOB_LEASE_LOST");
  }

  async extend(job: LeasedJob<TPayload>, workerId: string, leaseMs: number) {
    const db = await requireDb();
    const [result] = await db
      .update(backgroundJobs)
      .set({ lockedUntil: new Date(Date.now() + leaseMs) })
      .where(and(
        eq(backgroundJobs.id, job.id),
        eq(backgroundJobs.status, "processing"),
        eq(backgroundJobs.lockedBy, workerId),
      ));
    return affectedRows(result) === 1;
  }
}
