import { describe, expect, it } from "vitest";
import { isLocalDevHost, shouldUseLocalDevLogin } from "../client/src/const";

describe("client local development hosts", () => {
  it("accepts loopback hosts and localhost tenant subdomains", () => {
    expect(isLocalDevHost("localhost")).toBe(true);
    expect(isLocalDevHost("azal-farms.localhost")).toBe(true);
    expect(isLocalDevHost("127.0.0.1")).toBe(true);
    expect(isLocalDevHost("::1")).toBe(false);
  });

  it("rejects lookalike public hosts", () => {
    expect(isLocalDevHost("localhost.attacker.test")).toBe(false);
    expect(isLocalDevHost("azal-farms.localhost.attacker.test")).toBe(false);
    expect(isLocalDevHost("evil-localhost.test")).toBe(false);
  });

  it("uses local dev login only when development and the public flag are enabled", () => {
    expect(shouldUseLocalDevLogin(true, true, "azal-farms.localhost")).toBe(true);
    expect(shouldUseLocalDevLogin(true, false, "azal-farms.localhost")).toBe(false);
    expect(shouldUseLocalDevLogin(false, true, "azal-farms.localhost")).toBe(false);
    expect(shouldUseLocalDevLogin(true, true, "tenant.example.test")).toBe(false);
  });
});
