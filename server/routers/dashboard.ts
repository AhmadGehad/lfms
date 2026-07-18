import { z } from "zod";
import { getClientIp } from "../_core/audit";
import { assertFeatureAccess, permissionProcedure, router } from "../_core/trpc";
import { getRevertPlan, revertAuditEntry } from "../revert";
import {
  createAuditEntry,
  getCurrentHeadCountByCategory,
  getDashboardKPIs,
  getFeedStockStatus,
  getIncomeStatement,
  getExpenses,
  getSaleById,
  getSaleForUpdate,
  getSales,
  updateSale,
  getNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  getAuditLog,
  getAllUsers,
  getDb,
  updateUserRole,
} from "../db";
import { TRPCError } from "@trpc/server";
import { companyMemberships } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { tenantScope } from "../tenancy/scope";
import { executeIdempotent } from "../platform/idempotency";

export const dashboardRouter = router({
  // ─── KPIs ───────────────────────────────────────────────────────────────────
  getKPIs: permissionProcedure("dashboard", "view")
    .input(
      z.object({
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        speciesId: z.number().optional(),
        categoryId: z.number().optional(),
        groupId: z.number().optional(),
        ownerId: z.number().optional(),
      }).optional()
    )
    .query(({ input }) => getDashboardKPIs(input ?? {})),

  // ─── FEED STOCK STATUS (always unfiltered) ──────────────────────────────────
  getFeedStockStatus: permissionProcedure("dashboard", "view").query(() => getFeedStockStatus()),

  // ─── INCOME STATEMENT ───────────────────────────────────────────────────────
  getIncomeStatement: permissionProcedure("incomeStatement", "view")
    .input(
      z.object({
        fromDate: z.string(),
        toDate: z.string(),
        speciesId: z.number().optional(),
        categoryId: z.number().optional(),
        ownerId: z.number().optional(),
      })
    )
    .query(({ input }) => getIncomeStatement(input)),

  // ─── EXPENSE TREND (for charts) ─────────────────────────────────────────────
  getExpenseTrend: permissionProcedure("dashboard", "view")
    .input(
      z.object({
        fromDate: z.string(),
        toDate: z.string(),
        speciesId: z.number().optional(),
        categoryId: z.number().optional(),
        groupId: z.number().optional(),
        ownerId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const expenses = await getExpenses({ fromDate: input.fromDate, toDate: input.toDate, ownerId: input.ownerId });
      // Group by month
      const byMonth: Record<string, number> = {};
      for (const e of expenses) {
        const month = String(e.expense.expenseDate).substring(0, 7);
        byMonth[month] = (byMonth[month] ?? 0) + parseFloat(String(e.expense.amount));
      }
      return Object.entries(byMonth)
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => a.month.localeCompare(b.month));
    }),

  // ─── SALES TREND ────────────────────────────────────────────────────────────
  getSalesTrend: permissionProcedure("dashboard", "view")
    .input(z.object({ fromDate: z.string(), toDate: z.string(), ownerId: z.number().optional() }))
    .query(async ({ input }) => {
      const salesData = await getSales({ fromDate: input.fromDate, toDate: input.toDate, ownerId: input.ownerId });
      const byMonth: Record<string, { revenue: number; count: number }> = {};
      for (const s of salesData) {
        const month = String(s.sale.saleDate).substring(0, 7);
        if (!byMonth[month]) byMonth[month] = { revenue: 0, count: 0 };
        byMonth[month].revenue += parseFloat(String(s.sale.salePrice));
        byMonth[month].count += 1;
      }
      return Object.entries(byMonth)
        .map(([month, data]) => ({ month, ...data }))
        .sort((a, b) => a.month.localeCompare(b.month));
    }),

  // ─── HEAD COUNT HISTORY ─────────────────────────────────────────────────────
  getHeadCountByCategory: permissionProcedure("dashboard", "view")
    .input(z.object({ ownerId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const rows = await getCurrentHeadCountByCategory({ ownerId: input?.ownerId });
      return rows.map(row => ({ category: row.categoryName ?? "Unknown", count: Number(row.headCount ?? 0) }));
    }),
});

export const notificationsRouter = router({
  list: permissionProcedure("notifications", "view")
    .input(z.object({ unreadOnly: z.boolean().optional() }).optional())
    .query(({ input, ctx }) => getNotifications(ctx.user?.id, input?.unreadOnly)),

  markRead: permissionProcedure("notifications", "update")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const updated = await markNotificationRead(input.id, ctx.user.id);
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found" });
      }
      return { success: true } as const;
    }),

  markAllRead: permissionProcedure("notifications", "update")
    .mutation(({ ctx }) => markAllNotificationsRead(ctx.user!.id)),

  create: permissionProcedure("notifications", "update")
    .input(
      z.object({
        alertType: z.string(),
        title: z.string(),
        message: z.string(),
        relatedEntityType: z.string().optional(),
        relatedEntityId: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      })
    )
    .mutation(({ input }) => createNotification(input)),
});

export const salesRouter = router({
  list: permissionProcedure("sales", "view")
    .input(
      z.object({
        animalId: z.number().optional(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        ownerId: z.number().optional(),
        outstandingOnly: z.boolean().optional(),
        buyer: z.string().optional(),
      }).optional()
    )
    .query(({ input }) => getSales(input ?? {})),

  update: permissionProcedure("sales", "update")
    .input(z.object({
      id: z.number(),
      expectedVersion: z.number().int().positive(),
      salePrice: z.string().optional(),
      amountPaid: z.string().optional(),
      weightAtSale: z.string().optional(),
      saleDate: z.string().optional(),
      buyerName: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input: { id, expectedVersion, ...data }, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Lock the row so concurrent edits and payments serialize, and the
      // paid <= price invariant is checked against current values.
      return db.transaction(async (tx) => {
        const before = await getSaleForUpdate(id, tx);
        if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found" });
        if (before.version !== expectedVersion) {
          throw new TRPCError({ code: "CONFLICT", message: "Sale changed since it was loaded. Refresh and try again." });
        }
        const nextPrice = parseFloat(data.salePrice ?? before.salePrice ?? "0");
        const nextPaid = parseFloat(data.amountPaid ?? before.amountPaid ?? "0");
        if (nextPaid > nextPrice + 0.001) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Paid amount cannot exceed sale price" });
        }
        const affected = await updateSale(id, expectedVersion, data, tx);
        if (affected !== 1) {
          throw new TRPCError({ code: "CONFLICT", message: "Sale changed since it was loaded. Refresh and try again." });
        }
        await createAuditEntry({
          userId: ctx.user?.id,
          action: "update",
          ipAddress: getClientIp(ctx),
          entityType: "sale",
          entityId: String(id),
          // Prior values of the changed fields, so the action can be reverted.
          oldValues: Object.fromEntries(Object.keys(data).map((k) => [k, (before as any)[k]])) as any,
          newValues: { ...data, version: expectedVersion + 1 } as any,
        }, tx);
        return { success: true, version: expectedVersion + 1 };
      });
    }),

  // Record an additional payment toward an outstanding balance. amountPaid is
  // incremented by the given delta. The endpoint refuses to overpay.
  recordPayment: permissionProcedure("sales", "update")
    .input(z.object({
      id: z.number(),
      expectedVersion: z.number().int().positive(),
      payment: z.string().refine(v => parseFloat(v) > 0, "Payment must be greater than zero"),
      idempotencyKey: z.string().min(8).max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // SELECT ... FOR UPDATE so two concurrent payments cannot both read the
      // same amountPaid and silently drop one increment (lost update).
      return db.transaction(async (tx) => {
        return executeIdempotent(tx, {
          companyId: ctx.tenant!.companyId,
          userId: ctx.user.id,
          key: input.idempotencyKey,
          operation: "sales.recordPayment",
          body: { id: input.id, expectedVersion: input.expectedVersion, payment: input.payment },
        }, async () => {
          const existing = await getSaleForUpdate(input.id, tx);
          if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found" });
          if (existing.version !== input.expectedVersion) {
            throw new TRPCError({ code: "CONFLICT", message: "Sale changed since it was loaded. Refresh and try again." });
          }
          const price = parseFloat(existing.salePrice);
          const currentPaid = parseFloat(existing.amountPaid ?? "0");
          const newPaid = currentPaid + parseFloat(input.payment);
          if (newPaid > price + 0.001) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Payment would exceed sale price" });
          }
          const affected = await updateSale(input.id, input.expectedVersion, { amountPaid: String(newPaid) }, tx);
          if (affected !== 1) {
            throw new TRPCError({ code: "CONFLICT", message: "Sale changed since it was loaded. Refresh and try again." });
          }
          await createAuditEntry({
            userId: ctx.user?.id,
            action: "update",
            ipAddress: getClientIp(ctx),
            entityType: "sale",
            entityId: String(input.id),
            oldValues: { amountPaid: existing.amountPaid, version: existing.version } as any,
            newValues: { amountPaid: String(newPaid), paymentDelta: input.payment, version: input.expectedVersion + 1 } as any,
          }, tx);
          return { success: true, amountPaid: String(newPaid), outstanding: String(price - newPaid), version: input.expectedVersion + 1 };
        });
      });
    }),
});

export const auditRouter = router({
  list: permissionProcedure("audit", "view")
    .input(
      z.object({
        entityType: z.string().optional(),
        entityId: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const rows = await getAuditLog(input?.entityType, input?.entityId);
      // Newest non-reverted, non-"revert" entry per entity in this window — only
      // the newest change to a record may be reverted (guarded UI hint).
      const newestByEntity = new Map<string, number>();
      for (const r of rows as any[]) {
        if (r.action === "revert" || r.revertedAt) continue;
        const key = `${r.entityType}:${r.entityId}`;
        const cur = newestByEntity.get(key);
        if (cur == null || r.id > cur) newestByEntity.set(key, r.id);
      }
      return (rows as any[]).map((r) => {
        const plan = getRevertPlan(r);
        const isNewest = newestByEntity.get(`${r.entityType}:${r.entityId}`) === r.id;
        return {
          ...r,
          revertable: plan.revertable && isNewest,
          revertReason: plan.revertable ? (isNewest ? null : "not_newest") : (plan as any).reason,
        };
      });
    }),

  // Undo a single audited action. Owner recovery authority only.
  revert: permissionProcedure("audit", "revert")
    .input(z.object({ auditId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertFeatureAccess(ctx, "data_recovery", "write");
      return revertAuditEntry(input.auditId, ctx.user.id, async features => {
        for (const feature of features) await assertFeatureAccess(ctx, feature, "write");
      });
    }),
});

export const userManagementRouter = router({
  listUsers: permissionProcedure("users", "view").query(async () => {
    const allUsers = await getAllUsers();
    return allUsers.map(user => ({
      ...user,
      isProtectedOwner: user.role === "owner",
    }));
  }),
  updateUserRole: permissionProcedure("users", "update")
    .input(z.object({
      userId: z.number(),
      role: z.enum(["viewer", "user", "staff", "supervisor", "admin"]),
      expectedVersion: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Permission denied: user role administration requires an administrator or owner" });
      }
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.transaction(async tx => {
        // Serialize role changes so two concurrent demotions cannot remove the
        // final administrator.
        if (!ctx.tenant) throw new TRPCError({ code: "FORBIDDEN", message: "Company context required" });
        const memberships = await tx
          .select()
          .from(companyMemberships)
          .where(and(
            tenantScope(ctx.tenant, companyMemberships),
            eq(companyMemberships.status, "active"),
          ))
          .for("update");
        const target = memberships.find(membership => membership.userId === input.userId);
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }
        if (target.role === "owner") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "The owner role cannot be changed",
          });
        }
        if (target.version !== input.expectedVersion) {
          throw new TRPCError({ code: "CONFLICT", message: "User access changed since it was loaded. Refresh and try again." });
        }
        if (
          target.role === "admin" &&
          input.role !== "admin" &&
          !memberships.some(membership =>
            membership.id !== target.id &&
            membership.status === "active" &&
            (membership.role === "admin" || membership.role === "owner"),
          )
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "At least one administrator or owner must remain",
          });
        }

        if (await updateUserRole(input.userId, input.role, input.expectedVersion, tx) !== 1) {
          throw new TRPCError({ code: "CONFLICT", message: "User access changed since it was loaded. Refresh and try again." });
        }
        await createAuditEntry({
          userId: ctx.user.id,
          entityType: "user",
          entityId: String(input.userId),
          action: "update",
          oldValues: { role: target.role, version: target.version },
          newValues: { role: input.role, version: input.expectedVersion + 1 },
          ipAddress: getClientIp(ctx),
        }, tx);
      });
      return { success: true };
    }),
});
