import { and, desc, eq, like, lt, or, type SQL } from "drizzle-orm";
import {
  companies,
  deletionRequests,
  exportJobs,
  tenantFiles,
  tenantRestoreJobs,
} from "../../../drizzle/schema";
import { decodeCursor } from "../../../shared/platformApi";
import { publicCursorPage, requirePlatformDb } from "./db";

type LifecycleListInput = {
  cursor?: string | null;
  limit: number;
  companyPublicId?: string;
  search?: string;
};

export async function listExportRecords(input: LifecycleListInput & {
  status?: typeof exportJobs.$inferSelect.status;
}) {
  const db = await requirePlatformDb();
  const cursor = decodeCursor<{ id?: unknown }>(input.cursor);
  const conditions: SQL[] = [];
  if (typeof cursor?.id === "number") conditions.push(lt(exportJobs.id, cursor.id));
  if (input.companyPublicId) conditions.push(eq(companies.publicId, input.companyPublicId));
  if (input.status) conditions.push(eq(exportJobs.status, input.status));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(
      like(exportJobs.publicId, term),
      like(exportJobs.exportType, term),
      like(companies.name, term),
      like(companies.publicId, term),
    )!);
  }
  const rows = await db.select({
    cursorId: exportJobs.id,
    publicId: exportJobs.publicId,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    exportType: exportJobs.exportType,
    status: exportJobs.status,
    filePublicId: tenantFiles.publicId,
    failureReason: exportJobs.failureReason,
    expiresAt: exportJobs.expiresAt,
    version: exportJobs.version,
    createdAt: exportJobs.createdAt,
    completedAt: exportJobs.completedAt,
  }).from(exportJobs)
    .innerJoin(companies, eq(exportJobs.companyId, companies.id))
    .leftJoin(tenantFiles, and(
      eq(exportJobs.companyId, tenantFiles.companyId),
      eq(exportJobs.tenantFileId, tenantFiles.id),
    ))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(exportJobs.id))
    .limit(input.limit + 1);
  return publicCursorPage(rows, input.limit);
}

export async function listDeletionRecords(input: LifecycleListInput & {
  status?: typeof deletionRequests.$inferSelect.status;
}) {
  const db = await requirePlatformDb();
  const cursor = decodeCursor<{ id?: unknown }>(input.cursor);
  const conditions: SQL[] = [];
  if (typeof cursor?.id === "number") conditions.push(lt(deletionRequests.id, cursor.id));
  if (input.companyPublicId) conditions.push(eq(companies.publicId, input.companyPublicId));
  if (input.status) conditions.push(eq(deletionRequests.status, input.status));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(
      like(deletionRequests.publicId, term),
      like(deletionRequests.reason, term),
      like(companies.name, term),
      like(companies.publicId, term),
    )!);
  }
  const rows = await db.select({
    cursorId: deletionRequests.id,
    publicId: deletionRequests.publicId,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    reason: deletionRequests.reason,
    status: deletionRequests.status,
    retentionUntil: deletionRequests.retentionUntil,
    approvedAt: deletionRequests.approvedAt,
    purgedAt: deletionRequests.purgedAt,
    version: deletionRequests.version,
    createdAt: deletionRequests.createdAt,
    updatedAt: deletionRequests.updatedAt,
  }).from(deletionRequests)
    .innerJoin(companies, eq(deletionRequests.companyId, companies.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(deletionRequests.id))
    .limit(input.limit + 1);
  return publicCursorPage(rows, input.limit);
}

export async function listRestoreRecords(input: LifecycleListInput & {
  status?: typeof tenantRestoreJobs.$inferSelect.status;
}) {
  const db = await requirePlatformDb();
  const cursor = decodeCursor<{ id?: unknown }>(input.cursor);
  const conditions: SQL[] = [];
  if (typeof cursor?.id === "number") conditions.push(lt(tenantRestoreJobs.id, cursor.id));
  if (input.companyPublicId) conditions.push(eq(companies.publicId, input.companyPublicId));
  if (input.status) conditions.push(eq(tenantRestoreJobs.status, input.status));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(
      like(tenantRestoreJobs.publicId, term),
      like(companies.name, term),
      like(companies.publicId, term),
    )!);
  }
  const rows = await db.select({
    cursorId: tenantRestoreJobs.id,
    publicId: tenantRestoreJobs.publicId,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    sourceFilePublicId: tenantFiles.publicId,
    status: tenantRestoreJobs.status,
    validationResult: tenantRestoreJobs.validationResult,
    failureReason: tenantRestoreJobs.failureReason,
    maintenanceLeaseUntil: tenantRestoreJobs.maintenanceLeaseUntil,
    version: tenantRestoreJobs.version,
    createdAt: tenantRestoreJobs.createdAt,
    completedAt: tenantRestoreJobs.completedAt,
  }).from(tenantRestoreJobs)
    .innerJoin(companies, eq(tenantRestoreJobs.companyId, companies.id))
    .leftJoin(tenantFiles, and(
      eq(tenantRestoreJobs.companyId, tenantFiles.companyId),
      eq(tenantRestoreJobs.sourceTenantFileId, tenantFiles.id),
    ))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(tenantRestoreJobs.id))
    .limit(input.limit + 1);
  return publicCursorPage(rows, input.limit);
}
