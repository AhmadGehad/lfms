import { describe, expect, it } from "vitest";
import {
  collectContainerEnvironment,
  getConfiguredBaseDomain,
  getConfiguredInstanceCount,
  isLfmsHostname,
  isPlatformHostname,
  isReservedDeploymentHostname,
  normalizeEdgeHostname,
  normalizeContainerRequest,
  resolveEdgeAssetPath,
  sanitizeContainerResponse,
  secureEdgeResponse,
  shouldProxyToContainer,
} from "./runtime";

describe("Cloudflare container boundary", () => {
  it("passes only allowlisted string environment values", () => {
    expect(
      collectContainerEnvironment({
        DATABASE_URL: "mysql://example.test/db",
        EMPTY: "ignored",
        LFMS_WEB: { binding: true },
        SESSION_PEPPER: "pepper",
        CF_VERSION_METADATA: { id: "worker-version-1" },
      })
    ).toEqual({
      DATABASE_URL: "mysql://example.test/db",
      SESSION_PEPPER: "pepper",
      DEPLOY_VERSION: "worker-version-1",
    });
  });

  it("accepts only the base domain and one valid subdomain label", () => {
    expect(isLfmsHostname("l-fms.com")).toBe(true);
    expect(isLfmsHostname("azal-farms.l-fms.com")).toBe(true);
    expect(isLfmsHostname("a.b.l-fms.com")).toBe(false);
    expect(isLfmsHostname("not-l-fms.com")).toBe(false);
    expect(normalizeEdgeHostname("ADMIN.L-FMS.COM.")).toBe("admin.l-fms.com");
    expect(isPlatformHostname("ADMIN.L-FMS.COM.", "l-fms.com")).toBe(true);
  });

  it("keeps the production wildcard away from the staging hostname tree", () => {
    expect(isReservedDeploymentHostname("staging.l-fms.com", "l-fms.com")).toBe(
      true
    );
    expect(
      isReservedDeploymentHostname("admin.staging.l-fms.com", "l-fms.com")
    ).toBe(true);
    expect(
      isReservedDeploymentHostname("staging.l-fms.com", "staging.l-fms.com")
    ).toBe(false);
  });

  it("uses only a valid configured base domain", () => {
    expect(getConfiguredBaseDomain({ BASE_DOMAIN: "staging.l-fms.com" })).toBe(
      "staging.l-fms.com"
    );
    expect(getConfiguredBaseDomain({ BASE_DOMAIN: "https://evil.test" })).toBe(
      "l-fms.com"
    );
  });

  it("bounds the configured fixed container pool", () => {
    expect(getConfiguredInstanceCount({ CONTAINER_INSTANCE_COUNT: "1" })).toBe(
      1
    );
    expect(
      getConfiguredInstanceCount({ CONTAINER_INSTANCE_COUNT: "999" })
    ).toBe(3);
  });

  it("overwrites client-supplied forwarding headers", () => {
    const normalized = normalizeContainerRequest(
      new Request("https://azal-farms.l-fms.com/animals", {
        headers: {
          "cf-connecting-ip": "203.0.113.7",
          forwarded: "for=attacker",
          "x-forwarded-for": "198.51.100.9",
          "x-forwarded-host": "evil.example",
          "x-forwarded-proto": "http",
        },
      }),
      "edge-request-1"
    );

    expect(normalized.headers.get("forwarded")).toBeNull();
    expect(normalized.headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(normalized.headers.get("x-forwarded-host")).toBe(
      "azal-farms.l-fms.com"
    );
    expect(normalized.headers.get("x-forwarded-port")).toBe("443");
    expect(normalized.headers.get("x-forwarded-proto")).toBe("https");
    expect(normalized.headers.get("x-lfms-edge-request-id")).toBe(
      "edge-request-1"
    );
  });

  it("redacts proxy errors without changing LFMS application errors", async () => {
    const proxyError = sanitizeContainerResponse(
      new Response("Failed to start container: raw infrastructure error", {
        status: 500,
      }),
      "request-1"
    );
    expect(proxyError.status).toBe(503);
    await expect(proxyError.text()).resolves.toBe(
      "Service temporarily unavailable"
    );
    expect(proxyError.headers.get("x-request-id")).toBe("request-1");

    const applicationError = new Response('{"error":"public"}', {
      status: 500,
      headers: { "X-Request-Id": "application-request" },
    });
    expect(sanitizeContainerResponse(applicationError, "request-2")).toBe(
      applicationError
    );
  });

  it("proxies only server-owned paths and all state-changing requests", () => {
    expect(
      shouldProxyToContainer(
        new Request("https://azal-farms.l-fms.com/api/trpc/animals")
      )
    ).toBe(true);
    expect(
      shouldProxyToContainer(
        new Request("https://azal-farms.l-fms.com/runtime-config.js")
      )
    ).toBe(true);
    expect(
      shouldProxyToContainer(
        new Request("https://azal-farms.l-fms.com/animals", { method: "POST" })
      )
    ).toBe(true);
    expect(
      shouldProxyToContainer(
        new Request("https://azal-farms.l-fms.com/animals")
      )
    ).toBe(false);
  });

  it("selects tenant and Admin shells without exposing a cross-surface shell", () => {
    expect(resolveEdgeAssetPath("/animals", false)).toBe("/tenant.html");
    expect(resolveEdgeAssetPath("/companies", true)).toBe("/admin.html");
    expect(resolveEdgeAssetPath("/admin.html", false)).toBeNull();
    expect(resolveEdgeAssetPath("/tenant.html", true)).toBeNull();
    expect(resolveEdgeAssetPath("/assets/app-123.js", false)).toBe(
      "/assets/app-123.js"
    );
    expect(resolveEdgeAssetPath("/assets/%2e%2e/admin.html", false)).toBeNull();
    expect(resolveEdgeAssetPath("/favicon.ico", false)).toBe("/favicon.ico");
  });

  it("adds hardened HTML headers and storage origins at the edge", () => {
    const response = secureEdgeResponse(
      new Response("<html></html>", {
        headers: { "Content-Disposition": "attachment" },
      }),
      {
        CSP_SCRIPT_ORIGINS: "https://scripts.example.test/sdk",
        CSP_CONNECT_ORIGINS: "https://api.example.test/v1",
        CSP_IMAGE_ORIGINS: "https://images.example.test/file",
        OBJECT_STORAGE_ENDPOINT: "https://storage.example.test/bucket",
      },
      "edge-request-2",
      { html: true, platform: true }
    );

    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8"
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("edge-request-2");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    const policy = response.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("script-src 'self' https://scripts.example.test");
    expect(policy).toContain(
      "connect-src 'self' https://api.example.test https://storage.example.test"
    );
    expect(policy).toContain(
      "img-src 'self' data: blob: https://images.example.test https://storage.example.test"
    );
    expect(policy).toContain(
      "media-src 'self' blob: https://storage.example.test"
    );
  });
});
