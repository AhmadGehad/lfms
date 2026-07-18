import { z } from "zod";
import { cursorPageInputSchema } from "../../../shared/platformApi";
import { listFeatureRecords } from "../repositories/features";
import { setCompanyFeatureOverride } from "../services/features";
import { platformAuditActor, platformMfaProcedure, platformPermissionProcedure, platformRouterFactory } from "../trpc";

const publicId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

export const platformFeaturesRouter = platformRouterFactory({
  list: platformPermissionProcedure("entitlements.read").input(cursorPageInputSchema.extend({
    status: z.enum(["active", "deprecated"]).optional(),
  })).query(({ input }) => listFeatureRecords(input)),
  setOverride: platformMfaProcedure("entitlements.write").input(z.object({
    companyPublicId: publicId,
    featurePublicId: publicId,
    expectedEntitlementVersion: z.number().int().positive(),
    accessMode: z.enum(["enabled", "read_only", "disabled"]).nullable().optional(),
    limitValue: z.number().int().nonnegative().nullable().optional(),
    reason: z.string().trim().min(5).max(1_000),
    expiresAt: z.coerce.date().nullable().optional(),
  }).refine(value => value.accessMode !== undefined || value.limitValue !== undefined, {
    message: "An access or limit override is required",
  })).mutation(({ input, ctx }) => setCompanyFeatureOverride(input, platformAuditActor(ctx))),
});
