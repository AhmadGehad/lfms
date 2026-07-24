import {
  and,
  asc,
  eq,
  gt,
  isNotNull,
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
  emailLog,
} from "../../drizzle/schema";
import { isDuplicateEntryError } from "../_core/databaseErrors";
import { isEmailConfigured } from "../_core/email";
import { subscriptionExpiredEmail, subscriptionTrialEndingEmail } from "../_core/emailTemplates";
import { ENV } from "../_core/env";
import { sendTemplatedEmail } from "../_core/sendTemplatedEmail";
import { getDb } from "../db";
import { getCompanyOwnerEmail } from "../platform/repositories/companies";
import { isSubscriptionDueForExpiration } from "../entitlements/subscriptionLifecycle";
import { generatePublicId } from "../tenancy/publicIds";
import type {
  DueSubscription,
  SubscriptionExpirationRepository,
} from "./subscriptionExpiration";
import { SUBSCRIPTION_EXPIRATION_JOB_TYPE } from "./subscriptionExpiration";

const TRIAL_ENDING_THRESHOLD_DAYS = 3;
const TRIAL_ENDING_TEMPLATE = "subscription_trial_ending";

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
    const didExpire = await db.transaction(async tx => {
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
    if (didExpire && isEmailConfigured()) {
      const [company] = await db.select({ name: companies.name, slug: companies.slug })
        .from(companies).where(eq(companies.id, input.candidate.companyId)).limit(1);
      const ownerEmail = company ? await getCompanyOwnerEmail(input.candidate.companyId, db) : null;
      if (company && ownerEmail) {
        const email = subscriptionExpiredEmail({
          companyName: company.name,
          dashboardUrl: `https://${company.slug}.${ENV.baseDomain}/`,
        });
        void sendTemplatedEmail({
          template: "subscription_expired",
          to: ownerEmail,
          companyId: input.candidate.companyId,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
      }
    }
    return didExpire;
  }

  async listTrialsEndingSoon(now: Date, limit: number): Promise<readonly DueSubscription[]> {
    const db = await requireDb();
    const threshold = new Date(now.getTime() + TRIAL_ENDING_THRESHOLD_DAYS * 24 * 60 * 60 * 1_000);
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
        eq(companySubscriptions.status, "trialing"),
        isNotNull(companySubscriptions.trialEndsAt),
        gt(companySubscriptions.trialEndsAt, now),
        lte(companySubscriptions.trialEndsAt, threshold),
      ))
      .orderBy(asc(companySubscriptions.id))
      .limit(limit);
  }

  async notifyTrialEndingIfDue(input: Parameters<SubscriptionExpirationRepository["notifyTrialEndingIfDue"]>[0]) {
    const { candidate, now } = input;
    if (!candidate.trialEndsAt || !isEmailConfigured()) return false;
    const db = await requireDb();
    const [alreadyNotified] = await db.select({ id: emailLog.id }).from(emailLog)
      .where(and(eq(emailLog.companyId, candidate.companyId), eq(emailLog.template, TRIAL_ENDING_TEMPLATE)))
      .limit(1);
    if (alreadyNotified) return false;
    const [company] = await db.select({ name: companies.name, slug: companies.slug })
      .from(companies).where(eq(companies.id, candidate.companyId)).limit(1);
    if (!company) return false;
    const ownerEmail = await getCompanyOwnerEmail(candidate.companyId, db);
    if (!ownerEmail) return false;
    const daysRemaining = Math.max(1, Math.ceil((candidate.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1_000)));
    const email = subscriptionTrialEndingEmail({
      companyName: company.name,
      daysRemaining,
      dashboardUrl: `https://${company.slug}.${ENV.baseDomain}/`,
    });
    await sendTemplatedEmail({
      template: TRIAL_ENDING_TEMPLATE,
      to: ownerEmail,
      companyId: candidate.companyId,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return true;
  }
}
