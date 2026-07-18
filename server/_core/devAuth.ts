import { ENV } from "./env";

function normalizeLoopbackCandidate(value: string) {
  return value
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/^::ffff:/, "");
}

function isLoopbackAddress(value: string | undefined) {
  if (!value) return false;
  const normalized = normalizeLoopbackCandidate(value);
  return normalized === "127.0.0.1";
}

function isLocalDevelopmentHostname(value: string) {
  const normalized = normalizeLoopbackCandidate(value);
  return normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    isLoopbackAddress(normalized);
}

export function validateLocalDevAuthConfiguration(
  enabled = ENV.enableLocalDevAuth,
  isDevelopment = ENV.isDevelopment,
) {
  if (enabled && !isDevelopment) {
    throw new Error("VITE_ENABLE_LOCAL_DEV_AUTH is allowed only with NODE_ENV=development");
  }
}

export function isLocalDevAuthBypassAllowed(
  hostname: string,
  remoteAddress: string | undefined,
  options?: {
    isDevelopment?: boolean;
    enabled?: boolean;
    forwarded?: boolean;
  },
) {
  const isDevelopment = options?.isDevelopment ?? ENV.isDevelopment;
  const enabled = options?.enabled ?? ENV.enableLocalDevAuth;
  return enabled &&
    isDevelopment &&
    options?.forwarded !== true &&
    isLocalDevelopmentHostname(hostname) &&
    isLoopbackAddress(remoteAddress);
}

export function getSafeDevLoginNext(next: unknown) {
  if (typeof next !== "string") return "/";
  if (/%(?:2f|5c)/i.test(next)) return "/";
  try {
    const localOrigin = "http://localhost";
    const url = new URL(next, localOrigin);
    const decodedPath = decodeURIComponent(url.pathname);
    const normalizedPath = decodedPath.toLowerCase();
    if (
      url.origin !== localOrigin ||
      normalizedPath === "/api" ||
      normalizedPath.startsWith("/api/")
    ) {
      return "/";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
