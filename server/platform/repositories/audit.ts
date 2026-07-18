import { and, desc, eq, like, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { auditLog, companies, platformAdministrators, supportAccessGrants, users } from "../../../drizzle/schema";
import { decodeCursor } from "../../../shared/platformApi";
import type { PlatformContext, SupportScope } from "../../../shared/tenancy";
import { redactLogFields } from "../../observability/logger";
import { generatePublicId } from "../../tenancy/publicIds";
import { publicCursorPage, requirePlatformDb, type PlatformDb } from "./db";

const platformActorUsers = alias(users, "platform_actor_users");
const tenantActorUsers = alias(users, "tenant_actor_users");

export type PlatformAuditInput = {
  action: string;
  actionCategory: "auth" | "crud" | "config" | "membership" | "billing" | "security" | "data_export" | "data_delete" | "company";
  entityType: string;
  entityId?: string | null;
  companyId?: number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  outcome?: "success" | "denied" | "error";
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type PlatformAuditActor = PlatformContext & {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function appendPlatformAudit(
  db: PlatformDb,
  actor: PlatformAuditActor,
  input: PlatformAuditInput,
) {
  await db.insert(auditLog).values({
    publicId: generatePublicId(),
    companyId: input.companyId ?? null,
    platformAdministratorId: actor.platformAdminId,
    actorType: "platform_admin",
    action: input.action.slice(0, 50),
    actionCategory: input.actionCategory,
    entityType: input.entityType.slice(0, 50),
    entityId: input.entityId?.slice(0, 50) ?? null,
    oldValues: input.before ? redactLogFields(input.before) : null,
    newValues: input.after ? redactLogFields(input.after) : null,
    requestId: actor.requestId.slice(0, 64),
    outcome: input.outcome ?? "success",
    metadata: input.metadata ? redactLogFields(input.metadata) : null,
    ipAddress: (input.ipAddress ?? actor.ipAddress)?.slice(0, 45) ?? null,
    userAgent: (input.userAgent ?? actor.userAgent)?.slice(0, 500) ?? null,
  });
}

export async function appendSupportAudit(
  db: PlatformDb,
  actor: PlatformAuditActor,
  grant: typeof supportAccessGrants.$inferSelect,
  scope: SupportScope,
) {
  await db.insert(auditLog).values({
    publicId: generatePublicId(),
    companyId: grant.companyId,
    platformAdministratorId: actor.platformAdminId,
    supportAccessGrantId: grant.id,
    actorType: "support",
    action: "support.inspect",
    actionCategory: "security",
    entityType: "support_access_grant",
    entityId: grant.publicId,
    requestId: actor.requestId.slice(0, 64),
    outcome: "success",
    metadata: {
      scope,
      ticketReference: grant.ticketReference,
      accessMode: grant.accessMode,
    },
    ipAddress: actor.ipAddress?.slice(0, 45) ?? null,
    userAgent: actor.userAgent?.slice(0, 500) ?? null,
  });
}

export async function listAuditRecords(input: {
  cursor?: string | null;
  limit: number;
  search?: string;
  outcome?: "success" | "denied" | "error";
  companyPublicId?: string;
}) {
  const db = await requirePlatformDb();
  const cursor = decodeCursor<{ id?: unknown }>(input.cursor);
  const conditions: SQL[] = [];
  if (typeof cursor?.id === "number") conditions.push(lt(auditLog.id, cursor.id));
  if (input.outcome) conditions.push(eq(auditLog.outcome, input.outcome));
  if (input.companyPublicId) conditions.push(eq(companies.publicId, input.companyPublicId));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(
      like(auditLog.action, term),
      like(auditLog.entityType, term),
      like(auditLog.requestId, term),
      like(companies.name, term),
    )!);
  }

  const rows = await db.select({
    cursorId: auditLog.id,
    publicId: auditLog.publicId,
    createdAt: auditLog.createdAt,
    actorType: auditLog.actorType,
    actorName: sql<string | null>`COALESCE(${platformActorUsers.name}, ${tenantActorUsers.name})`,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    action: auditLog.action,
    actionCategory: auditLog.actionCategory,
    entityType: auditLog.entityType,
    entityId: auditLog.entityId,
    outcome: auditLog.outcome,
    ipAddress: auditLog.ipAddress,
    requestId: auditLog.requestId,
  })
    .from(auditLog)
    .leftJoin(companies, eq(auditLog.companyId, companies.id))
    .leftJoin(platformAdministrators, eq(auditLog.platformAdministratorId, platformAdministrators.id))
    .leftJoin(platformActorUsers, eq(platformAdministrators.userId, platformActorUsers.id))
    .leftJoin(tenantActorUsers, eq(auditLog.userId, tenantActorUsers.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(input.limit + 1);
  return publicCursorPage(rows, input.limit);
}

export async function listAuditExportRows(input: {
  search?: string;
  outcome?: "success" | "denied" | "error";
  companyPublicId?: string;
  limit: number;
}) {
  const db = await requirePlatformDb();
  const conditions: SQL[] = [];
  if (input.outcome) conditions.push(eq(auditLog.outcome, input.outcome));
  if (input.companyPublicId) conditions.push(eq(companies.publicId, input.companyPublicId));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(
      like(auditLog.action, term),
      like(auditLog.entityType, term),
      like(auditLog.requestId, term),
      like(companies.name, term),
    )!);
  }
  return db.select({
    createdAt: auditLog.createdAt,
    actorType: auditLog.actorType,
    actorName: sql<string | null>`COALESCE(${platformActorUsers.name}, ${tenantActorUsers.name})`,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    action: auditLog.action,
    actionCategory: auditLog.actionCategory,
    entityType: auditLog.entityType,
    entityId: auditLog.entityId,
    outcome: auditLog.outcome,
    ipAddress: auditLog.ipAddress,
    requestId: auditLog.requestId,
  })
    .from(auditLog)
    .leftJoin(companies, eq(auditLog.companyId, companies.id))
    .leftJoin(platformAdministrators, eq(auditLog.platformAdministratorId, platformAdministrators.id))
    .leftJoin(platformActorUsers, eq(platformAdministrators.userId, platformActorUsers.id))
    .leftJoin(tenantActorUsers, eq(auditLog.userId, tenantActorUsers.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(input.limit);
}

export async function countAuditFailuresSince(since: Date) {
  const db = await requirePlatformDb();
  const [row] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(auditLog)
    .where(and(eq(auditLog.outcome, "error"), sql`${auditLog.createdAt} >= ${since}`));
  return Number(row?.count ?? 0);
}
