import { ENV } from "./env";

function normalizeLoopbackCandidate(value: string) {
  return value
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/^::ffff:/, "");
}

function isLoopback(value: string | undefined) {
  if (!value) return false;
  const normalized = normalizeLoopbackCandidate(value);
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function isLocalDevAuthBypassAllowed(
  hostname: string,
  remoteAddress: string | undefined,
  isProduction = ENV.isProduction
) {
  return !isProduction && isLoopback(hostname) && isLoopback(remoteAddress);
}

export function getSafeDevLoginNext(next: unknown) {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  if (next.startsWith("/api/")) return "/";
  return next;
}
