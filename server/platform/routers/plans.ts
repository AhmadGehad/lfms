import { z } from "zod";
import { cursorPageInputSchema } from "../../../shared/platformApi";
import { listPlanRecords } from "../repositories/plans";
import { createPlan, publishPlan, retirePlan, updateDraftPlan } from "../services/plans";
import { platformAuditActor, platformMfaProcedure, platformPermissionProcedure, platformRouterFactory } from "../trpc";

const publicId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

export const platformPlansRouter = platformRouterFactory({
  list: platformPermissionProcedure("plans.read").input(cursorPageInputSchema.extend({
    status: z.enum(["draft", "active", "retired"]).optional(),
  })).query(({ input }) => listPlanRecords(input)),
  create: platformMfaProcedure("plans.write").input(z.object({
    code: z.string().trim().min(2).max(80).regex(/^[a-z0-9_]+$/),
    name: z.string().trim().min(2).max(150),
    description: z.string().trim().max(2_000).optional(),
    priceMonthly: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
    priceYearly: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
    currency: z.string().length(3),
    idempotencyKey: z.string().min(8).max(200),
    entitlements: z.array(z.object({
      featurePublicId: publicId,
      accessMode: z.enum(["enabled", "read_only", "disabled"]),
      limitValue: z.number().int().nonnegative().nullable().optional(),
    })).min(1).max(100),
  })).mutation(({ input, ctx }) => createPlan(input, platformAuditActor(ctx))),
  updateDraft: platformMfaProcedure("plans.write").input(z.object({
    publicId,
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(2).max(150).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    priceMonthly: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/).optional(),
    priceYearly: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/).optional(),
    currency: z.string().length(3).optional(),
    entitlements: z.array(z.object({
      featurePublicId: publicId,
      accessMode: z.enum(["enabled", "read_only", "disabled"]),
      limitValue: z.number().int().nonnegative().nullable().optional(),
    })).min(1).max(100).optional(),
  }).refine(value => value.name !== undefined || value.description !== undefined || value.priceMonthly !== undefined || value.priceYearly !== undefined || value.currency !== undefined || value.entitlements !== undefined, {
    message: "At least one plan field must change",
  })).mutation(({ input, ctx }) => updateDraftPlan(input, platformAuditActor(ctx))),
  publish: platformMfaProcedure("plans.write").input(z.object({ publicId, expectedVersion: z.number().int().positive() })).mutation(({ input, ctx }) => publishPlan(input.publicId, input.expectedVersion, platformAuditActor(ctx))),
  retire: platformMfaProcedure("plans.write").input(z.object({ publicId, expectedVersion: z.number().int().positive() })).mutation(({ input, ctx }) => retirePlan(input.publicId, input.expectedVersion, platformAuditActor(ctx))),
});
