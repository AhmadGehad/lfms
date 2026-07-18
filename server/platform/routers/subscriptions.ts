import { z } from "zod";
import { cursorPageInputSchema } from "../../../shared/platformApi";
import { listSubscriptionRecords } from "../repositories/subscriptions";
import { assignSubscription, updateSubscription } from "../services/subscriptions";
import { platformAuditActor, platformMfaProcedure, platformPermissionProcedure, platformRouterFactory } from "../trpc";

const publicId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

export const platformSubscriptionsRouter = platformRouterFactory({
  list: platformPermissionProcedure("subscriptions.read").input(cursorPageInputSchema.extend({
    status: z.enum(["trialing", "active", "past_due", "suspended", "canceled", "expired"]).optional(),
    companyPublicId: publicId.optional(),
  })).query(({ input }) => listSubscriptionRecords(input)),
  assign: platformMfaProcedure("subscriptions.write").input(z.object({
    companyPublicId: publicId,
    planPublicId: publicId,
    status: z.enum(["trialing", "active", "past_due", "suspended"]),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    trialEndsAt: z.coerce.date().nullable().optional(),
    graceEndsAt: z.coerce.date().nullable().optional(),
    expectedCompanyVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })).mutation(({ input, ctx }) => assignSubscription(input, platformAuditActor(ctx))),
  update: platformMfaProcedure("subscriptions.write").input(z.object({
    publicId,
    status: z.enum(["trialing", "active", "past_due", "suspended", "canceled"]).optional(),
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
    trialEndsAt: z.coerce.date().nullable().optional(),
    graceEndsAt: z.coerce.date().nullable().optional(),
    expectedVersion: z.number().int().positive(),
  }).refine(value => value.status !== undefined || value.periodStart !== undefined || value.periodEnd !== undefined || value.trialEndsAt !== undefined || value.graceEndsAt !== undefined, {
    message: "At least one subscription field must change",
  })).mutation(({ input, ctx }) => updateSubscription(input, platformAuditActor(ctx))),
});
