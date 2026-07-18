import { z } from "zod";
import { SUPPORT_SCOPES } from "../../../shared/tenancy";
import { cursorPageInputSchema } from "../../../shared/platformApi";
import { listSupportGrants } from "../repositories/support";
import { approveSupportAccess, inspectTenant, requestSupportAccess, revokeSupportAccess } from "../services/support";
import { platformAuditActor, platformMfaProcedure, platformPermissionProcedure, platformRouterFactory } from "../trpc";

const publicId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

export const platformSupportRouter = platformRouterFactory({
  list: platformPermissionProcedure("support.access").input(cursorPageInputSchema.extend({
    status: z.enum(["pending", "approved", "active", "expired", "revoked", "rejected"]).optional(),
    companyPublicId: publicId.optional(),
  })).query(({ input }) => listSupportGrants(input)),
  request: platformMfaProcedure("support.request").input(z.object({
    companyPublicId: publicId,
    accessMode: z.enum(["read_only", "write"]),
    allowedScopes: z.array(z.enum(SUPPORT_SCOPES)).min(1).max(SUPPORT_SCOPES.length),
    reason: z.string().trim().min(10).max(1_000),
    ticketReference: z.string().trim().min(2).max(150),
    durationMinutes: z.number().int().min(5).max(30).default(30),
  })).mutation(({ input, ctx }) => requestSupportAccess(input, platformAuditActor(ctx))),
  approve: platformMfaProcedure("support.approve").input(z.object({
    publicId,
    decision: z.enum(["approved", "rejected"]),
    notes: z.string().trim().max(1_000).optional(),
    expectedVersion: z.number().int().positive(),
  })).mutation(({ input, ctx }) => approveSupportAccess(input, platformAuditActor(ctx))),
  revoke: platformMfaProcedure("support.access").input(z.object({
    publicId,
    expectedVersion: z.number().int().positive(),
  })).mutation(({ input, ctx }) => revokeSupportAccess(input, platformAuditActor(ctx))),
  inspect: platformMfaProcedure("support.access").input(z.object({
    publicId,
    scope: z.enum(SUPPORT_SCOPES),
  })).mutation(({ input, ctx }) => inspectTenant(input, platformAuditActor(ctx))),
});
