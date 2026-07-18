import { createHash } from "node:crypto";

export type AuditActor =
  | { type: "tenant_user"; userId: number; membershipId: number }
  | { type: "platform_admin"; platformAdminId: number; supportGrantId?: number }
  | { type: "system_job"; jobId: number };

export type AuditOutcome = "succeeded" | "denied" | "failed";

export type AuditEventInput<TTransaction = unknown> = Readonly<{
  companyId: number | null;
  farmId?: number | null;
  actor: AuditActor;
  action: string;
  category: "authentication" | "authorization" | "business" | "billing" | "security" | "data";
  targetType: string;
  targetPublicId?: string | null;
  outcome: AuditOutcome;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  requestId: string;
  sessionId?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  transaction: TTransaction;
}>;

export type PersistedAuditEvent = Omit<AuditEventInput<never>, "transaction"> & {
  occurredAt: Date;
  payloadHash: string;
};

export interface AppendOnlyAuditStore<TTransaction = unknown> {
  append(event: PersistedAuditEvent, transaction: TTransaction): Promise<void>;
}

const SENSITIVE_FIELD = /password|passwd|secret|token|authorization|cookie|credential|api.?key|mfa.?secret|recovery.?code/i;
const MAX_TEXT_LENGTH = 4_000;
const MAX_ARRAY_ITEMS = 100;
const MAX_OBJECT_KEYS = 200;

export function redactAuditValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return value.length > MAX_TEXT_LENGTH
      ? `${value.slice(0, MAX_TEXT_LENGTH)}[TRUNCATED]`
      : value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map(item => redactAuditValue(item, seen));
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
    output[key] = SENSITIVE_FIELD.test(key)
      ? "[REDACTED]"
      : redactAuditValue(nested, seen);
  }
  return output;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export class AuditService<TTransaction = unknown> {
  constructor(
    private readonly store: AppendOnlyAuditStore<TTransaction>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async record(input: AuditEventInput<TTransaction>) {
    if (!input.requestId || !input.action || !input.targetType) {
      throw new Error("Audit event requires requestId, action, and targetType");
    }
    const before = redactAuditValue(input.before);
    const after = redactAuditValue(input.after);
    const base = {
      companyId: input.companyId,
      farmId: input.farmId ?? null,
      actor: input.actor,
      action: input.action,
      category: input.category,
      targetType: input.targetType,
      targetPublicId: input.targetPublicId ?? null,
      outcome: input.outcome,
      reason: input.reason ?? null,
      before,
      after,
      requestId: input.requestId,
      sessionId: input.sessionId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      occurredAt: this.now(),
    };
    const event: PersistedAuditEvent = {
      ...base,
      payloadHash: createHash("sha256").update(stableJson(base)).digest("hex"),
    };
    await this.store.append(event, input.transaction);
    return event;
  }
}
