import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import type { PermissionOverrides } from "../../shared/permissions";
import { buildDeniedPermissionOverrides } from "../../shared/permissions";
import { getRolePermissionOverrides } from "../permissionStore";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  permissionOverrides?: PermissionOverrides | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let permissionOverrides: PermissionOverrides | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (user) {
    if (user.role === "owner" && user.openId !== ENV.ownerOpenId) {
      user = { ...user, role: "admin" };
    }
    try {
      permissionOverrides = await getRolePermissionOverrides(user.role);
    } catch (error) {
      // Authorization state must fail closed if overrides cannot be loaded.
      console.warn("[Permissions] Failed to load role overrides:", error);
      permissionOverrides = buildDeniedPermissionOverrides();
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    permissionOverrides,
  };
}
