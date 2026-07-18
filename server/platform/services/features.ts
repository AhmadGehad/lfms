import { and, eq, sql } from "drizzle-orm";
import { companies, companyFeatureOverrides } from "../../../drizzle/schema";
import { generatePublicId } from "../../tenancy/publicIds";
import { notFound, versionConflict } from "../errors";
import { appendPlatformAudit, type PlatformAuditActor } from "../repositories/audit";
import { affectedRows, requirePlatformDb } from "../repositories/db";
import { findFeatureByPublicId } from "../repositories/features";
import { rethrowPlatformWriteError } from "./errors";

export async function setCompanyFeatureOverride(input: {
  companyPublicId: string;
  featurePublicId: string;
  expectedEntitlementVersion: number;
  accessMode?: "enabled" | "read_only" | "disabled" | null;
  limitValue?: number | null;
  reason: string;
  expiresAt?: Date | null;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  try {
    return await db.transaction(async tx => {
      const [company] = await tx.select().from(companies)
        .where(eq(companies.publicId, input.companyPublicId)).limit(1).for("update");
      const feature = await findFeatureByPublicId(input.featurePublicId, tx);
      if (!company || company.deletedAt) notFound("Company");
      if (!feature) notFound("Feature");
      if (company.entitlementVersion !== input.expectedEntitlementVersion) {
        versionConflict("Company entitlements");
      }

      const [current] = await tx.select().from(companyFeatureOverrides)
        .where(and(
          eq(companyFeatureOverrides.companyId, company.id),
          eq(companyFeatureOverrides.featureId, feature.id),
          eq(companyFeatureOverrides.isCurrent, true),
        )).limit(1).for("update");
      if (current) {
        await tx.update(companyFeatureOverrides).set({
          isCurrent: false,
          revokedAt: new Date(),
          revokedByPlatformAdministratorId: actor.platformAdminId,
          version: sql`${companyFeatureOverrides.version} + 1`,
        }).where(eq(companyFeatureOverrides.id, current.id));
      }

      const publicId = generatePublicId();
      await tx.insert(companyFeatureOverrides).values({
        publicId,
        companyId: company.id,
        featureId: feature.id,
        accessMode: input.accessMode,
        limitValue: input.limitValue,
        reason: input.reason.trim(),
        expiresAt: input.expiresAt,
        createdByPlatformAdministratorId: actor.platformAdminId,
      });
      const [companyUpdate] = await tx.update(companies).set({
        entitlementVersion: sql`${companies.entitlementVersion} + 1`,
      }).where(and(
        eq(companies.id, company.id),
        eq(companies.entitlementVersion, input.expectedEntitlementVersion),
      ));
      if (affectedRows(companyUpdate) !== 1) versionConflict("Company entitlements");
      await appendPlatformAudit(tx, actor, {
        action: "feature.override",
        actionCategory: "billing",
        entityType: "company_feature_override",
        entityId: publicId,
        companyId: company.id,
        before: current ? { accessMode: current.accessMode, limitValue: current.limitValue, expiresAt: current.expiresAt } : null,
        after: { featureCode: feature.code, accessMode: input.accessMode, limitValue: input.limitValue, expiresAt: input.expiresAt, reason: input.reason, entitlementVersion: input.expectedEntitlementVersion + 1 },
      });
      return { publicId, entitlementVersion: input.expectedEntitlementVersion + 1 };
    });
  } catch (error) {
    rethrowPlatformWriteError(error);
  }
}
