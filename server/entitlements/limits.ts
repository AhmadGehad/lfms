import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNotNull, isNull, lte, or } from "drizzle-orm";
import {
  companies,
  companyFeatureOverrides,
  companySubscriptions,
  featureCatalog,
  planEntitlements,
} from "../../drizzle/schema";
import type { DbOrTx } from "../db";
import { TENANCY_ERROR_CODES } from "../../shared/tenancy";

export async function lockCompanyQuota(db: DbOrTx, companyId: number) {
  const [company] = await db.select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)
    .for("update");
  if (!company) throw new Error("COMPANY_UNAVAILABLE");
}

export async function getEffectiveLimit(
  db: DbOrTx,
  companyId: number,
  featureCode: string,
  now = new Date(),
) {
  const [subscription] = await db.select({ planId: companySubscriptions.subscriptionPlanId })
    .from(companySubscriptions)
    .where(and(
      eq(companySubscriptions.companyId, companyId),
      eq(companySubscriptions.isCurrent, true),
      lte(companySubscriptions.periodStart, now),
      or(
        and(
          eq(companySubscriptions.status, "trialing"),
          gt(companySubscriptions.periodEnd, now),
          isNotNull(companySubscriptions.trialEndsAt),
          gt(companySubscriptions.trialEndsAt, now),
        ),
        and(eq(companySubscriptions.status, "active"), gt(companySubscriptions.periodEnd, now)),
        and(
          eq(companySubscriptions.status, "past_due"),
          isNotNull(companySubscriptions.graceEndsAt),
          gt(companySubscriptions.graceEndsAt, now),
        ),
      ),
    ))
    .limit(1);
  if (!subscription) return 0;

  const [base] = await db.select({ limitValue: planEntitlements.limitValue })
    .from(planEntitlements)
    .innerJoin(featureCatalog, eq(planEntitlements.featureId, featureCatalog.id))
    .where(and(
      eq(planEntitlements.subscriptionPlanId, subscription.planId),
      eq(featureCatalog.code, featureCode),
    ))
    .limit(1);
  const [override] = await db.select({ limitValue: companyFeatureOverrides.limitValue })
    .from(companyFeatureOverrides)
    .innerJoin(featureCatalog, eq(companyFeatureOverrides.featureId, featureCatalog.id))
    .where(and(
      eq(companyFeatureOverrides.companyId, companyId),
      eq(companyFeatureOverrides.isCurrent, true),
      eq(featureCatalog.code, featureCode),
      lte(companyFeatureOverrides.startsAt, now),
      or(isNull(companyFeatureOverrides.expiresAt), gt(companyFeatureOverrides.expiresAt, now)),
    ))
    .limit(1);
  if (override?.limitValue !== null && override?.limitValue !== undefined) {
    return override.limitValue;
  }
  return base ? base.limitValue : 0;
}

export function assertWithinLimit(
  current: number,
  increment: number,
  limit: number | null,
  resource: string,
) {
  if (limit !== null && current + increment > limit) {
    // TRPCError so quota violations surface as 403 instead of a generic 500.
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${TENANCY_ERROR_CODES.quotaExceeded}: ${resource}`,
    });
  }
}
