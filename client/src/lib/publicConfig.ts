export type BrowserPublicConfig = {
  analyticsEndpoint?: string;
  analyticsWebsiteId?: string;
  appTitle?: string;
  defaultDesign?: "old" | "new";
  frontendForgeApiUrl?: string;
  supportEmail?: string;
};

declare global {
  interface Window {
    __LFMS_PUBLIC_CONFIG__?: BrowserPublicConfig;
  }
}

const runtime = window.__LFMS_PUBLIC_CONFIG__ ?? {};
const developmentFallback: BrowserPublicConfig = import.meta.env.DEV
  ? {
      analyticsEndpoint: import.meta.env.VITE_ANALYTICS_ENDPOINT,
      analyticsWebsiteId: import.meta.env.VITE_ANALYTICS_WEBSITE_ID,
      appTitle: import.meta.env.VITE_APP_TITLE,
      defaultDesign: import.meta.env.VITE_DEFAULT_DESIGN,
      frontendForgeApiUrl: import.meta.env.VITE_FRONTEND_FORGE_API_URL,
      supportEmail: import.meta.env.VITE_SUPPORT_EMAIL,
    }
  : {};

export const publicConfig: BrowserPublicConfig = {
  analyticsEndpoint:
    runtime.analyticsEndpoint ?? developmentFallback.analyticsEndpoint,
  analyticsWebsiteId:
    runtime.analyticsWebsiteId ?? developmentFallback.analyticsWebsiteId,
  appTitle: runtime.appTitle ?? developmentFallback.appTitle,
  defaultDesign: runtime.defaultDesign ?? developmentFallback.defaultDesign,
  frontendForgeApiUrl:
    runtime.frontendForgeApiUrl ?? developmentFallback.frontendForgeApiUrl,
  supportEmail: runtime.supportEmail ?? developmentFallback.supportEmail,
};

export function initializePublicBrowserServices() {
  if (publicConfig.appTitle) document.title = publicConfig.appTitle;
  if (!publicConfig.analyticsEndpoint || !publicConfig.analyticsWebsiteId)
    return;

  try {
    const endpoint = new URL(publicConfig.analyticsEndpoint);
    if (endpoint.protocol !== "https:") return;
    const script = document.createElement("script");
    script.defer = true;
    script.src = `${endpoint.toString().replace(/\/$/, "")}/umami`;
    script.dataset.websiteId = publicConfig.analyticsWebsiteId;
    document.head.appendChild(script);
  } catch {
    // Invalid optional analytics configuration must not break the application.
  }
}
