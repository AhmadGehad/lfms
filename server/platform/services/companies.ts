import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { companies, companyMemberships, companySubscriptions, farms, planEntitlements, subscriptionPlans, tenantRestoreJobs, users } from "../../../drizzle/schema";
import { generatePublicId } from "../../tenancy/publicIds";
import { invalidLifecycle, notFound, versionConflict } from "../errors";
import { executeIdempotent } from "../idempotency";
import { appendPlatformAudit, type PlatformAuditActor } from "../repositories/audit";
import { insertCompany } from "../repositories/companies";
import { affectedRows, requirePlatformDb } from "../repositories/db";
import { findPlanByPublicId } from "../repositories/plans";
import { rethrowPlatformWriteError } from "./errors";
import { insertPlatformInvitation } from "../../invitations/service";

type Lifecycle = typeof companies.$inferSelect.lifecycleStatus;
const transitions: Record<Lifecycle, readonly Lifecycle[]> = {
  provisioning: ["active", "suspended"],
  active: ["suspended"],
  suspended: ["active"],
  deletion_requested: [],
  purging: [],
  deleted: [],
};

export async function createCompany(input: {
  name: string;
  slug: string;
  initialFarmName: string;
  initialFarmCode: string;
  ownerEmail: string;
  planPublicId?: string;
  idempotencyKey: string;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  let issuedOwnerInvitationCredential: string | null = null;
  try {
    const response = await db.transaction(async tx => {
      const companyName = input.name.trim();
      const companySlug = input.slug.trim().toLowerCase();
      const farmName = input.initialFarmName.trim();
      const farmCode = input.initialFarmCode.trim().toUpperCase();
      const ownerEmail = input.ownerEmail.trim();
      const normalizedEmail = ownerEmail.toLowerCase();
      return executeIdempotent(tx, {
        companyId: null,
        userId: actor.userId,
        key: input.idempotencyKey,
        operation: "platform.companies.create",
        body: {
          name: companyName,
          slug: companySlug,
          initialFarmName: farmName,
          initialFarmCode: farmCode,
          ownerEmail: normalizedEmail,
          planPublicId: input.planPublicId,
        },
      }, async () => {
      const publicId = generatePublicId();
      const companyId = await insertCompany(tx, {
        publicId,
        name: companyName,
        slug: companySlug,
        lifecycleStatus: "provisioning",
      });

      const initialFarmPublicId = generatePublicId();
      await tx.insert(farms).values({
        publicId: initialFarmPublicId,
        companyId,
        name: farmName,
        code: farmCode,
        status: "active",
        createdByMembershipId: null,
      });

      const ownerInvitation = await insertPlatformInvitation(tx, {
        companyId,
        companyPublicId: publicId,
        companySlug,
        normalizedEmail,
        provider: "manus",
        role: "owner",
        farmAccessMode: "all",
        farmPublicIds: [],
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1_000),
      }, actor);
      issuedOwnerInvitationCredential = ownerInvitation.token;

      if (input.planPublicId) {
        const plan = await findPlanByPublicId(input.planPublicId, tx);
        if (!plan || plan.status !== "active") invalidLifecycle("Only active plans can be assigned");
        const entitlements = await tx.select({
          featureId: planEntitlements.featureId,
          accessMode: planEntitlements.accessMode,
          limitValue: planEntitlements.limitValue,
          configuration: planEntitlements.configuration,
        }).from(planEntitlements).where(eq(planEntitlements.subscriptionPlanId, plan.id));
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
        await tx.insert(companySubscriptions).values({
          publicId: generatePublicId(),
          companyId,
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
          status: "trialing",
          periodStart: now,
          periodEnd,
          trialEndsAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1_000),
          changedByPlatformAdministratorId: actor.platformAdminId,
        });
      }

      await appendPlatformAudit(tx, actor, {
        action: "company.create",
        actionCategory: "company",
        entityType: "company",
        entityId: publicId,
        companyId,
        after: {
          name: companyName,
          slug: companySlug,
          status: "provisioning",
          initialFarmPublicId,
          ownerInvitationPublicId: ownerInvitation.publicId,
        },
      });
      return {
        publicId,
        status: "provisioning" as const,
        initialFarmPublicId,
        ownerInvitationPublicId: ownerInvitation.publicId,
        ownerInvitationExpiresAt: ownerInvitation.expiresAt,
      };
      });
    });
    return { ...response, ownerInvitationToken: issuedOwnerInvitationCredential };
  } catch (error) {
    rethrowPlatformWriteError(error);
  }
}

export async function changeCompanyLifecycle(input: {
  publicId: string;
  status: Lifecycle;
  expectedVersion: number;
  reason?: string;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const [company] = await tx.select().from(companies)
      .where(eq(companies.publicId, input.publicId))
      .for("update");
    if (!company || company.deletedAt) notFound("Company");
    if (!transitions[company.lifecycleStatus].includes(input.status)) {
      invalidLifecycle(`Company cannot move from ${company.lifecycleStatus} to ${input.status}`);
    }
    if (input.status === "suspended" && !input.reason?.trim()) {
      invalidLifecycle("A suspension reason is required");
    }
    if (input.status === "active") {
      const now = new Date();
      const [owner] = await tx.select({ id: companyMemberships.id })
        .from(companyMemberships)
        .innerJoin(users, eq(companyMemberships.userId, users.id))
        .where(and(
          eq(companyMemberships.companyId, company.id),
          eq(companyMemberships.role, "owner"),
          eq(companyMemberships.status, "active"),
          eq(users.status, "active"),
        ))
        .limit(1)
        .for("update");
      const [farm] = await tx.select({ id: farms.id }).from(farms).where(and(
        eq(farms.companyId, company.id),
        eq(farms.status, "active"),
        isNull(farms.deletedAt),
      )).limit(1).for("update");
      const [subscription] = await tx.select({ id: companySubscriptions.id }).from(companySubscriptions).where(and(
        eq(companySubscriptions.companyId, company.id),
        eq(companySubscriptions.isCurrent, true),
        or(
          and(eq(companySubscriptions.status, "trialing"), gt(companySubscriptions.trialEndsAt, now)),
          and(eq(companySubscriptions.status, "active"), gt(companySubscriptions.periodEnd, now)),
          and(eq(companySubscriptions.status, "past_due"), gt(companySubscriptions.graceEndsAt, now)),
        ),
      )).limit(1).for("update");
      const [activeRestore] = await tx.select({ id: tenantRestoreJobs.id }).from(tenantRestoreJobs).where(and(
        eq(tenantRestoreJobs.companyId, company.id),
        or(
          eq(tenantRestoreJobs.status, "pending"),
          eq(tenantRestoreJobs.status, "validating"),
          eq(tenantRestoreJobs.status, "ready"),
          eq(tenantRestoreJobs.status, "restoring"),
          eq(tenantRestoreJobs.status, "failed"),
        ),
      )).limit(1).for("update");
      if (activeRestore) invalidLifecycle("Activation is blocked while a tenant restore is active");
      if (!owner || !farm || !subscription) {
        invalidLifecycle("Activation requires an active owner, farm, and nonexpired subscription");
      }
    }
    const [result] = await tx.update(companies).set({
      lifecycleStatus: input.status,
      suspendedAt: input.status === "suspended" ? new Date() : null,
      suspendedReason: input.status === "suspended" ? input.reason!.trim() : null,
      version: sql`${companies.version} + 1`,
    }).where(and(eq(companies.id, company.id), eq(companies.version, input.expectedVersion)));
    if (affectedRows(result) !== 1) versionConflict("Company");
    await appendPlatformAudit(tx, actor, {
      action: `company.${input.status}`,
      actionCategory: "company",
      entityType: "company",
      entityId: company.publicId,
      companyId: company.id,
      before: { status: company.lifecycleStatus, version: company.version },
      after: { status: input.status, version: company.version + 1, reason: input.reason },
    });
    return { publicId: company.publicId, status: input.status, version: company.version + 1 };
  });
}
