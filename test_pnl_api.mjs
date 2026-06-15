// Direct test of getAnimalPnL for D-001 (animal id 76)
// Tests the exact same code path the Animal Profile page calls

import { createConnection } from "mysql2/promise";

const conn = await createConnection(process.env.DATABASE_URL);

// Step 1: Get D-001 raw data to see what Drizzle returns
const [animalRows] = await conn.execute(
  `SELECT a.*, c.name as categoryName FROM animals a 
   LEFT JOIN animal_categories c ON a.categoryId = c.id 
   WHERE a.animalCode = 'D-001' AND a.deletedAt IS NULL LIMIT 1`
);

if (!animalRows.length) {
  console.log("D-001 not found");
  process.exit(1);
}

const animal = animalRows[0];
console.log("=== D-001 Raw Data ===");
console.log("acquisitionDate type:", typeof animal.acquisitionDate, animal.acquisitionDate instanceof Date ? "(Date)" : "(string)");
console.log("acquisitionDate value:", animal.acquisitionDate);
console.log("exitDate type:", typeof animal.exitDate, animal.exitDate instanceof Date ? "(Date)" : "(string/null)");
console.log("exitDate value:", animal.exitDate);
console.log("purchaseCost:", animal.purchaseCost, typeof animal.purchaseCost);
console.log("categoryId:", animal.categoryId);

// Step 2: Apply the fix
const today = new Date().toISOString().split("T")[0];
const acquisitionDate = animal.acquisitionDate instanceof Date
  ? animal.acquisitionDate.toISOString().split("T")[0]
  : String(animal.acquisitionDate).split("T")[0];
const exitDate = animal.exitDate
  ? (animal.exitDate instanceof Date ? animal.exitDate.toISOString().split("T")[0] : String(animal.exitDate).split("T")[0])
  : today;

console.log("\n=== Normalized Dates ===");
console.log("acquisitionDate:", acquisitionDate);
console.log("exitDate:", exitDate);

// Validate dates
const acqMs = new Date(acquisitionDate).getTime();
const exitMs = new Date(exitDate).getTime();
console.log("acqDate valid:", !isNaN(acqMs), acqMs);
console.log("exitDate valid:", !isNaN(exitMs), exitMs);

if (isNaN(acqMs) || isNaN(exitMs)) {
  console.error("INVALID DATE — this is the bug!");
  process.exit(1);
}

const daysOnFarm = Math.max(1, Math.floor((exitMs - acqMs) / 86400000));
console.log("daysOnFarm:", daysOnFarm);

// Step 3: Check ration plans
const [plans] = await conn.execute(
  `SELECT rp.*, fi.name as feedItemName FROM ration_plans rp
   LEFT JOIN feed_items fi ON rp.feedItemId = fi.id
   WHERE rp.categoryId = ? AND rp.isActive = 1 AND rp.deletedAt IS NULL`,
  [animal.categoryId]
);
console.log("\n=== Ration Plans ===");
for (const p of plans) {
  const effDate = p.effectiveDate instanceof Date ? p.effectiveDate.toISOString().split("T")[0] : String(p.effectiveDate).split("T")[0];
  console.log(`  ${p.feedItemName}: ${p.qtyPerHeadPerDay} kg/day, effective: ${effDate}`);
}

// Step 4: Check prices
if (plans.length > 0) {
  const feedItemIds = plans.map(p => p.feedItemId);
  const [prices] = await conn.execute(
    `SELECT * FROM feed_item_price_history WHERE feedItemId IN (${feedItemIds.join(",")}) ORDER BY effectiveDate ASC`
  );
  console.log("\n=== Feed Prices ===");
  for (const pr of prices) {
    const effDate = pr.effectiveDate instanceof Date ? pr.effectiveDate.toISOString().split("T")[0] : String(pr.effectiveDate).split("T")[0];
    console.log(`  feedItemId=${pr.feedItemId}: ${pr.pricePerUnit} EGP/kg, effective: ${effDate}`);
  }
  
  // Step 5: Simulate feed cost
  let totalFeedCost = 0;
  for (const plan of plans) {
    const planEff = plan.effectiveDate instanceof Date ? plan.effectiveDate.toISOString().split("T")[0] : String(plan.effectiveDate).split("T")[0];
    const planCovers = planEff <= acquisitionDate;
    const price = prices.find(pr => pr.feedItemId === plan.feedItemId);
    if (price) {
      const priceEff = price.effectiveDate instanceof Date ? price.effectiveDate.toISOString().split("T")[0] : String(price.effectiveDate).split("T")[0];
      const priceToUse = parseFloat(price.pricePerUnit);
      const qty = parseFloat(plan.qtyPerHeadPerDay);
      const cost = qty * priceToUse * daysOnFarm;
      totalFeedCost += cost;
      console.log(`\n  ${plan.feedItemName}: ${qty} kg/day × ${priceToUse} EGP/kg × ${daysOnFarm} days = ${cost} EGP`);
      console.log(`    Plan covers acq date (${planEff} <= ${acquisitionDate}): ${planCovers}`);
      console.log(`    Price covers acq date (${priceEff} <= ${acquisitionDate}): ${priceEff <= acquisitionDate}`);
    }
  }
  console.log("\n=== Expected Feed Cost ===", totalFeedCost, "EGP");
}

await conn.end();
console.log("\n=== TEST PASSED ===");
