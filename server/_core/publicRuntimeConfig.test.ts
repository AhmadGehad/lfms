import { describe, expect, it } from "vitest";
import {
  buildPublicRuntimeConfig,
  serializePublicRuntimeConfig,
} from "./publicRuntimeConfig";

describe("public runtime configuration", () => {
  it("exposes only validated browser-safe settings", () => {
    expect(
      buildPublicRuntimeConfig({
        NODE_ENV: "production",
        DATABASE_URL: "mysql://must-not-leak",
        VITE_DEFAULT_DESIGN: "new",
        VITE_FRONTEND_FORGE_API_KEY: "browser-visible-key",
        VITE_FRONTEND_FORGE_API_URL: "https://forge.example.test/",
        VITE_SUPPORT_EMAIL: "support@example.test",
      })
    ).toEqual({
      analyticsEndpoint: undefined,
      analyticsWebsiteId: undefined,
      appTitle: undefined,
      defaultDesign: "new",
      frontendForgeApiUrl: "https://forge.example.test",
      supportEmail: "support@example.test",
    });
  });

  it("rejects insecure production URLs and safely serializes markup", () => {
    const config = buildPublicRuntimeConfig({
      NODE_ENV: "production",
      VITE_ANALYTICS_ENDPOINT: "http://analytics.example.test",
      VITE_APP_TITLE: "</script><script>alert(1)</script>",
    });

    expect(config.analyticsEndpoint).toBeUndefined();
    const script = serializePublicRuntimeConfig(config);
    expect(script).not.toContain("</script>");
    expect(script).toContain("\\u003c/script>");
  });
});
