import { z } from "zod";
import { cursorPageInputSchema } from "../../../shared/platformApi";
import { listAdministratorRecords, listPlatformRoleRecords } from "../repositories/administrators";
import { createPlatformAdministrator, updatePlatformAdministrator } from "../services/administrators";
import { platformAuditActor, platformMfaProcedure, platformPermissionProcedure, platformRouterFactory } from "../trpc";

const publicId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const roleCode = z.string().trim().min(2).max(100).regex(/^[a-z0-9_.-]+$/);

export const platformAdministratorsRouter = platformRouterFactory({
  list: platformPermissionProcedure("administrators.read").input(cursorPageInputSchema.extend({
    status: z.enum(["invited", "active", "suspended", "revoked"]).optional(),
  })).query(({ input }) => listAdministratorRecords(input)),
  roles: platformPermissionProcedure("administrators.read").query(listPlatformRoleRecords),
  create: platformMfaProcedure("administrators.write").input(z.object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320),
    oidcSubject: z.string().trim().min(1).max(255),
    status: z.enum(["invited", "active"]).default("invited"),
    roleCodes: z.array(roleCode).min(1).max(20),
    idempotencyKey: z.string().min(8).max(200),
  })).mutation(({ input, ctx }) => createPlatformAdministrator(input, platformAuditActor(ctx))),
  update: platformMfaProcedure("administrators.write").input(z.object({
    publicId,
    status: z.enum(["active", "suspended", "revoked"]).optional(),
    roleCodes: z.array(roleCode).min(1).max(20).optional(),
    expectedVersion: z.number().int().positive(),
  }).refine(value => value.status !== undefined || value.roleCodes !== undefined, {
    message: "At least one administrator change is required",
  })).mutation(({ input, ctx }) => updatePlatformAdministrator(input, platformAuditActor(ctx))),
});
