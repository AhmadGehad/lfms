import { z } from "zod";
import { cursorPageInputSchema } from "../../../shared/platformApi";
import {
  listDeletionRecords,
  listExportRecords,
  listRestoreRecords,
} from "../repositories/lifecycle";
import {
  approveCompanyDeletion,
  approveTenantRestore,
  cancelCompanyDeletion,
  cancelDataExport,
  cancelTenantRestore,
  MAX_DELETION_RETENTION_DAYS,
  MIN_DELETION_RETENTION_DAYS,
  requestCompanyDeletion,
  requestDataExport,
  requestTenantRestore,
  requestDataExportDownload,
} from "../services/lifecycle";
import {
  platformAuditActor,
  platformMfaProcedure,
  platformPermissionProcedure,
  platformRouterFactory,
} from "../trpc";

const publicId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const idempotencyKey = z.string().trim().min(8).max(200);

export const platformLifecycleRouter = platformRouterFactory({
  exports: platformRouterFactory({
    list: platformPermissionProcedure("exports.read").input(cursorPageInputSchema.extend({
      companyPublicId: publicId.optional(),
      status: z.enum(["pending", "processing", "completed", "failed", "expired", "canceled"]).optional(),
    })).query(({ input }) => listExportRecords(input)),
    request: platformMfaProcedure("exports.create").input(z.object({
      companyPublicId: publicId,
      exportType: z.enum(["tenant_full_backup", "tenant_operational_report"]),
      expiresInDays: z.number().int().min(1).max(90).default(30),
      idempotencyKey,
    })).mutation(({ input, ctx }) => requestDataExport(input, platformAuditActor(ctx))),
    cancel: platformMfaProcedure("exports.create").input(z.object({
      publicId,
      expectedVersion: z.number().int().positive(),
    })).mutation(({ input, ctx }) => cancelDataExport(input, platformAuditActor(ctx))),
    download: platformMfaProcedure("exports.create").input(z.object({
      publicId,
    })).mutation(({ input, ctx }) => requestDataExportDownload(input, platformAuditActor(ctx))),
  }),
  deletions: platformRouterFactory({
    list: platformPermissionProcedure("operations.read").input(cursorPageInputSchema.extend({
      companyPublicId: publicId.optional(),
      status: z.enum(["requested", "exported", "legal_hold", "approved", "purging", "completed", "canceled"]).optional(),
    })).query(({ input }) => listDeletionRecords(input)),
    request: platformMfaProcedure("operations.write").input(z.object({
      companyPublicId: publicId,
      reason: z.string().trim().min(10).max(2_000),
      retentionDays: z.number().int().min(MIN_DELETION_RETENTION_DAYS).max(MAX_DELETION_RETENTION_DAYS).default(MIN_DELETION_RETENTION_DAYS),
      expectedCompanyVersion: z.number().int().positive(),
      idempotencyKey,
    })).mutation(({ input, ctx }) => requestCompanyDeletion(input, platformAuditActor(ctx))),
    approve: platformMfaProcedure("operations.write").input(z.object({
      publicId,
      expectedVersion: z.number().int().positive(),
    })).mutation(({ input, ctx }) => approveCompanyDeletion(input, platformAuditActor(ctx))),
    cancel: platformMfaProcedure("operations.write").input(z.object({
      publicId,
      expectedVersion: z.number().int().positive(),
      reason: z.string().trim().min(10).max(2_000),
    })).mutation(({ input, ctx }) => cancelCompanyDeletion(input, platformAuditActor(ctx))),
  }),
  restores: platformRouterFactory({
    list: platformPermissionProcedure("operations.read").input(cursorPageInputSchema.extend({
      companyPublicId: publicId.optional(),
      status: z.enum(["pending", "validating", "ready", "restoring", "completed", "failed", "rolled_back", "canceled"]).optional(),
    })).query(({ input }) => listRestoreRecords(input)),
    request: platformMfaProcedure("operations.write").input(z.object({
      companyPublicId: publicId,
      sourceFilePublicId: publicId,
      preRestoreExportPublicId: publicId,
      reason: z.string().trim().min(10).max(2_000),
      expectedCompanyVersion: z.number().int().positive(),
      idempotencyKey,
    })).mutation(({ input, ctx }) => requestTenantRestore(input, platformAuditActor(ctx))),
    approve: platformMfaProcedure("operations.write").input(z.object({
      publicId,
      expectedVersion: z.number().int().positive(),
    })).mutation(({ input, ctx }) => approveTenantRestore(input, platformAuditActor(ctx))),
    cancel: platformMfaProcedure("operations.write").input(z.object({
      publicId,
      expectedVersion: z.number().int().positive(),
      reason: z.string().trim().min(10).max(2_000),
    })).mutation(({ input, ctx }) => cancelTenantRestore(input, platformAuditActor(ctx))),
  }),
});
