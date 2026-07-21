export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export function isLocalDevHost(hostname: string) {
  return hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1";
}

export function shouldUseLocalDevLogin(
  isDevelopment: boolean,
  enabled: boolean,
  hostname: string,
) {
  return isDevelopment && enabled && isLocalDevHost(hostname);
}

// OAuth state and redirect validation are generated server-side.
export const getLoginUrl = () => {
  if (shouldUseLocalDevLogin(
    import.meta.env.DEV,
    import.meta.env.VITE_ENABLE_LOCAL_DEV_AUTH === "1",
    window.location.hostname,
  )) {
    const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const url = new URL("/api/dev/login", window.location.origin);
    url.searchParams.set("next", next);
    return url.toString();
  }

  const url = new URL("/login", window.location.origin);
  url.searchParams.set(
    "returnTo",
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );

  return url.toString();
};
