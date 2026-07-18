import { and, eq, sql } from "drizzle-orm";
import { companies, companySubscriptions, planEntitlements } from "../../../drizzle/schema";
import { generatePublicId } from "../../tenancy/publicIds";
import { invalidLifecycle, notFound, versionConflict } from "../errors";
import { appendPlatformAudit, type PlatformAuditActor } from "../repositories/audit";
import { affectedRows, requirePlatformDb } from "../repositories/db";
import { findPlanByPublicId } from "../repositories/plans";
import { rethrowPlatformWriteError } from "./errors";
import { executeIdempotent } from "../idempotency";

export async function assignSubscription(input: {
  companyPublicId: string;
  planPublicId: string;
  status: "trialing" | "active" | "past_due" | "suspended";
  periodStart: Date;
  periodEnd: Date;
  trialEndsAt?: Date | null;
  graceEndsAt?: Date | null;
  expectedCompanyVersion: number;
  idempotencyKey: string;
}, actor: PlatformAuditActor) {
  if (input.periodEnd <= input.periodStart) invalidLifecycle("Subscription period end must follow start");
  if (input.status === "trialing" && (
    !input.trialEndsAt ||
    input.trialEndsAt <= input.periodStart ||
    input.trialEndsAt > input.periodEnd
  )) {
    invalidLifecycle("Trial subscriptions require a trial end within the subscription period");
  }
  if (input.status === "past_due" && (
    !input.graceEndsAt ||
    input.graceEndsAt <= input.periodEnd
  )) {
    invalidLifecycle("Past-due subscriptions require a grace end after the subscription period");
  }
  const db = await requirePlatformDb();
  try {
    return await db.transaction(async tx => {
      const [company] = await tx.select().from(companies)
        .where(eq(companies.publicId, input.companyPublicId))
        .limit(1)
        .for("update");
      if (!company || company.deletedAt) notFound("Company");
      return executeIdempotent(tx, {
        companyId: company.id,
        userId: actor.userId,
        key: input.idempotencyKey,
        operation: "platform.subscriptions.assign",
        body: {
          companyPublicId: company.publicId,
          planPublicId: input.planPublicId,
          status: input.status,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          trialEndsAt: input.trialEndsAt,
          graceEndsAt: input.graceEndsAt,
          expectedCompanyVersion: input.expectedCompanyVersion,
        },
      }, async () => {
        if (company.version !== input.expectedCompanyVersion) versionConflict("Company");
        const plan = await findPlanByPublicId(input.planPublicId, tx);
        if (!plan || plan.status !== "active") invalidLifecycle("Only active plans can be assigned");
        const current = await tx.select().from(companySubscriptions)
          .where(and(
            eq(companySubscriptions.companyId, company.id),
            eq(companySubscriptions.isCurrent, true),
          )).for("update");
        const entitlements = await tx.select({
          featureId: planEntitlements.featureId,
          accessMode: planEntitlements.accessMode,
          limitValue: planEntitlements.limitValue,
          configuration: planEntitlements.configuration,
        }).from(planEntitlements).where(eq(planEntitlements.subscriptionPlanId, plan.id));
        if (current.length > 0) {
          await tx.update(companySubscriptions).set({
            isCurrent: false,
            canceledAt: new Date(),
            version: sql`${companySubscriptions.version} + 1`,
          }).where(and(
            eq(companySubscriptions.companyId, company.id),
            eq(companySubscriptions.isCurrent, true),
          ));
        }
        const publicId = generatePublicId();
        await tx.insert(companySubscriptions).values({
          publicId,
          companyId: company.id,
          subscriptionPlanId: plan.id,
          planSnapshot: {
            publicId: plan.publicId,
            code: plan.code,
            name: plan.name,
            planVersion: plan.planVersion,
            currency: plan.currency,
            priceMonthly: plan.priceMonthly,
            priceYearly: plan.priceYearly,
            entitlements,
          },
          status: input.status,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          trialEndsAt: input.status === "trialing" ? input.trialEndsAt : null,
          graceEndsAt: input.status === "past_due" ? input.graceEndsAt : null,
          changedByPlatformAdministratorId: actor.platformAdminId,
        });
        const [updated] = await tx.update(companies).set({
          entitlementVersion: sql`${companies.entitlementVersion} + 1`,
          version: sql`${companies.version} + 1`,
        }).where(and(
          eq(companies.id, company.id),
          eq(companies.version, input.expectedCompanyVersion),
        ));
        if (affectedRows(updated) !== 1) versionConflict("Company");
        await appendPlatformAudit(tx, actor, {
          action: "subscription.assign",
          actionCategory: "billing",
          entityType: "company_subscription",
          entityId: publicId,
          companyId: company.id,
          before: current[0] ? { publicId: current[0].publicId, status: current[0].status } : null,
          after: { planPublicId: plan.publicId, status: input.status, periodStart: input.periodStart, periodEnd: input.periodEnd },
        });
        return { publicId, companyVersion: company.version + 1 };
      });
    });
  } catch (error) {
    rethrowPlatformWriteError(error);
  }
}

type MutableSubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "canceled";

const subscriptionTransitions: Record<MutableSubscriptionStatus | "expired", readonly MutableSubscriptionStatus[]> = {
  trialing: ["trialing", "active", "past_due", "suspended", "canceled"],
  active: ["active", "past_due", "suspended", "canceled"],
  past_due: ["past_due", "active", "suspended", "canceled"],
  suspended: ["suspended", "active", "canceled"],
  canceled: [],
  expired: [],
};

export async function updateSubscription(input: {
  publicId: string;
  status?: MutableSubscriptionStatus;
  periodStart?: Date;
  periodEnd?: Date;
  trialEndsAt?: Date | null;
  graceEndsAt?: Date | null;
  expectedVersion: number;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const [candidate] = await tx.select({
      id: companySubscriptions.id,
      companyId: companySubscriptions.companyId,
    }).from(companySubscriptions)
      .where(eq(companySubscriptions.publicId, input.publicId)).limit(1);
    if (!candidate) notFound("Subscription");
    const [company] = await tx.select().from(companies)
      .where(eq(companies.id, candidate.companyId)).limit(1).for("update");
    if (!company || company.deletedAt) notFound("Company");
    const [subscription] = await tx.select().from(companySubscriptions)
      .where(eq(companySubscriptions.id, candidate.id)).limit(1).for("update");
    if (!subscription) notFound("Subscription");
    if (!subscription.isCurrent) invalidLifecycle("Historical subscriptions are immutable");
    if (subscription.version !== input.expectedVersion) versionConflict("Subscription");
    const status = input.status ?? subscription.status;
    if (!subscriptionTransitions[subscription.status].includes(status as MutableSubscriptionStatus)) {
      invalidLifecycle(`Subscription cannot move from ${subscription.status} to ${status}`);
    }
    const periodStart = input.periodStart ?? subscription.periodStart;
    const periodEnd = input.periodEnd ?? subscription.periodEnd;
    if (periodEnd <= periodStart) invalidLifecycle("Subscription period end must follow start");
    const trialEndsAt = status === "trialing" ? input.trialEndsAt ?? subscription.trialEndsAt : null;
    const graceEndsAt = status === "past_due" ? input.graceEndsAt ?? subscription.graceEndsAt : null;
    if (status === "trialing" && (!trialEndsAt || trialEndsAt <= periodStart || trialEndsAt > periodEnd)) {
      invalidLifecycle("Trial subscriptions require a trial end within the subscription period");
    }
    if (status === "past_due" && (!graceEndsAt || graceEndsAt <= periodEnd)) {
      invalidLifecycle("Past-due subscriptions require a grace end after the subscription period");
    }
    const [result] = await tx.update(companySubscriptions).set({
      status,
      periodStart,
      periodEnd,
      trialEndsAt,
      graceEndsAt,
      canceledAt: status === "canceled" ? new Date() : null,
      changedByPlatformAdministratorId: actor.platformAdminId,
      version: sql`${companySubscriptions.version} + 1`,
    }).where(and(
      eq(companySubscriptions.id, subscription.id),
      eq(companySubscriptions.version, input.expectedVersion),
      eq(companySubscriptions.isCurrent, true),
    ));
    if (affectedRows(result) !== 1) versionConflict("Subscription");
    await tx.update(companies).set({
      entitlementVersion: sql`${companies.entitlementVersion} + 1`,
      version: sql`${companies.version} + 1`,
    }).where(eq(companies.id, company.id));
    await appendPlatformAudit(tx, actor, {
      action: status === "canceled" ? "subscription.cancel" : "subscription.update",
      actionCategory: "billing",
      entityType: "company_subscription",
      entityId: subscription.publicId,
      companyId: subscription.companyId,
      before: { status: subscription.status, periodStart: subscription.periodStart, periodEnd: subscription.periodEnd, trialEndsAt: subscription.trialEndsAt, graceEndsAt: subscription.graceEndsAt, version: subscription.version },
      after: { status, periodStart, periodEnd, trialEndsAt, graceEndsAt, version: subscription.version + 1 },
    });
    return { publicId: subscription.publicId, status, version: subscription.version + 1, companyVersion: company.version + 1 };
  });
}
