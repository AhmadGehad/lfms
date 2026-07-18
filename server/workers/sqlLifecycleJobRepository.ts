import { createHash } from "node:crypto";
import {
  and,
  eq,
  gt,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import {
  auditLog,
  companies,
  deletionRequests,
  exportJobs,
  tenantFiles,
  tenantRestoreJobs,
} from "../../drizzle/schema";
import {
  applyCanonicalData,
  canonicalDataToObject,
  readAllCanonicalTables,
  type CanonicalTransferScope,
} from "../canonicalTransfer";
import type { DbOrTx } from "../db";
import { getDb } from "../db";
import { getPrivateObjectBytes, putPrivateObject } from "../storageBackend";
import { generatePublicId } from "../tenancy/publicIds";
import {
  createLifecycleSnapshot,
  isNewerSeparateCheckpoint,
  parseLifecycleSnapshot,
  serializeLifecycleSnapshot,
} from "./lifecycleSnapshot";
import {
  lifecycleExportStorageKey,
  LIFECYCLE_JOB_TYPES,
  type LifecycleJobPayload,
  type LifecycleJobRepository,
} from "./lifecycleJobTypes";
import type { LeasedJob } from "./leasedWorker";

const MAX_SNAPSHOT_BYTES = 250 * 1024 * 1024;
const RESTORE_MAINTENANCE_LEASE_MS = 30 * 60 * 1_000;

type LifecycleJob = LeasedJob<LifecycleJobPayload>;

type LifecycleStorage = {
  put(input: { key: string; bytes: Buffer; contentType: string; checksumSha256: string }): Promise<void>;
  get(key: string, maximumBytes: number): Promise<Buffer>;
};

const defaultStorage: LifecycleStorage = {
  put: putPrivateObject,
  get: getPrivateObjectBytes,
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

function affectedRows(result: unknown) {
  return Number((result as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
}

function safeFailure(error: Error) {
  return `${error.name}: ${error.message}`
    .replace(/:\/\/[^@\s]+@/g, "://[REDACTED]@")
    .replace(/(authorization|cookie|password|secret|token|api[-_]?key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .slice(0, 2_000);
}

function checksum(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function systemScope(companyId: number): CanonicalTransferScope {
  return {
    companyId,
    farmAccessMode: "all",
    accessibleFarmIds: "all",
    selectedFarmId: null,
  };
}

async function appendSystemAudit(
  tx: DbOrTx,
  job: LifecycleJob,
  input: {
    action: string;
    category: "data_export" | "data_delete";
    entityType: string;
    entityId: string;
    outcome?: "success" | "error";
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  await tx.insert(auditLog).values({
    publicId: generatePublicId(),
    companyId: job.companyId,
    actorType: "system_job",
    action: input.action.slice(0, 50),
    actionCategory: input.category,
    entityType: input.entityType.slice(0, 50),
    entityId: input.entityId.slice(0, 50),
    requestId: `job:${job.publicId}`.slice(0, 64),
    outcome: input.outcome ?? "success",
    oldValues: input.oldValues ?? null,
    newValues: input.newValues ?? null,
    metadata: { jobId: job.id, ...(input.metadata ?? {}) },
  });
}

function deletionRequestId(filters: unknown) {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return null;
  const value = (filters as Record<string, unknown>).deletionRequestPublicId;
  return typeof value === "string" && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value) ? value : null;
}

function validValidationResult(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).valid === true &&
    (value as Record<string, unknown>).schemaCompatible === true &&
    (value as Record<string, unknown>).tenantMatches === true &&
    typeof (value as Record<string, unknown>).sourceChecksumSha256 === "string",
  );
}

async function lockCompany(tx: DbOrTx, companyId: number) {
  const [company] = await tx.select().from(companies)
    .where(eq(companies.id, companyId))
    .for("update");
  if (!company || company.deletedAt || company.lifecycleStatus === "deleted") {
    throw new Error("LIFECYCLE_COMPANY_UNAVAILABLE");
  }
  return company;
}

export class SqlLifecycleJobRepository implements LifecycleJobRepository {
  constructor(private readonly storage: LifecycleStorage = defaultStorage) {}

  async processExport(job: LifecycleJob, signal: AbortSignal) {
    const db = await requireDb();
    const prepared = await db.transaction(async tx => {
      const company = await lockCompany(tx, job.companyId!);
      const [record] = await tx.select().from(exportJobs).where(and(
        eq(exportJobs.companyId, company.id),
        eq(exportJobs.publicId, job.payload.resourcePublicId),
      )).for("update");
      if (!record) throw new Error("EXPORT_JOB_NOT_FOUND");
      if (record.status === "completed") return { skipped: "completed" as const };
      if (record.status === "canceled" || record.status === "expired") {
        return { skipped: record.status };
      }
      const now = new Date();
      if (record.expiresAt <= now) {
        await tx.update(exportJobs).set({
          status: "expired",
          version: sql`${exportJobs.version} + 1`,
        }).where(eq(exportJobs.id, record.id));
        await appendSystemAudit(tx, job, {
          action: "export.expire",
          category: "data_export",
          entityType: "export_job",
          entityId: record.publicId,
          oldValues: { status: record.status },
          newValues: { status: "expired" },
        });
        return { skipped: "expired" as const };
      }
      if (!(["pending", "processing", "failed"] as string[]).includes(record.status)) {
        throw new Error("EXPORT_JOB_INVALID_STATE");
      }
      if (company.lifecycleStatus === "purging") throw new Error("LIFECYCLE_COMPANY_UNAVAILABLE");
      if (record.status !== "processing") {
        await tx.update(exportJobs).set({
          status: "processing",
          failureReason: null,
          version: sql`${exportJobs.version} + 1`,
        }).where(eq(exportJobs.id, record.id));
      }
      return {
        skipped: null,
        exportId: record.id,
        exportPublicId: record.publicId,
        exportType: record.exportType,
        filters: record.filters,
        generatedAt: record.createdAt,
        companyId: company.id,
        companyPublicId: company.publicId,
      };
    });
    if (prepared.skipped) return prepared;
    if (signal.aborted) throw new Error("JOB_ABORTED");

    const canonicalRows = await db.transaction(tx => readAllCanonicalTables(
      tx,
      systemScope(prepared.companyId),
    ));
    const snapshot = createLifecycleSnapshot({
      companyPublicId: prepared.companyPublicId,
      exportPublicId: prepared.exportPublicId,
      generatedAt: prepared.generatedAt,
      tables: canonicalDataToObject(canonicalRows),
    });
    const bytes = serializeLifecycleSnapshot(snapshot);
    if (bytes.length > MAX_SNAPSHOT_BYTES) throw new Error("EXPORT_SNAPSHOT_SIZE_LIMIT_EXCEEDED");
    const checksumSha256 = checksum(bytes);
    const storageKey = lifecycleExportStorageKey({
      companyPublicId: prepared.companyPublicId,
      exportPublicId: prepared.exportPublicId,
      backgroundJobPublicId: job.publicId,
      attempt: job.attempts,
    });
    await this.storage.put({ key: storageKey, bytes, contentType: "application/json", checksumSha256 });
    if (signal.aborted) throw new Error("JOB_ABORTED");

    return db.transaction(async tx => {
      await lockCompany(tx, prepared.companyId);
      const [current] = await tx.select().from(exportJobs).where(and(
        eq(exportJobs.id, prepared.exportId),
        eq(exportJobs.companyId, prepared.companyId),
      )).for("update");
      if (!current) throw new Error("EXPORT_JOB_NOT_FOUND");
      if (current.status === "completed") return { skipped: "completed" as const };
      if (current.status !== "processing") throw new Error("EXPORT_JOB_STATE_CHANGED");

      const [existingFile] = await tx.select().from(tenantFiles).where(and(
        eq(tenantFiles.companyId, prepared.companyId),
        eq(tenantFiles.generatedByBackgroundJobId, job.id),
      )).for("update");
      let tenantFileId: number;
      const fileValues = {
        storageKey,
        originalName: `lfms-tenant-export-${prepared.generatedAt.toISOString().slice(0, 10)}.json`,
        contentType: "application/json",
        sizeBytes: bytes.length,
        checksumSha256,
        status: "clean" as const,
        scanResult: {
          systemGenerated: true,
          exportType: prepared.exportType,
          format: snapshot.format,
          formatVersion: snapshot.formatVersion,
          dataContractVersion: snapshot.dataContractVersion,
          totalRows: snapshot.totalRows,
          tableCounts: snapshot.tableCounts,
        },
        verifiedAt: new Date(),
        deletedAt: null,
      };
      if (existingFile) {
        if (existingFile.generatedByExportJobId !== prepared.exportId) {
          throw new Error("EXPORT_FILE_ATTRIBUTION_MISMATCH");
        }
        await tx.update(tenantFiles).set({
          ...fileValues,
          version: sql`${tenantFiles.version} + 1`,
        }).where(eq(tenantFiles.id, existingFile.id));
        tenantFileId = existingFile.id;
      } else {
        const [result] = await tx.insert(tenantFiles).values({
          publicId: generatePublicId(),
          companyId: prepared.companyId,
          farmId: null,
          uploadedByMembershipId: null,
          generatedByBackgroundJobId: job.id,
          generatedByExportJobId: prepared.exportId,
          ...fileValues,
        });
        tenantFileId = Number(result.insertId);
      }

      const [completed] = await tx.update(exportJobs).set({
        status: "completed",
        tenantFileId,
        failureReason: null,
        completedAt: new Date(),
        version: sql`${exportJobs.version} + 1`,
      }).where(and(
        eq(exportJobs.id, current.id),
        eq(exportJobs.version, current.version),
        eq(exportJobs.status, "processing"),
      ));
      if (affectedRows(completed) !== 1) throw new Error("EXPORT_JOB_VERSION_CONFLICT");

      const linkedDeletionPublicId = deletionRequestId(prepared.filters);
      if (linkedDeletionPublicId) {
        const [deletion] = await tx.select().from(deletionRequests).where(and(
          eq(deletionRequests.companyId, prepared.companyId),
          eq(deletionRequests.publicId, linkedDeletionPublicId),
        )).for("update");
        if (deletion && deletion.status === "requested") {
          await tx.update(deletionRequests).set({
            status: "exported",
            version: sql`${deletionRequests.version} + 1`,
          }).where(and(
            eq(deletionRequests.id, deletion.id),
            eq(deletionRequests.version, deletion.version),
          ));
        }
      }

      await appendSystemAudit(tx, job, {
        action: "export.complete",
        category: "data_export",
        entityType: "export_job",
        entityId: current.publicId,
        oldValues: { status: current.status, version: current.version },
        newValues: {
          status: "completed",
          version: current.version + 1,
          checksumSha256,
          sizeBytes: bytes.length,
          totalRows: snapshot.totalRows,
        },
      });
      return { skipped: null, checksumSha256, totalRows: snapshot.totalRows, sizeBytes: bytes.length };
    });
  }

  async validateRestore(job: LifecycleJob, signal: AbortSignal) {
    const db = await requireDb();
    const prepared = await db.transaction(async tx => {
      const company = await lockCompany(tx, job.companyId!);
      const [restore] = await tx.select().from(tenantRestoreJobs).where(and(
        eq(tenantRestoreJobs.companyId, company.id),
        eq(tenantRestoreJobs.publicId, job.payload.resourcePublicId),
      )).for("update");
      if (!restore) throw new Error("RESTORE_JOB_NOT_FOUND");
      if (restore.status === "ready" && validValidationResult(restore.validationResult)) {
        return { skipped: "ready" as const };
      }
      if (restore.status === "canceled" || restore.status === "completed") return { skipped: restore.status };
      if (!(["pending", "validating", "failed"] as string[]).includes(restore.status)) {
        throw new Error("RESTORE_VALIDATION_INVALID_STATE");
      }
      if (company.lifecycleStatus !== "suspended") throw new Error("RESTORE_COMPANY_NOT_SUSPENDED");
      const [source] = await tx.select({
        id: tenantFiles.id,
        publicId: tenantFiles.publicId,
        storageKey: tenantFiles.storageKey,
        sizeBytes: tenantFiles.sizeBytes,
        checksumSha256: tenantFiles.checksumSha256,
        contentType: tenantFiles.contentType,
        status: tenantFiles.status,
        deletedAt: tenantFiles.deletedAt,
        generatedByExportJobId: tenantFiles.generatedByExportJobId,
        sourceExportPublicId: exportJobs.publicId,
      }).from(tenantFiles)
        .innerJoin(exportJobs, and(
          eq(tenantFiles.companyId, exportJobs.companyId),
          eq(tenantFiles.generatedByExportJobId, exportJobs.id),
          eq(exportJobs.tenantFileId, tenantFiles.id),
          eq(exportJobs.status, "completed"),
        ))
        .where(and(
          eq(tenantFiles.id, restore.sourceTenantFileId),
          eq(tenantFiles.companyId, company.id),
        )).for("update");
      if (
        !source ||
        source.status !== "clean" ||
        source.deletedAt ||
        source.contentType !== "application/json" ||
        !source.generatedByExportJobId ||
        !source.sourceExportPublicId ||
        source.sizeBytes <= 0 ||
        source.sizeBytes > MAX_SNAPSHOT_BYTES
      ) {
        throw new Error("RESTORE_SOURCE_UNTRUSTED");
      }
      if (restore.status !== "validating") {
        await tx.update(tenantRestoreJobs).set({
          status: "validating",
          failureReason: null,
          maintenanceLeaseUntil: null,
          version: sql`${tenantRestoreJobs.version} + 1`,
        }).where(eq(tenantRestoreJobs.id, restore.id));
      }
      return {
        skipped: null,
        restoreId: restore.id,
        restorePublicId: restore.publicId,
        companyId: company.id,
        companyPublicId: company.publicId,
        sourceFileId: source.id,
        sourceFilePublicId: source.publicId,
        sourceExportPublicId: source.sourceExportPublicId,
        storageKey: source.storageKey,
        sourceSizeBytes: source.sizeBytes,
        sourceChecksumSha256: source.checksumSha256,
      };
    });
    if (prepared.skipped) return prepared;
    if (signal.aborted) throw new Error("JOB_ABORTED");
    const bytes = await this.storage.get(prepared.storageKey, MAX_SNAPSHOT_BYTES);
    if (bytes.length !== prepared.sourceSizeBytes || checksum(bytes) !== prepared.sourceChecksumSha256) {
      throw new Error("RESTORE_SOURCE_CHECKSUM_MISMATCH");
    }
    const parsed = parseLifecycleSnapshot(bytes, {
      companyId: prepared.companyId,
      companyPublicId: prepared.companyPublicId,
    });
    if (parsed.snapshot.exportPublicId !== prepared.sourceExportPublicId) {
      throw new Error("RESTORE_SOURCE_EXPORT_MISMATCH");
    }
    if (signal.aborted) throw new Error("JOB_ABORTED");

    return db.transaction(async tx => {
      const company = await lockCompany(tx, prepared.companyId);
      const [restore] = await tx.select().from(tenantRestoreJobs).where(and(
        eq(tenantRestoreJobs.id, prepared.restoreId),
        eq(tenantRestoreJobs.companyId, company.id),
      )).for("update");
      if (!restore) throw new Error("RESTORE_JOB_NOT_FOUND");
      if (restore.status === "ready" && validValidationResult(restore.validationResult)) {
        return { skipped: "ready" as const };
      }
      if (restore.status !== "validating" || company.lifecycleStatus !== "suspended") {
        throw new Error("RESTORE_VALIDATION_STATE_CHANGED");
      }
      const [source] = await tx.select().from(tenantFiles).where(and(
        eq(tenantFiles.id, prepared.sourceFileId),
        eq(tenantFiles.companyId, company.id),
      )).for("update");
      if (
        !source ||
        source.status !== "clean" ||
        source.deletedAt ||
        source.checksumSha256 !== prepared.sourceChecksumSha256 ||
        source.sizeBytes !== prepared.sourceSizeBytes ||
        source.generatedByExportJobId === null
      ) {
        throw new Error("RESTORE_SOURCE_STATE_CHANGED");
      }
      const validationResult = {
        valid: true,
        schemaCompatible: true,
        tenantMatches: true,
        sourceChecksumSha256: prepared.sourceChecksumSha256,
        sourceSizeBytes: prepared.sourceSizeBytes,
        snapshotExportPublicId: parsed.snapshot.exportPublicId,
        formatVersion: parsed.snapshot.formatVersion,
        dataContractVersion: parsed.snapshot.dataContractVersion,
        totalRows: parsed.snapshot.totalRows,
        tableCounts: parsed.snapshot.tableCounts,
        validatedAt: new Date().toISOString(),
      };
      const [updated] = await tx.update(tenantRestoreJobs).set({
        status: "ready",
        validationResult,
        failureReason: null,
        version: sql`${tenantRestoreJobs.version} + 1`,
      }).where(and(
        eq(tenantRestoreJobs.id, restore.id),
        eq(tenantRestoreJobs.version, restore.version),
        eq(tenantRestoreJobs.status, "validating"),
      ));
      if (affectedRows(updated) !== 1) throw new Error("RESTORE_JOB_VERSION_CONFLICT");
      await appendSystemAudit(tx, job, {
        action: "restore.validate",
        category: "data_delete",
        entityType: "tenant_restore_job",
        entityId: restore.publicId,
        oldValues: { status: restore.status, version: restore.version },
        newValues: { status: "ready", version: restore.version + 1, ...validationResult },
      });
      return { skipped: null, totalRows: parsed.snapshot.totalRows };
    });
  }

  async executeRestore(job: LifecycleJob, signal: AbortSignal) {
    const db = await requireDb();
    const prepared = await db.transaction(async tx => {
      const company = await lockCompany(tx, job.companyId!);
      const [restore] = await tx.select().from(tenantRestoreJobs).where(and(
        eq(tenantRestoreJobs.companyId, company.id),
        eq(tenantRestoreJobs.publicId, job.payload.resourcePublicId),
      )).for("update");
      if (!restore) throw new Error("RESTORE_JOB_NOT_FOUND");
      if (restore.status === "completed") return { skipped: "completed" as const };
      if (restore.status === "canceled") return { skipped: "canceled" as const };
      const now = new Date();
      const reclaiming = restore.status === "restoring" &&
        (!restore.maintenanceLeaseUntil || restore.maintenanceLeaseUntil <= now);
      if (restore.status !== "ready" && !reclaiming) throw new Error("RESTORE_EXECUTION_INVALID_STATE");
      if (
        !restore.approvedByPlatformAdministratorId ||
        restore.approvedByPlatformAdministratorId === restore.requestedByPlatformAdministratorId ||
        !validValidationResult(restore.validationResult)
      ) {
        throw new Error("RESTORE_EXECUTION_NOT_APPROVED");
      }
      if (company.lifecycleStatus !== "suspended") throw new Error("RESTORE_COMPANY_NOT_SUSPENDED");

      const [source] = await tx.select().from(tenantFiles).where(and(
        eq(tenantFiles.id, restore.sourceTenantFileId),
        eq(tenantFiles.companyId, company.id),
      )).for("update");
      if (
        !source ||
        source.status !== "clean" ||
        source.deletedAt ||
        source.contentType !== "application/json" ||
        source.generatedByExportJobId === null ||
        source.checksumSha256 !== restore.validationResult.sourceChecksumSha256
      ) {
        throw new Error("RESTORE_SOURCE_STATE_CHANGED");
      }
      const [sourceExport] = await tx.select({
        id: exportJobs.id,
        completedAt: exportJobs.completedAt,
      }).from(exportJobs).where(and(
        eq(exportJobs.id, source.generatedByExportJobId!),
        eq(exportJobs.companyId, company.id),
        eq(exportJobs.status, "completed"),
        isNotNull(exportJobs.completedAt),
      ));
      if (!sourceExport?.completedAt) throw new Error("RESTORE_SOURCE_EXPORT_INVALID");
      if (!restore.preRestoreExportJobId) throw new Error("RESTORE_CHECKPOINT_REQUIRED");
      const [checkpoint] = await tx.select({
        id: exportJobs.id,
        publicId: exportJobs.publicId,
        completedAt: exportJobs.completedAt,
        status: exportJobs.status,
        expiresAt: exportJobs.expiresAt,
        storageKey: tenantFiles.storageKey,
        sizeBytes: tenantFiles.sizeBytes,
        checksumSha256: tenantFiles.checksumSha256,
        tenantFileStatus: tenantFiles.status,
        tenantFileDeletedAt: tenantFiles.deletedAt,
      }).from(exportJobs)
        .innerJoin(tenantFiles, and(
          eq(exportJobs.companyId, tenantFiles.companyId),
          eq(exportJobs.tenantFileId, tenantFiles.id),
        ))
        .where(and(
          eq(exportJobs.id, restore.preRestoreExportJobId),
          eq(exportJobs.companyId, company.id),
          eq(exportJobs.status, "completed"),
          gt(exportJobs.expiresAt, now),
          eq(tenantFiles.status, "clean"),
          eq(tenantFiles.contentType, "application/json"),
          isNotNull(tenantFiles.generatedByBackgroundJobId),
          eq(tenantFiles.generatedByExportJobId, exportJobs.id),
          isNull(tenantFiles.deletedAt),
        )).for("update");
      if (!checkpoint) throw new Error("RESTORE_CHECKPOINT_INVALID");
      if (!checkpoint.completedAt || !isNewerSeparateCheckpoint(
        { id: sourceExport.id, completedAt: sourceExport.completedAt },
        { id: checkpoint.id, completedAt: checkpoint.completedAt },
      )) {
        throw new Error("RESTORE_CHECKPOINT_NOT_NEWER_THAN_SOURCE");
      }
      const maintenanceLeaseUntil = new Date(now.getTime() + RESTORE_MAINTENANCE_LEASE_MS);
      await tx.update(tenantRestoreJobs).set({
        status: "restoring",
        failureReason: null,
        maintenanceLeaseUntil,
        version: sql`${tenantRestoreJobs.version} + 1`,
      }).where(eq(tenantRestoreJobs.id, restore.id));
      return {
        skipped: null,
        restoreId: restore.id,
        restorePublicId: restore.publicId,
        companyId: company.id,
        companyPublicId: company.publicId,
        sourceFileId: source.id,
        sourceExportJobId: source.generatedByExportJobId,
        sourceExportCompletedAt: sourceExport.completedAt,
        storageKey: source.storageKey,
        sourceSizeBytes: source.sizeBytes,
        sourceChecksumSha256: source.checksumSha256,
        validationResult: restore.validationResult,
        checkpointId: checkpoint.id,
        checkpointPublicId: checkpoint.publicId,
        checkpointStorageKey: checkpoint.storageKey,
        checkpointSizeBytes: checkpoint.sizeBytes,
        checkpointChecksumSha256: checkpoint.checksumSha256,
        maintenanceLeaseUntil,
      };
    });
    if (prepared.skipped) return prepared;
    if (signal.aborted) throw new Error("JOB_ABORTED");
    const bytes = await this.storage.get(prepared.storageKey, MAX_SNAPSHOT_BYTES);
    if (bytes.length !== prepared.sourceSizeBytes || checksum(bytes) !== prepared.sourceChecksumSha256) {
      throw new Error("RESTORE_SOURCE_CHECKSUM_MISMATCH");
    }
    const parsed = parseLifecycleSnapshot(bytes, {
      companyId: prepared.companyId,
      companyPublicId: prepared.companyPublicId,
    });
    if (parsed.snapshot.exportPublicId !== prepared.validationResult.snapshotExportPublicId) {
      throw new Error("RESTORE_VALIDATION_SNAPSHOT_CHANGED");
    }
    {
      const checkpointBytes = await this.storage.get(prepared.checkpointStorageKey, MAX_SNAPSHOT_BYTES);
      if (
        checkpointBytes.length !== prepared.checkpointSizeBytes ||
        checksum(checkpointBytes) !== prepared.checkpointChecksumSha256
      ) {
        throw new Error("RESTORE_CHECKPOINT_CHECKSUM_MISMATCH");
      }
      const checkpointSnapshot = parseLifecycleSnapshot(checkpointBytes, {
        companyId: prepared.companyId,
        companyPublicId: prepared.companyPublicId,
      });
      if (checkpointSnapshot.snapshot.exportPublicId !== prepared.checkpointPublicId) {
        throw new Error("RESTORE_CHECKPOINT_EXPORT_MISMATCH");
      }
    }
    if (signal.aborted) throw new Error("JOB_ABORTED");

    return db.transaction(async tx => {
      const company = await lockCompany(tx, prepared.companyId);
      const [restore] = await tx.select().from(tenantRestoreJobs).where(and(
        eq(tenantRestoreJobs.id, prepared.restoreId),
        eq(tenantRestoreJobs.companyId, company.id),
      )).for("update");
      if (!restore) throw new Error("RESTORE_JOB_NOT_FOUND");
      if (restore.status === "completed") return { skipped: "completed" as const };
      if (
        restore.status !== "restoring" ||
        company.lifecycleStatus !== "suspended" ||
        !restore.approvedByPlatformAdministratorId ||
        !validValidationResult(restore.validationResult) ||
        !restore.maintenanceLeaseUntil ||
        restore.maintenanceLeaseUntil < new Date() ||
        restore.validationResult.sourceChecksumSha256 !== prepared.sourceChecksumSha256
      ) {
        throw new Error("RESTORE_EXECUTION_FENCE_LOST");
      }
      const [source] = await tx.select().from(tenantFiles).where(and(
        eq(tenantFiles.id, prepared.sourceFileId),
        eq(tenantFiles.companyId, company.id),
        eq(tenantFiles.status, "clean"),
        isNull(tenantFiles.deletedAt),
        eq(tenantFiles.checksumSha256, prepared.sourceChecksumSha256),
        eq(tenantFiles.generatedByExportJobId, prepared.sourceExportJobId),
      )).for("update");
      if (!source) throw new Error("RESTORE_SOURCE_STATE_CHANGED");
      const [checkpoint] = await tx.select({
        id: exportJobs.id,
        publicId: exportJobs.publicId,
        storageKey: tenantFiles.storageKey,
        sizeBytes: tenantFiles.sizeBytes,
        checksumSha256: tenantFiles.checksumSha256,
      }).from(exportJobs)
        .innerJoin(tenantFiles, and(
          eq(exportJobs.companyId, tenantFiles.companyId),
          eq(exportJobs.tenantFileId, tenantFiles.id),
        ))
        .where(and(
          eq(exportJobs.id, prepared.checkpointId),
          eq(exportJobs.companyId, company.id),
          eq(exportJobs.status, "completed"),
          gt(exportJobs.expiresAt, new Date()),
          eq(tenantFiles.status, "clean"),
          eq(tenantFiles.contentType, "application/json"),
          isNotNull(tenantFiles.generatedByBackgroundJobId),
          eq(tenantFiles.generatedByExportJobId, exportJobs.id),
          isNull(tenantFiles.deletedAt),
        )).for("update");
      if (
        !checkpoint ||
        checkpoint.publicId !== prepared.checkpointPublicId ||
        checkpoint.storageKey !== prepared.checkpointStorageKey ||
        checkpoint.sizeBytes !== prepared.checkpointSizeBytes ||
        checkpoint.checksumSha256 !== prepared.checkpointChecksumSha256
      ) {
        throw new Error("RESTORE_CHECKPOINT_INVALID");
      }
      const [sourceExport] = await tx.select({ completedAt: exportJobs.completedAt }).from(exportJobs).where(and(
        eq(exportJobs.id, prepared.sourceExportJobId),
        eq(exportJobs.companyId, company.id),
        eq(exportJobs.status, "completed"),
        isNotNull(exportJobs.completedAt),
      ));
      if (
        !sourceExport?.completedAt ||
        sourceExport.completedAt.getTime() !== prepared.sourceExportCompletedAt.getTime()
      ) {
        throw new Error("RESTORE_SOURCE_EXPORT_STATE_CHANGED");
      }

      const stats = await applyCanonicalData(tx, parsed.rows, "replace", {
        scope: systemScope(company.id),
        skipQuotaChecks: true,
      });
      const [completed] = await tx.update(tenantRestoreJobs).set({
        status: "completed",
        failureReason: null,
        maintenanceLeaseUntil: null,
        completedAt: new Date(),
        version: sql`${tenantRestoreJobs.version} + 1`,
      }).where(and(
        eq(tenantRestoreJobs.id, restore.id),
        eq(tenantRestoreJobs.version, restore.version),
        eq(tenantRestoreJobs.status, "restoring"),
      ));
      if (affectedRows(completed) !== 1) throw new Error("RESTORE_JOB_VERSION_CONFLICT");
      await appendSystemAudit(tx, job, {
        action: "restore.complete",
        category: "data_delete",
        entityType: "tenant_restore_job",
        entityId: restore.publicId,
        oldValues: { status: restore.status, version: restore.version },
        newValues: {
          status: "completed",
          version: restore.version + 1,
          totalRows: parsed.snapshot.totalRows,
          tables: stats,
        },
      });
      return { skipped: null, totalRows: parsed.snapshot.totalRows, stats };
    });
  }

  async recordFailure(job: LifecycleJob, error: Error) {
    const db = await requireDb();
    const failureReason = safeFailure(error);
    await db.transaction(async tx => {
      await lockCompany(tx, job.companyId!);
      if (job.type === LIFECYCLE_JOB_TYPES.dataExport) {
        const [record] = await tx.select().from(exportJobs).where(and(
          eq(exportJobs.companyId, job.companyId!),
          eq(exportJobs.publicId, job.payload.resourcePublicId),
        )).for("update");
        if (!record || (["completed", "canceled", "expired"] as string[]).includes(record.status)) return;
        await tx.update(exportJobs).set({
          status: "failed",
          failureReason,
          version: sql`${exportJobs.version} + 1`,
        }).where(eq(exportJobs.id, record.id));
        await appendSystemAudit(tx, job, {
          action: "export.fail",
          category: "data_export",
          entityType: "export_job",
          entityId: record.publicId,
          outcome: "error",
          oldValues: { status: record.status, version: record.version },
          newValues: { status: "failed", version: record.version + 1 },
          metadata: { errorName: error.name },
        });
        return;
      }

      const [restore] = await tx.select().from(tenantRestoreJobs).where(and(
        eq(tenantRestoreJobs.companyId, job.companyId!),
        eq(tenantRestoreJobs.publicId, job.payload.resourcePublicId),
      )).for("update");
      if (!restore || (["completed", "canceled", "rolled_back"] as string[]).includes(restore.status)) return;
      const executionFailure = job.type === LIFECYCLE_JOB_TYPES.restoreExecute;
      const nextStatus = executionFailure
        ? (restore.status === "restoring" || restore.status === "ready" ? "ready" : restore.status)
        : (["pending", "validating", "failed"] as string[]).includes(restore.status)
          ? "failed"
          : restore.status;
      await tx.update(tenantRestoreJobs).set({
        status: nextStatus,
        failureReason,
        maintenanceLeaseUntil: restore.status === "restoring" ? null : restore.maintenanceLeaseUntil,
        version: sql`${tenantRestoreJobs.version} + 1`,
      }).where(eq(tenantRestoreJobs.id, restore.id));
      await appendSystemAudit(tx, job, {
        action: executionFailure ? "restore.execute_fail" : "restore.validate_fail",
        category: "data_delete",
        entityType: "tenant_restore_job",
        entityId: restore.publicId,
        outcome: "error",
        oldValues: { status: restore.status, version: restore.version },
        newValues: {
          status: nextStatus,
          version: restore.version + 1,
        },
        metadata: { errorName: error.name },
      });
    });
  }
}
