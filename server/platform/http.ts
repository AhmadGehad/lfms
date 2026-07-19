import type { Express } from "express";
import { TRPCError } from "@trpc/server";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { and, eq } from "drizzle-orm";
import {
  platformAdministratorRoles,
  platformAdministrators,
  platformPermissions,
  platformRolePermissions,
  users,
} from "../../drizzle/schema";
import { PLATFORM_PERMISSIONS, type PlatformPermission } from "../../shared/tenancy";
import { getDb } from "../db";
import { clearAuthCookies, getAuthCookieNames, getOpaqueSessionToken, getRequestCookie } from "../_core/auth/cookies";
import { authenticatePlatformRequest, getOAuthStateSecret, getPlatformSessionManager } from "../_core/auth/runtime";
import { verifyCsrfToken, CSRF_HEADER_NAME } from "../_core/security/csrf";
import { getRequestId } from "../_core/security/httpSecurity";
import { configurePlatformContextResolver, createPlatformContext } from "./context";
import { platformRouter } from "./router";

const knownPermissions = new Set<string>(PLATFORM_PERMISSIONS);
let resolverConfigured = false;

function configureResolver() {
  if (resolverConfigured) return;
  resolverConfigured = true;
  configurePlatformContextResolver(async ({ req, res }) => {
    const principal = await authenticatePlatformRequest(req);
    if (!principal) {
      return {
        platform: null,
        csrfToken: null,
        requireCsrf: () => { throw new Error("Platform session required"); },
        revokeSession: async () => undefined,
      };
    }
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const [administrator] = await db.select({
      id: platformAdministrators.id,
      userId: platformAdministrators.userId,
      status: platformAdministrators.status,
      mfaRequired: platformAdministrators.mfaRequired,
      userStatus: users.status,
    }).from(platformAdministrators)
      .innerJoin(users, eq(platformAdministrators.userId, users.id))
      .where(and(
        eq(platformAdministrators.id, principal.subjectId),
        eq(platformAdministrators.status, "active"),
        eq(users.status, "active"),
      )).limit(1);
    const satisfiesCurrentMfaPolicy = principal.authLevel === "mfa" ||
      principal.authLevel === "step_up";
    if (!administrator || (administrator.mfaRequired && !satisfiesCurrentMfaPolicy)) {
      await getPlatformSessionManager().revoke(getOpaqueSessionToken(req, "platform"), "subject_unavailable");
      return {
        platform: null,
        csrfToken: null,
        requireCsrf: () => { throw new Error("Platform session required"); },
        revokeSession: async () => undefined,
      };
    }
    const permissionRows = await db.select({ code: platformPermissions.code })
      .from(platformAdministratorRoles)
      .innerJoin(platformRolePermissions, eq(platformAdministratorRoles.platformRoleId, platformRolePermissions.platformRoleId))
      .innerJoin(platformPermissions, eq(platformRolePermissions.platformPermissionId, platformPermissions.id))
      .where(eq(platformAdministratorRoles.platformAdministratorId, administrator.id));
    const permissions = new Set(permissionRows.map(row => row.code).filter((code): code is PlatformPermission => knownPermissions.has(code)));
    const names = getAuthCookieNames(req, "platform");
    const csrfToken = getRequestCookie(req, names.csrf) ?? null;
    const sessionToken = getOpaqueSessionToken(req, "platform");
    return {
      platform: {
        platformAdminId: administrator.id,
        userId: administrator.userId,
        permissions,
        sessionId: principal.sessionId,
        authenticationLevel: principal.authLevel,
        mfaRequired: administrator.mfaRequired,
        requestId: getRequestId(res),
      },
      csrfToken,
      requireCsrf: () => {
        const header = req.get(CSRF_HEADER_NAME);
        if (!header || header !== getRequestCookie(req, names.csrf) || !verifyCsrfToken(header, "platform", sessionToken, getOAuthStateSecret())) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Invalid platform CSRF token" });
        }
      },
      revokeSession: async () => {
        await getPlatformSessionManager().revoke(sessionToken, "logout");
        clearAuthCookies(req, res, "platform");
      },
    };
  });
}

export function registerPlatformApi(app: Express) {
  configureResolver();
  app.use(
    "/api/platform/trpc",
    createExpressMiddleware({ router: platformRouter, createContext: createPlatformContext }),
  );
}
