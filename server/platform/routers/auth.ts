import { platformProtectedProcedure, platformPublicProcedure, platformRouterFactory } from "../trpc";
import { getPlatformAdminProfile } from "../repositories/platformAdmin";

export const platformAuthRouter = platformRouterFactory({
  me: platformPublicProcedure.query(async ({ ctx }) => {
    if (!ctx.platform) return null;
    const profile = await getPlatformAdminProfile(ctx.platform.platformAdminId);
    if (!profile || profile.status !== "active") return null;
    return {
      ...profile,
      authenticationLevel: ctx.platform.authenticationLevel,
      permissions: Array.from(ctx.platform.permissions),
      csrfToken: ctx.csrfToken,
    };
  }),
  logout: platformProtectedProcedure.mutation(async ({ ctx }) => {
    await ctx.revokeSession();
    return { success: true as const };
  }),
});
