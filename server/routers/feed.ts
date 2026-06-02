import { z } from "zod";
import { getClientIp } from "../_core/audit";
import { protectedProcedure, staffProcedure, router } from "../_core/trpc";
import { qtyString, rationRateString, optionalMoneyString, isoDate } from "../_core/validators";
import {
  createAuditEntry,
  createFeedStockEntry,
  createNotification,
  createRationPlan,
  getFeedStockLedger,
  getFeedStockStatus,
  getRationPlans,
  updateFeedStockEntry,
  updateRationPlan,
} from "../db";

export const feedRouter = router({
  // ─── RATION PLANS ───────────────────────────────────────────────────────────
  getRationPlans: protectedProcedure
    .input(z.object({ categoryId: z.number().optional() }).optional())
    .query(({ input }) => getRationPlans(input?.categoryId)),

  createRationPlan: staffProcedure
    .input(
      z.object({
        categoryId: z.number().int().positive(),
        feedItemId: z.number().int().positive(),
        qtyPerHeadPerDay: rationRateString,
        effectiveDate: isoDate,
        endDate: isoDate.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createRationPlan({
        ...input,
        effectiveDate: input.effectiveDate as any,
        endDate: input.endDate as any,
        createdBy: ctx.user?.id,
      });
      await createAuditEntry({
        userId: ctx.user?.id,
        action: "create",
        ipAddress: getClientIp(ctx),
        entityType: "rationPlan",
        entityId: String((result as any).insertId),
        newValues: input as any,
      });
      return result;
    }),

  updateRationPlan: staffProcedure
    .input(
      z.object({
        id: z.number(),
        categoryId: z.number().optional(),
        feedItemId: z.number().optional(),
        qtyPerHeadPerDay: z.string().optional(),
        effectiveDate: z.string().optional(),
        endDate: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateRationPlan(id, {
        ...data,
        effectiveDate: data.effectiveDate as any,
        endDate: data.endDate as any,
      });
      await createAuditEntry({
        userId: ctx.user?.id,
        action: "update",
        ipAddress: getClientIp(ctx),
        entityType: "rationPlan",
        entityId: String(id),
        newValues: data as any,
      });
      return result;
    }),

  // ─── STOCK LEDGER ───────────────────────────────────────────────────────────
  getStockLedger: protectedProcedure
    .input(z.object({ feedItemId: z.number().optional() }).optional())
    .query(({ input }) => getFeedStockLedger(input?.feedItemId)),

  addStockEntry: staffProcedure
    .input(
      z.object({
        feedItemId: z.number().int().positive(),
        transactionDate: isoDate,
        transactionType: z.enum(["purchase", "stock_count", "adjustment"]),
        qty: qtyString,
        unitCost: optionalMoneyString,
        totalCost: optionalMoneyString,
        supplierName: z.string().max(100).optional(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createFeedStockEntry({
        ...input,
        transactionDate: input.transactionDate as any,
        createdBy: ctx.user?.id,
      });
      await createAuditEntry({
        userId: ctx.user?.id,
        action: "create",
        ipAddress: getClientIp(ctx),
        entityType: "feedStock",
        entityId: String((result as any).insertId),
        newValues: input as any,
      });

      // Check stock levels after new entry
      const stockStatus = await getFeedStockStatus();
      for (const item of stockStatus) {
        if (item.feedItemId === input.feedItemId) {
          if (item.status === "critical") {
            await createNotification({
              alertType: "low_feed_stock",
              title: "Critical Feed Stock",
              message: `${item.feedItemName} stock is critically low — only ${item.daysRemaining} days remaining (${item.stockOnHand} ${item.unit})`,
              relatedEntityType: "feed_item",
              relatedEntityId: String(item.feedItemId),
              priority: "critical",
            });
          } else if (item.status === "low") {
            await createNotification({
              alertType: "low_feed_stock",
              title: "Low Feed Stock",
              message: `${item.feedItemName} stock is running low — ${item.daysRemaining} days remaining (${item.stockOnHand} ${item.unit})`,
              relatedEntityType: "feed_item",
              relatedEntityId: String(item.feedItemId),
              priority: "high",
            });
          }
        }
      }

      return result;
    }),

  updateStockEntry: staffProcedure
    .input(
      z.object({
        id: z.number(),
        feedItemId: z.number().optional(),
        transactionDate: z.string().optional(),
        transactionType: z.enum(["purchase", "stock_count", "adjustment"]).optional(),
        qty: z.string().optional(),
        unitCost: z.string().nullable().optional(),
        totalCost: z.string().nullable().optional(),
        supplierName: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateFeedStockEntry(id, data);
      await createAuditEntry({
        userId: ctx.user?.id,
        action: "update",
        ipAddress: getClientIp(ctx),
        entityType: "feedStock",
        entityId: String(id),
        newValues: data as any,
      });
      return result;
    }),

  // ─── STOCK STATUS (always unfiltered per requirements) ──────────────────────────────────────────────
  getStockStatus: protectedProcedure.query(() => getFeedStockStatus()),
});