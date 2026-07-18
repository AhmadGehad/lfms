import {
  and,
  asc,
  eq,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  auditLog,
  backgroundJobs,
  companies,
  companySubscriptions,
} from "../../drizzle/schema";
import { isDuplicateEntryError } from "../_core/databaseErrors";
import { getDb } from "../db";
import { isSubscriptionDueForExpiration } from "../entitlements/subscriptionLifecycle";
import { generatePublicId } from "../tenancy/publicIds";
import type {
  DueSubscription,
  SubscriptionExpirationRepository,
} from "./subscriptionExpiration";
import { SUBSCRIPTION_EXPIRATION_JOB_TYPE } from "./subscriptionExpiration";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

function affectedRows(result: unknown) {
  return Number((result as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
}

function dueCondition(now: Date) {
  return or(
    and(
      eq(companySubscriptions.status, "trialing"),
      or(
        isNull(companySubscriptions.trialEndsAt),
        lte(companySubscriptions.periodEnd, now),
        lte(companySubscriptions.trialEndsAt, now),
      ),
    ),
    and(eq(companySubscriptions.status, "active"), lte(companySubscriptions.periodEnd, now)),
    and(
      eq(companySubscriptions.status, "past_due"),
      or(
        isNull(companySubscriptions.graceEndsAt),
        lte(companySubscriptions.graceEndsAt, now),
      ),
    ),
  );
}

export class SqlSubscriptionExpirationRepository implements SubscriptionExpirationRepository {
  async enqueue(input: Parameters<SubscriptionExpirationRepository["enqueue"]>[0]) {
    const db = await requireDb();
    try {
      const [result] = await db.insert(backgroundJobs).values({
        publicId: generatePublicId(),
        companyId: null,
        jobType: SUBSCRIPTION_EXPIRATION_JOB_TYPE,
        payload: input.payload,
        priority: 100,
        runAt: input.runAt,
        deduplicationKey: input.deduplicationKey,
        requestId: `subscription-expiry:${input.deduplicationKey}`.slice(0, 64),
        maxAttempts: 5,
      });
      return affectedRows(result) === 1;
    } catch (error) {
      if (isDuplicateEntryError(error)) return false;
      throw error;
    }
  }

  async listDue(now: Date, limit: number): Promise<readonly DueSubscription[]> {
    const db = await requireDb();
    return db.select({
      id: companySubscriptions.id,
      publicId: companySubscriptions.publicId,
      companyId: companySubscriptions.companyId,
      version: companySubscriptions.version,
      status: companySubscriptions.status,
      periodStart: companySubscriptions.periodStart,
      periodEnd: companySubscriptions.periodEnd,
      trialEndsAt: companySubscriptions.trialEndsAt,
      graceEndsAt: companySubscriptions.graceEndsAt,
    })
      .from(companySubscriptions)
      .where(and(
        eq(companySubscriptions.isCurrent, true),
        lte(companySubscriptions.periodStart, now),
        dueCondition(now),
      ))
      .orderBy(asc(companySubscriptions.id))
      .limit(limit);
  }

  async expireIfDue(input: Parameters<SubscriptionExpirationRepository["expireIfDue"]>[0]) {
    const db = await requireDb();
    return db.transaction(async tx => {
      const [current] = await tx.select({
        id: companySubscriptions.id,
        publicId: companySubscriptions.publicId,
        companyId: companySubscriptions.companyId,
        version: companySubscriptions.version,
        status: companySubscriptions.status,
        isCurrent: companySubscriptions.isCurrent,
        periodStart: companySubscriptions.periodStart,
        periodEnd: companySubscriptions.periodEnd,
        trialEndsAt: companySubscriptions.trialEndsAt,
        graceEndsAt: companySubscriptions.graceEndsAt,
      })
        .from(companySubscriptions)
        .where(eq(companySubscriptions.id, input.candidate.id))
        .limit(1)
        .for("update");

      if (!current || !current.isCurrent || !isSubscriptionDueForExpiration(current, input.now)) {
        return false;
      }

      const [transition] = await tx.update(companySubscriptions).set({
        status: "expired",
        version: sql`${companySubscriptions.version} + 1`,
      }).where(and(
        eq(companySubscriptions.id, current.id),
        eq(companySubscriptions.companyId, current.companyId),
        eq(companySubscriptions.version, current.version),
        eq(companySubscriptions.status, current.status),
        eq(companySubscriptions.isCurrent, true),
      ));
      if (affectedRows(transition) !== 1) return false;

      await tx.update(companies).set({
        entitlementVersion: sql`${companies.entitlementVersion} + 1`,
        version: sql`${companies.version} + 1`,
      }).where(eq(companies.id, current.companyId));

      await tx.insert(auditLog).values({
        publicId: generatePublicId(),
        companyId: current.companyId,
        actorType: "system_job",
        action: "subscription.expire",
        actionCategory: "billing",
        entityType: "company_subscription",
        entityId: current.publicId,
        oldValues: {
          status: current.status,
          version: current.version,
          periodEnd: current.periodEnd,
          trialEndsAt: current.trialEndsAt,
          graceEndsAt: current.graceEndsAt,
        },
        newValues: { status: "expired", version: current.version + 1 },
        requestId: `job:${input.jobPublicId}`.slice(0, 64),
        outcome: "success",
        metadata: { jobId: input.jobId },
      });
      return true;
    });
  }
}
