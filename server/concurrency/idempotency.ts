import { createHash } from "node:crypto";

export type IdempotencyScope = Readonly<{
  companyId: number;
  actorId: string;
  operation: string;
  key: string;
}>;

export type IdempotencyBeginResult<TResult> =
  | { state: "started"; recordId: number }
  | { state: "completed"; result: TResult }
  | { state: "processing" }
  | { state: "conflict" };

export interface IdempotencyStore<TResult, TTransaction = unknown> {
  begin(
    scope: IdempotencyScope,
    requestHash: string,
    transaction?: TTransaction,
  ): Promise<IdempotencyBeginResult<TResult>>;
  complete(recordId: number, result: TResult, transaction?: TTransaction): Promise<void>;
  fail(recordId: number, errorCode: string, transaction?: TTransaction): Promise<void>;
}

export class IdempotencyError extends Error {
  constructor(public readonly code: "IDEMPOTENCY_CONFLICT" | "IDEMPOTENCY_IN_PROGRESS") {
    super(code === "IDEMPOTENCY_CONFLICT"
      ? "Idempotency key was already used for a different request"
      : "Request with this idempotency key is still processing");
    this.name = "IdempotencyError";
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hashIdempotencyRequest(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export class IdempotencyService<TResult, TTransaction = unknown> {
  constructor(private readonly store: IdempotencyStore<TResult, TTransaction>) {}

  async execute(
    scope: IdempotencyScope,
    request: unknown,
    action: () => Promise<TResult>,
    transaction?: TTransaction,
  ): Promise<TResult> {
    if (!scope.key || scope.key.length > 200) throw new Error("Invalid idempotency key");
    const begin = await this.store.begin(scope, hashIdempotencyRequest(request), transaction);
    if (begin.state === "completed") return begin.result;
    if (begin.state === "processing") throw new IdempotencyError("IDEMPOTENCY_IN_PROGRESS");
    if (begin.state === "conflict") throw new IdempotencyError("IDEMPOTENCY_CONFLICT");

    try {
      const result = await action();
      await this.store.complete(begin.recordId, result, transaction);
      return result;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "FAILED";
      await this.store.fail(begin.recordId, code, transaction);
      throw error;
    }
  }
}
