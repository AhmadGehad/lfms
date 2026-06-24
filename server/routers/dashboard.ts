import { z } from "zod";
import { getClientIp } from "../_core/audit";
import { adminProcedure, permissionProcedure, privilegedProcedure, router } from "../_core/trpc";
import { getRevertPlan, revertAuditEntry } from "../revert";
import {
  createAuditEntry,
  getDashboardKPIs,
  getFeedStockStatus,
  getIncomeStatement,
  getAnimals,
  getExpenses,
  getSaleById,
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
import { users } from "../../drizzle/schema";
import { ENV } from "../_core/env";

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
    const animals = await getAnimals({ isActive: true, ownerId: input?.ownerId });
    const byCategory: Record<string, number> = {};
    for (const a of animals) {
      const key = a.categoryName ?? "Unknown";
      byCategory[key] = (byCategory[key] ?? 0) + 1;
    }
    return Object.entries(byCategory).map(([category, count]) => ({ category, count }));
  }),
});

export const notificationsRouter = router({
  list: permissionProcedure("notifications", "view")
    .input(z.object({ unreadOnly: z.boolean().optional() }).optional())
    .query(({ input, ctx }) => getNotifications(ctx.user?.id, input?.unreadOnly)),

  markRead: permissionProcedure("notifications", "update")
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => markNotificationRead(input.id)),

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
      salePrice: z.string().optional(),
      amountPaid: z.string().optional(),
      weightAtSale: z.string().optional(),
      saleDate: z.string().optional(),
      buyerName: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const before = await getSaleById(id);
      const result = await updateSale(id, data);
      await createAuditEntry({
        userId: ctx.user?.id,
        action: "update",
        ipAddress: getClientIp(ctx),
        entityType: "sale",
        entityId: String(id),
        // Prior values of the changed fields, so the action can be reverted.
        oldValues: before ? Object.fromEntries(Object.keys(data).map((k) => [k, (before as any)[k]])) as any : undefined,
        newValues: data as any,
      });
      return result;
    }),

  // Record an additional payment toward an outstanding balance. amountPaid is
  // incremented by the given delta. The endpoint refuses to overpay.
  recordPayment: permissionProcedure("sales", "update")
    .input(z.object({
      id: z.number(),
      payment: z.string().refine(v => parseFloat(v) > 0, "Payment must be greater than zero"),
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getSaleById(input.id);
      if (!existing) throw new Error("Sale not found");
      const price = parseFloat(existing.salePrice);
      const currentPaid = parseFloat(existing.amountPaid ?? "0");
      const newPaid = currentPaid + parseFloat(input.payment);
      if (newPaid > price + 0.001) throw new Error("Payment would exceed sale price");
      await updateSale(input.id, { amountPaid: String(newPaid) });
      await createAuditEntry({
        userId: ctx.user?.id,
        action: "update",
        ipAddress: getClientIp(ctx),
        entityType: "sale",
        entityId: String(input.id),
        oldValues: { amountPaid: existing.amountPaid } as any,
        newValues: { amountPaid: String(newPaid), paymentDelta: input.payment } as any,
      });
      return { success: true, amountPaid: String(newPaid), outstanding: String(price - newPaid) };
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

  // Undo a single audited action. Admin & Owner only; guarded server-side.
  revert: adminProcedure
    .input(z.object({ auditId: z.number() }))
    .mutation(({ input, ctx }) => revertAuditEntry(input.auditId, ctx.user.id)),
});

export const userManagementRouter = router({
  listUsers: permissionProcedure("users", "view").query(async () => {
    const allUsers = await getAllUsers();
    return allUsers.map(user => ({
      ...user,
      role: user.role === "owner" && user.openId !== ENV.ownerOpenId
        ? "admin" as const
        : user.role,
      isProtectedOwner: user.openId === ENV.ownerOpenId,
    }));
  }),
  updateUserRole: privilegedProcedure
    .input(z.object({
      userId: z.number(),
      role: z.enum(["viewer", "user", "staff", "supervisor", "admin"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.transaction(async tx => {
        // Serialize role changes so two concurrent demotions cannot remove the
        // final administrator.
        const allUsers = await tx.select().from(users).for("update");
        const target = allUsers.find(user => user.id === input.userId);
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }
        if (target.openId === ENV.ownerOpenId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "The owner role cannot be changed",
          });
        }
        if (
          target.role === "admin" &&
          input.role !== "admin" &&
          !allUsers.some(user =>
            user.id !== target.id &&
            (user.role === "admin" || user.role === "owner"),
          )
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "At least one administrator or owner must remain",
          });
        }

        await updateUserRole(input.userId, input.role, tx);
        await createAuditEntry({
          userId: ctx.user.id,
          entityType: "user",
          entityId: String(input.userId),
          action: "update",
          oldValues: { role: target.role },
          newValues: { role: input.role },
          ipAddress: getClientIp(ctx),
        }, tx);
      });
      return { success: true };
    }),
});
