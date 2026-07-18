import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { featureCatalog, planEntitlements, subscriptionPlans } from "../../../drizzle/schema";
import { generatePublicId } from "../../tenancy/publicIds";
import { invalidLifecycle, notFound, versionConflict } from "../errors";
import { appendPlatformAudit, type PlatformAuditActor } from "../repositories/audit";
import { affectedRows, requirePlatformDb } from "../repositories/db";
import { rethrowPlatformWriteError } from "./errors";
import { executeIdempotent } from "../idempotency";

export async function createPlan(input: {
  code: string;
  name: string;
  description?: string;
  priceMonthly: string;
  priceYearly: string;
  currency: string;
  idempotencyKey: string;
  entitlements: Array<{
    featurePublicId: string;
    accessMode: "enabled" | "read_only" | "disabled";
    limitValue?: number | null;
  }>;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  try {
    return await db.transaction(async tx => {
      return executeIdempotent(tx, {
        companyId: null,
        userId: actor.userId,
        key: input.idempotencyKey,
        operation: "platform.plans.create",
        body: { ...input, idempotencyKey: undefined },
      }, async () => {
      const publicId = generatePublicId();
      const [existing] = await tx.select({ latestVersion: subscriptionPlans.planVersion })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.code, input.code.trim().toLowerCase()))
        .orderBy(desc(subscriptionPlans.planVersion))
        .limit(1)
        .for("update");
      const planVersion = (existing?.latestVersion ?? 0) + 1;
      const [inserted] = await tx.insert(subscriptionPlans).values({
        publicId,
        code: input.code.trim().toLowerCase(),
        name: input.name.trim(),
        description: input.description?.trim(),
        planVersion,
        status: "draft",
        priceMonthly: input.priceMonthly,
        priceYearly: input.priceYearly,
        currency: input.currency.toUpperCase(),
        createdByPlatformAdministratorId: actor.platformAdminId,
      });
      const planId = Number(inserted.insertId);

      for (const entitlement of input.entitlements) {
        const [feature] = await tx.select({ id: featureCatalog.id }).from(featureCatalog)
          .where(eq(featureCatalog.publicId, entitlement.featurePublicId)).limit(1);
        if (!feature) notFound("Feature");
        await tx.insert(planEntitlements).values({
          subscriptionPlanId: planId,
          featureId: feature.id,
          accessMode: entitlement.accessMode,
          limitValue: entitlement.limitValue,
        });
      }

      await appendPlatformAudit(tx, actor, {
        action: "plan.create",
        actionCategory: "billing",
        entityType: "subscription_plan",
        entityId: publicId,
        after: { code: input.code, name: input.name, planVersion, status: "draft", entitlementCount: input.entitlements.length },
      });
      return { publicId, planVersion, status: "draft" as const };
      });
    });
  } catch (error) {
    rethrowPlatformWriteError(error);
  }
}

export async function updateDraftPlan(input: {
  publicId: string;
  expectedVersion: number;
  name?: string;
  description?: string | null;
  priceMonthly?: string;
  priceYearly?: string;
  currency?: string;
  entitlements?: Array<{
    featurePublicId: string;
    accessMode: "enabled" | "read_only" | "disabled";
    limitValue?: number | null;
  }>;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  try {
    return await db.transaction(async tx => {
      const [plan] = await tx.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.publicId, input.publicId)).limit(1).for("update");
      if (!plan) notFound("Plan");
      if (plan.status === "retired") invalidLifecycle("Retired plans cannot be edited");
      if (plan.status === "active" && input.entitlements !== undefined) {
        invalidLifecycle("Active plan features are immutable; only pricing and display details can change");
      }
      if (plan.version !== input.expectedVersion) versionConflict("Plan");
      let resolvedEntitlements: Array<{ featureId: number; accessMode: "enabled" | "read_only" | "disabled"; limitValue?: number | null }> | undefined;
      if (input.entitlements) {
        const distinctIds = [...new Set(input.entitlements.map(item => item.featurePublicId))];
        if (distinctIds.length !== input.entitlements.length) invalidLifecycle("Plan features must be unique");
        const features = await tx.select({ id: featureCatalog.id, publicId: featureCatalog.publicId })
          .from(featureCatalog).where(inArray(featureCatalog.publicId, distinctIds));
        if (features.length !== distinctIds.length) notFound("Feature");
        const ids = new Map(features.map(feature => [feature.publicId, feature.id]));
        resolvedEntitlements = input.entitlements.map(item => ({
          featureId: ids.get(item.featurePublicId)!,
          accessMode: item.accessMode,
          limitValue: item.limitValue,
        }));
      }
      const [result] = await tx.update(subscriptionPlans).set({
        name: input.name?.trim(),
        description: input.description === undefined ? undefined : input.description?.trim() || null,
        priceMonthly: input.priceMonthly,
        priceYearly: input.priceYearly,
        currency: input.currency?.toUpperCase(),
        version: sql`${subscriptionPlans.version} + 1`,
      }).where(and(
        eq(subscriptionPlans.id, plan.id),
        inArray(subscriptionPlans.status, ["draft", "active"]),
        eq(subscriptionPlans.version, input.expectedVersion),
      ));
      if (affectedRows(result) !== 1) versionConflict("Plan");
      if (resolvedEntitlements) {
        await tx.delete(planEntitlements).where(eq(planEntitlements.subscriptionPlanId, plan.id));
        await tx.insert(planEntitlements).values(resolvedEntitlements.map(item => ({
          subscriptionPlanId: plan.id,
          ...item,
        })));
      }
      await appendPlatformAudit(tx, actor, {
        action: "plan.update",
        actionCategory: "billing",
        entityType: "subscription_plan",
        entityId: plan.publicId,
        before: { name: plan.name, description: plan.description, priceMonthly: plan.priceMonthly, priceYearly: plan.priceYearly, currency: plan.currency, version: plan.version },
        after: { name: input.name ?? plan.name, description: input.description === undefined ? plan.description : input.description, priceMonthly: input.priceMonthly ?? plan.priceMonthly, priceYearly: input.priceYearly ?? plan.priceYearly, currency: input.currency?.toUpperCase() ?? plan.currency, entitlementCount: resolvedEntitlements?.length, version: plan.version + 1 },
      });
      return { publicId: plan.publicId, version: plan.version + 1 };
    });
  } catch (error) {
    rethrowPlatformWriteError(error);
  }
}

export async function publishPlan(publicId: string, expectedVersion: number, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const [plan] = await tx.select().from(subscriptionPlans)
      .where(eq(subscriptionPlans.publicId, publicId))
      .limit(1)
      .for("update");
    if (!plan) notFound("Plan");
    if (plan.status !== "draft") invalidLifecycle("Only draft plans can be published");
    if (plan.version !== expectedVersion) versionConflict("Plan");
    const [entitlement] = await tx.select({ id: planEntitlements.id }).from(planEntitlements)
      .where(eq(planEntitlements.subscriptionPlanId, plan.id)).limit(1);
    if (!entitlement) invalidLifecycle("A plan needs at least one entitlement before publication");
    const [result] = await tx.update(subscriptionPlans).set({
      status: "active",
      publishedAt: new Date(),
      version: sql`${subscriptionPlans.version} + 1`,
    }).where(and(
      eq(subscriptionPlans.id, plan.id),
      eq(subscriptionPlans.status, "draft"),
      eq(subscriptionPlans.version, expectedVersion),
    ));
    if (affectedRows(result) !== 1) versionConflict("Plan");
    await appendPlatformAudit(tx, actor, {
      action: "plan.publish",
      actionCategory: "billing",
      entityType: "subscription_plan",
      entityId: plan.publicId,
      before: { status: "draft", version: plan.version },
      after: { status: "active", version: plan.version + 1 },
    });
    return { publicId: plan.publicId, status: "active" as const };
  });
}

export async function retirePlan(publicId: string, expectedVersion: number, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const [plan] = await tx.select().from(subscriptionPlans)
      .where(eq(subscriptionPlans.publicId, publicId)).limit(1).for("update");
    if (!plan) notFound("Plan");
    if (plan.status !== "active") invalidLifecycle("Only active plans can be retired");
    if (plan.version !== expectedVersion) versionConflict("Plan");
    const [result] = await tx.update(subscriptionPlans).set({
      status: "retired",
      version: sql`${subscriptionPlans.version} + 1`,
    }).where(and(
      eq(subscriptionPlans.id, plan.id),
      eq(subscriptionPlans.status, "active"),
      eq(subscriptionPlans.version, expectedVersion),
    ));
    if (affectedRows(result) !== 1) versionConflict("Plan");
    await appendPlatformAudit(tx, actor, {
      action: "plan.retire",
      actionCategory: "billing",
      entityType: "subscription_plan",
      entityId: plan.publicId,
      before: { status: plan.status, version: plan.version },
      after: { status: "retired", version: plan.version + 1 },
    });
    return { publicId: plan.publicId, status: "retired" as const, version: plan.version + 1 };
  });
}
