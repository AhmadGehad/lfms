import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import {
  hasPermission,
  type AppRole,
  type PermissionAction,
  type PermissionPage,
} from "../../shared/permissions";
import type { TrpcContext } from "./context";
import { runWithTenantContext } from "../tenancy/runtime";
import { EntitlementError } from "../entitlements/service";
import { getEntitlementService, PAGE_FEATURES } from "../entitlements/sqlStore";
import { runWithTenantWriteFence } from "../tenancy/writeFence";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireAuthenticatedIdentity = t.middleware(({ ctx, next }) => {
  if (!ctx.user || !ctx.session || ctx.session.subjectId !== ctx.user.id) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user, session: ctx.session } });
});

/** Authenticated OAuth identity without requiring an existing tenant membership. */
export const identityProcedure = t.procedure.use(requireAuthenticatedIdentity);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  // Tenant APIs never authorize from a user record alone. This also blocks
  // legacy/dev/cron principals that do not carry an opaque tenant session from
  // bypassing host membership resolution and entitlement enforcement.
  if (!ctx.tenant) {
    const status = ctx.tenantResolutionError?.httpStatus;
    throw new TRPCError({
      code: status === 404 ? "NOT_FOUND" : status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
      message: ctx.tenantResolutionError?.message ?? "Company context required",
    });
  }
  if (ctx.tenant && ctx.tenant.companyLifecycleStatus !== "active") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Company is suspended" });
  }

  const user = ctx.user;
  const continueRequest = () => next({
    ctx: {
      ...ctx,
      user,
    },
  });
  if (!ctx.tenant) return continueRequest();
  return runWithTenantContext(ctx.tenant, async () => {
    if (opts.type !== "mutation") return continueRequest();
    const writeFence = ctx.tenantWriteFence ?? runWithTenantWriteFence;
    return writeFence(ctx.tenant!, async () => {
      const result = await continueRequest();
      if (!result.ok) throw result.error;
      return result;
    });
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

const requireTenant = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user || !ctx.tenant) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Company context required" });
  }
  if (ctx.tenant.companyLifecycleStatus !== "active") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Company is not active" });
  }
  return runWithTenantContext(ctx.tenant, () =>
    next({ ctx: { ...ctx, user: ctx.user, tenant: ctx.tenant } }),
  );
});

/** Tenant-authoritative base for all SaaS business procedures. */
export const companyProcedure = t.procedure.use(requireUser).use(requireTenant);

export const adminProcedure = t.procedure.use(requireUser).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== "admin" && ctx.user.role !== "owner")) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

async function requireFeature(
  ctx: TrpcContext,
  page: PermissionPage,
  operation: "read" | "write",
) {
  if (!ctx.tenant) return;
  try {
    await getEntitlementService().assertAccess(ctx.tenant, PAGE_FEATURES[page], operation);
  } catch (error) {
    if (error instanceof EntitlementError) {
      throw new TRPCError({ code: "FORBIDDEN", message: error.message });
    }
    throw error;
  }
}

export async function assertFeatureAccess(
  ctx: TrpcContext,
  featureKey: string,
  operation: "read" | "write",
) {
  if (!ctx.tenant) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Company context required" });
  }
  try {
    await getEntitlementService().assertAccess(ctx.tenant, featureKey, operation);
  } catch (error) {
    if (error instanceof EntitlementError) {
      throw new TRPCError({ code: "FORBIDDEN", message: error.message });
    }
    throw error;
  }
}

// ─── ROLE HIERARCHY ───────────────────────────────────────────────────────────
// Higher number = more privilege. A user satisfies a tier if their rank >= the
// tier's rank. owner and admin are top-level (full control).
const ROLE_RANK: Record<string, number> = {
  viewer: -1,     // view-only, no mutations allowed
  user: 0,        // read-only
  staff: 1,       // record day-to-day data (animals, weights, sales, expenses, feed)
  supervisor: 2,  // + edit/configure, manage ration plans & categories
  admin: 3,       // + destructive ops, user management, restore
  owner: 4,       // immutable recovery authority
};

function makeRoleProcedure(minRole: AppRole) {
  const required = ROLE_RANK[minRole];
  return t.procedure.use(requireUser).use(
    t.middleware(async opts => {
      const { ctx, next } = opts;
      const rank = ROLE_RANK[ctx.user!.role] ?? 0;
      if (rank < required) {
        throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
      }
      return next({ ctx: { ...ctx, user: ctx.user! } });
    }),
  );
}

/** Can record day-to-day operational data (staff and above). */
export const staffProcedure = makeRoleProcedure("staff");

/** Can edit configuration and manage plans/categories (supervisor and above). */
export const supervisorProcedure = makeRoleProcedure("supervisor");

/** Destructive / privileged ops: permanent delete, restore, user management (admin/owner). */
export const privilegedProcedure = makeRoleProcedure("admin");

export const ownerProcedure = makeRoleProcedure("owner");

/**
 * Server-authoritative page/action permission check. Owner is the immutable
 * recovery authority; every other role, including admin, is configurable.
 */
export function permissionProcedure(
  page: PermissionPage,
  action: PermissionAction,
) {
  return t.procedure.use(requireUser).use(
    t.middleware(async opts => {
      const { ctx, next } = opts;
      if (!hasPermission(
        ctx.user!.role,
        ctx.permissionOverrides,
        page,
        action,
      )) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Missing permission: ${page}.${action}`,
        });
      }
      await requireFeature(ctx, page, opts.type === "mutation" ? "write" : "read");
      return next({ ctx: { ...ctx, user: ctx.user! } });
    }),
  );
}

export function anyPermissionProcedure(
  permissions: ReadonlyArray<readonly [PermissionPage, PermissionAction]>,
) {
  return t.procedure.use(requireUser).use(
    t.middleware(async opts => {
      const { ctx, next } = opts;
      const allowed = permissions.some(([page, action]) =>
        hasPermission(
          ctx.user!.role,
          ctx.permissionOverrides,
          page,
          action,
        ),
      );
      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Missing required permission",
        });
      }
      const operation = opts.type === "mutation" ? "write" : "read";
      const permittedPages = permissions
        .filter(([page, action]) => hasPermission(
          ctx.user!.role,
          ctx.permissionOverrides,
          page,
          action,
        ))
        .map(([page]) => page);
      let lastError: unknown;
      let featureAllowed = !ctx.tenant;
      for (const page of permittedPages) {
        try {
          await requireFeature(ctx, page, operation);
          featureAllowed = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!featureAllowed) throw lastError;
      return next({ ctx: { ...ctx, user: ctx.user! } });
    }),
  );
}

export function allPermissionsProcedure(
  permissions: ReadonlyArray<readonly [PermissionPage, PermissionAction]>,
) {
  return t.procedure.use(requireUser).use(
    t.middleware(async opts => {
      const { ctx, next } = opts;
      const allowed = permissions.every(([page, action]) =>
        hasPermission(
          ctx.user!.role,
          ctx.permissionOverrides,
          page,
          action,
        ),
      );
      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Missing required permissions",
        });
      }
      const operation = opts.type === "mutation" ? "write" : "read";
      for (const [page] of permissions) {
        await requireFeature(ctx, page, operation);
      }
      return next({ ctx: { ...ctx, user: ctx.user! } });
    }),
  );
}
