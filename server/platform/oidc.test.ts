import { describe, expect, it } from "vitest";
import { platformOidcInternals } from "./oidc";

describe("platform OIDC foundations", () => {
  it("uses deterministic S256 PKCE challenges", () => {
    expect(platformOidcInternals.pkceChallenge("verifier"))
      .toBe("iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ");
  });

  it("requires an explicit MFA authentication method", () => {
    expect(platformOidcInternals.authenticationLevel({ amr: ["pwd"] }).level)
      .toBe("primary");
    expect(platformOidcInternals.authenticationLevel({ amr: ["otp"] }).level)
      .toBe("primary");
    expect(platformOidcInternals.authenticationLevel({ amr: ["pwd", "otp"] }).level)
      .toBe("mfa");
    expect(platformOidcInternals.authenticationLevel({ amr: ["pwd", "mfa"] }).level)
      .toBe("mfa");
  });

  it("rejects tampered browser attempt state", () => {
    const value = platformOidcInternals.encodeAttempt({
      binding: "binding",
      verifier: "verifier",
      nonce: "nonce",
      issuedAt: Date.now(),
    });
    expect(platformOidcInternals.decodeAttempt(value)).not.toBeNull();
    expect(platformOidcInternals.decodeAttempt(`${value}x`)).toBeNull();
  });

  it("rejects discovery endpoints outside the configured issuer origin", () => {
    expect(() => platformOidcInternals.validateEndpoint(
      "https://attacker.example/token",
      "OIDC token endpoint",
      "https://identity.example/tenant",
    )).toThrow("configured issuer origin");
    expect(platformOidcInternals.validateEndpoint(
      "https://identity.example/oauth/token",
      "OIDC token endpoint",
      "https://identity.example/tenant",
    )).toBe("https://identity.example/oauth/token");
  });
});
