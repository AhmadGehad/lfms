/**
 * Bootstrap a platform administrator with an email + password credential.
 *
 * The administrator's identity is a synthesized openId (`password:<sha256
 * (email)>`), matching the convention used by the self-hosted password login
 * routes (server/_core/passwordAuth.ts, server/invitations/service.ts). No
 * Manus or workforce OIDC identity is required.
 *
 * Required env vars:
 *   DATABASE_URL              - MySQL connection string
 *   ADMIN_BOOTSTRAP_EMAIL     - Administrator email address
 *   ADMIN_BOOTSTRAP_NAME      - Display name
 *
 * Optional:
 *   ADMIN_BOOTSTRAP_PASSWORD  - Initial password (>= 12 chars). If omitted, a
 *                               random password is generated and printed once.
 *   ADMIN_BOOTSTRAP_ROLE      - Platform role code (default: platform_admin)
 *
 * Usage:
 *   DATABASE_URL=... \
 *   ADMIN_BOOTSTRAP_EMAIL=admin@example.com \
 *   ADMIN_BOOTSTRAP_NAME="Alice" \
 *   pnpm tsx scripts/bootstrap-platform-admin-password.ts
 */
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  auditLog,
  passwordCredentials,
  platformAdministratorRoles,
  platformAdministrators,
  platformPermissions,
  platformRolePermissions,
  platformRoles,
  platformSessions,
  users,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import { generatePublicId } from "../server/tenancy/publicIds";
import { hashPassword, isPasswordStrongEnough } from "../server/_core/auth/password";
import {
  platformManagementAuthorityRemains,
  replacePlatformAdministratorRoles,
} from "../server/platform/administratorRoles";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function generateRandomPassword() {
  return randomBytes(24).toString("base64url");
}

const email = required("ADMIN_BOOTSTRAP_EMAIL").toLowerCase();
const name = required("ADMIN_BOOTSTRAP_NAME");
const roleCode = process.env.ADMIN_BOOTSTRAP_ROLE?.trim() || "platform_admin";
const providedPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
const generatedPassword = providedPassword ? null : generateRandomPassword();
const password = providedPassword ?? generatedPassword!;
if (!isPasswordStrongEnough(password)) {
  throw new Error("ADMIN_BOOTSTRAP_PASSWORD does not meet the minimum requirements (>= 12 characters)");
}
const openId = `password:${createHash("sha256").update(email).digest("hex").slice(0, 48)}`;

const db = await getDb();
if (!db) throw new Error("DATABASE_URL is required");

const passwordHash = await hashPassword(password);

const result = await db.transaction(async tx => {
  const [role] = await tx
    .select({ id: platformRoles.id })
    .from(platformRoles)
    .where(eq(platformRoles.code, roleCode))
    .limit(1);
  if (!role) throw new Error(`Platform role not found: ${roleCode}. Run SaaS migrations first.`);

  const matchingUsers = await tx
    .select()
    .from(users)
    .where(or(eq(users.openId, openId), eq(users.normalizedEmail, email)))
    .for("update");
  if (matchingUsers.length > 1) throw new Error("Bootstrap email conflicts with more than one existing user");
  let [user] = matchingUsers;

  if (!user) {
    const [inserted] = await tx.insert(users).values({
      publicId: generatePublicId(),
      openId,
      name,
      email,
      normalizedEmail: email,
      loginMethod: "password",
      role: "viewer",
      status: "active",
    });
    [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, Number(inserted.insertId)))
      .limit(1);
  }
  if (!user || user.status !== "active") throw new Error("Bootstrap user is not active");

  const [existingCredential] = await tx
    .select({ userId: passwordCredentials.userId })
    .from(passwordCredentials)
    .where(eq(passwordCredentials.userId, user.id))
    .limit(1);
  if (existingCredential) {
    await tx.update(passwordCredentials).set({
      passwordHash,
      passwordChangedAt: new Date(),
      passwordNeedsRehash: false,
    }).where(eq(passwordCredentials.userId, user.id));
  } else {
    await tx.insert(passwordCredentials).values({ userId: user.id, passwordHash });
  }

  let [administrator] = await tx
    .select()
    .from(platformAdministrators)
    .where(eq(platformAdministrators.userId, user.id))
    .limit(1)
    .for("update");

  if (!administrator) {
    const [inserted] = await tx.insert(platformAdministrators).values({
      publicId: generatePublicId(),
      userId: user.id,
      status: "active",
      mfaRequired: false,
    });
    [administrator] = await tx
      .select()
      .from(platformAdministrators)
      .where(eq(platformAdministrators.id, Number(inserted.insertId)))
      .limit(1);
  }
  if (!administrator || administrator.status !== "active") {
    throw new Error("Existing platform administrator is not active; use the recovery runbook");
  }

  const activeAdministrators = await tx
    .select({ id: platformAdministrators.id })
    .from(platformAdministrators)
    .where(eq(platformAdministrators.status, "active"))
    .for("update");
  const activeAdministratorIds = activeAdministrators.map(row => row.id);

  const activeManagers = await tx
    .selectDistinct({ id: platformAdministratorRoles.platformAdministratorId })
    .from(platformAdministratorRoles)
    .innerJoin(
      platformRolePermissions,
      eq(platformAdministratorRoles.platformRoleId, platformRolePermissions.platformRoleId),
    )
    .innerJoin(
      platformPermissions,
      eq(platformRolePermissions.platformPermissionId, platformPermissions.id),
    )
    .where(
      and(
        inArray(platformAdministratorRoles.platformAdministratorId, activeAdministratorIds),
        eq(platformPermissions.code, "administrators.write"),
      ),
    )
    .for("update");

  const [selectedManagementPermission] = await tx
    .select({ id: platformRolePermissions.platformRoleId })
    .from(platformRolePermissions)
    .innerJoin(
      platformPermissions,
      eq(platformRolePermissions.platformPermissionId, platformPermissions.id),
    )
    .where(
      and(
        eq(platformRolePermissions.platformRoleId, role.id),
        eq(platformPermissions.code, "administrators.write"),
      ),
    )
    .limit(1);

  if (
    !platformManagementAuthorityRemains({
      targetId: administrator.id,
      targetWillBeActive: true,
      targetWillHaveManagementPermission: Boolean(selectedManagementPermission),
      currentActiveManagerIds: activeManagers.map(manager => manager.id),
    })
  ) {
    throw new Error("Bootstrap role replacement would remove the last active platform manager");
  }

  const currentRoles = await tx
    .select({
      roleId: platformAdministratorRoles.platformRoleId,
      code: platformRoles.code,
    })
    .from(platformAdministratorRoles)
    .innerJoin(platformRoles, eq(platformAdministratorRoles.platformRoleId, platformRoles.id))
    .where(eq(platformAdministratorRoles.platformAdministratorId, administrator.id))
    .for("update");

  if (currentRoles.length !== 1 || currentRoles[0]?.roleId !== role.id) {
    await replacePlatformAdministratorRoles(tx, administrator.id, [role.id]);
    await tx
      .update(platformAdministrators)
      .set({
        authVersion: sql`${platformAdministrators.authVersion} + 1`,
        version: sql`${platformAdministrators.version} + 1`,
      })
      .where(eq(platformAdministrators.id, administrator.id));
    await tx
      .update(platformSessions)
      .set({ revokedAt: new Date(), revokedReason: "bootstrap_role_replaced" })
      .where(
        and(
          eq(platformSessions.platformAdministratorId, administrator.id),
          isNull(platformSessions.revokedAt),
        ),
      );
  }

  await tx.insert(auditLog).values({
    publicId: generatePublicId(),
    platformAdministratorId: administrator.id,
    actorType: "migration",
    action: "platform_administrator.bootstrap",
    actionCategory: "security",
    entityType: "platform_administrator",
    entityId: administrator.publicId,
    oldValues: { roleCodes: currentRoles.map(r => r.code).sort() },
    newValues: { roleCodes: [roleCode], status: administrator.status },
    requestId: `admin-bootstrap-${generatePublicId()}`,
    outcome: "success",
  });

  return { administratorPublicId: administrator.publicId, email, role: roleCode };
});

process.stdout.write(`${JSON.stringify(result)}\n`);
if (generatedPassword) {
  process.stderr.write(`Generated password (shown once): ${generatedPassword}\n`);
}
