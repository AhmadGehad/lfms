import { hashPassword as betterAuthHashPassword, verifyPassword as betterAuthVerifyPassword } from "better-auth/crypto";

export const MINIMUM_PASSWORD_LENGTH = 12;

export function isPasswordStrongEnough(password: string) {
  return typeof password === "string" && password.length >= MINIMUM_PASSWORD_LENGTH && password.length <= 512;
}

export async function hashPassword(password: string) {
  return betterAuthHashPassword(password);
}

export async function verifyPassword(hash: string, password: string) {
  return betterAuthVerifyPassword({ hash, password });
}

let dummyHash: Promise<string> | null = null;

/**
 * Runs a real scrypt verification against a fixed, never-matching hash when
 * no user/credential exists, so "unknown email" and "wrong password" take
 * the same amount of time. Without this, an attacker can enumerate valid
 * emails purely from response latency (missing account = instant 401,
 * existing account = one scrypt hash's worth of delay).
 */
export async function burnPasswordVerificationTime() {
  dummyHash ??= betterAuthHashPassword("lfms-constant-time-placeholder");
  await betterAuthVerifyPassword({ hash: await dummyHash, password: "irrelevant" });
}
