import "dotenv/config";
import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  platformAdministratorRoles,
  platformAdministrators,
  auditLog,
  platformIdentities,
  platformPermissions,
  platformRolePermissions,
  platformRoles,
  platformSessions,
  users,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import { generatePublicId } from "../server/tenancy/publicIds";
import { normalizePlatformOidcIssuer, platformOidcProviderCode } from "../server/platform/identity";
import { platformManagementAuthorityRemains, replacePlatformAdministratorRoles } from "../server/platform/administratorRoles";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const subject = required("ADMIN_BOOTSTRAP_OIDC_SUBJECT");
const email = required("ADMIN_BOOTSTRAP_EMAIL").toLowerCase();
const name = required("ADMIN_BOOTSTRAP_NAME");
const issuer = normalizePlatformOidcIssuer(required("ADMIN_OIDC_ISSUER"), process.env.NODE_ENV === "production");
const roleCode = process.env.ADMIN_BOOTSTRAP_ROLE?.trim() || "platform_admin";
const provider = platformOidcProviderCode(issuer, process.env.NODE_ENV === "production");
const platformOpenId = `platform:${createHash("sha256").update(`${issuer}\0${subject}`).digest("hex").slice(0, 48)}`;

const db = await getDb();
if (!db) throw new Error("DATABASE_URL is required");

const result = await db.transaction(async tx => {
  const [role] = await tx.select({ id: platformRoles.id }).from(platformRoles)
    .where(eq(platformRoles.code, roleCode)).limit(1);
  if (!role) throw new Error(`Platform role not found: ${roleCode}. Run SaaS migrations first.`);

  const matchingUsers = await tx.select().from(users).where(or(
    eq(users.openId, platformOpenId),
    eq(users.normalizedEmail, email),
  )).for("update");
  if (matchingUsers.length > 1) throw new Error("Bootstrap identity conflicts with an existing email");
  let user = matchingUsers[0];
  if (!user) {
    const [inserted] = await tx.insert(users).values({
      publicId: generatePublicId(),
      openId: platformOpenId,
      name,
      email,
      normalizedEmail: email,
      loginMethod: "workforce_oidc",
      role: "viewer",
      status: "active",
    });
    [user] = await tx.select().from(users).where(eq(users.id, Number(inserted.insertId))).limit(1);
  }
  if (!user || user.status !== "active") throw new Error("Bootstrap user is not active");

  let [administrator] = await tx.select().from(platformAdministrators)
    .where(eq(platformAdministrators.userId, user.id)).limit(1).for("update");
  if (!administrator) {
    const [inserted] = await tx.insert(platformAdministrators).values({
      publicId: generatePublicId(),
      userId: user.id,
      status: "active",
      mfaRequired: true,
    });
    [administrator] = await tx.select().from(platformAdministrators)
      .where(eq(platformAdministrators.id, Number(inserted.insertId))).limit(1);
  }
  if (!administrator || administrator.status !== "active") {
    throw new Error("Existing platform administrator is not active; use the recovery runbook");
  }

  const activeAdministrators = await tx.select({ id: platformAdministrators.id })
    .from(platformAdministrators)
    .where(eq(platformAdministrators.status, "active"))
    .for("update");
  const activeAdministratorIds = activeAdministrators.map(row => row.id);
  const activeManagers = await tx.selectDistinct({ id: platformAdministratorRoles.platformAdministratorId })
    .from(platformAdministratorRoles)
    .innerJoin(platformRolePermissions, eq(platformAdministratorRoles.platformRoleId, platformRolePermissions.platformRoleId))
    .innerJoin(platformPermissions, eq(platformRolePermissions.platformPermissionId, platformPermissions.id))
    .where(and(
      inArray(platformAdministratorRoles.platformAdministratorId, activeAdministratorIds),
      eq(platformPermissions.code, "administrators.write"),
    ))
    .for("update");
  const [selectedManagementPermission] = await tx.select({ id: platformRolePermissions.platformRoleId })
    .from(platformRolePermissions)
    .innerJoin(platformPermissions, eq(platformRolePermissions.platformPermissionId, platformPermissions.id))
    .where(and(
      eq(platformRolePermissions.platformRoleId, role.id),
      eq(platformPermissions.code, "administrators.write"),
    ))
    .limit(1);
  if (!platformManagementAuthorityRemains({
    targetId: administrator.id,
    targetWillBeActive: true,
    targetWillHaveManagementPermission: Boolean(selectedManagementPermission),
    currentActiveManagerIds: activeManagers.map(manager => manager.id),
  })) {
    throw new Error("Bootstrap role replacement would remove the last active platform manager");
  }

  const identities = await tx.select().from(platformIdentities).where(or(
    and(eq(platformIdentities.provider, provider), eq(platformIdentities.providerSubject, subject)),
    and(eq(platformIdentities.platformAdministratorId, administrator.id), eq(platformIdentities.provider, provider)),
  )).for("update");
  if (identities.some(identity =>
    identity.platformAdministratorId !== administrator.id || identity.providerSubject !== subject
  )) throw new Error("Workforce identity is already linked to another administrator");
  if (identities.length === 0) {
    await tx.insert(platformIdentities).values({
      platformAdministratorId: administrator.id,
      provider,
      providerSubject: subject,
      providerEmail: email,
      providerEmailVerified: true,
    });
  }
  const currentRoles = await tx.select({
    roleId: platformAdministratorRoles.platformRoleId,
    code: platformRoles.code,
  })
    .from(platformAdministratorRoles)
    .innerJoin(platformRoles, eq(platformAdministratorRoles.platformRoleId, platformRoles.id))
    .where(eq(platformAdministratorRoles.platformAdministratorId, administrator.id))
    .for("update");
  if (currentRoles.length !== 1 || currentRoles[0]?.roleId !== role.id) {
    await replacePlatformAdministratorRoles(tx, administrator.id, [role.id]);
    await tx.update(platformAdministrators).set({
      authVersion: sql`${platformAdministrators.authVersion} + 1`,
      version: sql`${platformAdministrators.version} + 1`,
    }).where(eq(platformAdministrators.id, administrator.id));
    await tx.update(platformSessions).set({
      revokedAt: new Date(),
      revokedReason: "bootstrap_role_replaced",
    }).where(and(
      eq(platformSessions.platformAdministratorId, administrator.id),
      isNull(platformSessions.revokedAt),
    ));
  }
  await tx.insert(auditLog).values({
    publicId: generatePublicId(),
    platformAdministratorId: administrator.id,
    actorType: "migration",
    action: "platform_administrator.bootstrap",
    actionCategory: "security",
    entityType: "platform_administrator",
    entityId: administrator.publicId,
    oldValues: { roleCodes: currentRoles.map(currentRole => currentRole.code).sort() },
    newValues: { roleCodes: [roleCode], status: administrator.status },
    requestId: `admin-bootstrap-${generatePublicId()}`,
    outcome: "success",
  });
  return { administratorPublicId: administrator.publicId, email, role: roleCode };
});

process.stdout.write(`${JSON.stringify(result)}\n`);
