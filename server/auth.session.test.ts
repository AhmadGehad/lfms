import { describe, expect, it, vi } from "vitest";

describe("session tokens", () => {
  it("accepts an empty display name from OAuth user info", async () => {
    const previousEnv = {
      VITE_APP_ID: process.env.VITE_APP_ID,
      JWT_SECRET: process.env.JWT_SECRET,
      OAUTH_SERVER_URL: process.env.OAUTH_SERVER_URL,
    };

    vi.resetModules();
    process.env.VITE_APP_ID = "test-app";
    process.env.JWT_SECRET = "test-secret";
    process.env.OAUTH_SERVER_URL = "http://oauth.test";

    try {
      const { sdk } = await import("./_core/sdk");
      const token = await sdk.createSessionToken("open-id", { name: "" });

      await expect(sdk.verifySession(token)).resolves.toEqual({
        openId: "open-id",
        appId: "test-app",
        name: "",
      });
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      vi.resetModules();
    }
  });
});
