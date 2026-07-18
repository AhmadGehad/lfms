/**
 * Bootstrap a platform administrator using their Manus openId.
 *
 * Since the admin portal now uses Manus OAuth (not external OIDC), the
 * administrator's identity is their Manus openId stored directly in the
 * `users.openId` column. No `platformIdentities` record is needed.
 *
 * Required env vars:
 *   DATABASE_URL          - MySQL connection string
 *   ADMIN_BOOTSTRAP_OPEN_ID - The Manus openId of the user to promote
 *   ADMIN_BOOTSTRAP_EMAIL   - Their email address (for display)
 *   ADMIN_BOOTSTRAP_NAME    - Their display name
 *
 * Optional:
 *   ADMIN_BOOTSTRAP_ROLE  - Platform role code (default: platform_admin)
 *
 * Usage:
 *   DATABASE_URL=... \
 *   ADMIN_BOOTSTRAP_OPEN_ID=manus:abc123 \
 *   ADMIN_BOOTSTRAP_EMAIL=admin@example.com \
 *   ADMIN_BOOTSTRAP_NAME="Alice" \
 *   pnpm tsx scripts/bootstrap-platform-admin-manus.ts
 */
import "dotenv/config";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  platformAdministratorRoles,
  platformAdministrators,
  auditLog,
  platformPermissions,
  platformRolePermissions,
  platformRoles,
  platformSessions,
  users,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import { generatePublicId } from "../server/tenancy/publicIds";
import {
  platformManagementAuthorityRemains,
  replacePlatformAdministratorRoles,
} from "../server/platform/administratorRoles";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const openId = required("ADMIN_BOOTSTRAP_OPEN_ID");
const email = required("ADMIN_BOOTSTRAP_EMAIL").toLowerCase();
const name = required("ADMIN_BOOTSTRAP_NAME");
const roleCode = process.env.ADMIN_BOOTSTRAP_ROLE?.trim() || "platform_admin";

const db = await getDb();
if (!db) throw new Error("DATABASE_URL is required");

const result = await db.transaction(async tx => {
  // 1. Resolve the platform role
  const [role] = await tx
    .select({ id: platformRoles.id })
    .from(platformRoles)
    .where(eq(platformRoles.code, roleCode))
    .limit(1);
  if (!role) throw new Error(`Platform role not found: ${roleCode}. Run SaaS migrations first.`);

  // 2. Find or create the user record
  let [user] = await tx
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .for("update")
    .limit(1);

  if (!user) {
    const [inserted] = await tx.insert(users).values({
      publicId: generatePublicId(),
      openId,
      name,
      email,
      normalizedEmail: email,
      loginMethod: "manus",
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

  // 3. Find or create the platformAdministrators record
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
      mfaRequired: false, // Manus OAuth handles authentication strength
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

  // 4. Safety check: ensure management authority is preserved
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

  // 5. Assign role (replace existing roles)
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
    // Revoke any existing platform sessions so the new role takes effect immediately
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

  // 6. Audit log
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

  return { administratorPublicId: administrator.publicId, email, openId, role: roleCode };
});

process.stdout.write(`${JSON.stringify(result)}\n`);
