import { and, desc, eq, sql } from "drizzle-orm";
import {
  animals,
  auditLog,
  companies,
  companyMemberships,
  farms,
  supportAccessApprovals,
  supportAccessGrants,
  users,
} from "../../../drizzle/schema";
import type { SupportScope } from "../../../shared/tenancy";
import { generatePublicId } from "../../tenancy/publicIds";
import { invalidLifecycle, notFound, versionConflict } from "../errors";
import { appendPlatformAudit, appendSupportAudit, type PlatformAuditActor } from "../repositories/audit";
import { findCompanyByPublicId } from "../repositories/companies";
import { affectedRows, requirePlatformDb } from "../repositories/db";
import { findSupportGrant } from "../repositories/support";
import { rethrowPlatformWriteError } from "./errors";

export async function requestSupportAccess(input: {
  companyPublicId: string;
  accessMode: "read_only" | "write";
  allowedScopes: SupportScope[];
  reason: string;
  ticketReference: string;
  durationMinutes: number;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  try {
    return await db.transaction(async tx => {
      const company = await findCompanyByPublicId(input.companyPublicId, tx);
      if (!company || company.deletedAt) notFound("Company");
      const publicId = generatePublicId();
      const expiresAt = new Date(Date.now() + Math.min(input.durationMinutes, 30) * 60_000);
      const status = input.accessMode === "read_only" ? "active" : "pending";
      await tx.insert(supportAccessGrants).values({
        publicId,
        companyId: company.id,
        requestedByPlatformAdministratorId: actor.platformAdminId,
        accessMode: input.accessMode,
        allowedScopes: input.allowedScopes,
        reason: input.reason.trim(),
        ticketReference: input.ticketReference.trim(),
        status,
        activatedAt: status === "active" ? new Date() : null,
        expiresAt,
      });
      await appendPlatformAudit(tx, actor, {
        action: "support.request",
        actionCategory: "security",
        entityType: "support_access_grant",
        entityId: publicId,
        companyId: company.id,
        after: { accessMode: input.accessMode, allowedScopes: input.allowedScopes, ticketReference: input.ticketReference, status, expiresAt },
      });
      return { publicId, status, expiresAt };
    });
  } catch (error) {
    rethrowPlatformWriteError(error);
  }
}

export async function approveSupportAccess(input: {
  publicId: string;
  decision: "approved" | "rejected";
  notes?: string;
  expectedVersion: number;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const grant = await findSupportGrant(input.publicId, tx);
    if (!grant) notFound("Support grant");
    if (grant.status !== "pending" || grant.accessMode !== "write") invalidLifecycle("Only pending write grants need approval");
    if (grant.requestedByPlatformAdministratorId === actor.platformAdminId) invalidLifecycle("Requesters cannot approve their own write access");
    await tx.insert(supportAccessApprovals).values({
      supportAccessGrantId: grant.id,
      platformAdministratorId: actor.platformAdminId,
      decision: input.decision,
      notes: input.notes?.trim(),
    });
    const nextStatus = input.decision === "approved" ? "active" : "rejected";
    const [result] = await tx.update(supportAccessGrants).set({
      status: nextStatus,
      activatedAt: nextStatus === "active" ? new Date() : null,
      version: sql`${supportAccessGrants.version} + 1`,
    }).where(and(eq(supportAccessGrants.id, grant.id), eq(supportAccessGrants.version, input.expectedVersion)));
    if (affectedRows(result) !== 1) versionConflict("Support grant");
    await appendPlatformAudit(tx, actor, {
      action: `support.${input.decision}`,
      actionCategory: "security",
      entityType: "support_access_grant",
      entityId: grant.publicId,
      companyId: grant.companyId,
      before: { status: grant.status },
      after: { status: nextStatus, notes: input.notes },
    });
    return { publicId: grant.publicId, status: nextStatus };
  });
}

export async function revokeSupportAccess(input: {
  publicId: string;
  expectedVersion: number;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const grant = await findSupportGrant(input.publicId, tx);
    if (!grant) notFound("Support grant");
    if (!(["active", "approved", "pending"] as string[]).includes(grant.status)) invalidLifecycle("Support grant is not revocable");
    const [result] = await tx.update(supportAccessGrants).set({
      status: "revoked",
      revokedAt: new Date(),
      revokedByPlatformAdministratorId: actor.platformAdminId,
      version: sql`${supportAccessGrants.version} + 1`,
    }).where(and(eq(supportAccessGrants.id, grant.id), eq(supportAccessGrants.version, input.expectedVersion)));
    if (affectedRows(result) !== 1) versionConflict("Support grant");
    await appendPlatformAudit(tx, actor, {
      action: "support.revoke",
      actionCategory: "security",
      entityType: "support_access_grant",
      entityId: grant.publicId,
      companyId: grant.companyId,
      before: { status: grant.status },
      after: { status: "revoked" },
    });
    return { publicId: grant.publicId, status: "revoked" as const };
  });
}

export async function inspectTenant(
  input: { publicId: string; scope: SupportScope },
  actor: PlatformAuditActor,
) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const grant = await findSupportGrant(input.publicId, tx);
    if (!grant) notFound("Support grant");
    const scopes = Array.isArray(grant.allowedScopes)
      ? grant.allowedScopes.filter((scope): scope is string => typeof scope === "string")
      : [];
    if (
      grant.requestedByPlatformAdministratorId !== actor.platformAdminId ||
      grant.status !== "active" ||
      !grant.activatedAt ||
      grant.expiresAt.getTime() <= Date.now() ||
      grant.revokedAt ||
      !scopes.includes(input.scope)
    ) {
      invalidLifecycle("Support grant is inactive, expired, or does not allow this scope");
    }

    let data: unknown;
    if (input.scope === "company.summary") {
      const [company] = await tx.select({
          publicId: companies.publicId,
          name: companies.name,
          slug: companies.slug,
          lifecycleStatus: companies.lifecycleStatus,
          createdAt: companies.createdAt,
        }).from(companies).where(eq(companies.id, grant.companyId)).limit(1);
      const [farmCount] = await tx.select({ count: sql<number>`COUNT(*)` }).from(farms)
        .where(eq(farms.companyId, grant.companyId));
      const [memberCount] = await tx.select({ count: sql<number>`COUNT(*)` }).from(companyMemberships)
        .where(eq(companyMemberships.companyId, grant.companyId));
      const [animalCount] = await tx.select({ count: sql<number>`COUNT(*)` }).from(animals)
        .where(eq(animals.companyId, grant.companyId));
      data = {
        company,
        farmCount: Number(farmCount?.count ?? 0),
        memberCount: Number(memberCount?.count ?? 0),
        animalCount: Number(animalCount?.count ?? 0),
      };
    } else if (input.scope === "farms.read") {
      data = await tx.select({
        publicId: farms.publicId,
        name: farms.name,
        code: farms.code,
        timezone: farms.timezone,
        status: farms.status,
        createdAt: farms.createdAt,
      }).from(farms).where(eq(farms.companyId, grant.companyId))
        .orderBy(farms.name).limit(100);
    } else if (input.scope === "memberships.read") {
      data = await tx.select({
        publicId: companyMemberships.publicId,
        userPublicId: users.publicId,
        name: users.name,
        email: users.email,
        role: companyMemberships.role,
        status: companyMemberships.status,
        farmAccessMode: companyMemberships.farmAccessMode,
      }).from(companyMemberships)
        .innerJoin(users, eq(companyMemberships.userId, users.id))
        .where(eq(companyMemberships.companyId, grant.companyId))
        .orderBy(companyMemberships.id).limit(100);
    } else if (input.scope === "animals.read") {
      data = await tx.select({
        publicId: animals.publicId,
        animalId: animals.animalId,
        farmId: animals.farmId,
        sex: animals.sex,
        isActive: animals.isActive,
        acquisitionDate: animals.acquisitionDate,
        exitDate: animals.exitDate,
      }).from(animals).where(eq(animals.companyId, grant.companyId))
        .orderBy(desc(animals.id)).limit(100);
    } else {
      data = await tx.select({
        publicId: auditLog.publicId,
        createdAt: auditLog.createdAt,
        actorType: auditLog.actorType,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        outcome: auditLog.outcome,
        requestId: auditLog.requestId,
      }).from(auditLog).where(eq(auditLog.companyId, grant.companyId))
        .orderBy(desc(auditLog.id)).limit(100);
    }

    await appendSupportAudit(tx, actor, grant, input.scope);
    return {
      grantPublicId: grant.publicId,
      scope: input.scope,
      expiresAt: grant.expiresAt,
      data,
    };
  });
}
