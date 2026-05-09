import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { configRouter } from "./routers/config";
import { animalsRouter } from "./routers/animals";
import { breedingRouter } from "./routers/breeding";
import { feedRouter } from "./routers/feed";
import { expensesRouter } from "./routers/expenses";
import { dashboardRouter, notificationsRouter, salesRouter, auditRouter, userManagementRouter } from "./routers/dashboard";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  config: configRouter,
  animals: animalsRouter,
  breeding: breedingRouter,
  feed: feedRouter,
  expenses: expensesRouter,
  dashboard: dashboardRouter,
  notifications: notificationsRouter,
  sales: salesRouter,
  audit: auditRouter,
  userMgmt: userManagementRouter,
});

export type AppRouter = typeof appRouter;
