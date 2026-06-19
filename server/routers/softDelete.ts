import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  animalCategories,
  animalStatuses,
  animals,
  auditLog,
  birthTypes,
  expenseCategories,
  expenses,
  feedItems,
  feedStockLedger,
  groups,
  lambingLog,
  rationPlans,
  sales,
  species,
  weightLog,
} from "../../drizzle/schema";
import { getDb, type DbOrTx } from "../db";
import { permissionProcedure, router } from "../_core/trpc";

// Helper: log to audit trail
async function logAudit(
  db: DbOrTx,
  userId: number,
  action: string,
  entityType: string,
  entityId: string | number,
  notes?: string
) {
  await db.insert(auditLog).values({
    userId,
    action,
    entityType,
    entityId: String(entityId),
    newValues: notes ? { notes } : undefined,
    createdAt: new Date(),
  });
}

// ─── RECYCLE BIN QUERY ────────────────────────────────────────────────────────

export const recycleBinRouter = router({
  /** Return all soft-deleted records across all entity types */
  list: permissionProcedure("recycleBin", "view")
    .input(z.object({ entityType: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const results: {
        entityType: string;
        id: number;
        label: string;
        deletedAt: Date | null;
        deletedBy: number | null;
        meta: Record<string, unknown>;
      }[] = [];

      const type = input?.entityType;

      if (!type || type === "animal") {
        const rows = await db
          .select()
          .from(animals)
          .where(isNotNull(animals.deletedAt));
        for (const r of rows) {
          results.push({
            entityType: "animal",
            id: r.id,
            label: `Animal ${r.animalId}`,
            deletedAt: r.deletedAt ?? null,
            deletedBy: r.deletedBy ?? null,
            meta: { animalId: r.animalId, isActive: r.isActive },
          });
        }
      }

      if (!type || type === "expense") {
        const rows = await db
          .select()
          .from(expenses)
          .where(isNotNull(expenses.deletedAt));
        for (const r of rows) {
          results.push({
            entityType: "expense",
            id: r.id,
            label: `Expense #${r.id} — ${r.expenseDate}`,
            deletedAt: r.deletedAt ?? null,
            deletedBy: r.deletedBy ?? null,
            meta: { amount: r.amount, expenseDate: r.expenseDate },
          });
        }
      }

      if (!type || type === "weightLog") {
        const rows = await db
          .select()
          .from(weightLog)
          .where(isNotNull(weightLog.deletedAt));
        for (const r of rows) {
          results.push({
            entityType: "weightLog",
            id: r.id,
            label: `Weight Entry #${r.id} — ${r.weighDate}`,
            deletedAt: r.deletedAt ?? null,
            deletedBy: r.deletedBy ?? null,
            meta: { animalId: r.animalId, weightKg: r.weightKg, weighDate: r.weighDate },
          });
        }
      }

      if (!type || type === "lambingLog") {
        const rows = await db
          .select()
          .from(lambingLog)
          .where(isNotNull(lambingLog.deletedAt));
        for (const r of rows) {
          results.push({
            entityType: "lambingLog",
            id: r.id,
            label: `Lambing Record ${r.lambId}`,
            deletedAt: r.deletedAt ?? null,
            deletedBy: r.deletedBy ?? null,
            meta: { lambId: r.lambId, birthDate: r.birthDate },
          });
        }
      }

      if (!type || type === "rationPlan") {
        const rows = await db
          .select()
          .from(rationPlans)
          .where(isNotNull(rationPlans.deletedAt));
        for (const r of rows) {
          results.push({
            entityType: "rationPlan",
            id: r.id,
            label: `Ration Plan #${r.id}`,
            deletedAt: r.deletedAt ?? null,
            deletedBy: r.deletedBy ?? null,
            meta: { categoryId: r.categoryId, feedItemId: r.feedItemId },
          });
        }
      }

      if (!type || type === "feedStock") {
        const rows = await db
          .select()
          .from(feedStockLedger)
          .where(isNotNull(feedStockLedger.deletedAt));
        for (const r of rows) {
          results.push({
            entityType: "feedStock",
            id: r.id,
            label: `Feed Stock Entry #${r.id} — ${r.transactionDate}`,
            deletedAt: r.deletedAt ?? null,
            deletedBy: r.deletedBy ?? null,
            meta: { feedItemId: r.feedItemId, qty: r.qty, transactionType: r.transactionType },
          });
        }
      }

      if (!type || type === "sale") {
        const rows = await db
          .select()
          .from(sales)
          .where(isNotNull(sales.deletedAt));
        for (const r of rows) {
          results.push({
            entityType: "sale",
            id: r.id,
            label: `Sale #${r.id} — ${r.saleDate}`,
            deletedAt: r.deletedAt ?? null,
            deletedBy: r.deletedBy ?? null,
            meta: { animalId: r.animalId, salePrice: r.salePrice },
          });
        }
      }

      if (!type || type === "species") {
        const rows = await db
          .select()
          .from(species)
          .where(isNotNull(species.deletedAt));
        for (const r of rows) {
          results.push({
            entityType: "species",
            id: r.id,
            label: `Species: ${r.name}`,
            deletedAt: r.deletedAt ?? null,
            deletedBy: r.deletedBy ?? null,
            meta: { name: r.name },
          });
        }
      }

      if (!type || type === "category") {
        const rows = await db
          .select()
          .from(animalCategories)
          .where(isNotNull(animalCategories.deletedAt));
        for (const r of rows) {
          results.push({
            entityType: "category",
            id: r.id,
            label: `Category: ${r.name}`,
            deletedAt: r.deletedAt ?? null,
            deletedBy: r.deletedBy ?? null,
            meta: { name: r.name, idPrefix: r.idPrefix },
          });
        }
      }

      if (!type || type === "group") {
        const rows = await db
          .select()
          .from(groups)
          .where(isNotNull(groups.deletedAt));
        for (const r of rows) {
          results.push({
            entityType: "group",
            id: r.id,
            label: `Group: ${r.name} (${r.groupCode})`,
            deletedAt: r.deletedAt ?? null,
            deletedBy: r.deletedBy ?? null,
            meta: { name: r.name, groupCode: r.groupCode },
          });
        }
      }

      if (!type || type === "status") {
        const rows = await db
          .select()
          .from(animalStatuses)
          .where(isNotNull(animalStatuses.deletedAt));
        for (const r of rows) {
          results.push({
            entityType: "status",
            id: r.id,
            label: `Status: ${r.name}`,
            deletedAt: r.deletedAt ?? null,
            deletedBy: r.deletedBy ?? null,
            meta: { name: r.name },
          });
        }
      }

      if (!type || type === "birthType") {
        const rows = await db
          .select()
          .from(birthTypes)
          .where(isNotNull(birthTypes.deletedAt));
        for (const r of rows) {
          results.push({
            entityType: "birthType",
            id: r.id,
            label: `Birth Type: ${r.name}`,
            deletedAt: r.deletedAt ?? null,
            deletedBy: r.deletedBy ?? null,
            meta: { name: r.name },
          });
        }
      }

      if (!type || type === "feedItem") {
        const rows = await db
          .select()
          .from(feedItems)
          .where(isNotNull(feedItems.deletedAt));
        for (const r of rows) {
          results.push({
            entityType: "feedItem",
            id: r.id,
            label: `Feed Item: ${r.name}`,
            deletedAt: r.deletedAt ?? null,
            deletedBy: r.deletedBy ?? null,
            meta: { name: r.name, unit: r.unit },
          });
        }
      }

      if (!type || type === "expenseCategory") {
        const rows = await db
          .select()
          .from(expenseCategories)
          .where(isNotNull(expenseCategories.deletedAt));
        for (const r of rows) {
          results.push({
            entityType: "expenseCategory",
            id: r.id,
            label: `Expense Category: ${r.name}`,
            deletedAt: r.deletedAt ?? null,
            deletedBy: r.deletedBy ?? null,
            meta: { name: r.name },
          });
        }
      }

      // Sort by most recently deleted first
      return results.sort((a, b) => {
        const ta = a.deletedAt?.getTime() ?? 0;
        const tb = b.deletedAt?.getTime() ?? 0;
        return tb - ta;
      });
    }),

  // ─── SOFT DELETE ──────────────────────────────────────────────────────────

  /** Soft-delete an animal and cascade to all related records */
  deleteAnimal: permissionProcedure("animals", "delete")
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.transaction(async tx => {
        const [animal] = await tx
          .select()
          .from(animals)
          .where(and(eq(animals.id, input.id), isNull(animals.deletedAt)))
          .limit(1)
          .for("update");
        if (!animal) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Animal not found" });
        }

        const now = new Date();
        const userId = ctx.user.id;
        await tx.update(lambingLog)
          .set({
            isPromoted: true,
            promotedAnimalCode: animal.animalId,
            deletedAt: null,
            deletedBy: null,
          })
          .where(eq(lambingLog.promotedHeadId, input.id));

        await tx.update(animals)
          .set({ deletedAt: now, deletedBy: userId, isActive: false })
          .where(eq(animals.id, input.id));
        await tx.update(weightLog)
          .set({ deletedAt: now, deletedBy: userId })
          .where(and(eq(weightLog.animalId, input.id), isNull(weightLog.deletedAt)));
        await tx.update(expenses)
          .set({ deletedAt: now, deletedBy: userId })
          .where(and(eq(expenses.headId, input.id), isNull(expenses.deletedAt)));
        await tx.update(sales)
          .set({ deletedAt: now, deletedBy: userId })
          .where(and(eq(sales.animalId, input.id), isNull(sales.deletedAt)));

        await logAudit(tx, userId, "SOFT_DELETE", "animal", input.id, input.reason);
      });
      return { success: true };
    }),

  /** Restore a soft-deleted animal and all its cascaded records */
  restoreAnimal: permissionProcedure("recycleBin", "restore")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.transaction(async tx => {
        const userId = ctx.user.id;
        await tx.update(animals)
          .set({ deletedAt: null, deletedBy: null, isActive: true })
          .where(eq(animals.id, input.id));
        await tx.update(weightLog)
          .set({ deletedAt: null, deletedBy: null })
          .where(eq(weightLog.animalId, input.id));
        await tx.update(expenses)
          .set({ deletedAt: null, deletedBy: null })
          .where(eq(expenses.headId, input.id));
        await tx.update(sales)
          .set({ deletedAt: null, deletedBy: null })
          .where(eq(sales.animalId, input.id));
        await logAudit(tx, userId, "RESTORE", "animal", input.id);
      });
      return { success: true };
    }),

  /** Permanently delete an animal (admin only) */
  purgeAnimal: permissionProcedure("recycleBin", "purge")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.transaction(async tx => {
        const [row] = await tx
          .select()
          .from(animals)
          .where(eq(animals.id, input.id))
          .limit(1)
          .for("update");
        if (!row?.deletedAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Animal must be soft-deleted first" });
        }

        const purgedAt = new Date();
        await tx.update(lambingLog)
          .set({
            isPromoted: true,
            promotedAnimalCode: row.animalId,
            promotedHeadId: null,
            promotedAnimalPurgedAt: purgedAt,
            deletedAt: null,
            deletedBy: null,
          })
          .where(eq(lambingLog.promotedHeadId, input.id));
        await tx.delete(weightLog).where(eq(weightLog.animalId, input.id));
        await tx.delete(expenses).where(eq(expenses.headId, input.id));
        await tx.delete(sales).where(eq(sales.animalId, input.id));
        await tx.delete(animals).where(eq(animals.id, input.id));
        await logAudit(tx, ctx.user.id, "PURGE", "animal", input.id);
      });
      return { success: true };
    }),

  // ─── EXPENSE ──────────────────────────────────────────────────────────────

  deleteExpense: permissionProcedure("expenses", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(expenses)
        .set({ deletedAt: new Date(), deletedBy: ctx.user.id })
        .where(and(eq(expenses.id, input.id), isNull(expenses.deletedAt)));
      await logAudit(db, ctx.user.id, "SOFT_DELETE", "expense", input.id);
      return { success: true };
    }),

  restoreExpense: permissionProcedure("recycleBin", "restore")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(expenses)
        .set({ deletedAt: null, deletedBy: null })
        .where(eq(expenses.id, input.id));
      await logAudit(db, ctx.user.id, "RESTORE", "expense", input.id);
      return { success: true };
    }),

  purgeExpense: permissionProcedure("recycleBin", "purge")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(expenses).where(eq(expenses.id, input.id));
      return { success: true };
    }),

  // ─── WEIGHT LOG ───────────────────────────────────────────────────────────

  deleteWeightLog: permissionProcedure("fattening", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(weightLog)
        .set({ deletedAt: new Date(), deletedBy: ctx.user.id })
        .where(and(eq(weightLog.id, input.id), isNull(weightLog.deletedAt)));
      await logAudit(db, ctx.user.id, "SOFT_DELETE", "weightLog", input.id);
      return { success: true };
    }),

  restoreWeightLog: permissionProcedure("recycleBin", "restore")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(weightLog)
        .set({ deletedAt: null, deletedBy: null })
        .where(eq(weightLog.id, input.id));
      await logAudit(db, ctx.user.id, "RESTORE", "weightLog", input.id);
      return { success: true };
    }),

  purgeWeightLog: permissionProcedure("recycleBin", "purge")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(weightLog).where(eq(weightLog.id, input.id));
      return { success: true };
    }),

  // ─── LAMBING LOG ──────────────────────────────────────────────────────────

  deleteLambingLog: permissionProcedure("breeding", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.transaction(async tx => {
        const [record] = await tx
          .select()
          .from(lambingLog)
          .where(eq(lambingLog.id, input.id))
          .limit(1)
          .for("update");
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Lambing record not found" });
        if (record.isPromoted) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Promoted birth records are permanent history and cannot be deleted",
          });
        }
        await tx.update(lambingLog)
          .set({ deletedAt: new Date(), deletedBy: ctx.user.id })
          .where(and(eq(lambingLog.id, input.id), isNull(lambingLog.deletedAt)));
        await logAudit(tx, ctx.user.id, "SOFT_DELETE", "lambingLog", input.id);
      });
      return { success: true };
    }),

  restoreLambingLog: permissionProcedure("recycleBin", "restore")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(lambingLog)
        .set({ deletedAt: null, deletedBy: null })
        .where(eq(lambingLog.id, input.id));
      await logAudit(db, ctx.user.id, "RESTORE", "lambingLog", input.id);
      return { success: true };
    }),

  purgeLambingLog: permissionProcedure("recycleBin", "purge")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.transaction(async tx => {
        const [record] = await tx
          .select()
          .from(lambingLog)
          .where(eq(lambingLog.id, input.id))
          .limit(1)
          .for("update");
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Lambing record not found" });
        if (record.isPromoted) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Promoted birth records are permanent history and cannot be purged",
          });
        }
        await tx.delete(lambingLog).where(eq(lambingLog.id, input.id));
        await logAudit(tx, ctx.user.id, "PURGE", "lambingLog", input.id);
      });
      return { success: true };
    }),

  // ─── RATION PLAN ──────────────────────────────────────────────────────────

  deleteRationPlan: permissionProcedure("feed", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(rationPlans)
        .set({ deletedAt: new Date(), deletedBy: ctx.user.id, isActive: false })
        .where(and(eq(rationPlans.id, input.id), isNull(rationPlans.deletedAt)));
      await logAudit(db, ctx.user.id, "SOFT_DELETE", "rationPlan", input.id);
      return { success: true };
    }),

  restoreRationPlan: permissionProcedure("recycleBin", "restore")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(rationPlans)
        .set({ deletedAt: null, deletedBy: null, isActive: true })
        .where(eq(rationPlans.id, input.id));
      await logAudit(db, ctx.user.id, "RESTORE", "rationPlan", input.id);
      return { success: true };
    }),

  purgeRationPlan: permissionProcedure("recycleBin", "purge")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(rationPlans).where(eq(rationPlans.id, input.id));
      return { success: true };
    }),

  // ─── FEED STOCK ───────────────────────────────────────────────────────────

  deleteFeedStock: permissionProcedure("feed", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(feedStockLedger)
        .set({ deletedAt: new Date(), deletedBy: ctx.user.id })
        .where(and(eq(feedStockLedger.id, input.id), isNull(feedStockLedger.deletedAt)));
      await logAudit(db, ctx.user.id, "SOFT_DELETE", "feedStock", input.id);
      return { success: true };
    }),

  restoreFeedStock: permissionProcedure("recycleBin", "restore")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(feedStockLedger)
        .set({ deletedAt: null, deletedBy: null })
        .where(eq(feedStockLedger.id, input.id));
      await logAudit(db, ctx.user.id, "RESTORE", "feedStock", input.id);
      return { success: true };
    }),

  purgeFeedStock: permissionProcedure("recycleBin", "purge")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(feedStockLedger).where(eq(feedStockLedger.id, input.id));
      return { success: true };
    }),

  // ─── SALE ─────────────────────────────────────────────────────────────────

  deleteSale: permissionProcedure("sales", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(sales)
        .set({ deletedAt: new Date(), deletedBy: ctx.user.id })
        .where(and(eq(sales.id, input.id), isNull(sales.deletedAt)));
      await logAudit(db, ctx.user.id, "SOFT_DELETE", "sale", input.id);
      return { success: true };
    }),

  restoreSale: permissionProcedure("recycleBin", "restore")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(sales)
        .set({ deletedAt: null, deletedBy: null })
        .where(eq(sales.id, input.id));
      await logAudit(db, ctx.user.id, "RESTORE", "sale", input.id);
      return { success: true };
    }),

  purgeSale: permissionProcedure("recycleBin", "purge")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(sales).where(eq(sales.id, input.id));
      return { success: true };
    }),

  // ─── CONFIG ENTITIES ──────────────────────────────────────────────────────

  deleteSpecies: permissionProcedure("configuration", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(species)
        .set({ deletedAt: new Date(), deletedBy: ctx.user.id, isActive: false })
        .where(and(eq(species.id, input.id), isNull(species.deletedAt)));
      await logAudit(db, ctx.user.id, "SOFT_DELETE", "species", input.id);
      return { success: true };
    }),

  restoreSpecies: permissionProcedure("recycleBin", "restore")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(species)
        .set({ deletedAt: null, deletedBy: null, isActive: true })
        .where(eq(species.id, input.id));
      await logAudit(db, ctx.user.id, "RESTORE", "species", input.id);
      return { success: true };
    }),

  deleteCategory: permissionProcedure("configuration", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(animalCategories)
        .set({ deletedAt: new Date(), deletedBy: ctx.user.id, isActive: false })
        .where(and(eq(animalCategories.id, input.id), isNull(animalCategories.deletedAt)));
      await logAudit(db, ctx.user.id, "SOFT_DELETE", "category", input.id);
      return { success: true };
    }),

  restoreCategory: permissionProcedure("recycleBin", "restore")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(animalCategories)
        .set({ deletedAt: null, deletedBy: null, isActive: true })
        .where(eq(animalCategories.id, input.id));
      await logAudit(db, ctx.user.id, "RESTORE", "category", input.id);
      return { success: true };
    }),

  deleteGroup: permissionProcedure("configuration", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(groups)
        .set({ deletedAt: new Date(), deletedBy: ctx.user.id, isActive: false })
        .where(and(eq(groups.id, input.id), isNull(groups.deletedAt)));
      await logAudit(db, ctx.user.id, "SOFT_DELETE", "group", input.id);
      return { success: true };
    }),

  restoreGroup: permissionProcedure("recycleBin", "restore")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(groups)
        .set({ deletedAt: null, deletedBy: null, isActive: true })
        .where(eq(groups.id, input.id));
      await logAudit(db, ctx.user.id, "RESTORE", "group", input.id);
      return { success: true };
    }),

  deleteStatus: permissionProcedure("configuration", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(animalStatuses)
        .set({ deletedAt: new Date(), deletedBy: ctx.user.id, isActive: false })
        .where(and(eq(animalStatuses.id, input.id), isNull(animalStatuses.deletedAt)));
      await logAudit(db, ctx.user.id, "SOFT_DELETE", "status", input.id);
      return { success: true };
    }),

  restoreStatus: permissionProcedure("recycleBin", "restore")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(animalStatuses)
        .set({ deletedAt: null, deletedBy: null, isActive: true })
        .where(eq(animalStatuses.id, input.id));
      await logAudit(db, ctx.user.id, "RESTORE", "status", input.id);
      return { success: true };
    }),

  deleteBirthType: permissionProcedure("configuration", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(birthTypes)
        .set({ deletedAt: new Date(), deletedBy: ctx.user.id, isActive: false })
        .where(and(eq(birthTypes.id, input.id), isNull(birthTypes.deletedAt)));
      await logAudit(db, ctx.user.id, "SOFT_DELETE", "birthType", input.id);
      return { success: true };
    }),

  restoreBirthType: permissionProcedure("recycleBin", "restore")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(birthTypes)
        .set({ deletedAt: null, deletedBy: null, isActive: true })
        .where(eq(birthTypes.id, input.id));
      await logAudit(db, ctx.user.id, "RESTORE", "birthType", input.id);
      return { success: true };
    }),

  deleteFeedItem: permissionProcedure("configuration", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(feedItems)
        .set({ deletedAt: new Date(), deletedBy: ctx.user.id, isActive: false })
        .where(and(eq(feedItems.id, input.id), isNull(feedItems.deletedAt)));
      await logAudit(db, ctx.user.id, "SOFT_DELETE", "feedItem", input.id);
      return { success: true };
    }),

  restoreFeedItem: permissionProcedure("recycleBin", "restore")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(feedItems)
        .set({ deletedAt: null, deletedBy: null, isActive: true })
        .where(eq(feedItems.id, input.id));
      await logAudit(db, ctx.user.id, "RESTORE", "feedItem", input.id);
      return { success: true };
    }),

  deleteExpenseCategory: permissionProcedure("configuration", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(expenseCategories)
        .set({ deletedAt: new Date(), deletedBy: ctx.user.id, isActive: false })
        .where(and(eq(expenseCategories.id, input.id), isNull(expenseCategories.deletedAt)));
      await logAudit(db, ctx.user.id, "SOFT_DELETE", "expenseCategory", input.id);
      return { success: true };
    }),

  restoreExpenseCategory: permissionProcedure("recycleBin", "restore")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(expenseCategories)
        .set({ deletedAt: null, deletedBy: null, isActive: true })
        .where(eq(expenseCategories.id, input.id));
      await logAudit(db, ctx.user.id, "RESTORE", "expenseCategory", input.id);
      return { success: true };
    }),

  /** Purge all soft-deleted records permanently (admin only) */
  purgeAll: permissionProcedure("recycleBin", "purge")
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.transaction(async tx => {
        const deletedAnimals = await tx
          .select({ id: animals.id, animalId: animals.animalId })
          .from(animals)
          .where(isNotNull(animals.deletedAt));
        const purgedAt = new Date();
        for (const animal of deletedAnimals) {
          await tx.update(lambingLog)
            .set({
              isPromoted: true,
              promotedAnimalCode: animal.animalId,
              promotedHeadId: null,
              promotedAnimalPurgedAt: purgedAt,
              deletedAt: null,
              deletedBy: null,
            })
            .where(eq(lambingLog.promotedHeadId, animal.id));
        }

        await tx.delete(weightLog).where(isNotNull(weightLog.deletedAt));
        await tx.delete(expenses).where(isNotNull(expenses.deletedAt));
        await tx.delete(sales).where(isNotNull(sales.deletedAt));
        await tx.delete(lambingLog).where(and(
          isNotNull(lambingLog.deletedAt),
          eq(lambingLog.isPromoted, false),
        ));
        await tx.delete(animals).where(isNotNull(animals.deletedAt));
        await tx.delete(rationPlans).where(isNotNull(rationPlans.deletedAt));
        await tx.delete(feedStockLedger).where(isNotNull(feedStockLedger.deletedAt));
        await tx.delete(species).where(isNotNull(species.deletedAt));
        await tx.delete(animalCategories).where(isNotNull(animalCategories.deletedAt));
        await tx.delete(groups).where(isNotNull(groups.deletedAt));
        await tx.delete(animalStatuses).where(isNotNull(animalStatuses.deletedAt));
        await tx.delete(birthTypes).where(isNotNull(birthTypes.deletedAt));
        await tx.delete(feedItems).where(isNotNull(feedItems.deletedAt));
        await tx.delete(expenseCategories).where(isNotNull(expenseCategories.deletedAt));
        await logAudit(tx, ctx.user.id, "PURGE_ALL", "recycle_bin", "all");
      });
      return { success: true };
    }),
});
