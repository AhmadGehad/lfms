import { z } from "zod";
import { cursorPageInputSchema } from "../../../shared/platformApi";
import { SESSION_IDLE_TIMEOUT_MINUTES_OPTIONS } from "../../tenancy/companySettings";
import { listCompanyRecords } from "../repositories/companies";
import { changeCompanyLifecycle, createCompany } from "../services/companies";
import { inspectCompany, updateCompany, updateCompanySessionTimeout } from "../services/companyManagement";
import { exportCompaniesCsv } from "../services/resourceExport";
import { platformAuditActor, platformMfaProcedure, platformPermissionProcedure, platformRouterFactory } from "../trpc";

const publicId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const statuses = z.enum(["provisioning", "active", "suspended", "deletion_requested", "purging", "deleted"]);
const mutableStatuses = z.enum(["active", "suspended"]);

export const platformCompaniesRouter = platformRouterFactory({
  list: platformPermissionProcedure("companies.read").input(cursorPageInputSchema.extend({
    status: statuses.optional(),
  })).query(({ input }) => listCompanyRecords(input)),
  get: platformPermissionProcedure("companies.read").input(z.object({ publicId }))
    .query(({ input, ctx }) => inspectCompany(input.publicId, platformAuditActor(ctx))),
  create: platformMfaProcedure("companies.write").input(z.object({
    name: z.string().trim().min(2).max(200),
    slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    initialFarmName: z.string().trim().min(2).max(200),
    initialFarmCode: z.string().trim().min(1).max(40),
    ownerEmail: z.string().trim().email().max(320),
    planPublicId: publicId.optional(),
    idempotencyKey: z.string().min(8).max(200),
  })).mutation(({ input, ctx }) => createCompany(input, platformAuditActor(ctx))),
  changeStatus: platformMfaProcedure("companies.write").input(z.object({
    publicId,
    status: mutableStatuses,
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(5).max(1_000).optional(),
  })).mutation(({ input, ctx }) => changeCompanyLifecycle(input, platformAuditActor(ctx))),
  update: platformMfaProcedure("companies.write").input(z.object({
    publicId,
    name: z.string().trim().min(2).max(200).optional(),
    slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
    expectedVersion: z.number().int().positive(),
  }).refine(value => value.name !== undefined || value.slug !== undefined, {
    message: "At least one company field must change",
  })).mutation(({ input, ctx }) => updateCompany(input, platformAuditActor(ctx))),
  updateSessionTimeout: platformMfaProcedure("companies.write").input(z.object({
    publicId,
    sessionIdleTimeoutMinutes: z.number().refine(
      (value): value is typeof SESSION_IDLE_TIMEOUT_MINUTES_OPTIONS[number] =>
        (SESSION_IDLE_TIMEOUT_MINUTES_OPTIONS as readonly number[]).includes(value),
      { message: "Unsupported session idle timeout" },
    ),
    expectedVersion: z.number().int().positive(),
  })).mutation(({ input, ctx }) => updateCompanySessionTimeout(
    input as typeof input & { sessionIdleTimeoutMinutes: typeof SESSION_IDLE_TIMEOUT_MINUTES_OPTIONS[number] },
    platformAuditActor(ctx),
  )),
  exportCsv: platformMfaProcedure("companies.read").input(z.object({
    search: z.string().trim().max(200).optional(),
    status: statuses.optional(),
  })).mutation(({ input, ctx }) => exportCompaniesCsv(input, platformAuditActor(ctx))),
});
