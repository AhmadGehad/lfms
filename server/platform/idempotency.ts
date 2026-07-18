import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { idempotencyKeys } from "../../drizzle/schema";
import type { PlatformDb } from "./repositories/db";

const PROCESSING_LEASE_MS = 2 * 60 * 1_000;
const RETENTION_MS = 24 * 60 * 60 * 1_000;

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(item => canonicalize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashIdempotencyRequest(input: {
  key: string;
  operation: string;
  body: unknown;
}) {
  return {
    keyHash: sha256(input.key),
    requestPathHash: sha256(input.operation),
    requestBodyHash: sha256(JSON.stringify(canonicalize(input.body))),
  };
}

function isDuplicateKey(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    String((error as { code?: unknown }).code ?? "") === "ER_DUP_ENTRY",
  );
}

/**
 * Run a platform mutation once. The idempotency claim, business writes, audit,
 * and cached response share the caller's transaction.
 */
export async function executeIdempotent<T>(
  tx: PlatformDb,
  input: {
    companyId: number | null;
    userId: number;
    key: string;
    operation: string;
    body: unknown;
  },
  operation: () => Promise<T>,
): Promise<T> {
  if (input.key.length < 8 || input.key.length > 200) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid idempotency key" });
  }

  const now = new Date();
  const hashes = hashIdempotencyRequest(input);
  let created = false;
  try {
    await tx.insert(idempotencyKeys).values({
      companyId: input.companyId,
      userId: input.userId,
      ...hashes,
      requestMethod: "POST",
      status: "processing",
      lockedUntil: new Date(now.getTime() + PROCESSING_LEASE_MS),
      expiresAt: new Date(now.getTime() + RETENTION_MS),
    });
    created = true;
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }

  const companyPredicate = input.companyId === null
    ? isNull(idempotencyKeys.companyId)
    : eq(idempotencyKeys.companyId, input.companyId);
  const [claim] = await tx.select().from(idempotencyKeys).where(and(
    companyPredicate,
    eq(idempotencyKeys.userId, input.userId),
    eq(idempotencyKeys.requestMethod, "POST"),
    eq(idempotencyKeys.requestPathHash, hashes.requestPathHash),
    eq(idempotencyKeys.keyHash, hashes.keyHash),
  )).limit(1).for("update");
  if (!claim) throw new Error("Idempotency claim was not persisted");

  if (!created) {
    if (claim.requestBodyHash !== hashes.requestBodyHash) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Idempotency key was already used with different input",
      });
    }
    if (claim.status === "completed") return claim.responseBody as T;
    if (claim.status === "processing" && claim.lockedUntil && claim.lockedUntil > now) {
      throw new TRPCError({ code: "CONFLICT", message: "Request is already processing" });
    }
    await tx.update(idempotencyKeys).set({
      status: "processing",
      responseStatus: null,
      responseBody: null,
      lockedUntil: new Date(now.getTime() + PROCESSING_LEASE_MS),
      expiresAt: new Date(now.getTime() + RETENTION_MS),
    }).where(eq(idempotencyKeys.id, claim.id));
  }

  const response = await operation();
  await tx.update(idempotencyKeys).set({
    status: "completed",
    responseStatus: 200,
    responseBody: canonicalize(response),
    lockedUntil: null,
    expiresAt: new Date(now.getTime() + RETENTION_MS),
  }).where(and(
    eq(idempotencyKeys.id, claim.id),
    eq(idempotencyKeys.status, "processing"),
  ));
  return response;
}
