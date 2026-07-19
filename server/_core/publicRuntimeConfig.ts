import type { Express } from "express";

export type PublicRuntimeConfig = {
  analyticsEndpoint?: string;
  analyticsWebsiteId?: string;
  appTitle?: string;
  defaultDesign: "old" | "new";
  frontendForgeApiUrl?: string;
  supportEmail?: string;
};

function trimmed(value: string | undefined, maximumLength: number) {
  const normalized = value?.trim();
  return normalized && normalized.length <= maximumLength
    ? normalized
    : undefined;
}

function webUrl(value: string | undefined, isProduction: boolean) {
  const normalized = trimmed(value, 2_048);
  if (!normalized) return undefined;
  try {
    const url = new URL(normalized);
    if (url.username || url.password) return undefined;
    if (
      isProduction
        ? url.protocol !== "https:"
        : !["http:", "https:"].includes(url.protocol)
    ) {
      return undefined;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export function buildPublicRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env
): PublicRuntimeConfig {
  const isProduction = environment.NODE_ENV === "production";
  const defaultDesign =
    environment.VITE_DEFAULT_DESIGN === "new" ? "new" : "old";
  const supportEmail = trimmed(environment.VITE_SUPPORT_EMAIL, 254);

  return {
    analyticsEndpoint: webUrl(
      environment.VITE_ANALYTICS_ENDPOINT,
      isProduction
    ),
    analyticsWebsiteId: trimmed(environment.VITE_ANALYTICS_WEBSITE_ID, 200),
    appTitle: trimmed(environment.VITE_APP_TITLE, 100),
    defaultDesign,
    frontendForgeApiUrl: webUrl(
      environment.VITE_FRONTEND_FORGE_API_URL,
      isProduction
    ),
    supportEmail:
      supportEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)
        ? supportEmail
        : undefined,
  };
}

export function serializePublicRuntimeConfig(config: PublicRuntimeConfig) {
  const json = JSON.stringify(config)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `globalThis.__LFMS_PUBLIC_CONFIG__=Object.freeze(${json});`;
}

export function registerPublicRuntimeConfig(app: Express) {
  app.get("/runtime-config.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.type("application/javascript");
    res.send(serializePublicRuntimeConfig(buildPublicRuntimeConfig()));
  });
}
