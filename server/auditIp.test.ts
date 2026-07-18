import { describe, expect, it } from "vitest";
import { getClientIp } from "./_core/audit";

describe("audit IP resolution", () => {
  it("uses Express trusted-proxy resolution instead of raw forwarding headers", () => {
    const value = getClientIp({
      req: {
        ip: "203.0.113.10",
        headers: { "x-forwarded-for": "198.51.100.99" },
        socket: { remoteAddress: "127.0.0.1" },
      } as any,
    });
    expect(value).toBe("203.0.113.10");
  });

  it("truncates addresses to the schema limit", () => {
    expect(getClientIp({ req: { ip: "x".repeat(100) } as any })).toHaveLength(45);
  });
});
