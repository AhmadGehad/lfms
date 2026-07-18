import { createHmac, randomBytes } from "node:crypto";
import type { SessionAudience } from "./opaqueSessions";

export type OAuthStateRecord = {
  id: number;
  stateHash: string;
  audience: SessionAudience;
  redirectUri: string;
  returnTo: string;
  browserBindingHash: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type NewOAuthStateRecord = Omit<OAuthStateRecord, "id" | "consumedAt">;

export interface OAuthStateStore {
  create(record: NewOAuthStateRecord): Promise<void>;
  /** Atomically consumes an unused, unexpired record. */
  consume(input: {
    stateHash: string;
    browserBindingHash: string;
    audience: SessionAudience;
    now: Date;
  }): Promise<OAuthStateRecord | null>;
}

export type OAuthStateManagerOptions = {
  secret: string;
  store: OAuthStateStore;
  allowedRedirectUris: ReadonlySet<string>;
  lifetimeMs?: number;
  now?: () => Date;
};

export type IssuedOAuthState = {
  state: string;
  browserBinding: string;
  expiresAt: Date;
};

function normalizeReturnTo(value: string | null | undefined) {
  if (!value || value.length > 500 || !value.startsWith("/")) return "/";
  if (/[\\\u0000-\u001f\u007f]/.test(value) || /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)) {
    return "/";
  }
  try {
    const trustedOrigin = "https://lfms-return.invalid";
    const target = new URL(value, trustedOrigin);
    const decodedPath = decodeURIComponent(target.pathname).toLowerCase();
    if (
      target.origin !== trustedOrigin ||
      decodedPath === "/api" ||
      decodedPath.startsWith("/api/")
    ) {
      return "/";
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

export class OAuthStateManager {
  private readonly secret: string;
  private readonly store: OAuthStateStore;
  private readonly allowedRedirectUris: ReadonlySet<string>;
  private readonly lifetimeMs: number;
  private readonly now: () => Date;

  constructor(options: OAuthStateManagerOptions) {
    if (options.secret.length < 32) {
      throw new Error("OAUTH_STATE_SECRET must contain at least 32 characters");
    }
    this.secret = options.secret;
    this.store = options.store;
    this.allowedRedirectUris = options.allowedRedirectUris;
    this.lifetimeMs = options.lifetimeMs ?? 10 * 60 * 1_000;
    this.now = options.now ?? (() => new Date());
  }

  private hash(kind: "state" | "binding", value: string) {
    return createHmac("sha256", this.secret)
      .update(kind)
      .update("\0")
      .update(value)
      .digest("hex");
  }

  async issue(input: {
    audience: SessionAudience;
    redirectUri: string;
    returnTo?: string | null;
  }): Promise<IssuedOAuthState> {
    if (!this.allowedRedirectUris.has(input.redirectUri)) {
      throw new Error("OAuth redirect URI is not allowlisted");
    }
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.lifetimeMs);
    const state = randomBytes(32).toString("base64url");
    const browserBinding = randomBytes(32).toString("base64url");

    await this.store.create({
      stateHash: this.hash("state", state),
      audience: input.audience,
      redirectUri: input.redirectUri,
      returnTo: normalizeReturnTo(input.returnTo),
      browserBindingHash: this.hash("binding", browserBinding),
      createdAt: now,
      expiresAt,
    });

    return { state, browserBinding, expiresAt };
  }

  async consume(input: {
    state: string;
    browserBinding: string | null | undefined;
    audience: SessionAudience;
  }) {
    if (
      !input.state ||
      input.state.length > 256 ||
      !input.browserBinding ||
      input.browserBinding.length > 256
    ) {
      return null;
    }

    return this.store.consume({
      stateHash: this.hash("state", input.state),
      browserBindingHash: this.hash("binding", input.browserBinding),
      audience: input.audience,
      now: this.now(),
    });
  }
}

/** Test/local adapter. Production startup must inject a shared durable store. */
export class MemoryOAuthStateStore implements OAuthStateStore {
  private readonly records = new Map<string, OAuthStateRecord>();
  private nextId = 1;

  async create(record: NewOAuthStateRecord) {
    if (this.records.has(record.stateHash)) {
      throw new Error("Duplicate OAuth state hash");
    }
    this.records.set(record.stateHash, {
      ...record,
      id: this.nextId++,
      consumedAt: null,
    });
  }

  async consume(input: {
    stateHash: string;
    browserBindingHash: string;
    audience: SessionAudience;
    now: Date;
  }) {
    const record = this.records.get(input.stateHash);
    if (
      !record ||
      record.consumedAt ||
      record.expiresAt <= input.now ||
      record.audience !== input.audience ||
      record.browserBindingHash !== input.browserBindingHash
    ) return null;
    const consumed = { ...record, consumedAt: input.now };
    this.records.set(input.stateHash, consumed);
    return consumed;
  }
}
