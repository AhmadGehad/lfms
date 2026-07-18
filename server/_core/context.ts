import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import type { TenantContext } from "../../shared/tenancy";
import type { PermissionOverrides } from "../../shared/permissions";
import { buildDeniedPermissionOverrides } from "../../shared/permissions";
import { getRolePermissionOverrides } from "../permissionStore";
import { ENV } from "./env";
import { sdk } from "./sdk";
import type { SessionPrincipal } from "./auth/opaqueSessions";
import {
  getOpaqueSessionToken,
  getRequestCookie,
  LEGACY_SESSION_COOKIE_NAME,
} from "./auth/cookies";
import { authenticateTenantRequest } from "./auth/runtime";
import {
  getRequestId,
  getResolvedRequestHost,
} from "./security/httpSecurity";
import {
  resolveTenantContext,
  type TenantResolutionError,
} from "../tenancy/resolveTenantContext";
import { SqlTenantContextStore } from "../tenancy/sqlTenantContextStore";
import { logger } from "../observability/logger";
import { recordTenantContextDenial } from "../audit/securityEvents";
import { runWithTenantWriteFence } from "../tenancy/writeFence";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  session?: SessionPrincipal | null;
  requestId?: string;
  tenant?: TenantContext | null;
  tenantResolutionError?: TenantResolutionError | null;
  permissionOverrides?: PermissionOverrides | null;
  timings?: Record<string, number>;
  tenantWriteFence?: typeof runWithTenantWriteFence;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const contextStarted = Date.now();
  const timings: Record<string, number> = {};
  let user: User | null = null;
  let session: SessionPrincipal | null = null;
  let tenant: TenantContext | null = null;
  let tenantResolutionError: TenantResolutionError | null = null;
  let permissionOverrides: PermissionOverrides | null = null;

  try {
    const started = Date.now();
    const opaqueToken = getOpaqueSessionToken(opts.req, "tenant");
    if (opaqueToken) {
      const authentication = await authenticateTenantRequest(opts.req);
      user = authentication?.user ?? null;
      session = authentication?.principal ?? null;
    } else if (!ENV.isProduction) {
      const legacyUser = await sdk.authenticateRequest(opts.req);
      user = legacyUser;
    } else {
      const legacyToken = getRequestCookie(opts.req, LEGACY_SESSION_COOKIE_NAME);
      const legacySession = await sdk.verifySession(legacyToken);
      if (legacySession?.openId.startsWith("cron_")) {
        const legacyUser = await sdk.authenticateRequest(opts.req);
        if (legacyUser.isCron) user = legacyUser;
      }
    }
    timings["context.authenticateMs"] = Date.now() - started;
  } catch (error) {
    timings["context.authenticateMs"] = Date.now() - contextStarted;
    // Authentication is optional for public procedures.
    user = null;
  }

  const requestId = getRequestId(opts.res);
  const requestHost = getResolvedRequestHost(opts.res);
  if (user && session && requestHost?.surface === "tenant") {
    const companySlug = requestHost.companySlug ?? (
      ENV.isProduction ? null : process.env.DEV_COMPANY_SLUG ?? "azal-farms"
    );
    try {
      const requestedFarmHeader = opts.req.get("x-lfms-farm");
      const requestedFarmPublicId = requestedFarmHeader === undefined
        ? null
        : /^[0-9A-HJKMNP-TV-Z]{26}$/.test(requestedFarmHeader)
          ? requestedFarmHeader
          : "invalid";
      tenant = await resolveTenantContext({
        companySlug,
        principal: {
          sessionId: session.sessionId,
          userId: user.id,
          authLevel: session.authLevel,
        },
        requestId,
        requestedFarmPublicId,
        store: new SqlTenantContextStore(),
      });
      user = { ...user, role: tenant.membershipRole };
      permissionOverrides = tenant.permissionOverrides;
    } catch (error) {
      if (error instanceof Error && error.name === "TenantResolutionError") {
        tenantResolutionError = error as TenantResolutionError;
        await recordTenantContextDenial({
          req: opts.req,
          requestId,
          userId: user.id,
          companySlug,
          code: tenantResolutionError.code,
        });
      } else {
        throw error;
      }
    }
  }

  if (user && !tenant) {
    if (user.role === "owner" && user.openId !== ENV.ownerOpenId) {
      user = { ...user, role: "admin" };
    }
    try {
      const started = Date.now();
      permissionOverrides = await getRolePermissionOverrides(user.role);
      timings["context.permissionsMs"] = Date.now() - started;
    } catch (error) {
      // Authorization state must fail closed if overrides cannot be loaded.
      logger.warn("authorization.permission_override_load_failed", { error });
      permissionOverrides = buildDeniedPermissionOverrides();
    }
  }
  timings["context.totalMs"] = Date.now() - contextStarted;

  return {
    req: opts.req,
    res: opts.res,
    user,
    session,
    requestId,
    tenant,
    tenantResolutionError,
    permissionOverrides,
    timings,
    tenantWriteFence: runWithTenantWriteFence,
  };
}
