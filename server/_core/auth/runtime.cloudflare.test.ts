import { describe, expect, it } from "vitest";
import { validateTrustedProxyCidrs } from "./runtime";

describe("Cloudflare trusted proxy configuration", () => {
  it("permits the dedicated container boundary without an IP allowlist", () => {
    expect(() => validateTrustedProxyCidrs([], true, true)).not.toThrow();
  });

  it("still requires narrow proxy addresses outside Cloudflare Containers", () => {
    expect(() => validateTrustedProxyCidrs([], false, true)).toThrow(
      "TRUST_PROXY_CIDRS must identify"
    );
    expect(() => validateTrustedProxyCidrs(["0.0.0.0/0"], false, true)).toThrow(
      "narrow ingress proxy addresses"
    );
  });
});
