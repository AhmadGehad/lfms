import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, inArray, isNull, like, lt, ne, or, sql, type SQL } from "drizzle-orm";
import {
  auditLog,
  authIdentities,
  companies,
  companyInvitations,
  companyMemberships,
  companySubscriptions,
  farmMemberships,
  farms,
  passwordCredentials,
  users,
} from "../../drizzle/schema";
import type { AppRole } from "../../shared/permissions";
import { decodeCursor } from "../../shared/platformApi";
import { assertWithinLimit, getEffectiveLimit, lockCompanyQuota } from "../entitlements/limits";
import { hashPassword, isPasswordStrongEnough } from "../_core/auth/password";
import { redactLogFields } from "../observability/logger";
import { generatePublicId } from "../tenancy/publicIds";
import { executeIdempotent } from "../platform/idempotency";
import { csvDocument } from "../platform/csv";
import { invalidLifecycle, notFound, versionConflict } from "../platform/errors";
import { appendPlatformAudit, type PlatformAuditActor } from "../platform/repositories/audit";
import { affectedRows, publicCursorPage, requirePlatformDb, type PlatformDb } from "../platform/repositories/db";
import { findCompanyByPublicId } from "../platform/repositories/companies";
import { rethrowPlatformWriteError } from "../platform/services/errors";

const INVITATION_PROVIDER = "password";

const INVITATION_TOKEN_BYTES = 32;
const DEFAULT_EXPIRY_HOURS = 72;

type InvitationRole = Exclude<AppRole, "owner"> | "owner";

export type InvitationIdentityActor = {
  userId: number;
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest();
}

export function hashProviderSubject(provider: string, subject: string) {
  return createHash("sha256")
    .update(provider.trim().toLowerCase())
    .update("\0")
    .update(subject.trim())
    .digest();
}

function emailBindingSubject(normalizedEmail: string) {
  return `email:${normalizedEmail}`;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function uniquePublicIds(values: readonly string[]) {
  return [...new Set(values)].sort();
}

function invitationToken() {
  return randomBytes(INVITATION_TOKEN_BYTES).toString("base64url");
}

function safeFarmPublicIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function driverBinary(value: Buffer) {
  return value as unknown as string;
}

function safeEqual(left: string | Buffer | null, right: Buffer) {
  const buffer = typeof left === "string" ? Buffer.from(left, "binary") : left;
  return Boolean(buffer && buffer.length === right.length && timingSafeEqual(buffer, right));
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "hidden";
  return `${local.slice(0, 1)}${"*".repeat(Math.min(6, Math.max(2, local.length - 1)))}@${domain}`;
}

async function expirePendingInvitations(tx: PlatformDb, companyId: number, now: Date) {
  await tx.update(companyInvitations).set({
    status: "expired",
    version: sql`${companyInvitations.version} + 1`,
  }).where(and(
    eq(companyInvitations.companyId, companyId),
    eq(companyInvitations.status, "pending"),
    sql`${companyInvitations.expiresAt} <= ${now}`,
  ));
}

async function validateInvitationFarms(
  tx: PlatformDb,
  companyId: number,
  farmAccessMode: "all" | "restricted",
  requestedPublicIds: readonly string[],
) {
  const farmPublicIds = uniquePublicIds(requestedPublicIds);
  if (farmAccessMode === "all") {
    if (farmPublicIds.length) invalidLifecycle("All-farm access cannot include explicit assignments");
    return [];
  }
  if (!farmPublicIds.length) invalidLifecycle("Restricted access needs at least one farm");
  const assigned = await tx.select({ id: farms.id, publicId: farms.publicId }).from(farms).where(and(
    eq(farms.companyId, companyId),
    eq(farms.status, "active"),
    isNull(farms.deletedAt),
    inArray(farms.publicId, farmPublicIds),
  ));
  if (assigned.length !== farmPublicIds.length) invalidLifecycle("One or more farms are unavailable");
  return assigned;
}

async function assertInvitationSeatAvailable(tx: PlatformDb, companyId: number, now: Date) {
  await lockCompanyQuota(tx, companyId);
  const [members] = await tx.select({ count: sql<number>`COUNT(*)` }).from(companyMemberships).where(and(
    eq(companyMemberships.companyId, companyId),
    ne(companyMemberships.status, "removed"),
  ));
  const [pending] = await tx.select({ count: sql<number>`COUNT(*)` }).from(companyInvitations).where(and(
    eq(companyInvitations.companyId, companyId),
    eq(companyInvitations.status, "pending"),
    gt(companyInvitations.expiresAt, now),
  ));
  const limit = await getEffectiveLimit(tx, companyId, "users_limit");
  assertWithinLimit(Number(members?.count ?? 0) + Number(pending?.count ?? 0), 1, limit, "users");
}

export async function insertPlatformInvitation(tx: PlatformDb, input: {
  companyId: number;
  companyPublicId: string;
  companySlug: string;
  normalizedEmail: string;
  provider: string;
  role: InvitationRole;
  farmAccessMode: "all" | "restricted";
  farmPublicIds: string[];
  expiresAt: Date;
}, actor: PlatformAuditActor) {
  const token = invitationToken();
  const publicId = generatePublicId();
  const provider = input.provider.trim().toLowerCase();
  const normalizedEmail = normalizeEmail(input.normalizedEmail);
  // Invitations are bound to the recipient's identity-provider email claim.
  // The raw email remains the recipient address; the binding hash is tagged so
  // it cannot be confused with an OAuth subject hash.
  const providerSubjectHash = hashProviderSubject(
    provider,
    emailBindingSubject(normalizedEmail),
  );
  const farmPublicIds = uniquePublicIds(input.farmPublicIds);
  await tx.insert(companyInvitations).values({
    publicId,
    companyId: input.companyId,
    normalizedEmail,
    role: input.role,
    farmAccessMode: input.farmAccessMode,
    farmPublicIds,
    provider,
    providerSubjectHash: driverBinary(providerSubjectHash),
    tokenHash: driverBinary(hashInvitationToken(token)),
    status: "pending",
    invitedByPlatformAdministratorId: actor.platformAdminId,
    expiresAt: input.expiresAt,
  });
  await appendPlatformAudit(tx, actor, {
    action: "invitation.create",
    actionCategory: "membership",
    entityType: "company_invitation",
    entityId: publicId,
    companyId: input.companyId,
    after: {
      normalizedEmail,
      provider,
      role: input.role,
      farmAccessMode: input.farmAccessMode,
      farmCount: farmPublicIds.length,
      expiresAt: input.expiresAt,
    },
  });
  return {
    publicId,
    companyPublicId: input.companyPublicId,
    companySlug: input.companySlug,
    status: "pending" as const,
    expiresAt: input.expiresAt,
    token,
  };
}

export async function createPlatformInvitation(input: {
  companyPublicId: string;
  email: string;
  role: Exclude<AppRole, "owner">;
  farmAccessMode: "all" | "restricted";
  farmPublicIds: string[];
  expiresInHours?: number;
  idempotencyKey: string;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  let issuedCredential: string | null = null;
  try {
    const response = await db.transaction(async tx => {
      const company = await findCompanyByPublicId(input.companyPublicId, tx);
      if (!company || company.deletedAt) notFound("Company");
      const normalizedEmail = normalizeEmail(input.email);
      const farmPublicIds = uniquePublicIds(input.farmPublicIds);
      return executeIdempotent(tx, {
        companyId: company.id,
        userId: actor.userId,
        key: input.idempotencyKey,
        operation: "platform.invitations.create",
        body: {
          companyPublicId: company.publicId,
          provider: INVITATION_PROVIDER,
          normalizedEmail,
          role: input.role,
          farmAccessMode: input.farmAccessMode,
          farmPublicIds,
          expiresInHours: input.expiresInHours ?? DEFAULT_EXPIRY_HOURS,
        },
      }, async () => {
        if (!(company.lifecycleStatus === "active" || company.lifecycleStatus === "provisioning")) {
          invalidLifecycle("Users cannot be invited to an unavailable company");
        }
        const now = new Date();
        await expirePendingInvitations(tx, company.id, now);
        await assertInvitationSeatAvailable(tx, company.id, now);
        await validateInvitationFarms(tx, company.id, input.farmAccessMode, farmPublicIds);
        const [existingUser] = await tx.select({ id: users.id }).from(users)
          .where(eq(users.normalizedEmail, normalizedEmail)).limit(1).for("update");
        if (existingUser) {
          const [existingMembership] = await tx.select({ id: companyMemberships.id })
            .from(companyMemberships)
            .where(and(
              eq(companyMemberships.companyId, company.id),
              eq(companyMemberships.userId, existingUser.id),
            )).limit(1);
          if (existingMembership) invalidLifecycle("User already has a membership in this company");
        }
        const expiresAt = new Date(now.getTime() + (input.expiresInHours ?? DEFAULT_EXPIRY_HOURS) * 60 * 60 * 1_000);
        const invitation = await insertPlatformInvitation(tx, {
          companyId: company.id,
          companyPublicId: company.publicId,
          companySlug: company.slug,
          normalizedEmail,
          provider: INVITATION_PROVIDER,
          role: input.role,
          farmAccessMode: input.farmAccessMode,
          farmPublicIds,
          expiresAt,
        }, actor);
        issuedCredential = invitation.token;
        const { token: _token, ...storedResponse } = invitation;
        return storedResponse;
      });
    });
    return { ...response, invitationToken: issuedCredential };
  } catch (error) {
    rethrowPlatformWriteError(error);
  }
}

export async function listPlatformInvitations(input: {
  cursor?: string | null;
  limit: number;
  search?: string;
  status?: "pending" | "accepted" | "revoked" | "expired";
  companyPublicId?: string;
}) {
  const db = await requirePlatformDb();
  const cursor = decodeCursor<{ id?: unknown }>(input.cursor);
  const conditions: SQL[] = [];
  if (typeof cursor?.id === "number") conditions.push(lt(companyInvitations.id, cursor.id));
  if (input.status) conditions.push(eq(companyInvitations.status, input.status));
  if (input.companyPublicId) conditions.push(eq(companies.publicId, input.companyPublicId));
  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(like(companyInvitations.normalizedEmail, term), like(companies.name, term))!);
  }
  const rows = await db.select({
    cursorId: companyInvitations.id,
    publicId: companyInvitations.publicId,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    companySlug: companies.slug,
    email: companyInvitations.normalizedEmail,
    role: companyInvitations.role,
    farmAccessMode: companyInvitations.farmAccessMode,
    farmPublicIds: companyInvitations.farmPublicIds,
    status: companyInvitations.status,
    expiresAt: companyInvitations.expiresAt,
    acceptedAt: companyInvitations.acceptedAt,
    revokedAt: companyInvitations.revokedAt,
    version: companyInvitations.version,
    createdAt: companyInvitations.createdAt,
  }).from(companyInvitations)
    .innerJoin(companies, eq(companyInvitations.companyId, companies.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(companyInvitations.id))
    .limit(input.limit + 1);
  const now = Date.now();
  return publicCursorPage(rows.map(row => ({
    ...row,
    status: row.status === "pending" && row.expiresAt.getTime() <= now ? "expired" as const : row.status,
  })), input.limit);
}

export async function exportPlatformAccessCsv(input: {
  search?: string;
  companyPublicId?: string;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  const limit = 10_000;
  const membershipConditions: SQL[] = [];
  const invitationConditions: SQL[] = [];
  if (input.companyPublicId) {
    membershipConditions.push(eq(companies.publicId, input.companyPublicId));
    invitationConditions.push(eq(companies.publicId, input.companyPublicId));
  }
  if (input.search) {
    const term = `%${input.search}%`;
    membershipConditions.push(or(like(users.name, term), like(users.email, term), like(companies.name, term))!);
    invitationConditions.push(or(like(companyInvitations.normalizedEmail, term), like(companies.name, term))!);
  }
  const memberships = await db.select({
    publicId: companyMemberships.publicId,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    userPublicId: users.publicId,
    name: users.name,
    email: users.email,
    role: companyMemberships.role,
    status: companyMemberships.status,
    farmAccessMode: companyMemberships.farmAccessMode,
    createdAt: companyMemberships.createdAt,
    joinedAt: companyMemberships.joinedAt,
    lastSignedIn: users.lastSignedIn,
  }).from(companyMemberships)
    .innerJoin(companies, eq(companyMemberships.companyId, companies.id))
    .innerJoin(users, eq(companyMemberships.userId, users.id))
    .where(membershipConditions.length ? and(...membershipConditions) : undefined)
    .orderBy(desc(companyMemberships.id)).limit(limit);
  const remaining = Math.max(0, limit - memberships.length);
  const invitations = remaining === 0 ? [] : await db.select({
    publicId: companyInvitations.publicId,
    companyPublicId: companies.publicId,
    companyName: companies.name,
    email: companyInvitations.normalizedEmail,
    role: companyInvitations.role,
    status: companyInvitations.status,
    farmAccessMode: companyInvitations.farmAccessMode,
    createdAt: companyInvitations.createdAt,
    expiresAt: companyInvitations.expiresAt,
    acceptedAt: companyInvitations.acceptedAt,
  }).from(companyInvitations)
    .innerJoin(companies, eq(companyInvitations.companyId, companies.id))
    .where(invitationConditions.length ? and(...invitationConditions) : undefined)
    .orderBy(desc(companyInvitations.id)).limit(remaining);
  await appendPlatformAudit(db, actor, {
    action: "membership.export",
    actionCategory: "data_export",
    entityType: "company_membership",
    metadata: {
      exportedRows: memberships.length + invitations.length,
      membershipRows: memberships.length,
      invitationRows: invitations.length,
      truncated: memberships.length + invitations.length === limit,
      filters: input,
    },
  });
  const blank = "";
  return {
    filename: `lfms-users-access-${new Date().toISOString().slice(0, 10)}.csv`,
    content: csvDocument(
      ["Record type", "Public ID", "Company ID", "Company", "User ID", "Name", "Email", "Role", "Status", "Farm access", "Created", "Joined", "Last sign-in", "Expires", "Accepted"],
      [
        ...memberships.map(row => ["membership", row.publicId, row.companyPublicId, row.companyName, row.userPublicId, row.name, row.email, row.role, row.status, row.farmAccessMode, row.createdAt, row.joinedAt, row.lastSignedIn, blank, blank]),
        ...invitations.map(row => ["invitation", row.publicId, row.companyPublicId, row.companyName, blank, blank, row.email, row.role, row.status, row.farmAccessMode, row.createdAt, blank, blank, row.expiresAt, row.acceptedAt]),
      ],
    ),
    rowCount: memberships.length + invitations.length,
    truncated: memberships.length + invitations.length === limit,
  };
}

export async function revokePlatformInvitation(input: {
  publicId: string;
  expectedVersion: number;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const [invitation] = await tx.select().from(companyInvitations)
      .where(eq(companyInvitations.publicId, input.publicId)).limit(1).for("update");
    if (!invitation) notFound("Invitation");
    if (invitation.status !== "pending") invalidLifecycle("Only pending invitations can be revoked");
    const now = new Date();
    const expired = invitation.expiresAt <= now;
    const [result] = await tx.update(companyInvitations).set({
      status: expired ? "expired" : "revoked",
      revokedAt: expired ? null : now,
      version: sql`${companyInvitations.version} + 1`,
    }).where(and(
      eq(companyInvitations.id, invitation.id),
      eq(companyInvitations.status, "pending"),
      eq(companyInvitations.version, input.expectedVersion),
    ));
    if (affectedRows(result) !== 1) versionConflict("Invitation");
    await appendPlatformAudit(tx, actor, {
      action: expired ? "invitation.expire" : "invitation.revoke",
      actionCategory: "membership",
      entityType: "company_invitation",
      entityId: invitation.publicId,
      companyId: invitation.companyId,
      before: { status: invitation.status, version: invitation.version },
      after: { status: expired ? "expired" : "revoked", version: invitation.version + 1 },
    });
    return { publicId: invitation.publicId, status: expired ? "expired" as const : "revoked" as const, version: invitation.version + 1 };
  });
}

export async function previewInvitation(input: { token: string; companySlug: string }) {
  const db = await requirePlatformDb();
  const tokenHash = hashInvitationToken(input.token);
  const [row] = await db.select({
    publicId: companyInvitations.publicId,
    companyName: companies.name,
    companySlug: companies.slug,
    companyStatus: companies.lifecycleStatus,
    normalizedEmail: companyInvitations.normalizedEmail,
    role: companyInvitations.role,
    status: companyInvitations.status,
    expiresAt: companyInvitations.expiresAt,
  }).from(companyInvitations)
    .innerJoin(companies, eq(companyInvitations.companyId, companies.id))
    .where(and(eq(companyInvitations.tokenHash, driverBinary(tokenHash)), eq(companies.slug, input.companySlug)))
    .limit(1);
  if (!row) notFound("Invitation");
  const expired = row.status === "pending" && row.expiresAt <= new Date();
  return {
    publicId: row.publicId,
    companyName: row.companyName,
    companySlug: row.companySlug,
    email: maskEmail(row.normalizedEmail),
    role: row.role,
    status: expired ? "expired" as const : row.status,
    expiresAt: row.expiresAt,
    canAccept: !expired && row.status === "pending" && (row.companyStatus === "active" || row.companyStatus === "provisioning"),
  };
}

async function appendAcceptanceAudit(tx: PlatformDb, actor: InvitationIdentityActor, input: {
  companyId: number;
  membershipId?: number;
  invitationPublicId: string;
  outcome: "success" | "denied";
  status: string;
}) {
  await tx.insert(auditLog).values({
    publicId: generatePublicId(),
    companyId: input.companyId,
    userId: actor.userId,
    membershipId: input.membershipId,
    actorType: "tenant_user",
    action: input.outcome === "success" ? "invitation.accept" : "invitation.deny",
    actionCategory: "membership",
    entityType: "company_invitation",
    entityId: input.invitationPublicId,
    newValues: redactLogFields({ status: input.status }),
    requestId: actor.requestId.slice(0, 64),
    outcome: input.outcome,
    ipAddress: actor.ipAddress?.slice(0, 45) ?? null,
    userAgent: actor.userAgent?.slice(0, 500) ?? null,
  });
}

async function appendOwnerActivationAudit(tx: PlatformDb, actor: InvitationIdentityActor, input: {
  companyId: number;
  companyPublicId: string;
  membershipId: number;
}) {
  await tx.insert(auditLog).values({
    publicId: generatePublicId(),
    companyId: input.companyId,
    userId: actor.userId,
    membershipId: input.membershipId,
    actorType: "tenant_user",
    action: "company.activate",
    actionCategory: "company",
    entityType: "company",
    entityId: input.companyPublicId,
    oldValues: redactLogFields({ lifecycleStatus: "provisioning" }),
    newValues: redactLogFields({ lifecycleStatus: "active", trigger: "owner_invitation_accepted" }),
    requestId: actor.requestId.slice(0, 64),
    outcome: "success",
    ipAddress: actor.ipAddress?.slice(0, 45) ?? null,
    userAgent: actor.userAgent?.slice(0, 500) ?? null,
  });
}

export async function acceptInvitation(input: {
  token: string;
  companySlug: string;
}, actor: InvitationIdentityActor) {
  const db = await requirePlatformDb();
  const outcome = await db.transaction(async tx => {
    const tokenHash = hashInvitationToken(input.token);
    const [invitation] = await tx.select({
      invitation: companyInvitations,
      // The drizzle binary() mapping decodes BINARY columns as utf8 text,
      // which destroys hash bytes; read a hex projection for comparisons.
      providerSubjectHashHex: sql<string>`LOWER(HEX(${companyInvitations.providerSubjectHash}))`,
      companyPublicId: companies.publicId,
      companySlug: companies.slug,
      companyStatus: companies.lifecycleStatus,
    }).from(companyInvitations)
      .innerJoin(companies, eq(companyInvitations.companyId, companies.id))
      .where(and(eq(companyInvitations.tokenHash, driverBinary(tokenHash)), eq(companies.slug, input.companySlug)))
      .limit(1).for("update");
    if (!invitation) notFound("Invitation");
    const record = invitation.invitation;
    if (record.status !== "pending") {
      await appendAcceptanceAudit(tx, actor, {
        companyId: record.companyId,
        invitationPublicId: record.publicId,
        outcome: "denied",
        status: record.status,
      });
      return { kind: "unavailable" as const };
    }
    const now = new Date();
    if (record.expiresAt <= now) {
      const [expired] = await tx.update(companyInvitations).set({
        status: "expired",
        version: sql`${companyInvitations.version} + 1`,
      }).where(and(
        eq(companyInvitations.id, record.id),
        eq(companyInvitations.status, "pending"),
        eq(companyInvitations.version, record.version),
      ));
      if (affectedRows(expired) !== 1) return { kind: "unavailable" as const };
      await appendAcceptanceAudit(tx, actor, {
        companyId: record.companyId,
        invitationPublicId: record.publicId,
        outcome: "denied",
        status: "expired",
      });
      return { kind: "expired" as const };
    }
    if (!(invitation.companyStatus === "active" || invitation.companyStatus === "provisioning")) {
      await appendAcceptanceAudit(tx, actor, {
        companyId: record.companyId,
        invitationPublicId: record.publicId,
        outcome: "denied",
        status: "company_unavailable",
      });
      return { kind: "company_unavailable" as const };
    }
    const [identity] = await tx.select({
      providerSubject: authIdentities.providerSubject,
      providerEmail: authIdentities.providerEmail,
      providerEmailVerified: authIdentities.providerEmailVerified,
      userStatus: users.status,
      normalizedEmail: users.normalizedEmail,
      openId: users.openId,
    }).from(authIdentities)
      .innerJoin(users, eq(authIdentities.userId, users.id))
      .where(and(eq(authIdentities.userId, actor.userId), eq(authIdentities.provider, record.provider)))
      .limit(1).for("update");
    const providerEmail = identity?.providerEmail ? normalizeEmail(identity.providerEmail) : null;
    const storedSubjectHash = typeof invitation.providerSubjectHashHex === "string"
      ? Buffer.from(invitation.providerSubjectHashHex, "hex")
      : record.providerSubjectHash;
    const emailBindingMatches = Boolean(providerEmail && safeEqual(
      storedSubjectHash,
      hashProviderSubject(record.provider, emailBindingSubject(providerEmail)),
    ));
    if (!identity || identity.userStatus !== "active" || !identity.providerEmailVerified || !emailBindingMatches ||
      identity.normalizedEmail !== record.normalizedEmail || providerEmail !== record.normalizedEmail) {
      await appendAcceptanceAudit(tx, actor, {
        companyId: record.companyId,
        invitationPublicId: record.publicId,
        outcome: "denied",
        status: "identity_mismatch",
      });
      return { kind: "identity_mismatch" as const };
    }
    await lockCompanyQuota(tx, record.companyId);
    const [memberCount] = await tx.select({ count: sql<number>`COUNT(*)` }).from(companyMemberships).where(and(
      eq(companyMemberships.companyId, record.companyId),
      ne(companyMemberships.status, "removed"),
    ));
    const limit = await getEffectiveLimit(tx, record.companyId, "users_limit");
    assertWithinLimit(Number(memberCount?.count ?? 0), 1, limit, "users");
    const [existing] = await tx.select({ id: companyMemberships.id }).from(companyMemberships).where(and(
      eq(companyMemberships.companyId, record.companyId),
      eq(companyMemberships.userId, actor.userId),
    )).limit(1).for("update");
    if (existing) {
      await appendAcceptanceAudit(tx, actor, {
        companyId: record.companyId,
        invitationPublicId: record.publicId,
        outcome: "denied",
        status: "already_member",
      });
      return { kind: "already_member" as const };
    }
    const farmPublicIds = safeFarmPublicIds(record.farmPublicIds);
    const assignedFarms = await validateInvitationFarms(tx, record.companyId, record.farmAccessMode, farmPublicIds);
    const membershipPublicId = generatePublicId();
    const [membershipResult] = await tx.insert(companyMemberships).values({
      publicId: membershipPublicId,
      companyId: record.companyId,
      userId: actor.userId,
      role: record.role,
      status: "active",
      farmAccessMode: record.farmAccessMode,
      joinedAt: now,
    });
    const membershipId = Number(membershipResult.insertId);
    if (assignedFarms.length) {
      await tx.insert(farmMemberships).values(assignedFarms.map(farm => ({
        companyId: record.companyId,
        companyMembershipId: membershipId,
        farmId: farm.id,
      })));
    }
    const [accepted] = await tx.update(companyInvitations).set({
      status: "accepted",
      acceptedByUserId: actor.userId,
      acceptedAt: now,
      version: sql`${companyInvitations.version} + 1`,
    }).where(and(
      eq(companyInvitations.id, record.id),
      eq(companyInvitations.status, "pending"),
      eq(companyInvitations.version, record.version),
    ));
    if (affectedRows(accepted) !== 1) versionConflict("Invitation");
    let activated = false;
    if (record.role === "owner" && invitation.companyStatus === "provisioning") {
      const [activeFarm] = await tx.select({ id: farms.id }).from(farms).where(and(
        eq(farms.companyId, record.companyId),
        eq(farms.status, "active"),
        isNull(farms.deletedAt),
      )).limit(1).for("update");
      const [currentSubscription] = await tx.select({ id: companySubscriptions.id }).from(companySubscriptions).where(and(
        eq(companySubscriptions.companyId, record.companyId),
        eq(companySubscriptions.isCurrent, true),
        or(
          and(eq(companySubscriptions.status, "trialing"), gt(companySubscriptions.trialEndsAt, now)),
          and(eq(companySubscriptions.status, "active"), gt(companySubscriptions.periodEnd, now)),
          and(eq(companySubscriptions.status, "past_due"), gt(companySubscriptions.graceEndsAt, now)),
        ),
      )).limit(1).for("update");
      if (activeFarm && currentSubscription) {
        const [activation] = await tx.update(companies).set({
          lifecycleStatus: "active",
          suspendedAt: null,
          suspendedReason: null,
          version: sql`${companies.version} + 1`,
        }).where(and(
          eq(companies.id, record.companyId),
          eq(companies.lifecycleStatus, "provisioning"),
        ));
        activated = affectedRows(activation) === 1;
        if (activated) {
          await appendOwnerActivationAudit(tx, actor, {
            companyId: record.companyId,
            companyPublicId: invitation.companyPublicId,
            membershipId,
          });
        }
      }
    }
    await appendAcceptanceAudit(tx, actor, {
      companyId: record.companyId,
      membershipId,
      invitationPublicId: record.publicId,
      outcome: "success",
      status: activated ? "accepted_activated" : "accepted",
    });
    return { kind: "accepted" as const, membershipPublicId, companySlug: invitation.companySlug };
  });
  if (outcome.kind === "accepted") return outcome;
  if (outcome.kind === "expired") invalidLifecycle("Invitation has expired");
  if (outcome.kind === "identity_mismatch") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Invitation does not match the signed-in identity" });
  }
  if (outcome.kind === "company_unavailable") invalidLifecycle("Company is unavailable");
  if (outcome.kind === "already_member") invalidLifecycle("User already has a membership in this company");
  invalidLifecycle("Invitation is no longer available");
}

/**
 * Unauthenticated counterpart to acceptInvitation: creates the invited user
 * (or attaches a password credential to a pre-existing, password-less user)
 * from the invitation's own email binding, then delegates to acceptInvitation
 * for the membership/seat/activation logic.
 */
export async function activateInvitationWithPassword(input: {
  token: string;
  companySlug: string;
  password: string;
}, actor: {
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  if (!isPasswordStrongEnough(input.password)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Password does not meet the minimum requirements" });
  }
  const db = await requirePlatformDb();
  const tokenHash = hashInvitationToken(input.token);
  const userId = await db.transaction(async tx => {
    const [row] = await tx.select({
      invitation: companyInvitations,
    }).from(companyInvitations)
      .innerJoin(companies, eq(companyInvitations.companyId, companies.id))
      .where(and(
        eq(companyInvitations.tokenHash, driverBinary(tokenHash)),
        eq(companies.slug, input.companySlug),
      ))
      .limit(1);
    if (!row) notFound("Invitation");
    const record = row.invitation;
    if (record.status !== "pending" || record.expiresAt <= new Date()) {
      invalidLifecycle("Invitation is no longer available");
    }
    const normalizedEmail = record.normalizedEmail;
    const [existingUser] = await tx.select().from(users)
      .where(eq(users.normalizedEmail, normalizedEmail)).limit(1).for("update");
    let user = existingUser;
    if (user) {
      if (user.status !== "active") invalidLifecycle("Account is not available");
      const [existingCredential] = await tx.select({ userId: passwordCredentials.userId })
        .from(passwordCredentials).where(eq(passwordCredentials.userId, user.id)).limit(1);
      if (existingCredential) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This account already has a password; sign in and accept the invitation instead",
        });
      }
    } else {
      const openId = `password:${createHash("sha256").update(normalizedEmail).digest("hex")}`;
      const [inserted] = await tx.insert(users).values({
        publicId: generatePublicId(),
        openId,
        name: null,
        email: normalizedEmail,
        normalizedEmail,
        loginMethod: "password",
        role: "user",
        status: "active",
      });
      [user] = await tx.select().from(users)
        .where(eq(users.id, Number(inserted.insertId))).limit(1);
    }
    if (!user) throw new Error("Invitee user was not persisted");
    const passwordHash = await hashPassword(input.password);
    await tx.insert(passwordCredentials).values({ userId: user.id, passwordHash });
    const now = new Date();
    await tx.insert(authIdentities).values({
      userId: user.id,
      provider: INVITATION_PROVIDER,
      providerSubject: normalizedEmail,
      providerEmail: normalizedEmail,
      providerEmailVerified: true,
      linkedAt: now,
      lastUsedAt: now,
    });
    return user.id;
  });
  const outcome = await acceptInvitation({ token: input.token, companySlug: input.companySlug }, {
    userId,
    requestId: actor.requestId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
  return { ...outcome, userId };
}
