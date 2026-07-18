import { describe, expect, it } from "vitest";
import {
  getSafeDevLoginNext,
  isLocalDevAuthBypassAllowed,
  validateLocalDevAuthConfiguration,
} from "./_core/devAuth";

describe("local dev auth bypass", () => {
  const enabledDevelopment = { isDevelopment: true, enabled: true };

  it("allows only explicit, direct local development requests", () => {
    expect(isLocalDevAuthBypassAllowed("localhost", "127.0.0.1", enabledDevelopment)).toBe(true);
    expect(isLocalDevAuthBypassAllowed("azal-farms.localhost", "127.0.0.1", enabledDevelopment)).toBe(true);
    expect(isLocalDevAuthBypassAllowed("127.0.0.1", "127.0.0.1", enabledDevelopment)).toBe(true);
    expect(isLocalDevAuthBypassAllowed("::1", "127.0.0.1", enabledDevelopment)).toBe(false);
    expect(isLocalDevAuthBypassAllowed("localhost", "::1", enabledDevelopment)).toBe(false);
    expect(isLocalDevAuthBypassAllowed("localhost", "127.0.0.1", {
      ...enabledDevelopment,
      forwarded: true,
    })).toBe(false);
    expect(isLocalDevAuthBypassAllowed("localhost", "127.0.0.1", {
      isDevelopment: false,
      enabled: true,
    })).toBe(false);
    expect(isLocalDevAuthBypassAllowed("localhost", "127.0.0.1", {
      isDevelopment: true,
      enabled: false,
    })).toBe(false);
    expect(isLocalDevAuthBypassAllowed("localhost", "192.168.1.10", enabledDevelopment)).toBe(false);
    expect(isLocalDevAuthBypassAllowed("192.168.1.10", "127.0.0.1", enabledDevelopment)).toBe(false);
    expect(isLocalDevAuthBypassAllowed("example.com", "127.0.0.1", enabledDevelopment)).toBe(false);
    expect(isLocalDevAuthBypassAllowed("localhost.attacker.test", "127.0.0.1", enabledDevelopment)).toBe(false);
    expect(isLocalDevAuthBypassAllowed("azal-farms.localhost.attacker.test", "127.0.0.1", enabledDevelopment)).toBe(false);
  });

  it("rejects enabling local dev auth outside development", () => {
    expect(() => validateLocalDevAuthConfiguration(true, false)).toThrow(/only with NODE_ENV=development/);
    expect(() => validateLocalDevAuthConfiguration(true, true)).not.toThrow();
    expect(() => validateLocalDevAuthConfiguration(false, false)).not.toThrow();
  });

  it("keeps local redirects inside the app", () => {
    expect(getSafeDevLoginNext("/")).toBe("/");
    expect(getSafeDevLoginNext("/animals?status=active")).toBe("/animals?status=active");
    expect(getSafeDevLoginNext("https://example.com")).toBe("/");
    expect(getSafeDevLoginNext("//example.com")).toBe("/");
    expect(getSafeDevLoginNext("/\\evil.example")).toBe("/");
    expect(getSafeDevLoginNext("/%2f%2fevil.example")).toBe("/");
    expect(getSafeDevLoginNext("/%5cevil.example")).toBe("/");
    expect(getSafeDevLoginNext("/animals/../api/trpc")).toBe("/");
    expect(getSafeDevLoginNext("/API/trpc")).toBe("/");
    expect(getSafeDevLoginNext("/%61pi/trpc")).toBe("/");
    expect(getSafeDevLoginNext("/api")).toBe("/");
    expect(getSafeDevLoginNext("/api/trpc")).toBe("/");
    expect(getSafeDevLoginNext(undefined)).toBe("/");
  });
});
