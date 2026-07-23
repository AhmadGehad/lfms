import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { companies, companyMemberships, farmMemberships, farms, passwordCredentials, users } from "../../../drizzle/schema";
import type { AppRole } from "../../../shared/permissions";
import { ENV } from "../../_core/env";
import { hashPassword, isPasswordStrongEnough } from "../../_core/auth/password";
import { issuePasswordResetToken } from "../../_core/auth/passwordReset";
import { isEmailConfigured, sendEmail } from "../../_core/email";
import { invalidLifecycle, notFound, versionConflict } from "../errors";
import { appendPlatformAudit, type PlatformAuditActor } from "../repositories/audit";
import { affectedRows, requirePlatformDb } from "../repositories/db";
import { findMembershipByPublicId } from "../repositories/memberships";
import { assertWithinLimit, getEffectiveLimit, lockCompanyQuota } from "../../entitlements/limits";

export async function updateMembership(input: {
  publicId: string;
  role?: AppRole;
  status?: "invited" | "active" | "suspended" | "removed";
  farmAccessMode?: "all" | "restricted";
  farmPublicIds?: string[];
  expectedVersion: number;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const membership = await findMembershipByPublicId(input.publicId, tx);
    if (!membership) notFound("Membership");
    if (membership.role === "owner" || input.role === "owner") {
      invalidLifecycle("Company ownership changes require the dedicated ownership-transfer workflow");
    }
    if (!input.role && !input.status && !input.farmAccessMode && input.farmPublicIds === undefined) {
      invalidLifecycle("No membership changes supplied");
    }
    if (membership.status === "removed" && input.status && input.status !== "removed") {
      await lockCompanyQuota(tx, membership.companyId);
      const [count] = await tx.select({ count: sql<number>`COUNT(*)` })
        .from(companyMemberships)
        .where(and(
          eq(companyMemberships.companyId, membership.companyId),
          ne(companyMemberships.status, "removed"),
        ));
      const limit = await getEffectiveLimit(tx, membership.companyId, "users_limit");
      assertWithinLimit(Number(count?.count ?? 0), 1, limit, "users");
    }
    if (input.status === "active") {
      const [identity] = await tx.select({ status: users.status })
        .from(users)
        .where(eq(users.id, membership.userId))
        .limit(1)
        .for("update");
      if (!identity || identity.status !== "active") {
        invalidLifecycle("Membership cannot be activated for an unavailable user identity");
      }
    }
    const nextFarmAccessMode = input.farmAccessMode ?? membership.farmAccessMode;
    let assignedFarmIds: number[] | null = null;
    if (nextFarmAccessMode === "all") {
      if (input.farmPublicIds?.length) invalidLifecycle("All-farm access cannot include explicit assignments");
      assignedFarmIds = [];
    } else if (input.farmPublicIds !== undefined) {
      const distinctPublicIds = [...new Set(input.farmPublicIds)];
      if (distinctPublicIds.length === 0) invalidLifecycle("Restricted access needs at least one farm");
      const assignedFarms = await tx.select({ id: farms.id }).from(farms).where(and(
        eq(farms.companyId, membership.companyId),
        eq(farms.status, "active"),
        isNull(farms.deletedAt),
        inArray(farms.publicId, distinctPublicIds),
      ));
      if (assignedFarms.length !== distinctPublicIds.length) {
        invalidLifecycle("One or more farms are unavailable");
      }
      assignedFarmIds = assignedFarms.map(farm => farm.id);
    } else if (input.farmAccessMode === "restricted") {
      invalidLifecycle("Restricted access needs explicit farm assignments");
    }
    const [result] = await tx.update(companyMemberships).set({
      role: input.role,
      status: input.status,
      farmAccessMode: input.farmAccessMode,
      removedAt: input.status === "removed" ? new Date() : input.status ? null : undefined,
      authorizationVersion: sql`${companyMemberships.authorizationVersion} + 1`,
      version: sql`${companyMemberships.version} + 1`,
    }).where(and(eq(companyMemberships.id, membership.id), eq(companyMemberships.version, input.expectedVersion)));
    if (affectedRows(result) !== 1) versionConflict("Membership");
    if (assignedFarmIds !== null) {
      await tx.delete(farmMemberships).where(and(
        eq(farmMemberships.companyId, membership.companyId),
        eq(farmMemberships.companyMembershipId, membership.id),
      ));
      if (assignedFarmIds.length > 0) {
        await tx.insert(farmMemberships).values(assignedFarmIds.map(farmId => ({
          companyId: membership.companyId,
          companyMembershipId: membership.id,
          farmId,
        })));
      }
    }
    await appendPlatformAudit(tx, actor, {
      action: "membership.update",
      actionCategory: "membership",
      entityType: "company_membership",
      entityId: membership.publicId,
      companyId: membership.companyId,
      before: { role: membership.role, status: membership.status, farmAccessMode: membership.farmAccessMode, version: membership.version },
      after: {
        role: input.role ?? membership.role,
        status: input.status ?? membership.status,
        farmAccessMode: nextFarmAccessMode,
        farmAssignmentCount: assignedFarmIds?.length,
        version: membership.version + 1,
      },
    });
    return { publicId: membership.publicId, version: membership.version + 1 };
  });
}

export async function inspectMembership(publicId: string, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const membership = await findMembershipByPublicId(publicId, tx);
    if (!membership) notFound("Membership");
    const [detail] = await tx.select({
      publicId: companyMemberships.publicId,
      userPublicId: users.publicId,
      userName: users.name,
      email: users.email,
      role: companyMemberships.role,
      status: companyMemberships.status,
      farmAccessMode: companyMemberships.farmAccessMode,
      joinedAt: companyMemberships.joinedAt,
      createdAt: companyMemberships.createdAt,
      lastSignedIn: users.lastSignedIn,
      companyPublicId: companies.publicId,
      companyName: companies.name,
    }).from(companyMemberships)
      .innerJoin(companies, eq(companyMemberships.companyId, companies.id))
      .innerJoin(users, eq(companyMemberships.userId, users.id))
      .where(eq(companyMemberships.id, membership.id)).limit(1);
    if (!detail) notFound("Membership");
    const assignedFarms = membership.farmAccessMode === "all" ? [] : await tx.select({
      publicId: farms.publicId,
      name: farms.name,
      code: farms.code,
      status: farms.status,
    }).from(farmMemberships)
      .innerJoin(farms, and(eq(farms.companyId, farmMemberships.companyId), eq(farms.id, farmMemberships.farmId)))
      .where(and(
        eq(farmMemberships.companyId, membership.companyId),
        eq(farmMemberships.companyMembershipId, membership.id),
      ));
    await appendPlatformAudit(tx, actor, {
      action: "membership.inspect",
      actionCategory: "membership",
      entityType: "company_membership",
      entityId: membership.publicId,
      companyId: membership.companyId,
      metadata: { scope: "membership.detail" },
    });
    return { ...detail, assignedFarms };
  });
}

export async function setMembershipPassword(input: {
  publicId: string;
  password: string;
}, actor: PlatformAuditActor) {
  if (!isPasswordStrongEnough(input.password)) {
    invalidLifecycle("Password does not meet the minimum requirements");
  }
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const membership = await findMembershipByPublicId(input.publicId, tx);
    if (!membership) notFound("Membership");
    const passwordHash = await hashPassword(input.password);
    const [existing] = await tx.select({ userId: passwordCredentials.userId })
      .from(passwordCredentials).where(eq(passwordCredentials.userId, membership.userId)).limit(1);
    if (existing) {
      await tx.update(passwordCredentials).set({
        passwordHash,
        passwordChangedAt: new Date(),
        passwordNeedsRehash: false,
      }).where(eq(passwordCredentials.userId, membership.userId));
    } else {
      await tx.insert(passwordCredentials).values({ userId: membership.userId, passwordHash });
    }
    await tx.update(users).set({
      authVersion: sql`${users.authVersion} + 1`,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastPasswordChange: new Date(),
    }).where(eq(users.id, membership.userId));
    await appendPlatformAudit(tx, actor, {
      action: "membership.password_set",
      actionCategory: "membership",
      entityType: "company_membership",
      entityId: membership.publicId,
      companyId: membership.companyId,
      metadata: { setBy: "platform_admin" },
    });
    return { publicId: membership.publicId };
  });
}

export async function sendMembershipPasswordReset(input: {
  publicId: string;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  const membership = await findMembershipByPublicId(input.publicId, db);
  if (!membership) notFound("Membership");
  const [row] = await db.select({ email: users.normalizedEmail, companySlug: companies.slug })
    .from(users).innerJoin(companies, eq(companies.id, membership.companyId))
    .where(eq(users.id, membership.userId)).limit(1);
  if (!row?.email) invalidLifecycle("User has no email on file");
  const token = await issuePasswordResetToken(membership.userId, row.email);
  const resetLink = `https://${row.companySlug}.${ENV.baseDomain}/reset-password?token=${encodeURIComponent(token)}`;
  const sent = isEmailConfigured();
  if (sent) {
    await sendEmail({
      to: row.email,
      subject: "Reset your LFMS password",
      text: `An administrator triggered a password reset for your LFMS account.\n\nSet a new password: ${resetLink}\n\nThis link expires in 1 hour. If you didn't expect this, contact your administrator.`,
    });
  }
  await appendPlatformAudit(db, actor, {
    action: "membership.password_reset_sent",
    actionCategory: "membership",
    entityType: "company_membership",
    entityId: membership.publicId,
    companyId: membership.companyId,
    metadata: { emailSent: sent },
  });
  return { sent };
}
