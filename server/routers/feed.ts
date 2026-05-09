import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createFeedStockEntry,
  createNotification,
  createRationPlan,
  getFeedStockLedger,
  getFeedStockStatus,
  getRationPlans,
  updateRationPlan,
} from "../db";

export const feedRouter = router({
  // ─── RATION PLANS ───────────────────────────────────────────────────────────
  getRationPlans: protectedProcedure
    .input(z.object({ categoryId: z.number().optional() }).optional())
    .query(({ input }) => getRationPlans(input?.categoryId)),

  createRationPlan: protectedProcedure
    .input(
      z.object({
        categoryId: z.number(),
        feedItemId: z.number(),
        qtyPerHeadPerDay: z.string(),
        effectiveDate: z.string(),
        endDate: z.string().optional(),
      })
    )
    .mutation(({ input, ctx }) =>
      createRationPlan({
        ...input,
        effectiveDate: input.effectiveDate as any,
        endDate: input.endDate as any,
        createdBy: ctx.user?.id,
      })
    ),

  updateRationPlan: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        qtyPerHeadPerDay: z.string().optional(),
        endDate: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(({ input: { id, ...data } }) =>
      updateRationPlan(id, { ...data, endDate: data.endDate as any })
    ),

  // ─── STOCK LEDGER ───────────────────────────────────────────────────────────
  getStockLedger: protectedProcedure
    .input(z.object({ feedItemId: z.number().optional() }).optional())
    .query(({ input }) => getFeedStockLedger(input?.feedItemId)),

  addStockEntry: protectedProcedure
    .input(
      z.object({
        feedItemId: z.number(),
        transactionDate: z.string(),
        transactionType: z.enum(["purchase", "stock_count", "adjustment"]),
        qty: z.string(),
        unitCost: z.string().optional(),
        totalCost: z.string().optional(),
        supplierName: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createFeedStockEntry({
        ...input,
        transactionDate: input.transactionDate as any,
        createdBy: ctx.user?.id,
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

  // ─── STOCK STATUS (always unfiltered per requirements) ──────────────────────
  getStockStatus: protectedProcedure.query(() => getFeedStockStatus()),
});
