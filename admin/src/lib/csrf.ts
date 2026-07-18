let csrfToken: string | null = null;

export function setPlatformCsrfToken(value: string | null | undefined) {
  csrfToken = value ?? null;
}

export function getPlatformCsrfHeaders() {
  if (typeof document !== "undefined") {
    const cookieValue = document.cookie
      .split("; ")
      .find(entry => entry.startsWith("__Host-lfms_platform_csrf=") || entry.startsWith("lfms_platform_csrf="))
      ?.split("=")
      .slice(1)
      .join("=");
    if (cookieValue) csrfToken = decodeURIComponent(cookieValue);
  }
  return csrfToken ? { "X-LFMS-CSRF": csrfToken } : {};
}
