import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  platformAdministratorRoles,
  platformAdministrators,
  platformIdentities,
  platformPermissions,
  platformRolePermissions,
  platformRoles,
  platformSessions,
  users,
} from "../../../drizzle/schema";
import { ENV } from "../../_core/env";
import { generatePublicId } from "../../tenancy/publicIds";
import { invalidLifecycle, notFound, versionConflict } from "../errors";
import { executeIdempotent } from "../idempotency";
import { platformManagementAuthorityRemains, replacePlatformAdministratorRoles } from "../administratorRoles";
import { platformOidcProviderCode, normalizePlatformOidcIssuer } from "../identity";
import { appendPlatformAudit, type PlatformAuditActor } from "../repositories/audit";
import { affectedRows, requirePlatformDb, type PlatformDb } from "../repositories/db";
import { findAdministratorByPublicId } from "../repositories/administrators";
import { rethrowPlatformWriteError } from "./errors";

type AdministratorStatus = typeof platformAdministrators.$inferSelect.status;

export function assertPlatformManagementAuthorityRemains(input: {
  targetId: number;
  nextStatus: AdministratorStatus;
  targetHasManagementPermission: boolean;
  activeManagerIds: number[];
}) {
  if (!platformManagementAuthorityRemains({
    targetId: input.targetId,
    targetWillBeActive: input.nextStatus === "active",
    targetWillHaveManagementPermission: input.targetHasManagementPermission,
    currentActiveManagerIds: input.activeManagerIds,
  })) {
    invalidLifecycle("Cannot remove the last active administrator with platform management authority");
  }
}

async function resolveRoles(tx: PlatformDb, roleCodes: string[]) {
  const codes = [...new Set(roleCodes.map(code => code.trim()).filter(Boolean))].sort();
  if (codes.length === 0) invalidLifecycle("At least one platform role is required");
  const roles = await tx.select({ id: platformRoles.id, code: platformRoles.code })
    .from(platformRoles)
    .where(inArray(platformRoles.code, codes))
    .for("update");
  if (roles.length !== codes.length) invalidLifecycle("One or more platform roles do not exist");
  return roles;
}

async function assertManagementAuthorityRemains(
  tx: PlatformDb,
  targetId: number,
  nextStatus: AdministratorStatus,
  nextRoleIds: number[] | null,
) {
  const active = await tx.select({ id: platformAdministrators.id })
    .from(platformAdministrators)
    .where(eq(platformAdministrators.status, "active"))
    .for("update");
  if (active.length === 0) invalidLifecycle("At least one active platform administrator is required");
  const activeIds = active.map(row => row.id);
  const writers = await tx.selectDistinct({ id: platformAdministratorRoles.platformAdministratorId })
    .from(platformAdministratorRoles)
    .innerJoin(platformRolePermissions, eq(platformAdministratorRoles.platformRoleId, platformRolePermissions.platformRoleId))
    .innerJoin(platformPermissions, eq(platformRolePermissions.platformPermissionId, platformPermissions.id))
    .where(and(
      inArray(platformAdministratorRoles.platformAdministratorId, activeIds),
      eq(platformPermissions.code, "administrators.write"),
    ))
    .for("update");
  let targetKeepsAuthority = nextStatus === "active";
  if (targetKeepsAuthority && nextRoleIds) {
    const [permission] = await tx.select({ id: platformRolePermissions.platformRoleId })
      .from(platformRolePermissions)
      .innerJoin(platformPermissions, eq(platformRolePermissions.platformPermissionId, platformPermissions.id))
      .where(and(
        inArray(platformRolePermissions.platformRoleId, nextRoleIds),
        eq(platformPermissions.code, "administrators.write"),
      ))
      .limit(1);
    targetKeepsAuthority = Boolean(permission);
  }
  assertPlatformManagementAuthorityRemains({
    targetId,
    nextStatus,
    targetHasManagementPermission: targetKeepsAuthority,
    activeManagerIds: writers.map(row => row.id),
  });
}

async function revokeAdministratorSessions(tx: PlatformDb, administratorId: number, reason: string) {
  await tx.update(platformSessions).set({
    revokedAt: new Date(),
    revokedReason: reason,
  }).where(and(
    eq(platformSessions.platformAdministratorId, administratorId),
    isNull(platformSessions.revokedAt),
  ));
}

export async function createPlatformAdministrator(input: {
  name: string;
  email: string;
  oidcSubject: string;
  status: "invited" | "active";
  roleCodes: string[];
  idempotencyKey: string;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  try {
    return await db.transaction(async tx => executeIdempotent(tx, {
      companyId: null,
      userId: actor.userId,
      key: input.idempotencyKey,
      operation: "platform.administrators.create",
      body: {
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        oidcSubject: input.oidcSubject.trim(),
        status: input.status,
        roleCodes: [...new Set(input.roleCodes)].sort(),
      },
    }, async () => {
      if (!ENV.adminOidcIssuer) invalidLifecycle("Platform OIDC is not configured");
      const issuer = normalizePlatformOidcIssuer(ENV.adminOidcIssuer, ENV.isProduction);
      const provider = platformOidcProviderCode(issuer, ENV.isProduction);
      const subject = input.oidcSubject.trim();
      const normalizedEmail = input.email.trim().toLowerCase();
      const roles = await resolveRoles(tx, input.roleCodes);

      const [linkedIdentity] = await tx.select().from(platformIdentities).where(and(
        eq(platformIdentities.provider, provider),
        eq(platformIdentities.providerSubject, subject),
      )).limit(1).for("update");
      if (linkedIdentity) invalidLifecycle("Workforce identity is already linked to an administrator");

      const platformOpenId = `platform:${createHash("sha256").update(`${issuer}\0${subject}`).digest("hex").slice(0, 48)}`;
      const matchingUsers = await tx.select().from(users).where(or(
        eq(users.openId, platformOpenId),
        eq(users.normalizedEmail, normalizedEmail),
      )).for("update");
      if (matchingUsers.length > 1) invalidLifecycle("Workforce identity conflicts with an existing email");
      let user = matchingUsers[0];
      if (user && user.status !== "active") invalidLifecycle("Administrator user identity is unavailable");
      if (user) {
        const [existingAdministrator] = await tx.select({ id: platformAdministrators.id })
          .from(platformAdministrators)
          .where(eq(platformAdministrators.userId, user.id))
          .limit(1)
          .for("update");
        if (existingAdministrator) invalidLifecycle("User is already a platform administrator");
      } else {
        const [inserted] = await tx.insert(users).values({
          publicId: generatePublicId(),
          openId: platformOpenId,
          name: input.name.trim(),
          email: input.email.trim(),
          normalizedEmail,
          loginMethod: "workforce_oidc",
          role: "viewer",
          status: "active",
        });
        [user] = await tx.select().from(users)
          .where(eq(users.id, Number(inserted.insertId)))
          .limit(1);
      }
      if (!user) throw new Error("Administrator user was not persisted");

      const publicId = generatePublicId();
      const [insertedAdministrator] = await tx.insert(platformAdministrators).values({
        publicId,
        userId: user.id,
        status: input.status,
        mfaRequired: true,
        grantedByPlatformAdministratorId: actor.platformAdminId,
      });
      const administratorId = Number(insertedAdministrator.insertId);
      await tx.insert(platformIdentities).values({
        platformAdministratorId: administratorId,
        provider,
        providerSubject: subject,
        providerEmail: normalizedEmail,
        providerEmailVerified: false,
      });
      await replacePlatformAdministratorRoles(tx, administratorId, roles.map(role => role.id), actor.platformAdminId);
      await appendPlatformAudit(tx, actor, {
        action: "platform_administrator.create",
        actionCategory: "security",
        entityType: "platform_administrator",
        entityId: publicId,
        after: { email: normalizedEmail, status: input.status, roleCodes: roles.map(role => role.code) },
      });
      return { publicId, status: input.status, version: 1 };
    }));
  } catch (error) {
    rethrowPlatformWriteError(error);
  }
}

export async function updatePlatformAdministrator(input: {
  publicId: string;
  status?: "active" | "suspended" | "revoked";
  roleCodes?: string[];
  expectedVersion: number;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const administrator = await findAdministratorByPublicId(input.publicId, tx);
    if (!administrator) notFound("Platform administrator");
    if (administrator.id === actor.platformAdminId) {
      invalidLifecycle("Platform administrators cannot change their own access; use another authorized administrator");
    }
    if (!input.status && input.roleCodes === undefined) invalidLifecycle("No administrator changes supplied");
    if (administrator.status === "revoked") invalidLifecycle("Revoked administrators cannot be reactivated");
    const roles = input.roleCodes === undefined ? null : await resolveRoles(tx, input.roleCodes);
    const currentRoles = await tx.select({ code: platformRoles.code })
      .from(platformAdministratorRoles)
      .innerJoin(platformRoles, eq(platformAdministratorRoles.platformRoleId, platformRoles.id))
      .where(eq(platformAdministratorRoles.platformAdministratorId, administrator.id));
    const nextStatus = input.status ?? administrator.status;
    await assertManagementAuthorityRemains(tx, administrator.id, nextStatus, roles?.map(role => role.id) ?? null);

    const [result] = await tx.update(platformAdministrators).set({
      status: input.status,
      revokedAt: input.status === "revoked" ? new Date() : undefined,
      authVersion: sql`${platformAdministrators.authVersion} + 1`,
      version: sql`${platformAdministrators.version} + 1`,
    }).where(and(
      eq(platformAdministrators.id, administrator.id),
      eq(platformAdministrators.version, input.expectedVersion),
    ));
    if (affectedRows(result) !== 1) versionConflict("Platform administrator");

    if (roles) {
      await replacePlatformAdministratorRoles(tx, administrator.id, roles.map(role => role.id), actor.platformAdminId);
    }
    await revokeAdministratorSessions(tx, administrator.id, "platform_access_changed");
    await appendPlatformAudit(tx, actor, {
      action: "platform_administrator.update",
      actionCategory: "security",
      entityType: "platform_administrator",
      entityId: administrator.publicId,
      before: {
        status: administrator.status,
        roleCodes: currentRoles.map(role => role.code).sort(),
        version: administrator.version,
      },
      after: {
        status: nextStatus,
        roleCodes: roles?.map(role => role.code),
        version: administrator.version + 1,
      },
    });
    return { publicId: administrator.publicId, status: nextStatus, version: administrator.version + 1 };
  });
}
