import { randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PUBLIC_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const MAX_TIMESTAMP = 281_474_976_710_655;

function encodeNumber(value: number, length: number) {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[value % 32] + output;
    value = Math.floor(value / 32);
  }
  if (value !== 0) throw new Error("Value does not fit public ID segment");
  return output;
}

function encodeBytes(bytes: Uint8Array) {
  let output = "";
  let buffer = 0;
  let bufferedBits = 0;

  for (let index = 0; index < bytes.length; index += 1) {
    buffer = (buffer << 8) | bytes[index];
    bufferedBits += 8;
    while (bufferedBits >= 5) {
      bufferedBits -= 5;
      output += CROCKFORD[(buffer >>> bufferedBits) & 31];
      buffer &= (1 << bufferedBits) - 1;
    }
  }

  if (bufferedBits !== 0) {
    output += CROCKFORD[(buffer << (5 - bufferedBits)) & 31];
  }
  return output;
}

export function generatePublicId(
  timestamp = Date.now(),
  entropy: Uint8Array = randomBytes(10),
) {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > MAX_TIMESTAMP) {
    throw new Error("Invalid public ID timestamp");
  }
  if (entropy.length !== 10) throw new Error("Public ID entropy must contain 10 bytes");
  return `${encodeNumber(timestamp, 10)}${encodeBytes(entropy)}`;
}

export function isPublicId(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_ID_PATTERN.test(value);
}

export function normalizePublicId(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!isPublicId(normalized)) throw new Error("Invalid public ID");
  return normalized;
}
