export type ContentSecurityPolicyOptions = {
  isProduction: boolean;
  analyticsEndpoint?: string;
  scriptOrigins?: readonly string[];
  connectOrigins?: readonly string[];
  imageOrigins?: readonly string[];
  mediaOrigins?: readonly string[];
};

function addHttpsOrigins(target: Set<string>, values: readonly string[]) {
  for (const value of values) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && !url.username && !url.password) {
        target.add(url.origin);
      }
    } catch {
      // Optional invalid origins must not weaken the policy.
    }
  }
}

export function buildContentSecurityPolicyValue(
  options: ContentSecurityPolicyOptions
) {
  const scriptSources = new Set(["'self'"]);
  const connectSources = new Set(["'self'"]);
  const imageSources = new Set(["'self'", "data:", "blob:"]);
  const mediaSources = new Set(["'self'", "blob:"]);

  if (!options.isProduction) {
    // Vite injects an inline React-refresh preamble and uses a plain WebSocket.
    scriptSources.add("'unsafe-inline'");
    connectSources.add("https:");
    connectSources.add("wss:");
    connectSources.add("ws:");
    imageSources.add("https:");
    mediaSources.add("https:");
  }

  if (options.analyticsEndpoint) {
    addHttpsOrigins(scriptSources, [options.analyticsEndpoint]);
    addHttpsOrigins(connectSources, [options.analyticsEndpoint]);
  }
  addHttpsOrigins(scriptSources, options.scriptOrigins ?? []);
  addHttpsOrigins(connectSources, options.connectOrigins ?? []);
  addHttpsOrigins(imageSources, options.imageOrigins ?? []);
  addHttpsOrigins(mediaSources, options.mediaOrigins ?? []);

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    `script-src ${[...scriptSources].join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${[...imageSources].join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${[...connectSources].join(" ")}`,
    `media-src ${[...mediaSources].join(" ")}`,
    ...(options.isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
