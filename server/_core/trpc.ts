import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
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

// ─── ROLE HIERARCHY ───────────────────────────────────────────────────────────
// Higher number = more privilege. A user satisfies a tier if their rank >= the
// tier's rank. owner and admin are top-level (full control).
export type AppRole = "owner" | "admin" | "supervisor" | "staff" | "user";

const ROLE_RANK: Record<string, number> = {
  user: 0,        // read-only
  staff: 1,       // record day-to-day data (animals, weights, sales, expenses, feed)
  supervisor: 2,  // + edit/configure, manage ration plans & categories
  admin: 3,       // + destructive ops, user management, restore/purge
  owner: 3,       // same as admin — full control
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
