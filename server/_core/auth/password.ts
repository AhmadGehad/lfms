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
