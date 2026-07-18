import { describe, expect, it } from "vitest";
import { normalizePlatformOidcIssuer, platformOidcProviderCode } from "./identity";

describe("platform OIDC identity keys", () => {
  it("normalizes trailing slashes to one stable provider code", () => {
    expect(platformOidcProviderCode("https://id.example.test/"))
      .toBe(platformOidcProviderCode("https://id.example.test"));
  });

  it("rejects credentialed issuers and non-HTTPS production issuers", () => {
    expect(() => normalizePlatformOidcIssuer("https://user:pass@id.example.test"))
      .toThrow("Invalid ADMIN_OIDC_ISSUER");
    expect(() => normalizePlatformOidcIssuer("http://id.example.test", true))
      .toThrow("must use HTTPS");
  });
});
