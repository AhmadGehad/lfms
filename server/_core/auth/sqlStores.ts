import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  authIdentities,
  authRateLimits,
  oauthStates,
  platformAdministrators,
  platformSessions,
  tenantSessions,
  users,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import { generatePublicId } from "../../tenancy/publicIds";
import type {
  NewOAuthStateRecord,
  OAuthStateRecord,
  OAuthStateStore,
} from "./oauthState";
import type {
  NewSessionRecord,
  OpaqueSessionStore,
  SessionRecord,
} from "./opaqueSessions";
import type { RateLimitStore } from "../security/rateLimit";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

export async function recordOAuthIdentity(input: {
  userId: number;
  provider: string;
  providerSubject: string;
  providerEmail?: string | null;
  providerEmailVerified?: boolean;
}) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const identities = await tx
      .select()
      .from(authIdentities)
      .where(or(
        and(
          eq(authIdentities.provider, input.provider),
          eq(authIdentities.providerSubject, input.providerSubject),
        ),
        and(
          eq(authIdentities.userId, input.userId),
          eq(authIdentities.provider, input.provider),
        ),
      ))
      .for("update");

    const conflict = identities.find(identity =>
      identity.userId !== input.userId ||
      identity.providerSubject !== input.providerSubject
    );
    if (conflict) throw new Error("OAuth identity is already linked");

    const now = new Date();
    const existing = identities[0];
    if (existing) {
      await tx
        .update(authIdentities)
        .set({
          providerEmail: input.providerEmail ?? existing.providerEmail,
          providerEmailVerified:
            input.providerEmailVerified ?? existing.providerEmailVerified,
          lastUsedAt: now,
        })
        .where(eq(authIdentities.id, existing.id));
      return;
    }

    await tx.insert(authIdentities).values({
      userId: input.userId,
      provider: input.provider,
      providerSubject: input.providerSubject,
      providerEmail: input.providerEmail ?? null,
      providerEmailVerified: input.providerEmailVerified ?? false,
      linkedAt: now,
      lastUsedAt: now,
    });
  });
}

function normalizeAuthenticationMethods(value: unknown) {
  return Array.isArray(value)
    ? value.filter((method): method is string => typeof method === "string")
    : [];
}

function tenantRecord(
  row: typeof tenantSessions.$inferSelect,
): SessionRecord {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    subjectId: row.userId,
    authVersion: row.userAuthVersion,
    authLevel: row.authLevel,
    authenticationMethods: normalizeAuthenticationMethods(
      row.authenticationMethods,
    ),
    mfaVerifiedAt: row.mfaVerifiedAt,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    idleExpiresAt: row.idleExpiresAt,
    absoluteExpiresAt: row.expiresAt,
    idleTimeoutMs: row.idleTimeoutMs,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
  };
}

function platformRecord(
  row: typeof platformSessions.$inferSelect,
): SessionRecord {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    subjectId: row.platformAdministratorId,
    authVersion: row.authVersion,
    authLevel: row.authLevel,
    authenticationMethods: normalizeAuthenticationMethods(
      row.authenticationMethods,
    ),
    mfaVerifiedAt: row.mfaVerifiedAt,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    idleExpiresAt: row.idleExpiresAt,
    absoluteExpiresAt: row.expiresAt,
    idleTimeoutMs: null,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
  };
}

export class SqlTenantSessionStore implements OpaqueSessionStore {
  async create(record: NewSessionRecord) {
    const db = await requireDb();
    const [result] = await db.insert(tenantSessions).values({
      publicId: generatePublicId(),
      tokenFamilyId: generatePublicId(),
      tokenHash: record.tokenHash,
      userId: record.subjectId,
      userAuthVersion: record.authVersion,
      authLevel: record.authLevel,
      authenticationMethods: [...record.authenticationMethods],
      mfaVerifiedAt: record.mfaVerifiedAt,
      createdAt: record.createdAt,
      lastSeenAt: record.lastSeenAt,
      idleExpiresAt: record.idleExpiresAt,
      expiresAt: record.absoluteExpiresAt,
      idleTimeoutMs: record.idleTimeoutMs,
      ipAddress: record.ipAddress,
      userAgent: record.userAgent,
    });
    return { id: Number((result as { insertId?: number }).insertId) };
  }

  async findByTokenHash(tokenHash: string) {
    const db = await requireDb();
    const [row] = await db
      .select()
      .from(tenantSessions)
      .where(eq(tenantSessions.tokenHash, tokenHash))
      .limit(1);
    return row ? tenantRecord(row) : null;
  }

  async getCurrentAuthVersion(subjectId: number) {
    const db = await requireDb();
    const [row] = await db
      .select({ authVersion: users.authVersion })
      .from(users)
      .where(and(eq(users.id, subjectId), eq(users.status, "active")))
      .limit(1);
    return row?.authVersion ?? null;
  }

  async touch(id: number, lastSeenAt: Date, idleExpiresAt: Date) {
    const db = await requireDb();
    await db
      .update(tenantSessions)
      .set({ lastSeenAt, idleExpiresAt })
      .where(and(eq(tenantSessions.id, id), isNull(tenantSessions.revokedAt)));
  }

  async revoke(id: number, revokedAt: Date, reason: string) {
    const db = await requireDb();
    await db
      .update(tenantSessions)
      .set({ revokedAt, revokedReason: reason.slice(0, 200) })
      .where(and(eq(tenantSessions.id, id), isNull(tenantSessions.revokedAt)));
  }

  async revokeAllForSubject(
    subjectId: number,
    revokedAt: Date,
    reason: string,
    exceptSessionId?: number,
  ) {
    const db = await requireDb();
    const filters = [
      eq(tenantSessions.userId, subjectId),
      isNull(tenantSessions.revokedAt),
    ];
    if (exceptSessionId !== undefined) {
      filters.push(ne(tenantSessions.id, exceptSessionId));
    }
    const result = await db
      .update(tenantSessions)
      .set({ revokedAt, revokedReason: reason.slice(0, 200) })
      .where(and(...filters));
    return Number((result as any)?.[0]?.affectedRows ?? 0);
  }

  async enforceActiveSessionLimit(
    subjectId: number,
    maximumActiveSessions: number,
    now: Date,
  ) {
    const db = await requireDb();
    await db.transaction(async tx => {
      const active = await tx
        .select({ id: tenantSessions.id })
        .from(tenantSessions)
        .where(and(
          eq(tenantSessions.userId, subjectId),
          isNull(tenantSessions.revokedAt),
          gt(tenantSessions.idleExpiresAt, now),
          gt(tenantSessions.expiresAt, now),
        ))
        .orderBy(asc(tenantSessions.createdAt), asc(tenantSessions.id))
        .for("update");
      const overflow = active.slice(
        0,
        Math.max(0, active.length - maximumActiveSessions),
      );
      if (!overflow.length) return;
      await tx
        .update(tenantSessions)
        .set({ revokedAt: now, revokedReason: "session_limit" })
        .where(inArray(tenantSessions.id, overflow.map(row => row.id)));
    });
  }
}

export class SqlPlatformSessionStore implements OpaqueSessionStore {
  async create(record: NewSessionRecord) {
    const db = await requireDb();
    const [result] = await db.insert(platformSessions).values({
      publicId: generatePublicId(),
      tokenFamilyId: generatePublicId(),
      tokenHash: record.tokenHash,
      platformAdministratorId: record.subjectId,
      authVersion: record.authVersion,
      authLevel: record.authLevel,
      authenticationMethods: [...record.authenticationMethods],
      mfaVerifiedAt: record.mfaVerifiedAt,
      createdAt: record.createdAt,
      lastSeenAt: record.lastSeenAt,
      idleExpiresAt: record.idleExpiresAt,
      expiresAt: record.absoluteExpiresAt,
      ipAddress: record.ipAddress,
      userAgent: record.userAgent,
    });
    return { id: Number((result as { insertId?: number }).insertId) };
  }

  async findByTokenHash(tokenHash: string) {
    const db = await requireDb();
    const [row] = await db
      .select()
      .from(platformSessions)
      .where(eq(platformSessions.tokenHash, tokenHash))
      .limit(1);
    return row ? platformRecord(row) : null;
  }

  async getCurrentAuthVersion(subjectId: number) {
    const db = await requireDb();
    const [row] = await db
      .select({ authVersion: platformAdministrators.authVersion })
      .from(platformAdministrators)
      .where(and(
        eq(platformAdministrators.id, subjectId),
        eq(platformAdministrators.status, "active"),
      ))
      .limit(1);
    return row?.authVersion ?? null;
  }

  async touch(id: number, lastSeenAt: Date, idleExpiresAt: Date) {
    const db = await requireDb();
    await db
      .update(platformSessions)
      .set({ lastSeenAt, idleExpiresAt })
      .where(and(eq(platformSessions.id, id), isNull(platformSessions.revokedAt)));
  }

  async revoke(id: number, revokedAt: Date, reason: string) {
    const db = await requireDb();
    await db
      .update(platformSessions)
      .set({ revokedAt, revokedReason: reason.slice(0, 200) })
      .where(and(eq(platformSessions.id, id), isNull(platformSessions.revokedAt)));
  }

  async revokeAllForSubject(
    subjectId: number,
    revokedAt: Date,
    reason: string,
    exceptSessionId?: number,
  ) {
    const db = await requireDb();
    const filters = [
      eq(platformSessions.platformAdministratorId, subjectId),
      isNull(platformSessions.revokedAt),
    ];
    if (exceptSessionId !== undefined) {
      filters.push(ne(platformSessions.id, exceptSessionId));
    }
    const result = await db
      .update(platformSessions)
      .set({ revokedAt, revokedReason: reason.slice(0, 200) })
      .where(and(...filters));
    return Number((result as any)?.[0]?.affectedRows ?? 0);
  }

  async enforceActiveSessionLimit(
    subjectId: number,
    maximumActiveSessions: number,
    now: Date,
  ) {
    const db = await requireDb();
    await db.transaction(async tx => {
      const active = await tx
        .select({ id: platformSessions.id })
        .from(platformSessions)
        .where(and(
          eq(platformSessions.platformAdministratorId, subjectId),
          isNull(platformSessions.revokedAt),
          gt(platformSessions.idleExpiresAt, now),
          gt(platformSessions.expiresAt, now),
        ))
        .orderBy(asc(platformSessions.createdAt), asc(platformSessions.id))
        .for("update");
      const overflow = active.slice(
        0,
        Math.max(0, active.length - maximumActiveSessions),
      );
      if (!overflow.length) return;
      await tx
        .update(platformSessions)
        .set({ revokedAt: now, revokedReason: "session_limit" })
        .where(inArray(platformSessions.id, overflow.map(row => row.id)));
    });
  }
}

export class SqlOAuthStateStore implements OAuthStateStore {
  async create(record: NewOAuthStateRecord) {
    const db = await requireDb();
    await db.insert(oauthStates).values(record);
  }

  async consume(input: {
    stateHash: string;
    browserBindingHash: string;
    audience: "tenant" | "platform";
    now: Date;
  }): Promise<OAuthStateRecord | null> {
    const db = await requireDb();
    return db.transaction(async tx => {
      const [record] = await tx
        .select()
        .from(oauthStates)
        .where(and(
          eq(oauthStates.stateHash, input.stateHash),
          eq(oauthStates.browserBindingHash, input.browserBindingHash),
          eq(oauthStates.audience, input.audience),
          isNull(oauthStates.consumedAt),
          gt(oauthStates.expiresAt, input.now),
        ))
        .limit(1)
        .for("update");
      if (!record) return null;
      await tx
        .update(oauthStates)
        .set({ consumedAt: input.now })
        .where(and(eq(oauthStates.id, record.id), isNull(oauthStates.consumedAt)));
      return { ...record, consumedAt: input.now };
    });
  }
}

export class SqlRateLimitStore implements RateLimitStore {
  async increment(keyHash: string, bucketStart: Date, expiresAt: Date) {
    const db = await requireDb();
    return db.transaction(async tx => {
      await tx
        .insert(authRateLimits)
        .values({ keyHash, bucketStart, expiresAt, count: 1 })
        .onDuplicateKeyUpdate({
          set: {
            count: sql`${authRateLimits.count} + 1`,
            expiresAt,
          },
        });
      const [row] = await tx
        .select({ count: authRateLimits.count })
        .from(authRateLimits)
        .where(and(
          eq(authRateLimits.keyHash, keyHash),
          eq(authRateLimits.bucketStart, bucketStart),
        ))
        .limit(1);
      if (!row) throw new Error("Rate-limit bucket write failed");
      return row.count;
    });
  }
}
