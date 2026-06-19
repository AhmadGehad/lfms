import ExcelJS from "exceljs";
import { z } from "zod";
import { getClientIp } from "../_core/audit";
import { permissionProcedure, router } from "../_core/trpc";
import { createAnimal, createExpense, createFeedStockEntry, createLambingRecord, createRationPlan, createSale, createWeightEntry, ensureCategoryLambSequenceAtLeast, getAllBirthTypes, getAllCategories, getAllExpenseCategories, getAllExpenseSubCategories, getAllFeedItems, getAllGroups, getAllSpecies, getAllStatuses, getAnimals, createAuditEntry, getDb, updateAnimal } from "../db";
import {
  EXCEL_DATA_FORMAT_VERSION,
  isCanonicalWorkbook,
  readCanonicalWorkbook,
} from "../excelDataContract";
import { applyCanonicalData, type ImportMode } from "../canonicalTransfer";

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

function asTimestamp(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function asOptionalNumber(v: any): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
}

function requireDate(v: any, field: string): string {
  const value = asDate(v);
  if (!value) throw new Error(`${field} is required and must be a valid date`);
  return value;
}

function requireEnum<T extends string>(v: any, field: string, values: readonly T[]): T {
  const value = asString(v).toLowerCase();
  if (!values.includes(value as T)) throw new Error(`${field} must be one of ${values.join(", ")}`);
  return value as T;
}

function requireYesNo(v: any, field: string): boolean {
  const value = asString(v).toLowerCase();
  if (["yes", "true", "1"].includes(value)) return true;
  if (["no", "false", "0"].includes(value)) return false;
  throw new Error(`${field} must be YES or no`);
}

type ImportStats = {
  sheet: string;
  inserted: number;
  skipped: number;
  errors: string[];
};

const importModeSchema = z.enum(["append", "replace"]).default("append");
const SECURITY_TABLES = new Set(["users", "role_permissions", "audit_log"]);

async function applyCanonicalWorkbook(workbook: ExcelJS.Workbook, ctx: any, mode: ImportMode) {
  const rowsByTable = readCanonicalWorkbook(workbook);
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  let stats: ImportStats[] = [];
  await db.transaction(async tx => {
    const transferStats = await applyCanonicalData(tx, rowsByTable, mode, {
      excludedTables: SECURITY_TABLES,
    });
    stats = transferStats.map(stat => ({
      sheet: stat.table,
      inserted: stat.applied,
      skipped: stat.skipped,
      errors: []
    }));
    await createAuditEntry(
      {
        userId: ctx.user?.id,
        action: "import",
        ipAddress: getClientIp(ctx),
        entityType: "bulk",
        entityId: `excel-v${EXCEL_DATA_FORMAT_VERSION}-${mode}`,
        newValues: {
          formatVersion: EXCEL_DATA_FORMAT_VERSION,
          mode,
          totalApplied: stats.reduce((sum, stat) => sum + stat.inserted, 0),
          sheets: stats.map(stat => ({
            sheet: stat.sheet,
            applied: stat.inserted
          }))
        } as any
      },
      tx
    );
  });

  return {
    stats,
    totalInserted: stats.reduce((sum, stat) => sum + stat.inserted, 0),
    formatVersion: EXCEL_DATA_FORMAT_VERSION,
    mode
  };
}

export const importRouter = router({
  /** Preview an upload — count rows per sheet without inserting. */
  preview: permissionProcedure("data", "import").input(z.object({ base64: z.string() })).mutation(async ({ input }) => {
    const buf = Buffer.from(input.base64, "base64");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    if (isCanonicalWorkbook(wb)) readCanonicalWorkbook(wb);
    const sheets: Array<{ name: string; rowCount: number }> = [];
    wb.eachSheet(ws => {
      sheets.push({
        name: ws.name,
        rowCount: ws.rowCount > 0 ? ws.rowCount - 1 : 0
      });
    });
    return { sheets };
  }),

  /** Apply an upload in append or full-snapshot replace mode. */
  applyImport: permissionProcedure("data", "import").input(z.object({ base64: z.string(), mode: importModeSchema })).mutation(async ({ input, ctx }) => {
    const buf = Buffer.from(input.base64, "base64");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    if (isCanonicalWorkbook(wb)) {
      return applyCanonicalWorkbook(wb, ctx, input.mode);
    }
    if (input.mode === "replace") {
      throw new Error("Replace mode requires a complete canonical LFMS Excel export. Manual Excel templates can only be appended.");
    }
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    // Pre-load lookup tables to resolve names → IDs
    const [species, categories, statuses, groups, birthTypes, feedItems, expenseCats, expenseSubCats, existingAnimals] = await Promise.all([getAllSpecies(), getAllCategories(), getAllStatuses(), getAllGroups(), getAllBirthTypes(), getAllFeedItems(), getAllExpenseCategories(), getAllExpenseSubCategories(), getAnimals()]);

    const speciesByName = new Map(species.map((s: any) => [s.name.toLowerCase(), s.id]));
    const categoryByName = new Map(categories.map((c: any) => [c.name.toLowerCase(), c]));
    const statusByName = new Map(statuses.map((s: any) => [s.name.toLowerCase(), s.id]));
    const groupByCode = new Map((groups as any[]).map((g: any) => [String(g.groupCode).toLowerCase(), g.id]));
    const groupByName = new Map((groups as any[]).map((g: any) => [g.name.toLowerCase(), g.id]));
    const feedItemByName = new Map(feedItems.map((f: any) => [f.name.toLowerCase(), f.id]));
    const expCatByName = new Map(expenseCats.map((e: any) => [e.name.toLowerCase(), e.id]));
    const birthTypeByName = new Map(birthTypes.map((b: any) => [b.name.toLowerCase(), b.id]));
    const expSubCatByName = new Map(expenseSubCats.map((e: any) => [`${e.categoryId}:${e.name.toLowerCase()}`, e.id]));
    const animalByCode = new Map((existingAnimals as any[]).map((a: any) => [a.animal.animalId, a.animal.id]));
    const animalDetailsById = new Map((existingAnimals as any[]).map((a: any) => [a.animal.id, a.animal]));
    const categoriesByPrefix = [...categories]
      .filter((category: any) => category.idPrefix)
      .sort((a: any, b: any) => b.idPrefix.length - a.idPrefix.length);

    return db.transaction(async tx => {
      const stats: ImportStats[] = [];
      const newAnimalCodes = new Set<string>();

      // ─── ANIMALS ─────────────────────────────────────────────────────────
      const animalsSheet = wb.getWorksheet("Animals");
      if (animalsSheet) {
        const s: ImportStats = {
          sheet: "Animals",
          inserted: 0,
          skipped: 0,
          errors: []
        };
        const rowCount = animalsSheet.rowCount;
        for (let i = 2; i <= rowCount; i++) {
          const row = animalsSheet.getRow(i);
          const animalCode = asString(getCell(row, 2));
          if (!animalCode) continue;
          if (animalByCode.has(animalCode)) {
            s.skipped++;
            continue;
          }

          try {
            const speciesName = asString(getCell(row, 3));
            const catName = asString(getCell(row, 4));
            const groupName = asString(getCell(row, 5));
            const statusName = asString(getCell(row, 6));
            const cat = categoryByName.get(catName.toLowerCase());
            const speciesId = speciesByName.get(speciesName.toLowerCase()) ?? cat?.speciesId;
            const groupId = groupByCode.get(groupName.toLowerCase()) ?? groupByName.get(groupName.toLowerCase());
            const statusId = statusByName.get(statusName.toLowerCase());
            if (!speciesId) throw new Error(`species ${speciesName || "(blank)"} not found`);
            if (!cat) throw new Error(`category ${catName || "(blank)"} not found`);
            if (!groupId) throw new Error(`group ${groupName || "(blank)"} not found`);
            if (!statusId) throw new Error(`status ${statusName || "(blank)"} not found`);
            const acquisitionDate = requireDate(getCell(row, 8), "acquisitionDate");
            const birthDate = requireDate(getCell(row, 21), "birthDate (Animals column 21)");
            const damCode = asString(getCell(row, 22));
            const sireCode = asString(getCell(row, 23));
            const data = {
              animalId: animalCode,
              speciesId,
              categoryId: cat.id,
              groupId,
              statusId,
              sex: requireEnum(getCell(row, 7), "sex", ["male", "female"] as const),
              acquisitionDate,
              acquisitionType: requireEnum(getCell(row, 9), "acquisitionType", ["purchased", "born"] as const),
              birthDate,
              damId: damCode ? (animalByCode.get(damCode) ?? null) : null,
              sireId: sireCode ? (animalByCode.get(sireCode) ?? null) : null,
              weightAtAcquisition: asOptionalNumber(getCell(row, 10)) === null ? null : String(asOptionalNumber(getCell(row, 10))),
              purchaseCost: String(asOptionalNumber(getCell(row, 13)) ?? 0),
              exitDate: asDate(getCell(row, 14)),
              isActive: requireYesNo(getCell(row, 15), "isActive"),
              notes: asString(getCell(row, 20)) || null,
              exitReason: asString(getCell(row, 24)) || null
            } as any;
            const created = await createAnimal(data, tx);
            const insertedId = Number((created as any).insertId);
            if (insertedId) {
              animalByCode.set(animalCode, insertedId);
              animalDetailsById.set(insertedId, { ...data, id: insertedId });
            }
            newAnimalCodes.add(animalCode);
            s.inserted++;
          } catch (e: any) {
            s.errors.push(`Row ${i}: ${e.message}`);
          }
        }
        for (let i = 2; i <= rowCount; i++) {
          const row = animalsSheet.getRow(i);
          const animalCode = asString(getCell(row, 2));
          if (!animalCode || !newAnimalCodes.has(animalCode)) continue;
          const id = animalByCode.get(animalCode);
          if (!id) continue;
          const damCode = asString(getCell(row, 22));
          const sireCode = asString(getCell(row, 23));
          const damId = damCode ? animalByCode.get(damCode) : null;
          const sireId = sireCode ? animalByCode.get(sireCode) : null;
          if (damCode && !damId) s.errors.push(`Row ${i}: dam ${damCode} not found`);
          if (sireCode && !sireId) s.errors.push(`Row ${i}: sire ${sireCode} not found`);
          if ((!damCode || damId) && (!sireCode || sireId)) {
            await updateAnimal(id, { damId: damId ?? null, sireId: sireId ?? null }, tx);
          }
        }
        stats.push(s);
      }

      // ─── SALES ────────────────────────────────────────────────────────────
      const salesSheet = wb.getWorksheet("Sales");
      if (salesSheet) {
        const s: ImportStats = {
          sheet: "Sales",
          inserted: 0,
          skipped: 0,
          errors: []
        };
        for (let i = 2; i <= salesSheet.rowCount; i++) {
          const row = salesSheet.getRow(i);
          const animalCode = asString(getCell(row, 2));
          if (!animalCode) continue;
          const animalId = animalByCode.get(animalCode);
          if (!animalId) {
            s.errors.push(`Row ${i}: animal ${animalCode} not found`);
            continue;
          }

          try {
            const saleDate = requireDate(getCell(row, 3), "saleDate");
            const salePrice = asOptionalNumber(getCell(row, 4));
            if (salePrice === null || salePrice < 0) throw new Error("salePrice is required and cannot be negative");
            const weightAtSale = asOptionalNumber(getCell(row, 5));
            const pricePerKg = asOptionalNumber(getCell(row, 6)) ?? (weightAtSale && weightAtSale > 0 ? salePrice / weightAtSale : null);
            const data = {
              animalId,
              saleDate,
              salePrice: String(salePrice),
              weightAtSale: weightAtSale === null ? null : String(weightAtSale),
              pricePerKg: pricePerKg === null ? null : String(pricePerKg),
              buyerName: asString(getCell(row, 7)) || null,
              notes: asString(getCell(row, 8)) || null
            } as any;
            const saleId = asOptionalNumber(getCell(row, 1));
            if (saleId !== null) throw new Error("Append manual template requires blank saleId; use a canonical Excel export to import existing IDs");
            await createSale(data, tx);
            s.inserted++;
          } catch (e: any) {
            s.errors.push(`Row ${i}: ${e.message}`);
          }
        }
        stats.push(s);
      }

      // ─── WEIGHT LOG ───────────────────────────────────────────────────────
      const weightSheet = wb.getWorksheet("Weight Log");
      if (weightSheet) {
        const s: ImportStats = {
          sheet: "Weight Log",
          inserted: 0,
          skipped: 0,
          errors: []
        };
        for (let i = 2; i <= weightSheet.rowCount; i++) {
          const row = weightSheet.getRow(i);
          const animalCode = asString(getCell(row, 2));
          if (!animalCode) continue;
          const animalId = animalByCode.get(animalCode);
          if (!animalId) {
            s.errors.push(`Row ${i}: animal ${animalCode} not found`);
            continue;
          }
          try {
            const weight = asOptionalNumber(getCell(row, 4));
            if (weight === null || weight <= 0) throw new Error("weightKg is required and must be greater than zero");
            const data = {
              animalId,
              weighDate: requireDate(getCell(row, 3), "weighDate"),
              weightKg: String(weight),
              sessionId: asString(getCell(row, 5)) || null,
              notes: asString(getCell(row, 6)) || null
            };
            const id = asOptionalNumber(getCell(row, 1));
            if (id !== null) throw new Error("Append manual template requires blank Weight Log id; use a canonical Excel export to import existing IDs");
            await createWeightEntry(data as any, tx);
            s.inserted++;
          } catch (e: any) {
            s.errors.push(`Row ${i}: ${e.message}`);
          }
        }
        stats.push(s);
      }

      // ─── LAMBING ──────────────────────────────────────────────────────────
      const lambSheet = wb.getWorksheet("Lambing");
      if (lambSheet) {
        const s: ImportStats = {
          sheet: "Lambing",
          inserted: 0,
          skipped: 0,
          errors: []
        };
        for (let i = 2; i <= lambSheet.rowCount; i++) {
          const row = lambSheet.getRow(i);
          const lambCode = asString(getCell(row, 2));
          const damCode = asString(getCell(row, 3));
          if (!lambCode && !damCode) continue;
          if (!lambCode) {
            s.errors.push(`Row ${i}: lamb code is required`);
            continue;
          }
          const damId = damCode ? animalByCode.get(damCode) : null;
          const sireCode = asString(getCell(row, 4));
          const sireId = sireCode ? (animalByCode.get(sireCode) ?? null) : null;
          if (damCode && !damId) {
            s.errors.push(`Row ${i}: dam ${damCode} not found`);
            continue;
          }
          if (sireCode && !sireId) {
            s.errors.push(`Row ${i}: sire ${sireCode} not found`);
            continue;
          }

          try {
            const birthTypeName = asString(getCell(row, 7));
            const groupName = asString(getCell(row, 8));
            const birthTypeId = birthTypeByName.get(birthTypeName.toLowerCase());
            const groupId = groupName ? (groupByCode.get(groupName.toLowerCase()) ?? groupByName.get(groupName.toLowerCase())) : null;
            if (!birthTypeId) throw new Error(`birth type ${birthTypeName || "(blank)"} not found`);
            if (groupName && !groupId) throw new Error(`group ${groupName} not found`);
            const isPromoted = requireYesNo(getCell(row, 9), "isPromoted");
            const promotedHeadCode = asString(getCell(row, 12));
            const promotedHeadId = promotedHeadCode ? animalByCode.get(promotedHeadCode) : null;
            if (promotedHeadCode && !promotedHeadId && !isPromoted) {
              throw new Error(`promoted head ${promotedHeadCode} not found`);
            }
            const promotedAnimal = promotedHeadId
              ? animalDetailsById.get(promotedHeadId)
              : null;
            const damAnimal = damId ? animalDetailsById.get(damId) : null;
            const explicitSpeciesName = asString(getCell(row, 13));
            const explicitCategoryName = asString(getCell(row, 14));
            const explicitCategory = explicitCategoryName
              ? categoryByName.get(explicitCategoryName.toLowerCase())
              : null;
            if (explicitCategoryName && !explicitCategory) {
              throw new Error(`category ${explicitCategoryName} not found`);
            }
            const prefixMatches = categoriesByPrefix.filter((category: any) =>
              lambCode.startsWith(category.idPrefix));
            const longestPrefixLength = prefixMatches[0]?.idPrefix.length ?? 0;
            const longestPrefixMatches = prefixMatches.filter(
              (category: any) => category.idPrefix.length === longestPrefixLength,
            );
            const prefixCategory = longestPrefixMatches.length === 1
              ? longestPrefixMatches[0]
              : null;
            const categoryId = explicitCategory?.id ??
              promotedAnimal?.categoryId ??
              damAnimal?.categoryId ??
              prefixCategory?.id ??
              null;
            const category = categories.find((item: any) => item.id === categoryId);
            const speciesId = (explicitSpeciesName
              ? speciesByName.get(explicitSpeciesName.toLowerCase())
              : null) ??
              promotedAnimal?.speciesId ??
              damAnimal?.speciesId ??
              category?.speciesId ??
              null;
            if (explicitSpeciesName && !speciesId) {
              throw new Error(`species ${explicitSpeciesName} not found`);
            }
            if (category && speciesId && category.speciesId !== speciesId) {
              throw new Error("birth category does not belong to the selected species");
            }
            const data = {
              lambId: lambCode,
              speciesId,
              categoryId,
              damId: damId ?? null,
              sireId,
              birthDate: requireDate(getCell(row, 5), "birthDate"),
              sex: requireEnum(getCell(row, 6), "sex", ["male", "female"] as const),
              birthTypeId,
              birthWeightKg: asOptionalNumber(getCell(row, 11)) === null ? null : String(asOptionalNumber(getCell(row, 11))),
              groupId: groupId ?? null,
              notes: asString(getCell(row, 10)) || null,
              isPromoted,
              promotedHeadId: promotedHeadId ?? null,
              promotedAnimalCode: promotedHeadCode || null,
              promotedAnimalPurgedAt: asTimestamp(getCell(row, 15)) ??
                (isPromoted && !promotedHeadId ? new Date() : null)
            } as any;
            const id = asOptionalNumber(getCell(row, 1));
            if (id !== null) throw new Error("Append manual template requires blank Lambing id; use a canonical Excel export to import existing IDs");
            await createLambingRecord(data, tx);
            if (category?.idPrefix && lambCode.startsWith(category.idPrefix)) {
              const suffix = lambCode.slice(category.idPrefix.length);
              if (/^\d+$/.test(suffix)) {
                const sequence = Number(suffix);
                if (Number.isSafeInteger(sequence) && sequence <= 2_147_483_646) {
                  await ensureCategoryLambSequenceAtLeast(category.id, sequence, tx);
                }
              }
            }
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
        const s: ImportStats = {
          sheet: "Ration Plans",
          inserted: 0,
          skipped: 0,
          errors: []
        };
        for (let i = 2; i <= rationSheet.rowCount; i++) {
          const row = rationSheet.getRow(i);
          const catName = asString(getCell(row, 2));
          const feedName = asString(getCell(row, 3));
          if (!catName || !feedName) continue;
          const cat = categoryByName.get(catName.toLowerCase());
          const feed = feedItemByName.get(feedName.toLowerCase());
          if (!cat || !feed) {
            s.errors.push(`Row ${i}: category or feed item not found`);
            continue;
          }

          try {
            const qty = asOptionalNumber(getCell(row, 4));
            if (qty === null || qty < 0) throw new Error("qty/head/day is required and cannot be negative");
            const data = {
              categoryId: cat.id,
              feedItemId: feed,
              qtyPerHeadPerDay: String(qty),
              effectiveDate: requireDate(getCell(row, 7), "effectiveDate"),
              endDate: asDate(getCell(row, 8)),
              isActive: requireYesNo(getCell(row, 9), "isActive")
            } as any;
            const id = asOptionalNumber(getCell(row, 1));
            if (id !== null) throw new Error("Append manual template requires blank Ration Plan id; use a canonical Excel export to import existing IDs");
            await createRationPlan(data, tx);
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
        const s: ImportStats = {
          sheet: "Feed Stock",
          inserted: 0,
          skipped: 0,
          errors: []
        };
        for (let i = 2; i <= stockSheet.rowCount; i++) {
          const row = stockSheet.getRow(i);
          const feedName = asString(getCell(row, 2));
          if (!feedName) continue;
          const feedId = feedItemByName.get(feedName.toLowerCase());
          if (!feedId) {
            s.errors.push(`Row ${i}: feed item ${feedName} not found`);
            continue;
          }

          try {
            const qty = asOptionalNumber(getCell(row, 5));
            if (qty === null) throw new Error("qty is required");
            const unitCost = asOptionalNumber(getCell(row, 6));
            const totalCost = asOptionalNumber(getCell(row, 7));
            const data = {
              feedItemId: feedId,
              transactionType: requireEnum(getCell(row, 3), "transactionType", ["purchase", "stock_count", "adjustment"] as const),
              transactionDate: requireDate(getCell(row, 4), "transactionDate"),
              qty: String(qty),
              unitCost: unitCost === null ? null : String(unitCost),
              totalCost: totalCost === null ? null : String(totalCost),
              supplierName: asString(getCell(row, 8)) || null,
              notes: asString(getCell(row, 9)) || null
            } as any;
            const id = asOptionalNumber(getCell(row, 1));
            if (id !== null) throw new Error("Append manual template requires blank Feed Stock id; use a canonical Excel export to import existing IDs");
            await createFeedStockEntry(data, tx);
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
        const s: ImportStats = {
          sheet: "Expenses",
          inserted: 0,
          skipped: 0,
          errors: []
        };
        for (let i = 2; i <= expSheet.rowCount; i++) {
          const row = expSheet.getRow(i);
          const expDate = asDate(getCell(row, 2));
          const catName = asString(getCell(row, 3));
          const amount = asNumber(getCell(row, 4));
          if (!expDate && !catName && amount === 0) continue;
          if (!expDate || !catName || amount <= 0) {
            s.errors.push(`Row ${i}: date, category, and a positive amount are required`);
            continue;
          }
          const catId = expCatByName.get(catName.toLowerCase());
          if (!catId) {
            s.errors.push(`Row ${i}: expense category ${catName} not found`);
            continue;
          }

          const targetType = (asString(getCell(row, 5)) || "general").toLowerCase() as any;
          const headCode = asString(getCell(row, 6));
          const catTargetName = asString(getCell(row, 7));

          try {
            if (!["general", "category", "head"].includes(targetType)) throw new Error("targetType must be general, category, or head");
            const headId = headCode ? animalByCode.get(headCode) : null;
            const categoryTarget = catTargetName ? categoryByName.get(catTargetName.toLowerCase())?.id : null;
            if (targetType === "head" && !headId) throw new Error(`head target ${headCode || "(blank)"} not found`);
            if (targetType === "category" && !categoryTarget) throw new Error(`category target ${catTargetName || "(blank)"} not found`);
            const subCategoryName = asString(getCell(row, 10));
            const subCategoryId = subCategoryName ? expSubCatByName.get(`${catId}:${subCategoryName.toLowerCase()}`) : null;
            if (subCategoryName && !subCategoryId) throw new Error(`expense subcategory ${subCategoryName} not found under ${catName}`);
            const data = {
              expenseDate: expDate,
              categoryId: catId,
              subCategoryId: subCategoryId ?? null,
              amount: String(amount),
              targetType,
              headId: headId ?? null,
              categoryTarget: categoryTarget ?? null,
              vendorName: asString(getCell(row, 8)) || null,
              notes: asString(getCell(row, 9)) || null
            } as any;
            const id = asOptionalNumber(getCell(row, 1));
            if (id !== null) throw new Error("Append manual template requires blank Expense id; use a canonical Excel export to import existing IDs");
            await createExpense(data, tx);
            s.inserted++;
          } catch (e: any) {
            s.errors.push(`Row ${i}: ${e.message}`);
          }
        }
        stats.push(s);
      }

      const legacyErrors = stats.flatMap(stat => stat.errors.map(error => `${stat.sheet}: ${error}`));
      if (legacyErrors.length) {
        const shown = legacyErrors.slice(0, 50);
        const suffix = legacyErrors.length > shown.length ? `\n...and ${legacyErrors.length - shown.length} more errors` : "";
        throw new Error(`Legacy Excel import failed; no changes were committed:\n${shown.join("\n")}${suffix}`);
      }

      // Audit entry
      const totalInserted = stats.reduce((a, b) => a + b.inserted, 0);
      await createAuditEntry(
        {
          userId: ctx.user?.id,
          action: "import",
          ipAddress: getClientIp(ctx),
          entityType: "bulk",
          entityId: "excel-manual-append",
          newValues: {
            mode: "append",
            totalInserted,
            sheets: stats.map(s => ({
              sheet: s.sheet,
              inserted: s.inserted
            }))
          } as any
        },
        tx
      );

      return { stats, totalInserted };
    });
  })
});
