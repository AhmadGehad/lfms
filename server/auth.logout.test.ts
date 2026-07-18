import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(
  req: Pick<TrpcContext["req"], "protocol" | "headers"> = {
    protocol: "https",
    headers: {},
  }
): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: req.protocol,
      headers: req.headers,
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(3);
    expect(clearedCookies.map(cookie => cookie.name)).toEqual([
      "__Host-lfms_tenant",
      "__Host-lfms_tenant_csrf",
      COOKIE_NAME,
    ]);
    expect(clearedCookies[2]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    });
  });

  it("clears the session cookie with local HTTP-compatible options", async () => {
    const { ctx, clearedCookies } = createAuthContext({
      protocol: "http",
      headers: {},
    });
    const caller = appRouter.createCaller(ctx);

    await caller.auth.logout();

    expect(clearedCookies.map(cookie => cookie.name)).toEqual([
      "lfms_tenant_session",
      "lfms_tenant_csrf",
      COOKIE_NAME,
    ]);
    expect(clearedCookies[2]?.options).toMatchObject({
      maxAge: -1,
      secure: false,
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    });
  });
});
