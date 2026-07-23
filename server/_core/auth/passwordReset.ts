import { createHash, randomBytes } from "node:crypto";
import { authenticationTokens } from "../../../drizzle/schema";
import { getDb } from "../../db";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1_000;
const RESET_TOKEN_BYTES = 32;

function driverBinary(value: Buffer) {
  return value as unknown as string;
}

export function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest();
}

export function generateResetToken() {
  return randomBytes(RESET_TOKEN_BYTES).toString("base64url");
}

export async function issuePasswordResetToken(userId: number, targetValue?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const token = generateResetToken();
  await db.insert(authenticationTokens).values({
    userId,
    purpose: "reset_password",
    tokenHash: driverBinary(hashResetToken(token)),
    targetValue: targetValue ?? null,
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });
  return token;
}
