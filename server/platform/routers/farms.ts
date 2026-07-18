import { z } from "zod";
import { cursorPageInputSchema } from "../../../shared/platformApi";
import { listFarmRecords } from "../repositories/farms";
import { changeFarmStatus, createFarm, inspectFarm, updateFarm } from "../services/farms";
import { exportFarmsCsv } from "../services/resourceExport";
import { platformAuditActor, platformMfaProcedure, platformPermissionProcedure, platformRouterFactory } from "../trpc";

const publicId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

export const platformFarmsRouter = platformRouterFactory({
  list: platformPermissionProcedure("farms.read").input(cursorPageInputSchema.extend({
    status: z.enum(["active", "suspended", "archived"]).optional(),
    companyPublicId: publicId.optional(),
  })).query(({ input }) => listFarmRecords(input)),
  get: platformPermissionProcedure("farms.read").input(z.object({ publicId }))
    .query(({ input, ctx }) => inspectFarm(input.publicId, platformAuditActor(ctx))),
  create: platformMfaProcedure("farms.write").input(z.object({
    companyPublicId: publicId,
    name: z.string().trim().min(2).max(200),
    code: z.string().trim().min(1).max(40),
    timezone: z.string().trim().min(1).max(64).default("UTC"),
    idempotencyKey: z.string().min(8).max(200),
  })).mutation(({ input, ctx }) => createFarm(input, platformAuditActor(ctx))),
  changeStatus: platformMfaProcedure("farms.write").input(z.object({
    publicId,
    status: z.enum(["active", "suspended", "archived"]),
    expectedVersion: z.number().int().positive(),
  })).mutation(({ input, ctx }) => changeFarmStatus(input, platformAuditActor(ctx))),
  update: platformMfaProcedure("farms.write").input(z.object({
    publicId,
    name: z.string().trim().min(2).max(200).optional(),
    code: z.string().trim().min(1).max(40).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    expectedVersion: z.number().int().positive(),
  }).refine(value => value.name !== undefined || value.code !== undefined || value.timezone !== undefined || value.latitude !== undefined || value.longitude !== undefined, {
    message: "At least one farm field must change",
  })).mutation(({ input, ctx }) => updateFarm(input, platformAuditActor(ctx))),
  exportCsv: platformMfaProcedure("farms.read").input(z.object({
    search: z.string().trim().max(200).optional(),
    status: z.enum(["active", "suspended", "archived"]).optional(),
    companyPublicId: publicId.optional(),
  })).mutation(({ input, ctx }) => exportFarmsCsv(input, platformAuditActor(ctx))),
});
