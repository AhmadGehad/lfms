import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import {
  backgroundJobs,
  companies,
  deletionRequests,
  exportJobs,
  tenantFiles,
  tenantRestoreJobs,
} from "../../../drizzle/schema";
import { generatePublicId } from "../../tenancy/publicIds";
import { LIFECYCLE_JOB_TYPES } from "../../workers/lifecycleJobTypes";
import { getPrivateObjectUrl } from "../../storageBackend";
import { isNewerSeparateCheckpoint } from "../../workers/lifecycleSnapshot";
import { invalidLifecycle, notFound, versionConflict } from "../errors";
import { executeIdempotent } from "../idempotency";
import { appendPlatformAudit, type PlatformAuditActor } from "../repositories/audit";
import { affectedRows, requirePlatformDb, type PlatformDb } from "../repositories/db";
import { rethrowPlatformWriteError } from "./errors";

const DAY_MS = 24 * 60 * 60 * 1_000;
const CHECKPOINT_MAX_AGE_MS = DAY_MS;
export const MIN_DELETION_RETENTION_DAYS = 30;
export const MAX_DELETION_RETENTION_DAYS = 365;

type DeletionStatus = typeof deletionRequests.$inferSelect.status;
type RestoreStatus = typeof tenantRestoreJobs.$inferSelect.status;

export function deletionApprovalBlockers(input: {
  status: DeletionStatus;
  requestedByPlatformAdministratorId: number | null;
  approvingPlatformAdministratorId: number;
  retentionUntil: Date;
  now: Date;
  hasCompletedExport: boolean;
}) {
  const blockers: string[] = [];
  if (input.status === "legal_hold") blockers.push("A legal hold blocks deletion approval");
  else if (input.status !== "requested" && input.status !== "exported") {
    blockers.push("Deletion request is not awaiting approval");
  }
  if (input.requestedByPlatformAdministratorId === input.approvingPlatformAdministratorId) {
    blockers.push("Requesters cannot approve their own deletion request");
  }
  if (input.retentionUntil.getTime() > input.now.getTime()) {
    blockers.push("The deletion retention deadline has not elapsed");
  }
  if (!input.hasCompletedExport) blockers.push("A completed clean tenant export is required");
  return blockers;
}

export function restoreApprovalBlockers(input: {
  status: RestoreStatus;
  requestedByPlatformAdministratorId: number;
  approvingPlatformAdministratorId: number;
  companyStatus: typeof companies.$inferSelect.lifecycleStatus;
  validationResult: unknown;
  hasFreshCheckpoint: boolean;
  sourceStillClean: boolean;
  sourceChecksumMatches: boolean;
}) {
  const result = input.validationResult && typeof input.validationResult === "object"
    ? input.validationResult as Record<string, unknown>
    : null;
  const blockers: string[] = [];
  if (input.status !== "ready") blockers.push("Restore validation is not ready");
  if (input.requestedByPlatformAdministratorId === input.approvingPlatformAdministratorId) {
    blockers.push("Requesters cannot approve their own restore request");
  }
  if (input.companyStatus !== "suspended") blockers.push("Company must remain suspended during restore");
  if (result?.valid !== true || result.schemaCompatible !== true || result.tenantMatches !== true) {
    blockers.push("Restore validation did not verify schema and tenant identity");
  }
  if (!input.sourceStillClean) blockers.push("Restore source is no longer clean and available");
  if (!input.sourceChecksumMatches) blockers.push("Restore source checksum changed after validation");
  if (!input.hasFreshCheckpoint) blockers.push("A fresh completed pre-restore checkpoint is required");
  return blockers;
}

async function lockCompany(tx: PlatformDb, publicId: string) {
  const [company] = await tx.select().from(companies)
    .where(eq(companies.publicId, publicId))
    .for("update");
  if (!company || company.deletedAt || company.lifecycleStatus === "deleted") notFound("Company");
  return company;
}

async function enqueueLifecycleJob(
  tx: PlatformDb,
  input: {
    companyId: number;
    jobType: (typeof LIFECYCLE_JOB_TYPES)[keyof typeof LIFECYCLE_JOB_TYPES];
    resourcePublicId: string;
    deduplicationKey: string;
    requestId: string;
    runAt?: Date;
  },
) {
  await tx.insert(backgroundJobs).values({
    publicId: generatePublicId(),
    companyId: input.companyId,
    jobType: input.jobType,
    payload: { companyId: input.companyId, resourcePublicId: input.resourcePublicId },
    deduplicationKey: input.deduplicationKey,
    requestId: input.requestId.slice(0, 64),
    runAt: input.runAt ?? new Date(),
    maxAttempts: 5,
  });
}

async function findCleanCompletedExport(
  tx: PlatformDb,
  input: {
    companyId: number;
    id?: number;
    publicId?: string;
    deletionRequestPublicId?: string;
    now: Date;
    freshCheckpoint?: boolean;
  },
) {
  const conditions = [
    eq(exportJobs.companyId, input.companyId),
    eq(exportJobs.exportType, "tenant_full_backup"),
    eq(exportJobs.status, "completed"),
    isNotNull(exportJobs.completedAt),
    isNotNull(exportJobs.tenantFileId),
    gt(exportJobs.expiresAt, input.now),
    eq(tenantFiles.status, "clean"),
    eq(tenantFiles.contentType, "application/json"),
    isNotNull(tenantFiles.generatedByBackgroundJobId),
    eq(tenantFiles.generatedByExportJobId, exportJobs.id),
    isNull(tenantFiles.deletedAt),
  ];
  if (input.id) conditions.push(eq(exportJobs.id, input.id));
  if (input.publicId) conditions.push(eq(exportJobs.publicId, input.publicId));
  if (input.deletionRequestPublicId) {
    conditions.push(sql<boolean>`JSON_UNQUOTE(JSON_EXTRACT(${exportJobs.filters}, '$.deletionRequestPublicId')) = ${input.deletionRequestPublicId}`);
  }
  if (input.freshCheckpoint) {
    conditions.push(gte(exportJobs.completedAt, new Date(input.now.getTime() - CHECKPOINT_MAX_AGE_MS)));
  }
  const [record] = await tx.select({
    id: exportJobs.id,
    publicId: exportJobs.publicId,
    tenantFileId: exportJobs.tenantFileId,
    filePublicId: tenantFiles.publicId,
    completedAt: exportJobs.completedAt,
    expiresAt: exportJobs.expiresAt,
  }).from(exportJobs)
    .innerJoin(tenantFiles, and(
      eq(exportJobs.companyId, tenantFiles.companyId),
      eq(exportJobs.tenantFileId, tenantFiles.id),
    ))
    .where(and(...conditions))
    .orderBy(desc(exportJobs.completedAt), desc(exportJobs.id))
    .limit(1);
  return record ?? null;
}

export async function requestDataExport(input: {
  companyPublicId: string;
  exportType: "tenant_full_backup" | "tenant_operational_report";
  expiresInDays: number;
  idempotencyKey: string;
}, actor: PlatformAuditActor) {
  if (input.expiresInDays < 1 || input.expiresInDays > 90) {
    invalidLifecycle("Export expiry must be between 1 and 90 days");
  }
  const db = await requirePlatformDb();
  try {
    return await db.transaction(async tx => {
      const company = await lockCompany(tx, input.companyPublicId);
      return executeIdempotent(tx, {
        companyId: company.id,
        userId: actor.userId,
        key: input.idempotencyKey,
        operation: "platform.lifecycle.export.request",
        body: input,
      }, async () => {
        if (company.lifecycleStatus === "purging") invalidLifecycle("Exports cannot start while a company is purging");
        const publicId = generatePublicId();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + input.expiresInDays * DAY_MS);
        await tx.insert(exportJobs).values({
          publicId,
          companyId: company.id,
          requestedByPlatformAdministratorId: actor.platformAdminId,
          exportType: input.exportType,
          filters: { purpose: "platform_request", requestedAt: now.toISOString() },
          expiresAt,
        });
        await enqueueLifecycleJob(tx, {
          companyId: company.id,
          jobType: LIFECYCLE_JOB_TYPES.dataExport,
          resourcePublicId: publicId,
          deduplicationKey: `export:${publicId}`,
          requestId: actor.requestId,
        });
        await appendPlatformAudit(tx, actor, {
          action: "export.request",
          actionCategory: "data_export",
          entityType: "export_job",
          entityId: publicId,
          companyId: company.id,
          after: { exportType: input.exportType, status: "pending", expiresAt },
        });
        return { publicId, status: "pending" as const, expiresAt: expiresAt.toISOString() };
      });
    });
  } catch (error) {
    rethrowPlatformWriteError(error);
  }
}

export async function cancelDataExport(input: {
  publicId: string;
  expectedVersion: number;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const [record] = await tx.select().from(exportJobs)
      .where(eq(exportJobs.publicId, input.publicId)).for("update");
    if (!record) notFound("Export job");
    if (!(["pending", "failed"] as string[]).includes(record.status)) {
      invalidLifecycle("Only pending or failed exports can be canceled");
    }
    const [result] = await tx.update(exportJobs).set({
      status: "canceled",
      version: sql`${exportJobs.version} + 1`,
    }).where(and(eq(exportJobs.id, record.id), eq(exportJobs.version, input.expectedVersion)));
    if (affectedRows(result) !== 1) versionConflict("Export job");
    await tx.update(backgroundJobs).set({ status: "canceled", completedAt: new Date() }).where(and(
      eq(backgroundJobs.companyId, record.companyId),
      eq(backgroundJobs.jobType, LIFECYCLE_JOB_TYPES.dataExport),
      eq(backgroundJobs.deduplicationKey, `export:${record.publicId}`),
      or(eq(backgroundJobs.status, "pending"), eq(backgroundJobs.status, "failed")),
    ));
    await appendPlatformAudit(tx, actor, {
      action: "export.cancel",
      actionCategory: "data_export",
      entityType: "export_job",
      entityId: record.publicId,
      companyId: record.companyId,
      before: { status: record.status, version: record.version },
      after: { status: "canceled", version: record.version + 1 },
    });
    return { publicId: record.publicId, status: "canceled" as const, version: record.version + 1 };
  });
}

export async function requestDataExportDownload(
  input: { publicId: string },
  actor: PlatformAuditActor,
) {
  const db = await requirePlatformDb();
  const record = await db.transaction(async tx => {
    const now = new Date();
    const [exportRecord] = await tx.select({
      id: exportJobs.id,
      publicId: exportJobs.publicId,
      companyId: exportJobs.companyId,
      companySlug: companies.slug,
      storageKey: tenantFiles.storageKey,
      contentType: tenantFiles.contentType,
      checksumSha256: tenantFiles.checksumSha256,
    }).from(exportJobs)
      .innerJoin(companies, eq(exportJobs.companyId, companies.id))
      .innerJoin(tenantFiles, and(
        eq(exportJobs.companyId, tenantFiles.companyId),
        eq(exportJobs.tenantFileId, tenantFiles.id),
        eq(tenantFiles.generatedByExportJobId, exportJobs.id),
      ))
      .where(and(
        eq(exportJobs.publicId, input.publicId),
        eq(exportJobs.status, "completed"),
        eq(tenantFiles.status, "clean"),
        eq(tenantFiles.contentType, "application/json"),
        isNotNull(tenantFiles.generatedByBackgroundJobId),
        isNull(tenantFiles.deletedAt),
        gt(exportJobs.expiresAt, now),
      ))
      .limit(1);
    if (!exportRecord?.storageKey) notFound("Available export");
    await appendPlatformAudit(tx, actor, {
      action: "export.download_request",
      actionCategory: "data_export",
      entityType: "export_job",
      entityId: exportRecord.publicId,
      companyId: exportRecord.companyId,
      after: {
        contentType: exportRecord.contentType,
        checksumSha256: exportRecord.checksumSha256,
      },
    });
    return exportRecord;
  });
  return {
    url: await getPrivateObjectUrl(record.storageKey),
    filename: `${record.companySlug}-${record.publicId}.json`,
    expiresInSeconds: 300,
  };
}

export async function requestCompanyDeletion(input: {
  companyPublicId: string;
  reason: string;
  retentionDays: number;
  expectedCompanyVersion: number;
  idempotencyKey: string;
}, actor: PlatformAuditActor) {
  if (
    input.retentionDays < MIN_DELETION_RETENTION_DAYS ||
    input.retentionDays > MAX_DELETION_RETENTION_DAYS
  ) {
    invalidLifecycle(`Deletion retention must be ${MIN_DELETION_RETENTION_DAYS}-${MAX_DELETION_RETENTION_DAYS} days`);
  }
  const db = await requirePlatformDb();
  try {
    return await db.transaction(async tx => {
      const company = await lockCompany(tx, input.companyPublicId);
      return executeIdempotent(tx, {
        companyId: company.id,
        userId: actor.userId,
        key: input.idempotencyKey,
        operation: "platform.lifecycle.deletion.request",
        body: input,
      }, async () => {
        if (!("provisioning active suspended".split(" ") as string[]).includes(company.lifecycleStatus)) {
          invalidLifecycle("Company is not eligible for a deletion request");
        }
        if (company.version !== input.expectedCompanyVersion) versionConflict("Company");
        const openRequests = await tx.select({ id: deletionRequests.id }).from(deletionRequests).where(and(
          eq(deletionRequests.companyId, company.id),
          inArray(deletionRequests.status, ["requested", "exported", "legal_hold", "approved", "purging"]),
        )).for("update");
        if (openRequests.length) invalidLifecycle("Company already has an open deletion request");
        const now = new Date();
        const publicId = generatePublicId();
        const exportPublicId = generatePublicId();
        const retentionUntil = new Date(now.getTime() + input.retentionDays * DAY_MS);
        await tx.insert(deletionRequests).values({
          publicId,
          companyId: company.id,
          requestedByPlatformAdministratorId: actor.platformAdminId,
          reason: input.reason.trim(),
          retentionUntil,
        });
        await tx.insert(exportJobs).values({
          publicId: exportPublicId,
          companyId: company.id,
          requestedByPlatformAdministratorId: actor.platformAdminId,
          exportType: "tenant_full_backup",
          filters: { purpose: "tenant_deletion", deletionRequestPublicId: publicId },
          expiresAt: new Date(retentionUntil.getTime() + 30 * DAY_MS),
        });
        await enqueueLifecycleJob(tx, {
          companyId: company.id,
          jobType: LIFECYCLE_JOB_TYPES.dataExport,
          resourcePublicId: exportPublicId,
          deduplicationKey: `export:${exportPublicId}`,
          requestId: actor.requestId,
        });
        const [updated] = await tx.update(companies).set({
          lifecycleStatus: "deletion_requested",
          suspendedAt: now,
          suspendedReason: "Deletion request pending retention and approval",
          version: sql`${companies.version} + 1`,
        }).where(and(eq(companies.id, company.id), eq(companies.version, input.expectedCompanyVersion)));
        if (affectedRows(updated) !== 1) versionConflict("Company");
        await appendPlatformAudit(tx, actor, {
          action: "deletion.request",
          actionCategory: "data_delete",
          entityType: "deletion_request",
          entityId: publicId,
          companyId: company.id,
          before: { companyStatus: company.lifecycleStatus, companyVersion: company.version },
          after: {
            companyStatus: "deletion_requested",
            companyVersion: company.version + 1,
            retentionUntil,
            exportPublicId,
            reason: input.reason,
          },
        });
        return {
          publicId,
          status: "requested" as const,
          retentionUntil: retentionUntil.toISOString(),
          exportPublicId,
          companyVersion: company.version + 1,
        };
      });
    });
  } catch (error) {
    rethrowPlatformWriteError(error);
  }
}

export async function approveCompanyDeletion(input: {
  publicId: string;
  expectedVersion: number;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const [requestSnapshot] = await tx.select({
      id: deletionRequests.id,
      companyId: deletionRequests.companyId,
    }).from(deletionRequests).where(eq(deletionRequests.publicId, input.publicId));
    if (!requestSnapshot) notFound("Deletion request");
    const [company] = await tx.select().from(companies)
      .where(eq(companies.id, requestSnapshot.companyId)).for("update");
    const [request] = await tx.select().from(deletionRequests)
      .where(eq(deletionRequests.id, requestSnapshot.id)).for("update");
    if (!request) notFound("Deletion request");
    if (!company || company.lifecycleStatus !== "deletion_requested") {
      invalidLifecycle("Company is not in deletion-requested state");
    }
    const now = new Date();
    const checkpoint = await findCleanCompletedExport(tx, {
      companyId: request.companyId,
      deletionRequestPublicId: request.publicId,
      now,
    });
    const blockers = deletionApprovalBlockers({
      status: request.status,
      requestedByPlatformAdministratorId: request.requestedByPlatformAdministratorId,
      approvingPlatformAdministratorId: actor.platformAdminId,
      retentionUntil: request.retentionUntil,
      now,
      hasCompletedExport: Boolean(checkpoint),
    });
    if (blockers.length) invalidLifecycle(blockers[0]);
    const [result] = await tx.update(deletionRequests).set({
      status: "approved",
      approvedByPlatformAdministratorId: actor.platformAdminId,
      approvedAt: now,
      version: sql`${deletionRequests.version} + 1`,
    }).where(and(eq(deletionRequests.id, request.id), eq(deletionRequests.version, input.expectedVersion)));
    if (affectedRows(result) !== 1) versionConflict("Deletion request");
    await appendPlatformAudit(tx, actor, {
      action: "deletion.approve",
      actionCategory: "data_delete",
      entityType: "deletion_request",
      entityId: request.publicId,
      companyId: request.companyId,
      before: { status: request.status, version: request.version },
      after: {
        status: "approved",
        version: request.version + 1,
        approvedAt: now,
        checkpointExportPublicId: checkpoint!.publicId,
      },
    });
    return {
      publicId: request.publicId,
      status: "approved" as const,
      version: request.version + 1,
      purgeReady: true as const,
      checkpointExportPublicId: checkpoint!.publicId,
    };
  });
}

export async function cancelCompanyDeletion(input: {
  publicId: string;
  expectedVersion: number;
  reason: string;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const [requestSnapshot] = await tx.select({
      id: deletionRequests.id,
      companyId: deletionRequests.companyId,
    }).from(deletionRequests).where(eq(deletionRequests.publicId, input.publicId));
    if (!requestSnapshot) notFound("Deletion request");
    const [company] = await tx.select().from(companies)
      .where(eq(companies.id, requestSnapshot.companyId)).for("update");
    const [request] = await tx.select().from(deletionRequests)
      .where(eq(deletionRequests.id, requestSnapshot.id)).for("update");
    if (!request) notFound("Deletion request");
    if (!(["requested", "exported", "approved"] as string[]).includes(request.status)) {
      invalidLifecycle("Deletion request cannot be canceled in its current state");
    }
    if (!company || company.lifecycleStatus !== "deletion_requested") {
      invalidLifecycle("Company is not in deletion-requested state");
    }
    const [result] = await tx.update(deletionRequests).set({
      status: "canceled",
      version: sql`${deletionRequests.version} + 1`,
    }).where(and(eq(deletionRequests.id, request.id), eq(deletionRequests.version, input.expectedVersion)));
    if (affectedRows(result) !== 1) versionConflict("Deletion request");
    const pendingExports = await tx.select({ publicId: exportJobs.publicId }).from(exportJobs).where(and(
      eq(exportJobs.companyId, request.companyId),
      inArray(exportJobs.status, ["pending", "failed"]),
      sql<boolean>`JSON_UNQUOTE(JSON_EXTRACT(${exportJobs.filters}, '$.deletionRequestPublicId')) = ${request.publicId}`,
    )).for("update");
    await tx.update(exportJobs).set({
      status: "canceled",
      version: sql`${exportJobs.version} + 1`,
    }).where(and(
      eq(exportJobs.companyId, request.companyId),
      inArray(exportJobs.status, ["pending", "failed"]),
      sql<boolean>`JSON_UNQUOTE(JSON_EXTRACT(${exportJobs.filters}, '$.deletionRequestPublicId')) = ${request.publicId}`,
    ));
    for (const pendingExport of pendingExports) {
      await tx.update(backgroundJobs).set({ status: "canceled", completedAt: new Date() }).where(and(
        eq(backgroundJobs.companyId, request.companyId),
        eq(backgroundJobs.jobType, LIFECYCLE_JOB_TYPES.dataExport),
        eq(backgroundJobs.deduplicationKey, `export:${pendingExport.publicId}`),
        or(eq(backgroundJobs.status, "pending"), eq(backgroundJobs.status, "failed")),
      ));
    }
    await tx.update(companies).set({
      lifecycleStatus: "suspended",
      suspendedAt: new Date(),
      suspendedReason: `Deletion request canceled: ${input.reason.trim()}`.slice(0, 2_000),
      version: sql`${companies.version} + 1`,
    }).where(eq(companies.id, company.id));
    await appendPlatformAudit(tx, actor, {
      action: "deletion.cancel",
      actionCategory: "data_delete",
      entityType: "deletion_request",
      entityId: request.publicId,
      companyId: request.companyId,
      before: { status: request.status, companyStatus: company.lifecycleStatus, version: request.version },
      after: { status: "canceled", companyStatus: "suspended", version: request.version + 1, reason: input.reason },
    });
    return {
      publicId: request.publicId,
      status: "canceled" as const,
      version: request.version + 1,
      companyStatus: "suspended" as const,
      companyVersion: company.version + 1,
    };
  });
}

export async function requestTenantRestore(input: {
  companyPublicId: string;
  sourceFilePublicId: string;
  preRestoreExportPublicId: string;
  reason: string;
  expectedCompanyVersion: number;
  idempotencyKey: string;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  try {
    return await db.transaction(async tx => {
      const company = await lockCompany(tx, input.companyPublicId);
      return executeIdempotent(tx, {
        companyId: company.id,
        userId: actor.userId,
        key: input.idempotencyKey,
        operation: "platform.lifecycle.restore.request",
        body: input,
      }, async () => {
        if (company.lifecycleStatus !== "suspended") invalidLifecycle("Company must be suspended before restore");
        if (company.version !== input.expectedCompanyVersion) versionConflict("Company");
        const openJobs = await tx.select({ id: tenantRestoreJobs.id }).from(tenantRestoreJobs).where(and(
          eq(tenantRestoreJobs.companyId, company.id),
        inArray(tenantRestoreJobs.status, ["pending", "validating", "ready", "restoring", "failed"]),
        )).for("update");
        if (openJobs.length) invalidLifecycle("Company already has an active restore request");
        const [sourceFile] = await tx.select().from(tenantFiles).where(and(
          eq(tenantFiles.publicId, input.sourceFilePublicId),
          eq(tenantFiles.companyId, company.id),
          eq(tenantFiles.status, "clean"),
          isNull(tenantFiles.deletedAt),
        )).for("update");
        if (!sourceFile) invalidLifecycle("Restore source must be a clean file owned by the company");
        if (sourceFile.contentType !== "application/json" || !sourceFile.generatedByExportJobId) {
          invalidLifecycle("Restore source must be a system-generated canonical JSON export");
        }
        const [sourceExport] = await tx.select({
          id: exportJobs.id,
          completedAt: exportJobs.completedAt,
        }).from(exportJobs).where(and(
          eq(exportJobs.id, sourceFile.generatedByExportJobId),
          eq(exportJobs.companyId, company.id),
          eq(exportJobs.status, "completed"),
          isNotNull(exportJobs.completedAt),
        ));
        if (!sourceExport?.completedAt) invalidLifecycle("Restore source export is incomplete");
        const now = new Date();
        const checkpoint = await findCleanCompletedExport(tx, {
          companyId: company.id,
          publicId: input.preRestoreExportPublicId,
          now,
          freshCheckpoint: true,
        });
        if (!checkpoint) invalidLifecycle("A completed clean export from the last 24 hours is required before restore");
        if (!checkpoint.completedAt || !isNewerSeparateCheckpoint(
          { id: sourceExport.id, completedAt: sourceExport.completedAt },
          { id: checkpoint.id, completedAt: checkpoint.completedAt },
        )) {
          invalidLifecycle("Pre-restore checkpoint must be a newer, separate export from the restore source");
        }
        const publicId = generatePublicId();
        await tx.insert(tenantRestoreJobs).values({
          publicId,
          companyId: company.id,
          sourceTenantFileId: sourceFile.id,
          preRestoreExportJobId: checkpoint.id,
          requestedByPlatformAdministratorId: actor.platformAdminId,
        });
        await enqueueLifecycleJob(tx, {
          companyId: company.id,
          jobType: LIFECYCLE_JOB_TYPES.restoreValidate,
          resourcePublicId: publicId,
          deduplicationKey: `restore-validate:${publicId}`,
          requestId: actor.requestId,
        });
        await appendPlatformAudit(tx, actor, {
          action: "restore.request",
          actionCategory: "data_delete",
          entityType: "tenant_restore_job",
          entityId: publicId,
          companyId: company.id,
          after: {
            status: "pending",
            sourceFilePublicId: sourceFile.publicId,
            checkpointExportPublicId: checkpoint.publicId,
            reason: input.reason,
          },
        });
        return {
          publicId,
          status: "pending" as const,
          sourceFilePublicId: sourceFile.publicId,
          checkpointExportPublicId: checkpoint.publicId,
        };
      });
    });
  } catch (error) {
    rethrowPlatformWriteError(error);
  }
}

export async function approveTenantRestore(input: {
  publicId: string;
  expectedVersion: number;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const [restoreSnapshot] = await tx.select({
      id: tenantRestoreJobs.id,
      companyId: tenantRestoreJobs.companyId,
    }).from(tenantRestoreJobs).where(eq(tenantRestoreJobs.publicId, input.publicId));
    if (!restoreSnapshot) notFound("Restore request");
    const [company] = await tx.select().from(companies)
      .where(eq(companies.id, restoreSnapshot.companyId)).for("update");
    const [restore] = await tx.select().from(tenantRestoreJobs)
      .where(eq(tenantRestoreJobs.id, restoreSnapshot.id)).for("update");
    if (!restore) notFound("Restore request");
    if (!company) notFound("Company");
    const now = new Date();
    const [sourceFile] = await tx.select({
      checksumSha256: tenantFiles.checksumSha256,
      status: tenantFiles.status,
      deletedAt: tenantFiles.deletedAt,
    }).from(tenantFiles).where(and(
      eq(tenantFiles.id, restore.sourceTenantFileId),
      eq(tenantFiles.companyId, restore.companyId),
    )).for("update");
    const validationResult = restore.validationResult && typeof restore.validationResult === "object"
      ? restore.validationResult as Record<string, unknown>
      : null;
    const checkpoint = restore.preRestoreExportJobId
      ? await findCleanCompletedExport(tx, {
          companyId: restore.companyId,
          id: restore.preRestoreExportJobId,
          now,
          freshCheckpoint: true,
        })
      : null;
    const blockers = restoreApprovalBlockers({
      status: restore.status,
      requestedByPlatformAdministratorId: restore.requestedByPlatformAdministratorId,
      approvingPlatformAdministratorId: actor.platformAdminId,
      companyStatus: company.lifecycleStatus,
      validationResult: restore.validationResult,
      hasFreshCheckpoint: Boolean(checkpoint),
      sourceStillClean: sourceFile?.status === "clean" && sourceFile.deletedAt === null,
      sourceChecksumMatches: Boolean(
        sourceFile &&
        typeof validationResult?.sourceChecksumSha256 === "string" &&
        validationResult.sourceChecksumSha256 === sourceFile.checksumSha256,
      ),
    });
    if (blockers.length) invalidLifecycle(blockers[0]);
    const [result] = await tx.update(tenantRestoreJobs).set({
      approvedByPlatformAdministratorId: actor.platformAdminId,
      version: sql`${tenantRestoreJobs.version} + 1`,
    }).where(and(
      eq(tenantRestoreJobs.id, restore.id),
      eq(tenantRestoreJobs.version, input.expectedVersion),
      isNull(tenantRestoreJobs.approvedByPlatformAdministratorId),
    ));
    if (affectedRows(result) !== 1) versionConflict("Restore request");
    await enqueueLifecycleJob(tx, {
      companyId: restore.companyId,
      jobType: LIFECYCLE_JOB_TYPES.restoreExecute,
      resourcePublicId: restore.publicId,
      deduplicationKey: `restore-execute:${restore.publicId}`,
      requestId: actor.requestId,
    });
    await appendPlatformAudit(tx, actor, {
      action: "restore.approve",
      actionCategory: "data_delete",
      entityType: "tenant_restore_job",
      entityId: restore.publicId,
      companyId: restore.companyId,
      before: { status: restore.status, approved: false, version: restore.version },
      after: {
        status: "ready",
        approved: true,
        version: restore.version + 1,
        checkpointExportPublicId: checkpoint!.publicId,
      },
    });
    return { publicId: restore.publicId, status: "ready" as const, approved: true as const, version: restore.version + 1 };
  });
}

export async function cancelTenantRestore(input: {
  publicId: string;
  expectedVersion: number;
  reason: string;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const [restoreSnapshot] = await tx.select({
      id: tenantRestoreJobs.id,
      companyId: tenantRestoreJobs.companyId,
    }).from(tenantRestoreJobs).where(eq(tenantRestoreJobs.publicId, input.publicId));
    if (!restoreSnapshot) notFound("Restore request");
    await tx.select({ id: companies.id }).from(companies)
      .where(eq(companies.id, restoreSnapshot.companyId)).for("update");
    const [restore] = await tx.select().from(tenantRestoreJobs)
      .where(eq(tenantRestoreJobs.id, restoreSnapshot.id)).for("update");
    if (!restore) notFound("Restore request");
    if (!(["pending", "validating", "ready", "failed"] as string[]).includes(restore.status)) {
      invalidLifecycle("Restore request cannot be canceled in its current state");
    }
    const [result] = await tx.update(tenantRestoreJobs).set({
      status: "canceled",
      failureReason: null,
      maintenanceLeaseUntil: null,
      completedAt: new Date(),
      version: sql`${tenantRestoreJobs.version} + 1`,
    }).where(and(eq(tenantRestoreJobs.id, restore.id), eq(tenantRestoreJobs.version, input.expectedVersion)));
    if (affectedRows(result) !== 1) versionConflict("Restore request");
    await tx.update(backgroundJobs).set({ status: "canceled", completedAt: new Date() }).where(and(
      eq(backgroundJobs.companyId, restore.companyId),
      inArray(backgroundJobs.jobType, [LIFECYCLE_JOB_TYPES.restoreValidate, LIFECYCLE_JOB_TYPES.restoreExecute]),
      inArray(backgroundJobs.deduplicationKey, [
        `restore-validate:${restore.publicId}`,
        `restore-execute:${restore.publicId}`,
      ]),
      or(eq(backgroundJobs.status, "pending"), eq(backgroundJobs.status, "failed")),
    ));
    await appendPlatformAudit(tx, actor, {
      action: "restore.cancel",
      actionCategory: "data_delete",
      entityType: "tenant_restore_job",
      entityId: restore.publicId,
      companyId: restore.companyId,
      before: { status: restore.status, version: restore.version },
      after: { status: "canceled", version: restore.version + 1, reason: input.reason },
    });
    return { publicId: restore.publicId, status: "canceled" as const, version: restore.version + 1 };
  });
}
