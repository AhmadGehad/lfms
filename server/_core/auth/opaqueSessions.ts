import { createHmac, randomBytes } from "node:crypto";
import type { AuthenticationLevel } from "../../../shared/tenancy";

export type SessionAudience = "tenant" | "platform";

export type SessionRecord = {
  id: number;
  tokenHash: string;
  subjectId: number;
  authVersion: number;
  authLevel: AuthenticationLevel;
  authenticationMethods: readonly string[];
  mfaVerifiedAt: Date | null;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export type NewSessionRecord = Omit<
  SessionRecord,
  "id" | "revokedAt" | "revokedReason"
>;

export interface OpaqueSessionStore {
  create(record: NewSessionRecord): Promise<{ id: number }>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  getCurrentAuthVersion(subjectId: number): Promise<number | null>;
  touch(id: number, lastSeenAt: Date, idleExpiresAt: Date): Promise<void>;
  revoke(id: number, revokedAt: Date, reason: string): Promise<void>;
  revokeAllForSubject(
    subjectId: number,
    revokedAt: Date,
    reason: string,
    exceptSessionId?: number,
  ): Promise<number>;
  enforceActiveSessionLimit(
    subjectId: number,
    maximumActiveSessions: number,
    now: Date,
  ): Promise<void>;
}

export type SessionPrincipal = {
  audience: SessionAudience;
  sessionId: number;
  subjectId: number;
  authLevel: AuthenticationLevel;
  authenticationMethods: readonly string[];
  mfaVerifiedAt: Date | null;
};

export type IssuedSession = {
  token: string;
  principal: SessionPrincipal;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
};

export type IssueSessionInput = {
  subjectId: number;
  authVersion: number;
  authLevel?: AuthenticationLevel;
  authenticationMethods?: readonly string[];
  mfaVerifiedAt?: Date | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type OpaqueSessionManagerOptions = {
  audience: SessionAudience;
  pepper: string;
  store: OpaqueSessionStore;
  idleTimeoutMs?: number;
  absoluteTimeoutMs?: number;
  touchIntervalMs?: number;
  maximumActiveSessions?: number;
  now?: () => Date;
};

const DEFAULTS: Record<
  SessionAudience,
  Pick<
    Required<OpaqueSessionManagerOptions>,
    "idleTimeoutMs" | "absoluteTimeoutMs" | "maximumActiveSessions"
  >
> = {
  tenant: {
    idleTimeoutMs: 8 * 60 * 60 * 1_000,
    absoluteTimeoutMs: 7 * 24 * 60 * 60 * 1_000,
    maximumActiveSessions: 5,
  },
  platform: {
    idleTimeoutMs: 15 * 60 * 1_000,
    absoluteTimeoutMs: 8 * 60 * 60 * 1_000,
    maximumActiveSessions: 3,
  },
};

const MAX_USER_AGENT_LENGTH = 500;
const MAX_IP_LENGTH = 45;

function addMilliseconds(date: Date, milliseconds: number) {
  return new Date(date.getTime() + milliseconds);
}

function normalizeRiskSignal(
  value: string | null | undefined,
  maximumLength: number,
) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maximumLength);
}

export class OpaqueSessionManager {
  private readonly audience: SessionAudience;
  private readonly pepper: string;
  private readonly store: OpaqueSessionStore;
  private readonly idleTimeoutMs: number;
  private readonly absoluteTimeoutMs: number;
  private readonly touchIntervalMs: number;
  private readonly maximumActiveSessions: number;
  private readonly now: () => Date;

  constructor(options: OpaqueSessionManagerOptions) {
    if (options.pepper.length < 32) {
      throw new Error("SESSION_PEPPER must contain at least 32 characters");
    }

    const defaults = DEFAULTS[options.audience];
    this.audience = options.audience;
    this.pepper = options.pepper;
    this.store = options.store;
    this.idleTimeoutMs = options.idleTimeoutMs ?? defaults.idleTimeoutMs;
    this.absoluteTimeoutMs =
      options.absoluteTimeoutMs ?? defaults.absoluteTimeoutMs;
    this.touchIntervalMs = options.touchIntervalMs ?? 5 * 60 * 1_000;
    this.maximumActiveSessions =
      options.maximumActiveSessions ?? defaults.maximumActiveSessions;
    this.now = options.now ?? (() => new Date());
  }

  hashToken(token: string) {
    return createHmac("sha256", this.pepper)
      .update(this.audience)
      .update("\0")
      .update(token)
      .digest("hex");
  }

  async issue(input: IssueSessionInput): Promise<IssuedSession> {
    const now = this.now();
    const token = `${this.audience === "tenant" ? "lfms_t" : "lfms_p"}_${randomBytes(32).toString("base64url")}`;
    const idleExpiresAt = addMilliseconds(now, this.idleTimeoutMs);
    const absoluteExpiresAt = addMilliseconds(now, this.absoluteTimeoutMs);
    const authenticationMethods = [...(input.authenticationMethods ?? [])];

    const stored = await this.store.create({
      tokenHash: this.hashToken(token),
      subjectId: input.subjectId,
      authVersion: input.authVersion,
      authLevel: input.authLevel ?? "primary",
      authenticationMethods,
      mfaVerifiedAt: input.mfaVerifiedAt ?? null,
      createdAt: now,
      lastSeenAt: now,
      idleExpiresAt,
      absoluteExpiresAt,
      ipAddress: normalizeRiskSignal(input.ipAddress, MAX_IP_LENGTH),
      userAgent: normalizeRiskSignal(input.userAgent, MAX_USER_AGENT_LENGTH),
    });

    try {
      await this.store.enforceActiveSessionLimit(
        input.subjectId,
        this.maximumActiveSessions,
        now,
      );
    } catch (error) {
      await this.store.revoke(stored.id, now, "issuance_failed").catch(() => undefined);
      throw error;
    }

    return {
      token,
      principal: {
        audience: this.audience,
        sessionId: stored.id,
        subjectId: input.subjectId,
        authLevel: input.authLevel ?? "primary",
        authenticationMethods,
        mfaVerifiedAt: input.mfaVerifiedAt ?? null,
      },
      idleExpiresAt,
      absoluteExpiresAt,
    };
  }

  async authenticate(token: string | null | undefined) {
    if (!token || token.length > 256) return null;

    const now = this.now();
    const record = await this.store.findByTokenHash(this.hashToken(token));
    if (!record || record.revokedAt) return null;

    if (
      record.idleExpiresAt.getTime() <= now.getTime() ||
      record.absoluteExpiresAt.getTime() <= now.getTime()
    ) {
      await this.store.revoke(record.id, now, "expired");
      return null;
    }

    const currentAuthVersion = await this.store.getCurrentAuthVersion(
      record.subjectId,
    );
    if (
      currentAuthVersion === null ||
      currentAuthVersion !== record.authVersion
    ) {
      await this.store.revoke(record.id, now, "auth_version_changed");
      return null;
    }

    if (now.getTime() - record.lastSeenAt.getTime() >= this.touchIntervalMs) {
      const idleExpiresAt = new Date(
        Math.min(
          now.getTime() + this.idleTimeoutMs,
          record.absoluteExpiresAt.getTime(),
        ),
      );
      await this.store.touch(record.id, now, idleExpiresAt);
    }

    return {
      audience: this.audience,
      sessionId: record.id,
      subjectId: record.subjectId,
      authLevel: record.authLevel,
      authenticationMethods: record.authenticationMethods,
      mfaVerifiedAt: record.mfaVerifiedAt,
    } satisfies SessionPrincipal;
  }

  async revoke(token: string | null | undefined, reason = "logout") {
    if (!token || token.length > 256) return false;
    const record = await this.store.findByTokenHash(this.hashToken(token));
    if (!record || record.revokedAt) return false;
    await this.store.revoke(record.id, this.now(), reason);
    return true;
  }

  async revokeAllForSubject(
    subjectId: number,
    reason: string,
    exceptSessionId?: number,
  ) {
    return this.store.revokeAllForSubject(
      subjectId,
      this.now(),
      reason,
      exceptSessionId,
    );
  }

  async rotate(token: string, input: IssueSessionInput) {
    const current = await this.authenticate(token);
    if (!current || current.subjectId !== input.subjectId) return null;
    const issued = await this.issue(input);
    try {
      const revoked = await this.revoke(token, "rotated");
      if (!revoked) {
        await this.revoke(issued.token, "rotation_failed");
        return null;
      }
    } catch (error) {
      await this.revoke(issued.token, "rotation_failed").catch(() => undefined);
      throw error;
    }
    return issued;
  }
}

/** Test/local adapter. Production startup must inject a shared durable store. */
export class MemoryOpaqueSessionStore implements OpaqueSessionStore {
  private readonly sessions = new Map<number, SessionRecord>();
  private readonly authVersions = new Map<number, number>();
  private nextId = 1;

  setAuthVersion(subjectId: number, authVersion: number) {
    this.authVersions.set(subjectId, authVersion);
  }

  async create(record: NewSessionRecord) {
    const id = this.nextId++;
    this.sessions.set(id, {
      id,
      ...record,
      authenticationMethods: [...record.authenticationMethods],
      revokedAt: null,
      revokedReason: null,
    });
    if (!this.authVersions.has(record.subjectId)) {
      this.authVersions.set(record.subjectId, record.authVersion);
    }
    return { id };
  }

  async findByTokenHash(tokenHash: string) {
    const record = Array.from(this.sessions.values()).find(
      session => session.tokenHash === tokenHash,
    );
    return record ? { ...record } : null;
  }

  async getCurrentAuthVersion(subjectId: number) {
    return this.authVersions.get(subjectId) ?? null;
  }

  async touch(id: number, lastSeenAt: Date, idleExpiresAt: Date) {
    const record = this.sessions.get(id);
    if (!record || record.revokedAt) return;
    this.sessions.set(id, { ...record, lastSeenAt, idleExpiresAt });
  }

  async revoke(id: number, revokedAt: Date, reason: string) {
    const record = this.sessions.get(id);
    if (!record || record.revokedAt) return;
    this.sessions.set(id, { ...record, revokedAt, revokedReason: reason });
  }

  async revokeAllForSubject(
    subjectId: number,
    revokedAt: Date,
    reason: string,
    exceptSessionId?: number,
  ) {
    let count = 0;
    this.sessions.forEach((record, id) => {
      if (
        record.subjectId === subjectId &&
        !record.revokedAt &&
        id !== exceptSessionId
      ) {
        this.sessions.set(id, { ...record, revokedAt, revokedReason: reason });
        count += 1;
      }
    });
    return count;
  }

  async enforceActiveSessionLimit(
    subjectId: number,
    maximumActiveSessions: number,
    now: Date,
  ) {
    const active = Array.from(this.sessions.values())
      .filter(
        record =>
          record.subjectId === subjectId &&
          !record.revokedAt &&
          record.idleExpiresAt > now &&
          record.absoluteExpiresAt > now,
      )
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

    for (const record of active.slice(
      0,
      Math.max(0, active.length - maximumActiveSessions),
    )) {
      await this.revoke(record.id, now, "session_limit");
    }
  }
}
