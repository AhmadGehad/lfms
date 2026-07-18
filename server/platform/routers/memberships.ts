import { z } from "zod";
import { cursorPageInputSchema } from "../../../shared/platformApi";
import { listMembershipRecords } from "../repositories/memberships";
import { inspectMembership, updateMembership } from "../services/memberships";
import { createPlatformInvitation, exportPlatformAccessCsv, listPlatformInvitations, revokePlatformInvitation } from "../../invitations/service";
import { platformAuditActor, platformMfaProcedure, platformPermissionProcedure, platformRouterFactory } from "../trpc";

const publicId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

export const platformMembershipsRouter = platformRouterFactory({
  list: platformPermissionProcedure("memberships.read").input(cursorPageInputSchema.extend({
    status: z.enum(["invited", "active", "suspended", "removed"]).optional(),
    companyPublicId: publicId.optional(),
  })).query(({ input }) => listMembershipRecords(input)),
  inspect: platformMfaProcedure("memberships.read").input(z.object({ publicId }))
    .mutation(({ input, ctx }) => inspectMembership(input.publicId, platformAuditActor(ctx))),
  exportCsv: platformMfaProcedure("memberships.read").input(z.object({
    search: z.string().trim().max(200).optional(),
    companyPublicId: publicId.optional(),
  })).mutation(({ input, ctx }) => exportPlatformAccessCsv(input, platformAuditActor(ctx))),
  invitations: platformRouterFactory({
    list: platformPermissionProcedure("memberships.read").input(cursorPageInputSchema.extend({
      status: z.enum(["pending", "accepted", "revoked", "expired"]).optional(),
      companyPublicId: publicId.optional(),
    })).query(({ input }) => listPlatformInvitations(input)),
    create: platformMfaProcedure("memberships.write").input(z.object({
      companyPublicId: publicId,
      email: z.string().trim().email().max(320),
      role: z.enum(["supervisor", "staff", "admin", "user", "viewer"]),
      farmAccessMode: z.enum(["all", "restricted"]),
      farmPublicIds: z.array(publicId).max(100).default([]),
      expiresInHours: z.number().int().min(1).max(168).default(72),
      idempotencyKey: z.string().min(8).max(200),
    })).mutation(({ input, ctx }) => createPlatformInvitation(input, platformAuditActor(ctx))),
    revoke: platformMfaProcedure("memberships.write").input(z.object({
      publicId,
      expectedVersion: z.number().int().positive(),
    })).mutation(({ input, ctx }) => revokePlatformInvitation(input, platformAuditActor(ctx))),
  }),
  update: platformMfaProcedure("memberships.write").input(z.object({
    publicId,
    role: z.enum(["owner", "supervisor", "staff", "admin", "user", "viewer"]).optional(),
    status: z.enum(["invited", "active", "suspended", "removed"]).optional(),
    farmAccessMode: z.enum(["all", "restricted"]).optional(),
    farmPublicIds: z.array(publicId).max(100).optional(),
    expectedVersion: z.number().int().positive(),
  })).mutation(({ input, ctx }) => updateMembership(input, platformAuditActor(ctx))),
});
