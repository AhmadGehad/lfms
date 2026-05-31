import ExcelJS from "exceljs";
import { z } from "zod";
import { protectedProcedure, supervisorProcedure, router } from "../_core/trpc";
import {
  createAnimal,
  createExpense,
  createFeedStockEntry,
  createLambingRecord,
  createRationPlan,
  createSale,
  createWeightEntry,
  getAllCategories,
  getAllExpenseCategories,
  getAllFeedItems,
  getAllGroups,
  getAllSpecies,
  getAllStatuses,
  getAnimals,
  createAuditEntry,
} from "../db";

// Helper to find a row by header→value mapping
function getCell(row: ExcelJS.Row, col: number): any {
  const cell = row.getCell(col);
  if (cell.value === null || cell.value === undefined) return null;
  if (typeof cell.value === "object" && "result" in (cell.value as any)) {
    return (cell.value as any).result;
  }
  return cell.value;
}

function asDate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().split("T")[0];
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

function asString(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function asNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

type ImportStats = {
  sheet: string;
  inserted: number;
  skipped: number;
  errors: string[];
};

export const importRouter = router({
  /** Preview an upload — count rows per sheet without inserting. */
  preview: supervisorProcedure
    .input(z.object({ base64: z.string() }))
    .mutation(async ({ input }) => {
      const buf = Buffer.from(input.base64, "base64");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);
      const sheets: Array<{ name: string; rowCount: number }> = [];
      wb.eachSheet((ws) => {
        sheets.push({ name: ws.name, rowCount: ws.rowCount > 0 ? ws.rowCount - 1 : 0 });
      });
      return { sheets };
    }),

  /** Apply an upload — upserts all supported sheets. */
  applyImport: supervisorProcedure
    .input(z.object({ base64: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const buf = Buffer.from(input.base64, "base64");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);

      // Pre-load lookup tables to resolve names → IDs
      const [species, categories, statuses, groups, feedItems, expenseCats, existingAnimals] =
        await Promise.all([
          getAllSpecies(),
          getAllCategories(),
          getAllStatuses(),
          getAllGroups(),
          getAllFeedItems(),
          getAllExpenseCategories(),
          getAnimals(),
        ]);

      const speciesByName = new Map(species.map((s: any) => [s.name.toLowerCase(), s.id]));
      const categoryByName = new Map(categories.map((c: any) => [c.name.toLowerCase(), c]));
      const statusByName = new Map(statuses.map((s: any) => [s.name.toLowerCase(), s.id]));
      const groupByCode = new Map((groups as any[]).map((g: any) => [String(g.groupCode).toLowerCase(), g.id]));
      const groupByName = new Map((groups as any[]).map((g: any) => [g.name.toLowerCase(), g.id]));
      const feedItemByName = new Map(feedItems.map((f: any) => [f.name.toLowerCase(), f.id]));
      const expCatByName = new Map(expenseCats.map((e: any) => [e.name.toLowerCase(), e.id]));
      const animalByCode = new Map(
        (existingAnimals as any[]).map((a: any) => [a.animal.animalId, a.animal.id])
      );

      const stats: ImportStats[] = [];

      // ─── ANIMALS ─────────────────────────────────────────────────────────
      const animalsSheet = wb.getWorksheet("Animals");
      if (animalsSheet) {
        const s: ImportStats = { sheet: "Animals", inserted: 0, skipped: 0, errors: [] };
        animalsSheet.eachRow({ includeEmpty: false }, async (row, rowNum) => {});
        // Use synchronous iteration to know when done
        const rowCount = animalsSheet.rowCount;
        for (let i = 2; i <= rowCount; i++) {
          const row = animalsSheet.getRow(i);
          const animalCode = asString(getCell(row, 2));
          if (!animalCode) continue;
          if (animalByCode.has(animalCode)) { s.skipped++; continue; }

          try {
            const speciesName = asString(getCell(row, 3));
            const catName = asString(getCell(row, 4));
            const groupName = asString(getCell(row, 5));
            const statusName = asString(getCell(row, 6));
            const cat = categoryByName.get(catName.toLowerCase());

            await createAnimal({
              animalId: animalCode,
              speciesId: speciesByName.get(speciesName.toLowerCase()) ?? cat?.speciesId ?? 1,
              categoryId: cat?.id ?? 1,
              groupId: groupByCode.get(groupName.toLowerCase()) ?? groupByName.get(groupName.toLowerCase()) ?? 1,
              statusId: statusByName.get(statusName.toLowerCase()) ?? 1,
              sex: asString(getCell(row, 7)) || "M",
              acquisitionDate: asDate(getCell(row, 8)) ?? new Date().toISOString().split("T")[0],
              acquisitionType: asString(getCell(row, 9)) || "Purchased",
              weightAtAcquisition: asNumber(getCell(row, 10)) > 0 ? String(asNumber(getCell(row, 10))) : null,
              purchaseCost: String(asNumber(getCell(row, 13))),
              exitDate: asDate(getCell(row, 14)),
              isActive: asString(getCell(row, 15)).toLowerCase() === "yes",
              notes: asString(getCell(row, 20)) || null,
            } as any);
            // Re-fetch animal id for relations
            const newAnimals = await getAnimals({ search: animalCode });
            const newAnimal = (newAnimals as any[]).find((a: any) => a.animal.animalId === animalCode);
            if (newAnimal) animalByCode.set(animalCode, newAnimal.animal.id);
            s.inserted++;
          } catch (e: any) {
            s.errors.push(`Row ${i}: ${e.message}`);
          }
        }
        stats.push(s);
      }

      // ─── SALES ────────────────────────────────────────────────────────────
      const salesSheet = wb.getWorksheet("Sales");
      if (salesSheet) {
        const s: ImportStats = { sheet: "Sales", inserted: 0, skipped: 0, errors: [] };
        for (let i = 2; i <= salesSheet.rowCount; i++) {
          const row = salesSheet.getRow(i);
          const animalCode = asString(getCell(row, 2));
          if (!animalCode) continue;
          const animalId = animalByCode.get(animalCode);
          if (!animalId) { s.errors.push(`Row ${i}: animal ${animalCode} not found`); continue; }

          try {
            await createSale({
              animalId,
              saleDate: asDate(getCell(row, 3)) ?? new Date().toISOString().split("T")[0],
              salePrice: String(asNumber(getCell(row, 4))),
              weightAtSale: asNumber(getCell(row, 5)) > 0 ? String(asNumber(getCell(row, 5))) : null,
              buyerName: asString(getCell(row, 7)) || null,
              notes: asString(getCell(row, 8)) || null,
            } as any);
            s.inserted++;
          } catch (e: any) {
            s.errors.push(`Row ${i}: ${e.message}`);
          }
        }
        stats.push(s);
      }

      // ─── WEIGHT LOG (from Animals sheet — but we don't have a dedicated sheet)
      // Skip: weights are exported but not imported directly

      // ─── LAMBING ──────────────────────────────────────────────────────────
      const lambSheet = wb.getWorksheet("Lambing");
      if (lambSheet) {
        const s: ImportStats = { sheet: "Lambing", inserted: 0, skipped: 0, errors: [] };
        for (let i = 2; i <= lambSheet.rowCount; i++) {
          const row = lambSheet.getRow(i);
          const lambCode = asString(getCell(row, 2));
          const damCode = asString(getCell(row, 3));
          if (!lambCode && !damCode) continue;
          const damId = damCode ? animalByCode.get(damCode) : null;
          const sireId = animalByCode.get(asString(getCell(row, 4))) ?? null;
          if (!damId) { s.errors.push(`Row ${i}: dam ${damCode} not found`); continue; }

          try {
            await createLambingRecord({
              damId,
              sireId,
              birthDate: asDate(getCell(row, 5)) ?? new Date().toISOString().split("T")[0],
              sex: asString(getCell(row, 6)) || "M",
              birthTypeId: 1, // Single by default — can be improved with lookup
              groupId: 1,
              notes: asString(getCell(row, 10)) || null,
              isPromoted: asString(getCell(row, 9)).toLowerCase() === "yes",
            } as any);
            s.inserted++;
          } catch (e: any) {
            s.errors.push(`Row ${i}: ${e.message}`);
          }
        }
        stats.push(s);
      }

      // ─── RATION PLANS ─────────────────────────────────────────────────────
      const rationSheet = wb.getWorksheet("Ration Plans");
      if (rationSheet) {
        const s: ImportStats = { sheet: "Ration Plans", inserted: 0, skipped: 0, errors: [] };
        for (let i = 2; i <= rationSheet.rowCount; i++) {
          const row = rationSheet.getRow(i);
          const catName = asString(getCell(row, 2));
          const feedName = asString(getCell(row, 3));
          if (!catName || !feedName) continue;
          const cat = categoryByName.get(catName.toLowerCase());
          const feed = feedItemByName.get(feedName.toLowerCase());
          if (!cat || !feed) { s.errors.push(`Row ${i}: category or feed item not found`); continue; }

          try {
            await createRationPlan({
              categoryId: cat.id,
              feedItemId: feed,
              qtyPerHeadPerDay: String(asNumber(getCell(row, 4))),
              effectiveDate: asDate(getCell(row, 7)) ?? new Date().toISOString().split("T")[0],
              endDate: asDate(getCell(row, 8)),
              isActive: asString(getCell(row, 9)).toLowerCase() === "yes",
            } as any);
            s.inserted++;
          } catch (e: any) {
            s.errors.push(`Row ${i}: ${e.message}`);
          }
        }
        stats.push(s);
      }

      // ─── FEED STOCK ───────────────────────────────────────────────────────
      const stockSheet = wb.getWorksheet("Feed Stock");
      if (stockSheet) {
        const s: ImportStats = { sheet: "Feed Stock", inserted: 0, skipped: 0, errors: [] };
        for (let i = 2; i <= stockSheet.rowCount; i++) {
          const row = stockSheet.getRow(i);
          const feedName = asString(getCell(row, 2));
          if (!feedName) continue;
          const feedId = feedItemByName.get(feedName.toLowerCase());
          if (!feedId) { s.errors.push(`Row ${i}: feed item ${feedName} not found`); continue; }

          try {
            await createFeedStockEntry({
              feedItemId: feedId,
              transactionType: asString(getCell(row, 3)) || "purchase",
              transactionDate: asDate(getCell(row, 4)) ?? new Date().toISOString().split("T")[0],
              qty: String(asNumber(getCell(row, 5))),
              unitCost: asNumber(getCell(row, 6)) > 0 ? String(asNumber(getCell(row, 6))) : null,
              totalCost: asNumber(getCell(row, 7)) > 0 ? String(asNumber(getCell(row, 7))) : null,
              supplierName: asString(getCell(row, 8)) || null,
              notes: asString(getCell(row, 9)) || null,
            } as any);
            s.inserted++;
          } catch (e: any) {
            s.errors.push(`Row ${i}: ${e.message}`);
          }
        }
        stats.push(s);
      }

      // ─── EXPENSES ─────────────────────────────────────────────────────────
      const expSheet = wb.getWorksheet("Expenses");
      if (expSheet) {
        const s: ImportStats = { sheet: "Expenses", inserted: 0, skipped: 0, errors: [] };
        for (let i = 2; i <= expSheet.rowCount; i++) {
          const row = expSheet.getRow(i);
          const expDate = asDate(getCell(row, 2));
          const catName = asString(getCell(row, 3));
          const amount = asNumber(getCell(row, 4));
          if (!expDate || !catName || amount <= 0) continue;
          const catId = expCatByName.get(catName.toLowerCase());
          if (!catId) { s.errors.push(`Row ${i}: expense category ${catName} not found`); continue; }

          const targetType = (asString(getCell(row, 5)) || "general").toLowerCase() as any;
          const headCode = asString(getCell(row, 6));
          const catTargetName = asString(getCell(row, 7));

          try {
            await createExpense({
              expenseDate: expDate,
              categoryId: catId,
              amount: String(amount),
              targetType,
              headId: headCode ? animalByCode.get(headCode) ?? null : null,
              categoryTarget: catTargetName ? categoryByName.get(catTargetName.toLowerCase())?.id ?? null : null,
              vendorName: asString(getCell(row, 8)) || null,
              notes: asString(getCell(row, 9)) || null,
            } as any);
            s.inserted++;
          } catch (e: any) {
            s.errors.push(`Row ${i}: ${e.message}`);
          }
        }
        stats.push(s);
      }

      // Audit entry
      const totalInserted = stats.reduce((a, b) => a + b.inserted, 0);
      await createAuditEntry({
        userId: ctx.user?.id,
        action: "import",
        entityType: "bulk",
        entityId: "excel",
        newValues: { totalInserted, sheets: stats.map((s) => ({ sheet: s.sheet, inserted: s.inserted })) } as any,
      });

      return { stats, totalInserted };
    }),
});
