import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAllAnimalsPnL,
  getAllCategories,
  getAllExpenseCategories,
  getAllFeedItems,
  getAllGroups,
  getAllSpecies,
  getAllStatuses,
  getAnimals,
  getExpenses,
  getFeedStockLedger,
  getLambingLog,
  getRationPlans,
  getSales,
  createAnimal,
  createExpense,
  createFeedStockEntry,
  createLambingRecord,
  createRationPlan,
  createSale,
  createAuditEntry,
  getDb,
} from "../db";
import { weightLog } from "../../drizzle/schema";
import { isNull } from "drizzle-orm";

/**
 * Backup snapshot — JSON-serializable representation of all live data
 * (soft-deleted records excluded). Restorable via importBackup endpoint.
 */
type Snapshot = {
  version: 1;
  generatedAt: string;
  config: {
    species: any[];
    categories: any[];
    statuses: any[];
    groups: any[];
    feedItems: any[];
    expenseCategories: any[];
  };
  animals: any[];
  sales: any[];
  lambing: any[];
  weights: any[];
  rations: any[];
  feedStock: any[];
  expenses: any[];
};

export const backupRouter = router({
  /**
   * Generate a full JSON snapshot of the live database.
   * Returns base64 for client download as `lfms-backup-YYYY-MM-DD.json`.
   */
  download: protectedProcedure.query(async () => {
    const db = await getDb();
    const weights = db
      ? await db.select().from(weightLog).where(isNull(weightLog.deletedAt))
      : [];

    const snapshot: Snapshot = {
      version: 1,
      generatedAt: new Date().toISOString(),
      config: {
        species: await getAllSpecies(),
        categories: await getAllCategories(),
        statuses: await getAllStatuses(),
        groups: await getAllGroups(),
        feedItems: await getAllFeedItems(),
        expenseCategories: await getAllExpenseCategories(),
      },
      animals: await getAnimals(),
      sales: await getSales(),
      lambing: await getLambingLog(),
      weights,
      rations: await getRationPlans(),
      feedStock: await getFeedStockLedger(),
      expenses: await getExpenses(),
    };

    const json = JSON.stringify(snapshot, null, 2);
    return {
      filename: `lfms-backup-${new Date().toISOString().split("T")[0]}.json`,
      mimeType: "application/json",
      base64: Buffer.from(json, "utf-8").toString("base64"),
      stats: {
        animals: snapshot.animals.length,
        sales: snapshot.sales.length,
        lambing: snapshot.lambing.length,
        weights: weights.length,
        rations: snapshot.rations.length,
        feedStock: snapshot.feedStock.length,
        expenses: snapshot.expenses.length,
      },
    };
  }),

  /**
   * Restore from a JSON backup. Skips entities that already exist by ID.
   * Returns counts of restored vs skipped.
   */
  restore: protectedProcedure
    .input(z.object({ base64: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const json = Buffer.from(input.base64, "base64").toString("utf-8");
      let snap: Snapshot;
      try {
        snap = JSON.parse(json);
      } catch {
        throw new Error("Invalid backup file — not valid JSON");
      }
      if (snap.version !== 1) {
        throw new Error(`Unsupported backup version ${snap.version}`);
      }

      const stats = {
        animals: { restored: 0, skipped: 0 },
        sales: { restored: 0, skipped: 0 },
        lambing: { restored: 0, skipped: 0 },
        rations: { restored: 0, skipped: 0 },
        feedStock: { restored: 0, skipped: 0 },
        expenses: { restored: 0, skipped: 0 },
      };

      // Build existing-record lookups to skip duplicates
      const existingAnimals = await getAnimals();
      const existingAnimalCodes = new Set((existingAnimals as any[]).map((a: any) => a.animal.animalId));
      const oldIdToNewId = new Map<number, number>();

      // ─── ANIMALS ─────────────────────────────────────────────────────────
      for (const row of snap.animals ?? []) {
        const animal = row.animal ?? row;
        if (existingAnimalCodes.has(animal.animalId)) {
          stats.animals.skipped++;
          // Map old id → existing id for relations
          const existing = (existingAnimals as any[]).find((a: any) => a.animal.animalId === animal.animalId);
          if (existing) oldIdToNewId.set(animal.id, existing.animal.id);
          continue;
        }
        try {
          await createAnimal({
            animalId: animal.animalId,
            speciesId: animal.speciesId,
            categoryId: animal.categoryId,
            groupId: animal.groupId,
            statusId: animal.statusId,
            sex: animal.sex,
            acquisitionDate: animal.acquisitionDate,
            acquisitionType: animal.acquisitionType,
            weightAtAcquisition: animal.weightAtAcquisition,
            purchaseCost: animal.purchaseCost,
            exitDate: animal.exitDate,
            isActive: animal.isActive,
            notes: animal.notes,
          } as any);
          stats.animals.restored++;
          // Find newly-inserted to map old id → new id
          const fresh = await getAnimals({ search: animal.animalId });
          const newRow = (fresh as any[]).find((a: any) => a.animal.animalId === animal.animalId);
          if (newRow) oldIdToNewId.set(animal.id, newRow.animal.id);
        } catch {
          stats.animals.skipped++;
        }
      }

      // ─── SALES ────────────────────────────────────────────────────────────
      for (const row of snap.sales ?? []) {
        const sale = row.sale ?? row;
        const newAnimalId = oldIdToNewId.get(sale.animalId) ?? sale.animalId;
        try {
          await createSale({
            animalId: newAnimalId,
            saleDate: sale.saleDate,
            salePrice: sale.salePrice,
            weightAtSale: sale.weightAtSale,
            pricePerKg: sale.pricePerKg,
            buyerName: sale.buyerName,
            notes: sale.notes,
          } as any);
          stats.sales.restored++;
        } catch {
          stats.sales.skipped++;
        }
      }

      // ─── LAMBING ──────────────────────────────────────────────────────────
      for (const row of snap.lambing ?? []) {
        try {
          await createLambingRecord({
            damId: oldIdToNewId.get(row.damId) ?? row.damId,
            sireId: row.sireId ? oldIdToNewId.get(row.sireId) ?? row.sireId : null,
            birthDate: row.birthDate,
            sex: row.sex,
            birthTypeId: row.birthTypeId ?? 1,
            birthWeightKg: row.birthWeightKg,
            groupId: row.groupId ?? 1,
            notes: row.notes,
            isPromoted: row.isPromoted,
          } as any);
          stats.lambing.restored++;
        } catch {
          stats.lambing.skipped++;
        }
      }

      // ─── RATIONS ──────────────────────────────────────────────────────────
      for (const row of snap.rations ?? []) {
        try {
          await createRationPlan({
            categoryId: row.categoryId,
            feedItemId: row.feedItemId,
            qtyPerHeadPerDay: row.qtyPerHeadPerDay,
            effectiveDate: row.effectiveDate,
            endDate: row.endDate,
            isActive: row.isActive,
          } as any);
          stats.rations.restored++;
        } catch {
          stats.rations.skipped++;
        }
      }

      // ─── FEED STOCK ───────────────────────────────────────────────────────
      for (const row of snap.feedStock ?? []) {
        try {
          await createFeedStockEntry({
            feedItemId: row.feedItemId,
            transactionType: row.transactionType,
            transactionDate: row.transactionDate,
            qty: row.qty,
            unitCost: row.unitCost,
            totalCost: row.totalCost,
            supplierName: row.supplierName,
            notes: row.notes,
          } as any);
          stats.feedStock.restored++;
        } catch {
          stats.feedStock.skipped++;
        }
      }

      // ─── EXPENSES ─────────────────────────────────────────────────────────
      for (const row of snap.expenses ?? []) {
        const exp = row.expense ?? row;
        try {
          await createExpense({
            expenseDate: exp.expenseDate,
            categoryId: exp.categoryId,
            amount: exp.amount,
            targetType: exp.targetType,
            headId: exp.headId ? oldIdToNewId.get(exp.headId) ?? exp.headId : null,
            categoryTarget: exp.categoryTarget,
            vendorName: exp.vendorName,
            notes: exp.notes,
          } as any);
          stats.expenses.restored++;
        } catch {
          stats.expenses.skipped++;
        }
      }

      await createAuditEntry({
        userId: ctx.user?.id,
        action: "restore",
        entityType: "backup",
        entityId: snap.generatedAt,
        newValues: stats as any,
      });

      return stats;
    }),
});
