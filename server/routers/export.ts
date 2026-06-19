import ExcelJS from "exceljs";
import { permissionProcedure, router } from "../_core/trpc";
import { getDb, getAllSpecies, getAllCategories, getAllStatuses, getAllGroups, getAllFeedItems, getAllExpenseCategories, getAnimals, getSales, getLambingLog, getFeedStockLedger, getFeedStockStatus, getExpenses, getAllAnimalsPnL, getIncomeStatement, getDashboardKPIs, getActiveHeadCountByCategory, getFeedPriceOnDate } from "../db";
import { readAllCanonicalTables } from "../canonicalTransfer";
import { addCanonicalSheets } from "../excelDataContract";

// ── styling helpers ──────────────────────────────────────────────────────────
function headerRow(ws: ExcelJS.Worksheet, row: number) {
  const r = ws.getRow(row);
  r.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F6E56" } };
  r.alignment = { vertical: "middle", horizontal: "left" };
  r.height = 22;
}

function titleRow(ws: ExcelJS.Worksheet, row: number, text: string, span: number) {
  ws.mergeCells(row, 1, row, span);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { bold: true, size: 14, color: { argb: "FF0F6E56" } };
  c.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(row).height = 28;
}

function fmtDate(d: any): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

// ── main export function ─────────────────────────────────────────────────────
async function buildWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LFMS Export";
  wb.created = new Date();
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const canonicalRows = await db.transaction(tx => readAllCanonicalTables(tx));

  // ─── 1. README ────────────────────────────────────────────────────────────
  const readme = wb.addWorksheet("README", {
    properties: { tabColor: { argb: "FF0F6E56" } }
  });
  readme.columns = [{ width: 100 }];
  titleRow(readme, 1, "Azal Farms — LFMS Full Export", 1);
  readme.getCell("A2").value = `Generated: ${new Date().toLocaleString()}`;
  readme.getCell("A4").value = "This workbook contains human-facing reports plus complete canonical Data - sheets for lossless import.";
  readme.getCell("A5").value = "Only LFMS Manifest and Data - sheets are the round-trip contract. Report formulas are informational.";
  readme.getCell("A7").value = "Sheet guide:";
  const guide = ["  • Animals          — full animal registry (97 records)", "  • Sales            — exit / sale records with revenue", "  • Lambing          — birth log with dam, sire, promotion status", "  • Weight Log       — every weight session per animal", "  • Feed Items       — feed items with current price", "  • Ration Plans     — qty per head per day per category", "  • Feed Stock       — full ledger (counts, purchases, adjustments)", "  • Stock Status     — live formulas: stockOnHand, daysRemaining", "  • Expenses         — all expenses with GENERAL/CATEGORY/HEAD targeting", "  • P&L              — per-animal P&L with cost components", "  • Income Statement — period summary: revenue, cost, profit", "  • Dashboard        — KPIs: heads, expenses, cost/head/day", "  • Config           — convenient configuration report", "  • LFMS Manifest    — versioned import contract", "  • Data - ...       — every table, field, relationship, and soft-deleted record"];
  guide.forEach((g, i) => (readme.getCell(`A${9 + i}`).value = g));

  // ─── 2. CONFIG TABLES ─────────────────────────────────────────────────────
  const species = await getAllSpecies();
  const categories = await getAllCategories();
  const statuses = await getAllStatuses();
  const groups = await getAllGroups();
  const feedItems = await getAllFeedItems();
  const expenseCats = await getAllExpenseCategories();

  const cfg = wb.addWorksheet("Config", {
    properties: { tabColor: { argb: "FF888888" } }
  });
  cfg.getCell("A1").value = "SPECIES";
  cfg.getCell("A1").font = { bold: true, size: 12 };
  cfg.addRow(["id", "name"]);
  headerRow(cfg, 2);
  species.forEach((s: any) => cfg.addRow([s.id, s.name]));

  let r = cfg.lastRow!.number + 2;
  cfg.getCell(`A${r}`).value = "CATEGORIES";
  cfg.getCell(`A${r}`).font = { bold: true, size: 12 };
  r++;
  cfg.getRow(r).values = ["id", "name", "speciesId", "idPrefix", "idSequence", "lambIdSequence", "targetWeightKg", "autoStageWeightKg", "autoStageTargetCategoryId"];
  headerRow(cfg, r);
  categories.forEach((c: any) => cfg.addRow([c.id, c.name, c.speciesId, c.idPrefix, c.idSequence, c.lambIdSequence, c.targetWeightKg, c.autoStageWeightKg, c.autoStageTargetCategoryId]));

  r = cfg.lastRow!.number + 2;
  cfg.getCell(`A${r}`).value = "STATUSES";
  cfg.getCell(`A${r}`).font = { bold: true, size: 12 };
  r++;
  cfg.getRow(r).values = ["id", "name", "isExitStatus"];
  headerRow(cfg, r);
  statuses.forEach((s: any) => cfg.addRow([s.id, s.name, s.isExitStatus ? "YES" : "no"]));

  r = cfg.lastRow!.number + 2;
  cfg.getCell(`A${r}`).value = "GROUPS";
  cfg.getCell(`A${r}`).font = { bold: true, size: 12 };
  r++;
  cfg.getRow(r).values = ["id", "groupCode", "name"];
  headerRow(cfg, r);
  groups.forEach((g: any) => cfg.addRow([g.id, g.groupCode, g.name]));

  r = cfg.lastRow!.number + 2;
  cfg.getCell(`A${r}`).value = "EXPENSE CATEGORIES";
  cfg.getCell(`A${r}`).font = { bold: true, size: 12 };
  r++;
  cfg.getRow(r).values = ["id", "name"];
  headerRow(cfg, r);
  expenseCats.forEach((e: any) => cfg.addRow([e.id, e.name]));

  cfg.columns.forEach(col => (col.width = 20));

  // ─── 3. ANIMALS ───────────────────────────────────────────────────────────
  const animals = await getAnimals();
  const animalCodeById = new Map<number, string>();
  animals.forEach((a: any) => animalCodeById.set(a.animal.id, a.animal.animalId));
  const ws = wb.addWorksheet("Animals", {
    properties: { tabColor: { argb: "FF378ADD" } }
  });
  ws.columns = [
    { header: "id", key: "id", width: 6 },
    { header: "animalId", key: "animalId", width: 12 },
    { header: "species", key: "speciesName", width: 10 },
    { header: "category", key: "categoryName", width: 14 },
    { header: "group", key: "groupName", width: 10 },
    { header: "status", key: "statusName", width: 12 },
    { header: "sex", key: "sex", width: 6 },
    {
      header: "acquisitionDate",
      key: "acquisitionDate",
      width: 14,
      style: { numFmt: "yyyy-mm-dd" }
    },
    { header: "acquisitionType", key: "acquisitionType", width: 14 },
    {
      header: "weightAtAcq (kg)",
      key: "weightAtAcquisition",
      width: 14,
      style: { numFmt: "0.00" }
    },
    {
      header: "latestWeight (kg)",
      key: "latestWeightKg",
      width: 14,
      style: { numFmt: "0.00" }
    },
    {
      header: "targetWeight (kg)",
      key: "targetWeightKg",
      width: 14,
      style: { numFmt: "0.00" }
    },
    {
      header: "purchaseCost (EGP)",
      key: "purchaseCost",
      width: 14,
      style: { numFmt: "#,##0.00" }
    },
    {
      header: "exitDate",
      key: "exitDate",
      width: 12,
      style: { numFmt: "yyyy-mm-dd" }
    },
    { header: "isActive", key: "isActive", width: 9 },
    { header: "daysOnFarm", key: "daysOnFarm", width: 11 },
    {
      header: "weightGain",
      key: "weightGain",
      width: 11,
      style: { numFmt: "0.00" }
    },
    {
      header: "dailyGain (kg/d)",
      key: "dailyGain",
      width: 14,
      style: { numFmt: "0.000" }
    },
    {
      header: "progress %",
      key: "progress",
      width: 10,
      style: { numFmt: "0%" }
    },
    { header: "notes", key: "notes", width: 30 },
    {
      header: "birthDate",
      key: "birthDate",
      width: 12,
      style: { numFmt: "yyyy-mm-dd" }
    },
    { header: "dam (code)", key: "damCode", width: 14 },
    { header: "sire (code)", key: "sireCode", width: 14 },
    { header: "exitReason", key: "exitReason", width: 24 }
  ];
  headerRow(ws, 1);

  animals.forEach((a: any, idx: number) => {
    const rowNum = idx + 2;
    ws.addRow({
      id: a.animal.id,
      animalId: a.animal.animalId,
      speciesName: a.speciesName,
      categoryName: a.categoryName,
      groupName: a.groupName,
      statusName: a.statusName,
      sex: a.animal.sex,
      acquisitionDate: fmtDate(a.animal.acquisitionDate),
      acquisitionType: a.animal.acquisitionType,
      weightAtAcquisition: a.animal.weightAtAcquisition ? parseFloat(a.animal.weightAtAcquisition) : null,
      latestWeightKg: a.latestWeightKg ? parseFloat(a.latestWeightKg) : null,
      targetWeightKg: a.targetWeightKg ? parseFloat(a.targetWeightKg) : null,
      purchaseCost: a.animal.purchaseCost ? parseFloat(a.animal.purchaseCost) : 0,
      exitDate: fmtDate(a.animal.exitDate),
      isActive: a.animal.isActive ? "YES" : "no",
      notes: a.animal.notes,
      birthDate: fmtDate(a.animal.birthDate),
      damCode: a.animal.damId ? (animalCodeById.get(a.animal.damId) ?? `#${a.animal.damId}`) : "",
      sireCode: a.animal.sireId ? (animalCodeById.get(a.animal.sireId) ?? `#${a.animal.sireId}`) : "",
      exitReason: a.animal.exitReason
    });
    // Formulas for derived columns:
    // daysOnFarm = (exitDate or TODAY) − acquisitionDate
    ws.getCell(`P${rowNum}`).value = {
      formula: `IF(ISBLANK(N${rowNum}),TODAY()-H${rowNum},N${rowNum}-H${rowNum})`
    };
    // weightGain = latestWeight − acqWeight
    ws.getCell(`Q${rowNum}`).value = {
      formula: `IF(AND(ISNUMBER(J${rowNum}),ISNUMBER(K${rowNum})),K${rowNum}-J${rowNum},0)`
    };
    // dailyGain = weightGain ÷ daysOnFarm
    ws.getCell(`R${rowNum}`).value = {
      formula: `IFERROR(Q${rowNum}/P${rowNum},0)`
    };
    // progress % = (latestW − acqW) ÷ (targetW − acqW)
    ws.getCell(`S${rowNum}`).value = {
      formula: `IFERROR((K${rowNum}-J${rowNum})/(L${rowNum}-J${rowNum}),"")`
    };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 24 } };

  // ─── 4. SALES ─────────────────────────────────────────────────────────────
  const sales = await getSales();
  const wsSale = wb.addWorksheet("Sales", {
    properties: { tabColor: { argb: "FF3B6D11" } }
  });
  wsSale.columns = [
    { header: "saleId", key: "id", width: 8 },
    { header: "animalId (code)", key: "animalCode", width: 14 },
    {
      header: "saleDate",
      key: "saleDate",
      width: 12,
      style: { numFmt: "yyyy-mm-dd" }
    },
    {
      header: "salePrice (EGP)",
      key: "salePrice",
      width: 14,
      style: { numFmt: "#,##0.00" }
    },
    {
      header: "weightAtSale (kg)",
      key: "weightAtSale",
      width: 14,
      style: { numFmt: "0.00" }
    },
    {
      header: "pricePerKg (EGP/kg)",
      key: "pricePerKg",
      width: 16,
      style: { numFmt: "0.00" }
    },
    { header: "buyerName", key: "buyerName", width: 20 },
    { header: "notes", key: "notes", width: 30 }
  ];
  headerRow(wsSale, 1);
  sales.forEach((s: any, idx: number) => {
    const rowNum = idx + 2;
    wsSale.addRow({
      id: s.sale.id,
      animalCode: s.animalCode ?? "",
      saleDate: fmtDate(s.sale.saleDate),
      salePrice: parseFloat(s.sale.salePrice ?? "0"),
      weightAtSale: s.sale.weightAtSale ? parseFloat(s.sale.weightAtSale) : null,
      pricePerKg: s.sale.pricePerKg ? parseFloat(s.sale.pricePerKg) : null,
      buyerName: s.sale.buyerName,
      notes: s.sale.notes
    });
    if (!s.sale.pricePerKg) {
      wsSale.getCell(`F${rowNum}`).value = {
        formula: `IFERROR(D${rowNum}/E${rowNum},"")`
      };
    }
  });
  // Summary row
  const salesEnd = sales.length + 1;
  wsSale.getCell(`A${salesEnd + 2}`).value = "TOTAL";
  wsSale.getCell(`A${salesEnd + 2}`).font = { bold: true };
  wsSale.getCell(`D${salesEnd + 2}`).value = {
    formula: `SUM(D2:D${salesEnd})`
  };
  wsSale.getCell(`D${salesEnd + 2}`).font = { bold: true };
  wsSale.getCell(`D${salesEnd + 2}`).numFmt = "#,##0.00";
  wsSale.views = [{ state: "frozen", ySplit: 1 }];

  // ─── 5. LAMBING LOG ───────────────────────────────────────────────────────
  const lambing = await getLambingLog();
  const wsLamb = wb.addWorksheet("Lambing", {
    properties: { tabColor: { argb: "FFBA7517" } }
  });
  wsLamb.columns = [
    { header: "id", key: "id", width: 6 },
    { header: "lamb (code)", key: "lambCode", width: 14 },
    { header: "dam (code)", key: "damCode", width: 14 },
    { header: "sire (code)", key: "sireCode", width: 14 },
    {
      header: "birthDate",
      key: "birthDate",
      width: 12,
      style: { numFmt: "yyyy-mm-dd" }
    },
    { header: "sex", key: "sex", width: 6 },
    { header: "birthType", key: "birthTypeName", width: 12 },
    { header: "group", key: "groupCode", width: 10 },
    { header: "isPromoted", key: "isPromoted", width: 11 },
    { header: "notes", key: "notes", width: 30 },
    {
      header: "birthWeightKg",
      key: "birthWeightKg",
      width: 14,
      style: { numFmt: "0.00" }
    },
    { header: "promotedHead (code)", key: "promotedHeadCode", width: 20 },
    { header: "species", key: "speciesName", width: 14 },
    { header: "category", key: "categoryName", width: 16 },
    {
      header: "promotedAnimalPurgedAt",
      key: "promotedAnimalPurgedAt",
      width: 22,
      style: { numFmt: "yyyy-mm-dd hh:mm:ss" }
    }
  ];
  headerRow(wsLamb, 1);
  lambing.forEach((l: any) =>
    wsLamb.addRow({
      id: l.id,
      lambCode: l.lambId ?? "",
      damCode: l.damId ? (animalCodeById.get(l.damId) ?? `#${l.damId}`) : "",
      sireCode: l.sireId ? (animalCodeById.get(l.sireId) ?? `#${l.sireId}`) : "",
      birthDate: fmtDate(l.birthDate),
      sex: l.sex,
      birthTypeName: l.birthTypeName,
      groupCode: l.groupCode,
      isPromoted: l.isPromoted ? "YES" : "no",
      notes: l.notes,
      birthWeightKg: l.birthWeightKg ? parseFloat(l.birthWeightKg) : null,
      promotedHeadCode: l.promotedAnimalCode ??
        (l.promotedHeadId ? (animalCodeById.get(l.promotedHeadId) ?? `#${l.promotedHeadId}`) : ""),
      speciesName: l.speciesName ?? "",
      categoryName: l.categoryName ?? "",
      promotedAnimalPurgedAt: l.promotedAnimalPurgedAt
        ? new Date(l.promotedAnimalPurgedAt)
        : null
    })
  );
  wsLamb.views = [{ state: "frozen", ySplit: 1 }];

  // ─── 6. WEIGHT LOG ────────────────────────────────────────────────────────
  const weights = canonicalRows.get("weight_log") ?? [];
  const wsWeight = wb.addWorksheet("Weight Log", {
    properties: { tabColor: { argb: "FF378ADD" } }
  });
  wsWeight.columns = [
    { header: "id", key: "id", width: 8 },
    { header: "animalId (code)", key: "animalCode", width: 18 },
    {
      header: "weighDate",
      key: "weighDate",
      width: 14,
      style: { numFmt: "yyyy-mm-dd" }
    },
    {
      header: "weightKg",
      key: "weightKg",
      width: 14,
      style: { numFmt: "0.00" }
    },
    { header: "sessionId", key: "sessionId", width: 38 },
    { header: "notes", key: "notes", width: 30 }
  ];
  headerRow(wsWeight, 1);
  weights.forEach((entry: any) =>
    wsWeight.addRow({
      id: entry.id,
      animalCode: animalCodeById.get(entry.animalId) ?? `#${entry.animalId}`,
      weighDate: fmtDate(entry.weighDate),
      weightKg: entry.weightKg ? parseFloat(entry.weightKg) : null,
      sessionId: entry.sessionId,
      notes: entry.notes
    })
  );
  wsWeight.views = [{ state: "frozen", ySplit: 1 }];

  // ─── 7. FEED ITEMS ────────────────────────────────────────────────────────
  const wsFi = wb.addWorksheet("Feed Items", {
    properties: { tabColor: { argb: "FF534AB7" } }
  });
  wsFi.columns = [
    { header: "id", key: "id", width: 6 },
    { header: "name", key: "name", width: 25 },
    { header: "unit", key: "unit", width: 8 },
    {
      header: "currentPrice (EGP)",
      key: "price",
      width: 18,
      style: { numFmt: "#,##0.00" }
    }
  ];
  headerRow(wsFi, 1);
  const today = new Date().toISOString().split("T")[0];
  // Resolve current prices for all feed items
  const feedItemPrices = new Map<number, number>();
  for (const f of feedItems) {
    const p = await getFeedPriceOnDate(f.id, today);
    feedItemPrices.set(f.id, p);
  }
  feedItems.forEach((f: any) =>
    wsFi.addRow({
      id: f.id,
      name: f.name,
      unit: f.unit,
      price: feedItemPrices.get(f.id) ?? 0
    })
  );

  // ─── 8. RATION PLANS ──────────────────────────────────────────────────────
  const categoryNameById = new Map(categories.map((category: any) => [category.id, category.name]));
  const feedItemNameById = new Map(feedItems.map((feedItem: any) => [feedItem.id, feedItem.name]));
  const rations = canonicalRows.get("ration_plans") ?? [];
  const wsRat = wb.addWorksheet("Ration Plans", {
    properties: { tabColor: { argb: "FF1D9E75" } }
  });
  wsRat.columns = [
    { header: "id", key: "id", width: 6 },
    { header: "category", key: "categoryName", width: 14 },
    { header: "feedItem", key: "feedItemName", width: 22 },
    {
      header: "qty/head/day (kg)",
      key: "qty",
      width: 16,
      style: { numFmt: "0.000" }
    },
    {
      header: "unitCost (EGP/kg)",
      key: "unitCost",
      width: 16,
      style: { numFmt: "#,##0.00" }
    },
    {
      header: "cost/head/day",
      key: "costPHD",
      width: 14,
      style: { numFmt: "#,##0.00" }
    },
    {
      header: "effectiveDate",
      key: "effectiveDate",
      width: 12,
      style: { numFmt: "yyyy-mm-dd" }
    },
    {
      header: "endDate",
      key: "endDate",
      width: 12,
      style: { numFmt: "yyyy-mm-dd" }
    },
    { header: "isActive", key: "isActive", width: 9 }
  ];
  headerRow(wsRat, 1);
  // Build a map of feedItemId → unitCost (use the prices we already fetched)
  rations.forEach((p: any, idx: number) => {
    const rowNum = idx + 2;
    const uc = feedItemPrices.get(p.feedItemId) ?? 0;
    wsRat.addRow({
      id: p.id,
      categoryName: categoryNameById.get(p.categoryId) ?? `#${p.categoryId}`,
      feedItemName: feedItemNameById.get(p.feedItemId) ?? `#${p.feedItemId}`,
      qty: parseFloat(p.qtyPerHeadPerDay),
      unitCost: uc,
      effectiveDate: fmtDate(p.effectiveDate),
      endDate: fmtDate(p.endDate),
      isActive: p.isActive ? "YES" : "no"
    });
    // costPHD = qty × unitCost
    wsRat.getCell(`F${rowNum}`).value = { formula: `D${rowNum}*E${rowNum}` };
  });
  wsRat.views = [{ state: "frozen", ySplit: 1 }];

  // ─── 9. FEED STOCK LEDGER ─────────────────────────────────────────────────
  const ledger = await getFeedStockLedger();
  const wsLed = wb.addWorksheet("Feed Stock", {
    properties: { tabColor: { argb: "FF888780" } }
  });
  wsLed.columns = [
    { header: "id", key: "id", width: 6 },
    { header: "feedItem", key: "feedItemName", width: 22 },
    { header: "transactionType", key: "transactionType", width: 16 },
    {
      header: "transactionDate",
      key: "transactionDate",
      width: 14,
      style: { numFmt: "yyyy-mm-dd" }
    },
    {
      header: "qty (kg)",
      key: "qty",
      width: 12,
      style: { numFmt: "#,##0.00" }
    },
    {
      header: "unitCost",
      key: "unitCost",
      width: 12,
      style: { numFmt: "#,##0.00" }
    },
    {
      header: "totalCost",
      key: "totalCost",
      width: 12,
      style: { numFmt: "#,##0.00" }
    },
    { header: "supplier", key: "supplier", width: 20 },
    { header: "notes", key: "notes", width: 30 }
  ];
  headerRow(wsLed, 1);
  ledger.forEach((l: any) =>
    wsLed.addRow({
      id: l.id,
      feedItemName: l.feedItemName,
      transactionType: l.transactionType,
      transactionDate: fmtDate(l.transactionDate),
      qty: parseFloat(l.qty ?? "0"),
      unitCost: l.unitCost ? parseFloat(l.unitCost) : null,
      totalCost: l.totalCost ? parseFloat(l.totalCost) : null,
      supplier: l.supplierName,
      notes: l.notes
    })
  );
  wsLed.views = [{ state: "frozen", ySplit: 1 }];

  // ─── 10. STOCK STATUS (with live formulas) ────────────────────────────────
  const stockStatus = await getFeedStockStatus();
  const wsStock = wb.addWorksheet("Stock Status", {
    properties: { tabColor: { argb: "FFE24B4A" } }
  });
  wsStock.columns = [
    { header: "feedItem", key: "feedItemName", width: 22 },
    {
      header: "lastCountDate",
      key: "lastCountDate",
      width: 14,
      style: { numFmt: "yyyy-mm-dd" }
    },
    { header: "daysSinceCount", key: "daysSinceCount", width: 14 },
    {
      header: "stockOnHand (kg)",
      key: "stockOnHand",
      width: 16,
      style: { numFmt: "#,##0.00" }
    },
    {
      header: "consumedSinceCount",
      key: "consumedSinceCount",
      width: 17,
      style: { numFmt: "#,##0.00" }
    },
    {
      header: "dailyConsumption",
      key: "dailyConsumption",
      width: 16,
      style: { numFmt: "#,##0.00" }
    },
    { header: "daysRemaining", key: "daysRemaining", width: 14 },
    {
      header: "runOutDate",
      key: "runOutDate",
      width: 14,
      style: { numFmt: "yyyy-mm-dd" }
    },
    { header: "status", key: "status", width: 10 }
  ];
  headerRow(wsStock, 1);
  stockStatus.forEach((s: any, idx: number) => {
    const rowNum = idx + 2;
    wsStock.addRow({
      feedItemName: s.feedItemName,
      lastCountDate: fmtDate(s.lastCountDate),
      stockOnHand: s.stockOnHand,
      consumedSinceCount: s.consumedSinceCount,
      dailyConsumption: s.dailyConsumption,
      runOutDate: fmtDate(s.runOutDate),
      status: s.status
    });
    // Live formula: daysRemaining = stockOnHand / dailyConsumption
    // Columns: A name, B lastCountDate, C stockOnHand, D consumedSinceCount,
    //          E dailyConsumption, F daysRemaining, G runOutDate, H status
    wsStock.getCell(`F${rowNum}`).value = {
      formula: `IFERROR(FLOOR(C${rowNum}/E${rowNum},1),"∞")`
    };
  });
  wsStock.views = [{ state: "frozen", ySplit: 1 }];

  // ─── 11. EXPENSES ─────────────────────────────────────────────────────────
  const expenses = await getExpenses();
  // Build category name lookup
  const catNameById = new Map<number, string>();
  categories.forEach((c: any) => catNameById.set(c.id, c.name));

  const wsExp = wb.addWorksheet("Expenses", {
    properties: { tabColor: { argb: "FF534AB7" } }
  });
  wsExp.columns = [
    { header: "id", key: "id", width: 6 },
    {
      header: "date",
      key: "expenseDate",
      width: 12,
      style: { numFmt: "yyyy-mm-dd" }
    },
    { header: "category", key: "categoryName", width: 14 },
    {
      header: "amount (EGP)",
      key: "amount",
      width: 14,
      style: { numFmt: "#,##0.00" }
    },
    { header: "targetType", key: "targetType", width: 11 },
    { header: "headId (code)", key: "headIdCode", width: 14 },
    { header: "categoryTarget", key: "categoryTargetName", width: 14 },
    { header: "vendor", key: "vendorName", width: 18 },
    { header: "notes", key: "notes", width: 30 },
    { header: "subCategory", key: "subCategoryName", width: 18 }
  ];
  headerRow(wsExp, 1);
  expenses.forEach((e: any) =>
    wsExp.addRow({
      id: e.expense.id,
      expenseDate: fmtDate(e.expense.expenseDate),
      categoryName: e.categoryName,
      amount: parseFloat(e.expense.amount ?? "0"),
      targetType: e.expense.targetType,
      headIdCode: e.animalCode ?? "",
      categoryTargetName: e.expense.categoryTarget ? (catNameById.get(e.expense.categoryTarget) ?? `#${e.expense.categoryTarget}`) : "",
      vendorName: e.expense.vendorName,
      notes: e.expense.notes,
      subCategoryName: e.subCategoryName ?? ""
    })
  );
  const expEnd = expenses.length + 1;
  wsExp.getCell(`A${expEnd + 2}`).value = "TOTAL";
  wsExp.getCell(`A${expEnd + 2}`).font = { bold: true };
  wsExp.getCell(`D${expEnd + 2}`).value = { formula: `SUM(D2:D${expEnd})` };
  wsExp.getCell(`D${expEnd + 2}`).font = { bold: true };
  wsExp.getCell(`D${expEnd + 2}`).numFmt = "#,##0.00";
  wsExp.views = [{ state: "frozen", ySplit: 1 }];

  // ─── 12. P&L (per animal) ─────────────────────────────────────────────────
  const pnl = await getAllAnimalsPnL();
  const wsPnL = wb.addWorksheet("P&L", {
    properties: { tabColor: { argb: "FF993C1D" } }
  });
  wsPnL.columns = [
    { header: "animal (code)", key: "animalCode", width: 14 },
    { header: "category", key: "categoryName", width: 14 },
    { header: "status", key: "statusName", width: 12 },
    { header: "daysOnFarm", key: "daysOnFarm", width: 11 },
    {
      header: "purchaseCost",
      key: "purchaseCost",
      width: 13,
      style: { numFmt: "#,##0.00" }
    },
    {
      header: "feedCost",
      key: "feedCost",
      width: 13,
      style: { numFmt: "#,##0.00" }
    },
    {
      header: "directExpenses",
      key: "directExpenseTotal",
      width: 14,
      style: { numFmt: "#,##0.00" }
    },
    {
      header: "catAllocation",
      key: "categoryExpenseAllocation",
      width: 13,
      style: { numFmt: "#,##0.00" }
    },
    {
      header: "totalCost",
      key: "totalCost",
      width: 13,
      style: { numFmt: "#,##0.00" }
    },
    {
      header: "revenue",
      key: "revenue",
      width: 13,
      style: { numFmt: "#,##0.00" }
    },
    {
      header: "netPnL",
      key: "netPnL",
      width: 13,
      style: { numFmt: "#,##0.00" }
    },
    {
      header: "costPerDay",
      key: "costPerDay",
      width: 12,
      style: { numFmt: "#,##0.00" }
    }
  ];
  headerRow(wsPnL, 1);
  pnl.forEach((p: any, idx: number) => {
    const rowNum = idx + 2;
    wsPnL.addRow({
      animalCode: p.animalCode,
      categoryName: p.categoryName,
      statusName: p.statusName,
      daysOnFarm: p.daysOnFarm,
      purchaseCost: p.purchaseCost,
      feedCost: p.feedCost,
      directExpenseTotal: p.directExpenseTotal,
      categoryExpenseAllocation: p.categoryExpenseAllocation
    });
    // totalCost = purchaseCost + feedCost + directExpenses + catAllocation
    wsPnL.getCell(`I${rowNum}`).value = {
      formula: `E${rowNum}+F${rowNum}+G${rowNum}+H${rowNum}`
    };
    // revenue (static — set after totalCost formula)
    wsPnL.getCell(`J${rowNum}`).value = p.revenue;
    wsPnL.getCell(`J${rowNum}`).numFmt = "#,##0.00";
    // netPnL = revenue − totalCost
    wsPnL.getCell(`K${rowNum}`).value = { formula: `J${rowNum}-I${rowNum}` };
    // costPerDay = totalCost ÷ days
    wsPnL.getCell(`L${rowNum}`).value = {
      formula: `IFERROR(I${rowNum}/D${rowNum},0)`
    };
  });
  // Totals row
  const pnlEnd = pnl.length + 1;
  const totalsRow = pnlEnd + 2;
  wsPnL.getCell(`A${totalsRow}`).value = "TOTAL";
  wsPnL.getCell(`A${totalsRow}`).font = { bold: true };
  ["E", "F", "G", "H", "I", "J", "K"].forEach(col => {
    wsPnL.getCell(`${col}${totalsRow}`).value = {
      formula: `SUM(${col}2:${col}${pnlEnd})`
    };
    wsPnL.getCell(`${col}${totalsRow}`).font = { bold: true };
    wsPnL.getCell(`${col}${totalsRow}`).numFmt = "#,##0.00";
    wsPnL.getCell(`${col}${totalsRow}`).border = { top: { style: "medium" } };
  });
  wsPnL.views = [{ state: "frozen", ySplit: 1 }];
  wsPnL.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 12 }
  };

  // ─── 13. INCOME STATEMENT ─────────────────────────────────────────────────
  const fromDate = new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];
  const toDate = new Date().toISOString().split("T")[0];
  const isData: any = await getIncomeStatement({ fromDate, toDate });

  const wsIS = wb.addWorksheet("Income Statement", {
    properties: { tabColor: { argb: "FF3B6D11" } }
  });
  wsIS.columns = [{ width: 30 }, { width: 18, style: { numFmt: "#,##0.00" } }];
  titleRow(wsIS, 1, `Income Statement: ${fromDate} → ${toDate}`, 2);
  wsIS.getCell("A3").value = "REVENUE";
  wsIS.getCell("A3").font = { bold: true, color: { argb: "FF3B6D11" } };
  wsIS.getCell("A4").value = "  Animal sales";
  wsIS.getCell("B4").value = isData?.revenue?.animalSales ?? 0;
  wsIS.getCell("A5").value = "Total Revenue";
  wsIS.getCell("A5").font = { bold: true };
  wsIS.getCell("B5").value = { formula: "B4" };
  wsIS.getCell("B5").font = { bold: true };

  wsIS.getCell("A7").value = "EXPENSES";
  wsIS.getCell("A7").font = { bold: true, color: { argb: "FFA32D2D" } };
  let row = 8;
  wsIS.getCell(`A${row}`).value = "  Animal purchases";
  wsIS.getCell(`B${row++}`).value = isData?.costs?.animalPurchases ?? 0;
  wsIS.getCell(`A${row}`).value = "  Feed purchases";
  wsIS.getCell(`B${row++}`).value = isData?.costs?.feedPurchases ?? 0;
  if (isData?.costs?.byCategory) {
    isData.costs.byCategory.forEach((c: any) => {
      wsIS.getCell(`A${row}`).value = `  ${c.categoryName}`;
      wsIS.getCell(`B${row++}`).value = parseFloat(c.total ?? "0");
    });
  }
  const expEndIS = row - 1;
  wsIS.getCell(`A${row}`).value = "Total Expenses";
  wsIS.getCell(`A${row}`).font = { bold: true };
  wsIS.getCell(`B${row}`).value = { formula: `SUM(B8:B${expEndIS})` };
  wsIS.getCell(`B${row}`).font = { bold: true };
  const totExpRow = row;
  row += 2;

  wsIS.getCell(`A${row}`).value = "NET PROFIT / LOSS";
  wsIS.getCell(`A${row}`).font = {
    bold: true,
    size: 12,
    color: { argb: "FF0F6E56" }
  };
  wsIS.getCell(`B${row}`).value = { formula: `B5-B${totExpRow}` };
  wsIS.getCell(`B${row}`).font = { bold: true, size: 12 };
  wsIS.getCell(`B${row}`).border = {
    top: { style: "medium" },
    bottom: { style: "double" }
  };
  row += 2;
  wsIS.getCell(`A${row}`).value = "Profit margin %";
  wsIS.getCell(`B${row}`).value = { formula: `IFERROR(B${row - 2}/B5,0)` };
  wsIS.getCell(`B${row}`).numFmt = "0.00%";

  // ─── 14. DASHBOARD KPIs ───────────────────────────────────────────────────
  const kpisRaw = await getDashboardKPIs({ fromDate, toDate });
  const kpis: any = kpisRaw ?? {
    totalActiveHeads: 0,
    totalRevenue: 0,
    feedExpenses: 0,
    otherExpenses: 0,
    totalExpenses: 0,
    grossPnL: 0,
    costPerHeadPerDay: 0,
    categoryBreakdown: []
  };
  const wsKpi = wb.addWorksheet("Dashboard", {
    properties: { tabColor: { argb: "FF0F6E56" } }
  });
  wsKpi.columns = [{ width: 30 }, { width: 20, style: { numFmt: "#,##0.00" } }];
  titleRow(wsKpi, 1, `Dashboard KPIs: ${fromDate} → ${toDate}`, 2);
  const kpiRows = [
    ["Total Active Heads", kpis.totalActiveHeads],
    ["Total Revenue (period)", kpis.totalRevenue],
    ["Feed Expenses (period)", kpis.feedExpenses],
    ["Other Expenses (period)", kpis.otherExpenses],
    ["Total Expenses (period)", kpis.totalExpenses],
    ["Gross P&L (period)", kpis.grossPnL],
    ["Cost / Head / Day", kpis.costPerHeadPerDay]
  ];
  kpiRows.forEach(([label, val], i) => {
    const r = i + 3;
    wsKpi.getCell(`A${r}`).value = label;
    wsKpi.getCell(`A${r}`).font = { bold: true };
    wsKpi.getCell(`B${r}`).value = val ?? 0;
  });
  // Category breakdown
  let bRow = kpiRows.length + 5;
  wsKpi.getCell(`A${bRow}`).value = "Category breakdown";
  wsKpi.getCell(`A${bRow}`).font = { bold: true, color: { argb: "FF0F6E56" } };
  bRow++;
  wsKpi.getCell(`A${bRow}`).value = "Category";
  wsKpi.getCell(`B${bRow}`).value = "Head count";
  headerRow(wsKpi, bRow);
  (kpis.categoryBreakdown ?? []).forEach((c: any) => {
    bRow++;
    wsKpi.getCell(`A${bRow}`).value = c.categoryName;
    wsKpi.getCell(`B${bRow}`).value = Number(c.headCount);
    wsKpi.getCell(`B${bRow}`).numFmt = "0";
  });

  // Active head count per category (live source for Stock formulas)
  const activeHC = await getActiveHeadCountByCategory();
  bRow += 2;
  wsKpi.getCell(`A${bRow}`).value = "Active head count by categoryId (live)";
  wsKpi.getCell(`A${bRow}`).font = { bold: true, color: { argb: "FF0F6E56" } };
  bRow++;
  wsKpi.getCell(`A${bRow}`).value = "categoryId";
  wsKpi.getCell(`B${bRow}`).value = "headCount";
  headerRow(wsKpi, bRow);
  Object.entries(activeHC).forEach(([catId, count]) => {
    bRow++;
    wsKpi.getCell(`A${bRow}`).value = Number(catId);
    wsKpi.getCell(`B${bRow}`).value = count;
    wsKpi.getCell(`B${bRow}`).numFmt = "0";
  });

  // ─── Canonical round-trip data ───────────────────────────────────────────
  addCanonicalSheets(wb, canonicalRows, wb.created);

  // ─── Output ──────────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

export const exportRouter = router({
  /** Generate the full workbook and return as base64. */
  full: permissionProcedure("data", "export").query(async () => {
    const buf = await buildWorkbook();
    return {
      filename: `lfms-export-${new Date().toISOString().split("T")[0]}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      base64: buf.toString("base64")
    };
  })
});
