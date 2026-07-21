import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { clearAuthCookies, getOpaqueSessionToken } from "./_core/auth/cookies";
import { getTenantSessionManager } from "./_core/auth/runtime";
import { systemRouter } from "./_core/systemRouter";
import {
  companyProcedure,
  identityProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { companies, farms, users } from "../drizzle/schema";
import { getDb } from "./db";
import { configRouter } from "./routers/config";
import { animalsRouter } from "./routers/animals";
import { breedingRouter } from "./routers/breeding";
import { feedRouter } from "./routers/feed";
import { expensesRouter } from "./routers/expenses";
import {
  dashboardRouter,
  notificationsRouter,
  salesRouter,
  auditRouter,
  userManagementRouter,
} from "./routers/dashboard";
import { recycleBinRouter } from "./routers/softDelete";
import { exportRouter } from "./routers/export";
import { importRouter } from "./routers/import";
import { backupRouter } from "./routers/backup";
import { vaccinationRouter } from "./routers/vaccination";
import { pregnancyRouter } from "./routers/pregnancy";
import { permissionsRouter } from "./routers/permissions";
import { preferencesRouter } from "./routers/preferences";
import { capitalRouter } from "./routers/capital";
import { acceptInvitation, activateInvitationWithPassword, previewInvitation } from "./invitations/service";
import { issueTenantSessionForUser } from "./_core/passwordAuth";
import { getTenantCompanyBranding } from "./tenancy/branding";
import { getResolvedRequestHost } from "./_core/security/httpSecurity";
import { getClientIp } from "./_core/audit";
import { z } from "zod";

const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

function invitationCompanySlug(ctx: {
  res: Parameters<typeof getResolvedRequestHost>[0];
}) {
  const host = getResolvedRequestHost(ctx.res);
  if (host?.surface !== "tenant" || !host.companySlug) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
  }
  return host.companySlug;
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => {
      if (opts.ctx.session && !opts.ctx.tenant) return null;
      return opts.ctx.user;
    }),
    invitationIdentity: publicProcedure.query(({ ctx }) => {
      if (!ctx.user || !ctx.session || ctx.session.subjectId !== ctx.user.id)
        return null;
      return { name: ctx.user.name, email: ctx.user.email };
    }),
    suspensionStatus: identityProcedure.query(async ({ ctx }) => {
      const host = getResolvedRequestHost(ctx.res);
      if (host?.surface !== "tenant" || !host.companySlug) {
        return { suspended: false };
      }
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Service unavailable",
        });
      }
      const [company] = await db
        .select({ lifecycleStatus: companies.lifecycleStatus })
        .from(companies)
        .where(eq(companies.slug, host.companySlug))
        .limit(1);
      // This endpoint intentionally never returns the internal suspension
      // reason or tenant data. Requiring a signed-in identity also prevents
      // unauthenticated company-status enumeration.
      return { suspended: company?.lifecycleStatus === "suspended" };
    }),
    tenantContext: companyProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });
      }
      if (!ctx.tenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Company context required",
        });
      }
      const tenant = ctx.tenant;

      const farmAccess = tenant.accessibleFarmIds;
      const farmPredicate =
        farmAccess === "all"
          ? eq(farms.companyId, tenant.companyId)
          : farmAccess.length === 0
            ? null
            : and(
                eq(farms.companyId, tenant.companyId),
                inArray(farms.id, [...farmAccess])
              );

      const [branding, farmRows] = await Promise.all([
        getTenantCompanyBranding(),
        farmPredicate
          ? db
              .select({
                id: farms.id,
                publicId: farms.publicId,
                name: farms.name,
                code: farms.code,
                timezone: farms.timezone,
              })
              .from(farms)
              .where(and(farmPredicate, eq(farms.status, "active")))
              .orderBy(asc(farms.name), asc(farms.id))
          : Promise.resolve([]),
      ]);
      const selectedFarm =
        tenant.selectedFarmId === null
          ? null
          : (farmRows.find(farm => farm.id === tenant.selectedFarmId) ?? null);
      return {
        company: {
          publicId: branding.companyPublicId,
          name: branding.name,
          slug: branding.slug,
          lifecycleStatus: tenant.companyLifecycleStatus,
          brandingVersion: branding.version,
          logoUrl: branding.logoUrl,
        },
        membership: {
          role: tenant.membershipRole,
          farmAccessMode: tenant.farmAccessMode,
        },
        selectedFarmPublicId: selectedFarm?.publicId ?? null,
        farms: farmRows.map(({ id: _id, ...farm }) => farm),
      };
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const opaqueToken = getOpaqueSessionToken(ctx.req, "tenant");
      if (opaqueToken) {
        await getTenantSessionManager().revoke(opaqueToken, "logout");
      }
      clearAuthCookies(ctx.req, ctx.res, "tenant");
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  invitations: router({
    preview: publicProcedure
      .input(z.object({ token: invitationTokenSchema }))
      .mutation(({ input, ctx }) =>
        previewInvitation({
          token: input.token,
          companySlug: invitationCompanySlug(ctx),
        })
      ),
    accept: identityProcedure
      .input(z.object({ token: invitationTokenSchema }))
      .mutation(({ input, ctx }) =>
        acceptInvitation(
          { token: input.token, companySlug: invitationCompanySlug(ctx) },
          {
            userId: ctx.user.id,
            requestId: ctx.requestId ?? "unknown",
            ipAddress: getClientIp(ctx),
            userAgent: ctx.req.get("user-agent") ?? null,
          }
        )
      ),
    activateWithPassword: publicProcedure
      .input(z.object({ token: invitationTokenSchema, password: z.string().min(1).max(512) }))
      .mutation(async ({ input, ctx }) => {
        const outcome = await activateInvitationWithPassword(
          { token: input.token, companySlug: invitationCompanySlug(ctx), password: input.password },
          {
            requestId: ctx.requestId ?? "unknown",
            ipAddress: getClientIp(ctx),
            userAgent: ctx.req.get("user-agent") ?? null,
          }
        );
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        }
        const [user] = await db.select().from(users).where(eq(users.id, outcome.userId)).limit(1);
        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account was not created" });
        }
        await issueTenantSessionForUser(ctx.req, ctx.res, user);
        return outcome;
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
  recycleBin: recycleBinRouter,
  export: exportRouter,
  import: importRouter,
  backup: backupRouter,
  vaccination: vaccinationRouter,
  pregnancy: pregnancyRouter,
  permissions: permissionsRouter,
  preferences: preferencesRouter,
  capital: capitalRouter,
});

export type AppRouter = typeof appRouter;
