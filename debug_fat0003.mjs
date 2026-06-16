// Direct DB test for FAT0003 cost/day calculation
// Run with: node --loader ts-node/esm debug_fat0003.mjs
// Or: DATABASE_URL=... node debug_fat0003.mjs

import mysql from "mysql2/promise";

// Get DATABASE_URL from running server
import { execSync } from "child_process";

let dbUrl;
try {
  // Try to find it from running processes
  const pids = execSync("pgrep -f 'tsx\\|ts-node\\|vite' 2>/dev/null || true").toString().trim().split("\n");
  for (const pid of pids) {
    if (!pid) continue;
    try {
      const env = execSync(`cat /proc/${pid}/environ 2>/dev/null | tr '\\0' '\\n' | grep DATABASE_URL`).toString().trim();
      if (env) { dbUrl = env.replace("DATABASE_URL=", ""); break; }
    } catch {}
  }
} catch {}

if (!dbUrl) {
  // Try manus env
  try {
    dbUrl = execSync("manus-config config load --search DATABASE_URL 2>/dev/null | grep DATABASE_URL | head -1 | awk -F'\"' '{print $4}'").toString().trim();
  } catch {}
}

if (!dbUrl) {
  console.error("Could not find DATABASE_URL. Set it manually.");
  process.exit(1);
}

console.log("Connecting to DB...");
const conn = await mysql.createConnection(dbUrl);

// Step 1: Get FAT0003 base data
const [animals] = await conn.query(`
  SELECT id, animalId, acquisitionDate, exitDate, purchaseCost, categoryId,
    DATEDIFF(COALESCE(exitDate, CURDATE()), acquisitionDate) AS daysOnFarm
  FROM animals WHERE animalId = 'FAT0003'
`);
const animal = animals[0];
console.log("\n=== FAT0003 Base Data ===");
console.log(animal);

const acqDate = animal.acquisitionDate instanceof Date 
  ? animal.acquisitionDate.toISOString().split("T")[0] 
  : String(animal.acquisitionDate).split("T")[0];
const today = new Date().toISOString().split("T")[0];
const daysOnFarm = animal.daysOnFarm;

console.log(`\nacqDate: ${acqDate}, today: ${today}, daysOnFarm: ${daysOnFarm}`);

// Step 2: Get ration plans for category 7
const [plans] = await conn.query(`
  SELECT id, effectiveDate, endDate, isActive, qtyPerHeadPerDay, feedItemId
  FROM ration_plans WHERE categoryId = ? AND isActive = 1
`, [animal.categoryId]);
console.log("\n=== Ration Plans (active) ===");
for (const p of plans) {
  const effStr = p.effectiveDate instanceof Date 
    ? p.effectiveDate.toISOString().split("T")[0] 
    : String(p.effectiveDate).split("T")[0];
  console.log(`  Plan ${p.id}: feedItem=${p.feedItemId}, qty=${p.qtyPerHeadPerDay}/day, effectiveDate=${effStr}`);
}

// Step 3: Get feed item prices
const feedItemIds = plans.map(p => p.feedItemId);
const [prices] = await conn.query(`
  SELECT feedItemId, pricePerUnit, effectiveDate
  FROM feed_item_price_history
  WHERE feedItemId IN (?)
  ORDER BY feedItemId, effectiveDate
`, [feedItemIds]);
console.log("\n=== Feed Item Prices ===");
for (const p of prices) {
  const effStr = p.effectiveDate instanceof Date 
    ? p.effectiveDate.toISOString().split("T")[0] 
    : String(p.effectiveDate).split("T")[0];
  console.log(`  feedItem=${p.feedItemId}: ${p.pricePerUnit} EGP/unit (from ${effStr})`);
}

// Step 4: Calculate feed cost manually
let totalFeedCost = 0;
for (const plan of plans) {
  const planPrices = prices.filter(p => p.feedItemId == plan.feedItemId);
  // Find price on acqDate (or earliest fallback)
  const acqDateObj = new Date(acqDate);
  let applicablePrice = null;
  for (const pp of planPrices) {
    const ppDate = pp.effectiveDate instanceof Date ? pp.effectiveDate : new Date(pp.effectiveDate);
    if (ppDate <= acqDateObj) applicablePrice = pp;
  }
  if (!applicablePrice && planPrices.length > 0) applicablePrice = planPrices[0]; // earliest fallback
  
  const price = applicablePrice ? parseFloat(applicablePrice.pricePerUnit) : 0;
  const qty = parseFloat(plan.qtyPerHeadPerDay);
  const feedCost = qty * price * daysOnFarm;
  console.log(`\n  feedItem=${plan.feedItemId}: ${qty} kg/day × ${price} EGP/kg × ${daysOnFarm} days = ${feedCost.toFixed(2)} EGP`);
  totalFeedCost += feedCost;
}
console.log(`\nTotal Feed Cost: ${totalFeedCost.toFixed(2)} EGP`);

// Step 5: Direct expenses
const [directExp] = await conn.query(`
  SELECT SUM(amount) AS total FROM expenses WHERE headId = ? AND targetType = 'head'
`, [animal.id]);
const directExpTotal = parseFloat(directExp[0].total || 0);
console.log(`\nDirect Expenses: ${directExpTotal.toFixed(2)} EGP`);

// Step 6: Category expenses
const [catExp] = await conn.query(`
  SELECT e.expenseDate, e.amount,
    (SELECT COUNT(*) FROM animals a2 
     WHERE a2.categoryId = ? 
       AND a2.acquisitionDate <= e.expenseDate 
       AND (a2.exitDate IS NULL OR a2.exitDate > e.expenseDate)) AS headCount
  FROM expenses e
  WHERE e.targetType = 'category' AND e.categoryTarget = ?
    AND e.expenseDate >= ?
`, [animal.categoryId, animal.categoryId, acqDate]);
let catExpTotal = 0;
for (const e of catExp) {
  const share = parseFloat(e.amount) / Math.max(1, e.headCount);
  console.log(`\n  Cat expense: ${e.amount} EGP on ${e.expenseDate}, headCount=${e.headCount}, share=${share.toFixed(2)}`);
  catExpTotal += share;
}
console.log(`Category Expense Allocated: ${catExpTotal.toFixed(2)} EGP`);

// Step 7: Herd expenses
const [herdExp] = await conn.query(`
  SELECT e.expenseDate, e.amount,
    (SELECT COUNT(*) FROM animals a2 
     WHERE a2.acquisitionDate <= e.expenseDate 
       AND (a2.exitDate IS NULL OR a2.exitDate > e.expenseDate)) AS headCount
  FROM expenses e
  WHERE e.targetType = 'herd' AND e.expenseDate >= ?
`, [acqDate]);
let herdExpTotal = 0;
for (const e of herdExp) {
  const share = parseFloat(e.amount) / Math.max(1, e.headCount);
  console.log(`\n  Herd expense: ${e.amount} EGP on ${e.expenseDate}, headCount=${e.headCount}, share=${share.toFixed(2)}`);
  herdExpTotal += share;
}
console.log(`Herd Expense Allocated: ${herdExpTotal.toFixed(2)} EGP`);

// Step 8: Final calculation
const purchaseCost = parseFloat(animal.purchaseCost || 0);
const operatingCost = totalFeedCost + directExpTotal + catExpTotal + herdExpTotal;
const totalCost = purchaseCost + operatingCost;
const costPerDay = daysOnFarm > 0 ? operatingCost / daysOnFarm : 0;
const costPerMonth = costPerDay * 30;

console.log("\n=== FINAL CALCULATION ===");
console.log(`Purchase Cost:     ${purchaseCost.toFixed(2)} EGP`);
console.log(`Feed Cost:         ${totalFeedCost.toFixed(2)} EGP`);
console.log(`Direct Expenses:   ${directExpTotal.toFixed(2)} EGP`);
console.log(`Category Expenses: ${catExpTotal.toFixed(2)} EGP`);
console.log(`Herd Expenses:     ${herdExpTotal.toFixed(2)} EGP`);
console.log(`Operating Cost:    ${operatingCost.toFixed(2)} EGP`);
console.log(`Total Cost:        ${totalCost.toFixed(2)} EGP`);
console.log(`Days on Farm:      ${daysOnFarm}`);
console.log(`Cost/Day:          ${costPerDay.toFixed(2)} EGP`);
console.log(`Cost/Month:        ${costPerMonth.toFixed(2)} EGP`);

await conn.end();
