import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { PlatformPermission } from "../../shared/tenancy";
import type { PlatformTrpcContext } from "./context";

const t = initTRPC.context<PlatformTrpcContext>().create({ transformer: superjson });

export const platformRouterFactory = t.router;
export const platformPublicProcedure = t.procedure;

const requirePlatformSession = t.middleware(({ ctx, next }) => {
  if (!ctx.platform) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Platform session required" });
  }
  return next({ ctx: { ...ctx, platform: ctx.platform } });
});

const validateMutationCsrf = t.middleware(async ({ ctx, next, type }) => {
  if (type === "mutation") await ctx.requireCsrf();
  return next();
});

export const platformProtectedProcedure = t.procedure
  .use(requirePlatformSession)
  .use(validateMutationCsrf);

export function platformPermissionProcedure(permission: PlatformPermission) {
  return platformProtectedProcedure.use(({ ctx, next }) => {
    if (!ctx.platform.permissions.has(permission)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Missing platform permission: ${permission}`,
      });
    }
    return next();
  });
}

export function platformMfaProcedure(permission: PlatformPermission) {
  return platformPermissionProcedure(permission).use(({ ctx, next }) => {
    const hasMfa = ctx.platform.authenticationLevel === "mfa" ||
      ctx.platform.authenticationLevel === "step_up";
    if (ctx.platform.mfaRequired !== false && !hasMfa) {
      throw new TRPCError({ code: "FORBIDDEN", message: "MFA verification required" });
    }
    return next();
  });
}

export function platformAuditActor(ctx: PlatformTrpcContext & { platform: NonNullable<PlatformTrpcContext["platform"]> }) {
  return {
    ...ctx.platform,
    ipAddress: ctx.req.ip || null,
    userAgent: ctx.req.get("user-agent") || null,
  };
}
