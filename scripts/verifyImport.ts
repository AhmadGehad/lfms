/**
 * Import verification script.
 *
 * Reads the source Excel (1112111.xlsm) and produces a report of how many
 * records SHOULD be in the database so the operator can compare against the
 * actual DB state. The script does not connect to the DB — it is a sanity-
 * check tool to highlight discrepancies between source data and what was
 * imported.
 *
 * Usage:  npx tsx scripts/verifyImport.ts <path/to/excel.xlsm>
 */
import ExcelJS from "exceljs";
import path from "path";

type Report = {
  source: string;
  animals: {
    total: number;
    active: number;
    exited: number;
    speciesBreakdown: Record<string, number>;
    groupBreakdown: Record<string, number>;
    sexBreakdown: Record<string, number>;
    bornOnFarm: number;
    purchased: number;
    withBirthDate: number;
    withPurchaseCost: number;
    totalPurchaseCost: number;
  };
  lambing: { total: number; bySex: Record<string, number> };
  expenses: {
    total: number;
    totalAmount: number;
    byCategory: Record<string, { count: number; amount: number }>;
    byTargetType: Record<string, { count: number; amount: number }>;
  };
  weightLog: { totalEntries: number };
  feedStock: { totalEntries: number };
  feedItems: number;
};

async function verify(excelPath: string): Promise<Report> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelPath);

  // ─── HEADS ──────────────────────────────────────────────────────────────
  const heads = wb.getWorksheet("Heads");
  if (!heads) throw new Error("Heads sheet not found");
  const animals = {
    total: 0,
    active: 0,
    exited: 0,
    speciesBreakdown: {} as Record<string, number>,
    groupBreakdown: {} as Record<string, number>,
    sexBreakdown: {} as Record<string, number>,
    bornOnFarm: 0,
    purchased: 0,
    withBirthDate: 0,
    withPurchaseCost: 0,
    totalPurchaseCost: 0,
  };

  // Header row is row 2 in the source; row 1 has the title.
  heads.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const headId = row.getCell(1).value;
    if (!headId || headId === "HeadID") return;
    const species = String(row.getCell(2).value ?? "").trim();
    const sex = String(row.getCell(3).value ?? "").trim();
    const birthDate = row.getCell(4).value;
    const acqType = String(row.getCell(5).value ?? "").trim();
    const group = String(row.getCell(9).value ?? "").trim();
    const exitDate = row.getCell(11).value;
    const purchaseCostRaw = row.getCell(14).value;

    animals.total++;
    if (exitDate) animals.exited++;
    else animals.active++;

    if (species) animals.speciesBreakdown[species] = (animals.speciesBreakdown[species] ?? 0) + 1;
    if (group) animals.groupBreakdown[group] = (animals.groupBreakdown[group] ?? 0) + 1;
    if (sex) animals.sexBreakdown[sex] = (animals.sexBreakdown[sex] ?? 0) + 1;
    if (birthDate) animals.withBirthDate++;
    if (String(acqType).toLowerCase().startsWith("born")) animals.bornOnFarm++;
    else if (String(acqType).toLowerCase().startsWith("purch")) animals.purchased++;
    if (purchaseCostRaw && !isNaN(parseFloat(String(purchaseCostRaw)))) {
      animals.withPurchaseCost++;
      animals.totalPurchaseCost += parseFloat(String(purchaseCostRaw));
    }
  });

  // ─── LAMBING ────────────────────────────────────────────────────────────
  const lambing = { total: 0, bySex: {} as Record<string, number> };
  const lambSheet = wb.getWorksheet("Lambing_Log");
  lambSheet?.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const v = row.getCell(1).value;
    if (!v || v === "LambID") return;
    lambing.total++;
    const sex = String(row.getCell(5).value ?? "").trim();
    if (sex) lambing.bySex[sex] = (lambing.bySex[sex] ?? 0) + 1;
  });

  // ─── EXPENSES ───────────────────────────────────────────────────────────
  const expenses = {
    total: 0,
    totalAmount: 0,
    byCategory: {} as Record<string, { count: number; amount: number }>,
    byTargetType: {} as Record<string, { count: number; amount: number }>,
  };
  const expSheet = wb.getWorksheet("Other_Expenses");
  expSheet?.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const date = row.getCell(1).value;
    const cat = String(row.getCell(2).value ?? "").trim();
    const amt = row.getCell(3).value;
    const ttRaw = row.getCell(8).value as any;
    // exceljs returns formula cells as { formula, result }; use the result.
    const tt = String(
      (ttRaw && typeof ttRaw === "object" && "result" in ttRaw ? ttRaw.result : ttRaw) ?? "GENERAL"
    ).trim();
    if (!date || !amt) return;
    const amount = parseFloat(String(amt));
    if (isNaN(amount)) return;
    expenses.total++;
    expenses.totalAmount += amount;
    if (cat) {
      const c = expenses.byCategory[cat] ?? { count: 0, amount: 0 };
      c.count++; c.amount += amount;
      expenses.byCategory[cat] = c;
    }
    const t = expenses.byTargetType[tt] ?? { count: 0, amount: 0 };
    t.count++; t.amount += amount;
    expenses.byTargetType[tt] = t;
  });

  // ─── WEIGHT LOG (Fattening sheet — pairs of weight/diff columns) ────────
  let weightEntries = 0;
  const fatSheet = wb.getWorksheet("Fattening");
  fatSheet?.eachRow((row, rowNum) => {
    if (rowNum < 4) return; // weekly headers occupy rows 2-3
    const id = row.getCell(1).value;
    if (!id) return;
    // even-indexed cells from col 2 onward are weights
    for (let c = 2; c <= row.cellCount; c += 2) {
      const w = row.getCell(c).value;
      if (w !== null && w !== undefined && w !== "") weightEntries++;
    }
  });

  // ─── FEED STOCK ─────────────────────────────────────────────────────────
  let stockEntries = 0;
  const stockSheet = wb.getWorksheet("Feed_Stock");
  stockSheet?.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    if (row.getCell(1).value && row.getCell(2).value) stockEntries++;
  });

  // ─── FEED ITEMS (from Lists sheet) ──────────────────────────────────────
  let feedItems = 0;
  const lists = wb.getWorksheet("Lists");
  lists?.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    if (row.getCell(8).value) feedItems++; // FeedItems column (approximate)
  });

  return {
    source: path.basename(excelPath),
    animals,
    lambing,
    expenses,
    weightLog: { totalEntries: weightEntries },
    feedStock: { totalEntries: stockEntries },
    feedItems,
  };
}

function printReport(r: Report) {
  const fmt = (n: number) => n.toLocaleString("en-EG", { minimumFractionDigits: 2 });
  console.log(`\n═══════════════════════════════════════════════════════════════════`);
  console.log(`  IMPORT VERIFICATION  —  Expected DB state from: ${r.source}`);
  console.log(`═══════════════════════════════════════════════════════════════════\n`);

  console.log(`ANIMALS`);
  console.log(`  Total:                   ${r.animals.total}`);
  console.log(`  Active:                  ${r.animals.active}`);
  console.log(`  Exited:                  ${r.animals.exited}`);
  console.log(`  Born on farm:            ${r.animals.bornOnFarm}`);
  console.log(`  Purchased:               ${r.animals.purchased}`);
  console.log(`  With birth date:         ${r.animals.withBirthDate}`);
  console.log(`  With purchase cost:      ${r.animals.withPurchaseCost}  (total EGP ${fmt(r.animals.totalPurchaseCost)})`);
  console.log(`  Species breakdown:       ${JSON.stringify(r.animals.speciesBreakdown)}`);
  console.log(`  Sex breakdown:           ${JSON.stringify(r.animals.sexBreakdown)}`);
  console.log(`  Groups (top counts):     ${Object.entries(r.animals.groupBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}=${v}`).join(", ")}`);

  console.log(`\nLAMBING`);
  console.log(`  Records:                 ${r.lambing.total}`);
  console.log(`  By sex:                  ${JSON.stringify(r.lambing.bySex)}`);

  console.log(`\nEXPENSES`);
  console.log(`  Records:                 ${r.expenses.total}`);
  console.log(`  Total amount:            EGP ${fmt(r.expenses.totalAmount)}`);
  console.log(`  By category:`);
  for (const [k, v] of Object.entries(r.expenses.byCategory).sort((a, b) => b[1].amount - a[1].amount)) {
    console.log(`    ${k.padEnd(20)} ${String(v.count).padStart(3)} records  EGP ${fmt(v.amount).padStart(12)}`);
  }
  console.log(`  By target type:`);
  for (const [k, v] of Object.entries(r.expenses.byTargetType)) {
    console.log(`    ${k.padEnd(10)} ${String(v.count).padStart(3)} records  EGP ${fmt(v.amount).padStart(12)}`);
  }

  console.log(`\nWEIGHT LOG`);
  console.log(`  Entries:                 ${r.weightLog.totalEntries}`);

  console.log(`\nFEED STOCK LEDGER`);
  console.log(`  Entries:                 ${r.feedStock.totalEntries}`);

  console.log(`\nNOTES`);
  console.log(`  Compare the totals above to your DB. Any divergence likely means`);
  console.log(`  the import skipped or duplicated rows. Common discrepancies to`);
  console.log(`  check first:`);
  console.log(`  • If DB 'active' count is lower than source — animals may have been`);
  console.log(`    auto-marked exited because of empty exit-date cells parsed as exits.`);
  console.log(`  • If expense total differs — rows with non-numeric amounts may have`);
  console.log(`    been silently dropped during import.`);
  console.log(`  • If lambing count differs — check that promoted lambs are still in`);
  console.log(`    the lambing_log table even after promotion to animals.\n`);
}

const argv = process.argv.slice(2);
const inputPath = argv[0] ?? "_excel.xlsm";
verify(inputPath).then(printReport).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
