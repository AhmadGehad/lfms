import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createAuditEntry,
  getDashboardKPIs,
  getFeedStockStatus,
  getIncomeStatement,
  getAnimals,
  getExpenses,
  getSales,
  updateSale,
  getNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  getAuditLog,
} from "../db";

export const dashboardRouter = router({
  // ─── KPIs ───────────────────────────────────────────────────────────────────
  getKPIs: protectedProcedure
    .input(
      z.object({
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        speciesId: z.number().optional(),
        categoryId: z.number().optional(),
        groupId: z.number().optional(),
      }).optional()
    )
    .query(({ input }) => getDashboardKPIs(input ?? {})),

  // ─── FEED STOCK STATUS (always unfiltered) ──────────────────────────────────
  getFeedStockStatus: protectedProcedure.query(() => getFeedStockStatus()),

  // ─── INCOME STATEMENT ───────────────────────────────────────────────────────
  getIncomeStatement: protectedProcedure
    .input(
      z.object({
        fromDate: z.string(),
        toDate: z.string(),
        speciesId: z.number().optional(),
        categoryId: z.number().optional(),
      })
    )
    .query(({ input }) => getIncomeStatement(input)),

  // ─── EXPENSE TREND (for charts) ─────────────────────────────────────────────
  getExpenseTrend: protectedProcedure
    .input(
      z.object({
        fromDate: z.string(),
        toDate: z.string(),
        speciesId: z.number().optional(),
        categoryId: z.number().optional(),
        groupId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const expenses = await getExpenses({ fromDate: input.fromDate, toDate: input.toDate });
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
  getSalesTrend: protectedProcedure
    .input(z.object({ fromDate: z.string(), toDate: z.string() }))
    .query(async ({ input }) => {
      const salesData = await getSales({ fromDate: input.fromDate, toDate: input.toDate });
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
  getHeadCountByCategory: protectedProcedure.query(async () => {
    const animals = await getAnimals({ isActive: true });
    const byCategory: Record<string, number> = {};
    for (const a of animals) {
      const key = a.categoryName ?? "Unknown";
      byCategory[key] = (byCategory[key] ?? 0) + 1;
    }
    return Object.entries(byCategory).map(([category, count]) => ({ category, count }));
  }),
});

export const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({ unreadOnly: z.boolean().optional() }).optional())
    .query(({ input, ctx }) => getNotifications(ctx.user?.id, input?.unreadOnly)),

  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => markNotificationRead(input.id)),

  markAllRead: protectedProcedure
    .mutation(({ ctx }) => markAllNotificationsRead(ctx.user!.id)),

  create: protectedProcedure
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
  list: protectedProcedure
    .input(
      z.object({
        animalId: z.number().optional(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
      }).optional()
    )
    .query(({ input }) => getSales(input ?? {})),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      salePrice: z.string().optional(),
      weightAtSale: z.string().optional(),
      saleDate: z.string().optional(),
      buyerName: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateSale(id, data);
      await createAuditEntry({
        userId: ctx.user?.id,
        action: "update",
        entityType: "sale",
        entityId: String(id),
        newValues: data as any,
      });
      return result;
    }),
});

export const auditRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        entityType: z.string().optional(),
        entityId: z.string().optional(),
      }).optional()
    )
    .query(({ input }) => getAuditLog(input?.entityType, input?.entityId)),
});

export const userManagementRouter = router({
  listUsers: protectedProcedure.query(async () => {
    const { getDb } = await import("../db");
    const db = await getDb();
    if (!db) return [];
    const { users } = await import("../../drizzle/schema");
    return db.select().from(users).orderBy(users.createdAt);
  }),
  updateUserRole: protectedProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("../db");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
      return { success: true };
    }),
});
