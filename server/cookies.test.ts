import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { getSessionCookieOptions } from "./_core/cookies";

function request(protocol: string, options: Partial<Pick<Request, "headers" | "secure">> = {}) {
  return { protocol, headers: options.headers ?? {}, secure: options.secure } as Request;
}

describe("getSessionCookieOptions", () => {
  it("uses browser-valid cookie options for local HTTP", () => {
    expect(getSessionCookieOptions(request("http"))).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });

  it("uses cross-site cookie options for HTTPS", () => {
    expect(getSessionCookieOptions(request("https"))).toMatchObject({
      sameSite: "none",
      secure: true,
    });
  });

  it("trusts forwarded HTTPS when behind a proxy", () => {
    expect(getSessionCookieOptions(request("http", { secure: true }))).toMatchObject({
      sameSite: "none",
      secure: true,
    });
  });

  it("does not trust forwarded headers unless Express marked the request secure", () => {
    expect(
      getSessionCookieOptions(request("http", { headers: { "x-forwarded-proto": "https" } }))
    ).toMatchObject({
      sameSite: "lax",
      secure: false,
    });
  });
});
