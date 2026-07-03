import { describe, expect, it } from "vitest";
import { getSafeDevLoginNext, isLocalDevAuthBypassAllowed } from "./_core/devAuth";

describe("local dev auth bypass", () => {
  it("allows only local non-production hosts from local clients", () => {
    expect(isLocalDevAuthBypassAllowed("localhost", "::1", false)).toBe(true);
    expect(isLocalDevAuthBypassAllowed("127.0.0.1", "127.0.0.1", false)).toBe(true);
    expect(isLocalDevAuthBypassAllowed("::1", "::ffff:127.0.0.1", false)).toBe(true);
    expect(isLocalDevAuthBypassAllowed("localhost", "127.0.0.1", true)).toBe(false);
    expect(isLocalDevAuthBypassAllowed("localhost", "192.168.1.10", false)).toBe(false);
    expect(isLocalDevAuthBypassAllowed("192.168.1.10", "127.0.0.1", false)).toBe(false);
    expect(isLocalDevAuthBypassAllowed("example.com", "127.0.0.1", false)).toBe(false);
  });

  it("keeps local redirects inside the app", () => {
    expect(getSafeDevLoginNext("/")).toBe("/");
    expect(getSafeDevLoginNext("/animals?status=active")).toBe("/animals?status=active");
    expect(getSafeDevLoginNext("https://example.com")).toBe("/");
    expect(getSafeDevLoginNext("//example.com")).toBe("/");
    expect(getSafeDevLoginNext("/api/trpc")).toBe("/");
    expect(getSafeDevLoginNext(undefined)).toBe("/");
  });
});
