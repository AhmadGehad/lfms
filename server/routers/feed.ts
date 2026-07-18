import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { rationPlans } from "../../drizzle/schema";
import { getClientIp } from "../_core/audit";
import { anyPermissionProcedure, permissionProcedure, router } from "../_core/trpc";
import { qtyString, rationRateString, optionalMoneyString, isoDate } from "../_core/validators";
import {
  createAuditEntry,
  createFeedStockEntry,
  createNotification,
  createRationPlan,
  getFeedStockLedger,
  getFeedStockStatus,
  getFeedShrinkage,
  getRationPlans,
  getDb,
  updateFeedStockEntry,
  updateRationPlan,
} from "../db";
import { tenantScope } from "../tenancy/scope";
import { rethrowVersionedWriteError } from "../concurrency/trpcVersioning";
import { executeIdempotent } from "../platform/idempotency";

function timingHeaderValue(timings: Record<string, number>) {
  return JSON.stringify(timings);
}

function serverTimingValue(timings: Record<string, number>) {
  return Object.entries(timings)
    .map(([key, value]) => `${key.replace(/[^a-zA-Z0-9_-]/g, "_")};dur=${value}`)
    .join(", ");
}

export const feedRouter = router({
  // ─── RATION PLANS ───────────────────────────────────────────────────────────
  getRationPlans: anyPermissionProcedure([
    ["feed", "view"],
    ["animals", "view"],
  ])
    .input(z.object({ categoryId: z.number().optional() }).optional())
    .query(({ input }) => getRationPlans(input?.categoryId)),

  createRationPlan: permissionProcedure("feed", "create")
    .input(
      z.object({
        categoryId: z.number().int().positive(),
        feedItemId: z.number().int().positive(),
        qtyPerHeadPerDay: rationRateString,
        effectiveDate: isoDate,
        endDate: isoDate.optional(),
        idempotencyKey: z.string().min(8).max(200),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { idempotencyKey, ...data } = input;
      return db.transaction(tx => executeIdempotent(tx, {
        companyId: ctx.tenant!.companyId,
        userId: ctx.user.id,
        key: idempotencyKey,
        operation: "feed.createRationPlan",
        body: data,
      }, async () => {
        const result = await createRationPlan({
          ...data,
          effectiveDate: data.effectiveDate as any,
          endDate: data.endDate as any,
          createdBy: ctx.user.id,
        }, tx);
        await createAuditEntry({
          userId: ctx.user.id,
          action: "create",
          ipAddress: getClientIp(ctx),
          entityType: "rationPlan",
          entityId: String((result as any).insertId),
          newValues: data as any,
        }, tx);
        return result;
      }));
    }),

  updateRationPlan: permissionProcedure("feed", "update")
    .input(
      z.object({
        id: z.number(),
        expectedVersion: z.number().int().positive(),
        categoryId: z.number().optional(),
        feedItemId: z.number().optional(),
        qtyPerHeadPerDay: z.string().optional(),
        effectiveDate: z.string().optional(),
        endDate: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input: { id, expectedVersion, ...data }, ctx }) => {
      const updateData: Record<string, unknown> = { ...data };
      if (data.effectiveDate !== undefined) updateData.effectiveDate = data.effectiveDate as any;
      if (data.endDate !== undefined) updateData.endDate = data.endDate as any;
      try {
        return await updateRationPlan(id, expectedVersion, updateData, {
          userId: ctx.user?.id,
          ipAddress: getClientIp(ctx),
        });
      } catch (error) {
        rethrowVersionedWriteError(error, "Ration plan");
      }
    }),

  bulkUpdateRationPlanDates: permissionProcedure("feed", "update")
    .input(
      z.object({
        plans: z.array(z.object({
          id: z.number().int().positive(),
          expectedVersion: z.number().int().positive(),
        })).min(1).max(500).refine(
          plans => new Set(plans.map(plan => plan.id)).size === plans.length,
          "Ration plan IDs must be unique",
        ),
        effectiveDate: isoDate,
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenant) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Company context required" });
      }
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const tenant = ctx.tenant;
      const expectedVersions = new Map(input.plans.map(plan => [plan.id, plan.expectedVersion]));
      return db.transaction(async tx => {
        const locked = await tx.select({
          id: rationPlans.id,
          effectiveDate: rationPlans.effectiveDate,
          version: rationPlans.version,
        }).from(rationPlans).where(and(
          tenantScope(tenant, rationPlans),
          inArray(rationPlans.id, input.plans.map(plan => plan.id)),
          isNull(rationPlans.deletedAt),
        )).orderBy(rationPlans.id).for("update");

        if (locked.length !== input.plans.length || locked.some(plan => plan.version !== expectedVersions.get(plan.id))) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "One or more ration plans changed since they were loaded. Refresh and try again.",
          });
        }

        for (const plan of input.plans) {
          const [result] = await tx.update(rationPlans).set({
            effectiveDate: input.effectiveDate as any,
            updatedAt: new Date(),
            version: sql`${rationPlans.version} + 1`,
          }).where(and(
            tenantScope(tenant, rationPlans),
            eq(rationPlans.id, plan.id),
            eq(rationPlans.version, plan.expectedVersion),
            isNull(rationPlans.deletedAt),
          ));
          if (Number((result as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "One or more ration plans changed since they were loaded. Refresh and try again.",
            });
          }
        }

        await createAuditEntry({
          userId: ctx.user?.id,
          action: "update",
          ipAddress: getClientIp(ctx),
          entityType: "rationPlan",
          entityId: `bulk:${input.plans.length}`,
          oldValues: {
            plans: locked.map(plan => ({ id: plan.id, effectiveDate: plan.effectiveDate, version: plan.version })),
          } as any,
          newValues: {
            effectiveDate: input.effectiveDate,
            plans: input.plans.map(plan => ({ id: plan.id, version: plan.expectedVersion + 1 })),
          } as any,
        }, tx);
        return { updated: input.plans.length };
      });
    }),

  // ─── STOCK LEDGER ───────────────────────────────────────────────────────────
  getStockLedger: permissionProcedure("feed", "view")
    .input(z.object({ feedItemId: z.number().optional() }).optional())
    .query(({ input }) => getFeedStockLedger(input?.feedItemId)),

  addStockEntry: permissionProcedure("feed", "create")
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
        idempotencyKey: z.string().min(8).max(200),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { idempotencyKey, ...data } = input;
      return db.transaction(tx => executeIdempotent(tx, {
        companyId: ctx.tenant!.companyId,
        userId: ctx.user.id,
        key: idempotencyKey,
        operation: "feed.addStockEntry",
        body: data,
      }, async () => {
        const result = await createFeedStockEntry({
          ...data,
          transactionDate: data.transactionDate as any,
          createdBy: ctx.user.id,
        }, tx);
        await createAuditEntry({
          userId: ctx.user.id,
          action: "create",
          ipAddress: getClientIp(ctx),
          entityType: "feedStock",
          entityId: String((result as any).insertId),
          newValues: data as any,
        }, tx);

        const stockStatus = await getFeedStockStatus(undefined, tx);
        for (const item of stockStatus) {
          if (item.feedItemId === data.feedItemId) {
            if (item.status === "critical") {
              await createNotification({
                alertType: "low_feed_stock",
                title: "Critical Feed Stock",
                message: `${item.feedItemName} stock is critically low — only ${item.daysRemaining} days remaining (${item.stockOnHand} ${item.unit})`,
                relatedEntityType: "feed_item",
                relatedEntityId: String(item.feedItemId),
                priority: "critical",
              }, tx);
            } else if (item.status === "low") {
              await createNotification({
                alertType: "low_feed_stock",
                title: "Low Feed Stock",
                message: `${item.feedItemName} stock is running low — ${item.daysRemaining} days remaining (${item.stockOnHand} ${item.unit})`,
                relatedEntityType: "feed_item",
                relatedEntityId: String(item.feedItemId),
                priority: "high",
              }, tx);
            }
          }
        }

        return result;
      }));
    }),

  updateStockEntry: permissionProcedure("feed", "update")
    .input(
      z.object({
        id: z.number(),
        expectedVersion: z.number().int().positive(),
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
    .mutation(async ({ input: { id, expectedVersion, ...data }, ctx }) => {
      try {
        return await updateFeedStockEntry(id, expectedVersion, data, {
          userId: ctx.user?.id,
          ipAddress: getClientIp(ctx),
        });
      } catch (error) {
        rethrowVersionedWriteError(error, "Feed stock entry");
      }
    }),

  // ─── STOCK STATUS (always unfiltered per requirements) ──────────────────────────────────────────────
  getStockStatus: anyPermissionProcedure([
    ["feed", "view"],
    ["dashboard", "view"],
  ]).query(async ({ ctx }) => {
    const started = Date.now();
    const timings = ctx.timings ?? {};
    const stockStatus = await getFeedStockStatus(timings);
    timings["feed.getStockStatus.routeMs"] = Date.now() - started;

    const timingSnapshot = { ...timings };
    if (stockStatus[0]) {
      (stockStatus[0] as any)._debugTimings = timingSnapshot;
    }
    if (typeof ctx.res.setHeader === "function") {
      ctx.res.setHeader("x-lfms-timings", timingHeaderValue(timingSnapshot));
      ctx.res.setHeader("server-timing", serverTimingValue(timingSnapshot));
    }
    console.info("[Timing] feed.getStockStatus", timingSnapshot);

    return stockStatus;
  }),

  getShrinkage: permissionProcedure("feed", "view").query(() => getFeedShrinkage()),
});
