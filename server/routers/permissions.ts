import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  CONFIGURABLE_ROLES,
  PERMISSION_PAGES,
  buildPermissionMatrix,
  getDefaultPermission,
  isKnownPermission,
  type AppRole,
  type PermissionAction,
  type PermissionPage,
} from "../../shared/permissions";
import { getClientIp } from "../_core/audit";
import {
  privilegedProcedure,
  protectedProcedure,
  router,
} from "../_core/trpc";
import {
  getRolePermissionState,
  replaceRolePermissions,
} from "../permissionStore";

const configurableRoleSchema = z.enum(CONFIGURABLE_ROLES);

const permissionEntrySchema = z.object({
  page: z.string(),
  action: z.string(),
  allowed: z.boolean(),
}).superRefine((entry, ctx) => {
  if (!isKnownPermission(entry.page, entry.action)) {
    ctx.addIssue({
      code: "custom",
      message: `Unknown permission: ${entry.page}.${entry.action}`,
    });
  }
});

export const permissionsRouter = router({
  my: protectedProcedure.query(({ ctx }) => ({
    role: ctx.user.role,
    matrix: buildPermissionMatrix(
      ctx.user.role,
      ctx.permissionOverrides,
    ),
  })),

  catalog: privilegedProcedure.query(() => ({
    configurableRoles: CONFIGURABLE_ROLES,
    pages: PERMISSION_PAGES,
  })),

  roleMatrix: privilegedProcedure
    .input(z.object({ role: configurableRoleSchema }))
    .query(async ({ input }) => {
      const state = await getRolePermissionState(input.role);
      return {
        role: input.role,
        revision: state.revision,
        matrix: buildPermissionMatrix(input.role, state.overrides),
      };
    }),

  updateRoleMatrix: privilegedProcedure
    .input(z.object({
      role: configurableRoleSchema,
      expectedRevision: z.string(),
      entries: z.array(permissionEntrySchema).max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      const seen = new Set<string>();
      const expectedKeys = new Set(
        PERMISSION_PAGES.flatMap(page =>
          page.actions.map(action => `${page.id}:${action}`),
        ),
      );
      if (input.entries.length !== 0 && input.entries.length !== expectedKeys.size) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A complete permission matrix is required",
        });
      }
      for (const entry of input.entries) {
        const key = `${entry.page}:${entry.action}`;
        if (seen.has(key)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Duplicate permission: ${entry.page}.${entry.action}`,
          });
        }
        if (!expectedKeys.has(key)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Unknown permission: ${entry.page}.${entry.action}`,
          });
        }
        seen.add(key);
      }
      if (input.entries.some(entry =>
        entry.allowed && (
          (entry.page === "users" && entry.action === "update") ||
          (entry.page === "data" && entry.action === "restore")
        ),
      )) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This owner-level action cannot be delegated",
        });
      }
      const viewByPage = new Map(
        input.entries
          .filter(entry => entry.action === "view")
          .map(entry => [entry.page, entry.allowed]),
      );
      const invalidAction = input.entries.find(entry =>
        entry.action !== "view" &&
        entry.allowed &&
        viewByPage.get(entry.page) === false,
      );
      if (invalidAction) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot allow ${invalidAction.page}.${invalidAction.action} while page view is denied`,
        });
      }

      const entries = input.entries
        .filter(entry => entry.allowed !== getDefaultPermission(
          input.role,
          entry.page as PermissionPage,
          entry.action as PermissionAction,
        ))
        .map(entry => ({
        page: entry.page as PermissionPage,
        action: entry.action as PermissionAction,
        allowed: entry.allowed,
      }));
      await replaceRolePermissions(
        input.role as AppRole,
        entries,
        ctx.user.id,
        getClientIp(ctx),
        input.expectedRevision,
      );
      return { success: true };
    }),
});
