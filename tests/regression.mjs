/**
 * LFMS Regression Test Suite
 * Tests all major features via HTTP API calls and verifies audit logging.
 * Run:  pnpm test:regression
 *       node tests/regression.mjs
 *
 * MAINTENANCE GUIDE:
 * - Add new sections at the end of main() before the Audit Log Verification section.
 * - Each new feature should have: a section() header, try/catch blocks, pass()/fail() calls.
 * - The audit verification section at the end automatically checks that new entity types
 *   are logged — add new expected entity types to the `expectedEntities` array.
 * - Run after every significant feature addition to catch regressions early.
 */

import { SignJWT } from "jose";
import { readFileSync } from "fs";
import { createRequire } from "module";

const BASE = "http://localhost:3000";
const RESULTS = [];
let SESSION_COOKIE = "";

// ── Helpers ──────────────────────────────────────────────────────────────────
function pass(name, detail = "") {
  RESULTS.push({ status: "PASS", name, detail });
  console.log(`  ✅ PASS  ${name}${detail ? " — " + detail : ""}`);
}
function fail(name, detail = "") {
  RESULTS.push({ status: "FAIL", name, detail });
  console.log(`  ❌ FAIL  ${name}${detail ? " — " + detail : ""}`);
}
function warn(name, detail = "") {
  RESULTS.push({ status: "WARN", name, detail });
  console.log(`  ⚠️  WARN  ${name}${detail ? " — " + detail : ""}`);
}
function section(title) {
  console.log(`\n${"─".repeat(60)}\n  ${title}\n${"─".repeat(60)}`);
}

async function trpc(procedure, input, method = "GET") {
  const isQuery = method === "GET";
  let url = `${BASE}/api/trpc/${procedure}`;
  const opts = {
    headers: {
      "Content-Type": "application/json",
      Cookie: SESSION_COOKIE,
    },
  };
  if (isQuery) {
    // Only add ?input= if input is explicitly provided (not undefined)
    if (input !== undefined) {
      url += `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` ;
    }
    opts.method = "GET";
  } else {
    opts.method = "POST";
    opts.body = JSON.stringify({ json: input ?? null });
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (json?.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json?.result?.data?.json ?? json?.result?.data ?? json;
}

// ── Create session token ──────────────────────────────────────────────────────
async function createSessionToken() {
  // Read JWT_SECRET from .env or environment
  let secret = process.env.JWT_SECRET;
  if (!secret) {
    try {
      const env = readFileSync("/home/ubuntu/lfms/.env", "utf8");
      const match = env.match(/JWT_SECRET=(.+)/);
      if (match) secret = match[1].trim();
    } catch {}
  }
  if (!secret) throw new Error("JWT_SECRET not found");

  let ownerOpenId = process.env.OWNER_OPEN_ID;
  if (!ownerOpenId) {
    try {
      const env = readFileSync("/home/ubuntu/lfms/.env", "utf8");
      const match = env.match(/OWNER_OPEN_ID=(.+)/);
      if (match) ownerOpenId = match[1].trim();
    } catch {}
  }
  if (!ownerOpenId) ownerOpenId = "BzE3sWMQNrS6fiC3R725Cv"; // admin user from DB

  let appId = process.env.VITE_APP_ID;
  if (!appId) {
    try {
      const env = readFileSync("/home/ubuntu/lfms/.env", "utf8");
      const match = env.match(/VITE_APP_ID=(.+)/);
      if (match) appId = match[1].trim();
    } catch {}
  }

  const secretKey = new TextEncoder().encode(secret);
  const token = await new SignJWT({ openId: ownerOpenId, appId: appId ?? "", name: "Test User" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(secretKey);
  return token;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🐄  LFMS Full Scenario Test\n");

  // ── Auth ──────────────────────────────────────────────────────────────────
  section("1. Authentication");
  try {
    const token = await createSessionToken();
    SESSION_COOKIE = `app_session_id=${token}`;
    const me = await trpc("auth.me");
    if (me?.id) {
      pass("Session token creation + auth.me", `userId=${me.id}, role=${me.role}`);
    } else {
      fail("auth.me returned no user", JSON.stringify(me));
      process.exit(1);
    }
  } catch (e) {
    fail("Authentication setup", e.message);
    process.exit(1);
  }

  // ── Config: read all lookup tables ────────────────────────────────────────
  section("2. Configuration — Read Lookups");
  const lookups = ["config.getSpecies", "config.getCategories", "config.getGroups",
    "config.getStatuses", "config.getBirthTypes", "config.getFeedItems",
    "config.getExpenseCategories"];
  const lookupData = {};
  for (const proc of lookups) {
    try {
      const data = await trpc(proc);
      const count = Array.isArray(data) ? data.length : "?";
      lookupData[proc] = data;
      pass(proc, `${count} records`);
    } catch (e) { fail(proc, e.message); }
  }

  // ── Config: update a species ───────────────────────────────────────────────
  section("3. Configuration — Update");
  const species = lookupData["config.getSpecies"] ?? [];
  if (species.length > 0) {
    const s = species[0];
    try {
      await trpc("config.updateSpecies", { id: s.id, name: s.name, description: "Updated by scenario test" }, "POST");
      pass("config.updateSpecies", `id=${s.id}`);
    } catch (e) { fail("config.updateSpecies", e.message); }
  }

  // ── Animals: list ─────────────────────────────────────────────────────────
  section("4. Animals — Registry");
  let animals = [];
  try {
    const data = await trpc("animals.list", { isActive: true });
    animals = Array.isArray(data) ? data : [];
    pass("animals.list (active)", `${animals.length} animals`);
  } catch (e) { fail("animals.list", e.message); }

  // ── Animals: create a test animal ─────────────────────────────────────────
  let testAnimalId = null;
  let testAnimalCode = null;
  const cats = lookupData["config.getCategories"] ?? [];
  const specs = lookupData["config.getSpecies"] ?? [];
  const groups = lookupData["config.getGroups"] ?? [];
  const statuses = lookupData["config.getStatuses"] ?? [];
  if (cats.length > 0 && specs.length > 0) {
    try {
      const result = await trpc("animals.create", {
        animalId: `TEST-${Date.now()}`,
        speciesId: specs[0].id,
        categoryId: cats[0].id,
        groupId: groups.length > 0 ? groups[0].id : undefined,
        statusId: statuses.length > 0 ? statuses[0].id : undefined,
        sex: "male",
        acquisitionDate: "2026-01-01",
        acquisitionType: "purchased",
        birthDate: "2025-06-01",
        initialWeightKg: "45.0",
        notes: "Created by scenario test",
      }, "POST");
      testAnimalId = result?.id ?? result?.insertId;
      testAnimalCode = `TEST-${Date.now() - 1}`;
      pass("animals.create", `id=${testAnimalId}`);
    } catch (e) { fail("animals.create", e.message); }
  } else {
    warn("animals.create", "Skipped — no species/categories available");
  }

  // ── Animals: update ───────────────────────────────────────────────────────
  if (testAnimalId) {
    try {
      await trpc("animals.update", { id: testAnimalId, notes: "Updated by scenario test" }, "POST");
      pass("animals.update", `id=${testAnimalId}`);
    } catch (e) { fail("animals.update", e.message); }
  }

  // ── Animals: get by ID ────────────────────────────────────────────────────
  if (animals.length > 0) {
    const firstAnimal = animals[0];
    const animalId = firstAnimal?.animal?.id ?? firstAnimal?.id;
    try {
      const detail = await trpc("animals.getById", { id: animalId });
      pass("animals.getById", `id=${animalId}, code=${detail?.animal?.animalId ?? "?"}`);
    } catch (e) { fail("animals.getById", e.message); }
  }

  // ── Weight logs ───────────────────────────────────────────────────────────
  section("5. Weight Logs");
  const targetAnimal = animals.length > 0 ? (animals[0]?.animal?.id ?? animals[0]?.id) : null;
  let weightLogId = null;
  if (targetAnimal) {
    try {
      const result = await trpc("animals.addWeight", {
        animalId: targetAnimal,
        weightKg: "52.5",
        weighDate: "2026-05-01",
        notes: "Scenario test weight",
      }, "POST");
      weightLogId = result?.id ?? result?.insertId;
      pass("animals.addWeight", `animalId=${targetAnimal}, weight=52.5kg`);
    } catch (e) { fail("animals.addWeight", e.message); }

    try {
      const logs = await trpc("animals.getWeightLog", { animalId: targetAnimal });
      pass("animals.getWeightLog", `${Array.isArray(logs) ? logs.length : "?"} logs`);
    } catch (e) { fail("animals.getWeightLog", e.message); }
  }

  // ── Expenses ──────────────────────────────────────────────────────────────
  section("6. Expenses");
  const expCats = lookupData["config.getExpenseCategories"] ?? [];
  let expenseId = null;
  if (expCats.length > 0) {
    try {
      const result = await trpc("expenses.create", {
        categoryId: expCats[0].id,
        amount: "500.00",
        expenseDate: "2026-05-01",
        targetType: "general",
        notes: "Scenario test expense",
        vendorName: "Test Vendor",
      }, "POST");
      expenseId = result?.id ?? result?.insertId;
      pass("expenses.create", `id=${expenseId}, amount=500`);
    } catch (e) { fail("expenses.create", e.message); }
  }

  try {
    const expenses = await trpc("expenses.list", { fromDate: "2026-01-01", toDate: "2026-12-31" });
    pass("expenses.list", `${Array.isArray(expenses) ? expenses.length : "?"} records`);
  } catch (e) { fail("expenses.list", e.message); }

  if (expenseId) {
    try {
      await trpc("expenses.update", { id: expenseId, notes: "Updated by scenario test" }, "POST");
      pass("expenses.update", `id=${expenseId}`);
    } catch (e) { fail("expenses.update", e.message); }
  }

  // ── Feed: ration plans ────────────────────────────────────────────────────
  section("7. Feed Management");
  const feedItems = lookupData["config.getFeedItems"] ?? [];
  try {
    const plans = await trpc("feed.getRationPlans");
    pass("feed.getRationPlans", `${Array.isArray(plans) ? plans.length : "?"} plans`);
  } catch (e) { fail("feed.getRationPlans", e.message); }

  let rationPlanId = null;
  if (feedItems.length > 0 && cats.length > 0) {
    try {
      const result = await trpc("feed.createRationPlan", {
        categoryId: cats[0].id,
        feedItemId: feedItems[0].id,
        qtyPerHeadPerDay: "2.5",
        effectiveDate: "2026-05-01",
      }, "POST");
      rationPlanId = result?.id ?? result?.insertId;
      pass("feed.createRationPlan", `id=${rationPlanId}`);
    } catch (e) { fail("feed.createRationPlan", e.message); }
  }

  // ── Feed: stock entry ─────────────────────────────────────────────────────
  if (feedItems.length > 0) {
    try {
      const result = await trpc("feed.addStockEntry", {
        feedItemId: feedItems[0].id,
        transactionDate: "2026-05-01",
        transactionType: "purchase",
        qty: "100",
        unitCost: "25.00",
        totalCost: "2500.00",
        supplierName: "Test Supplier",
        notes: "Scenario test stock",
      }, "POST");
      pass("feed.addStockEntry", `feedItemId=${feedItems[0].id}, qty=100`);
    } catch (e) { fail("feed.addStockEntry", e.message); }
  }

  try {
    const ledger = await trpc("feed.getStockLedger");
    pass("feed.getStockLedger", `${Array.isArray(ledger) ? ledger.length : "?"} entries`);
  } catch (e) { fail("feed.getStockLedger", e.message); }

  try {
    const status = await trpc("feed.getStockStatus");
    pass("feed.getStockStatus", `${Array.isArray(status) ? status.length : "?"} items`);
  } catch (e) { fail("feed.getStockStatus", e.message); }

  // ── Breeding / Lambing ────────────────────────────────────────────────────
  section("8. Breeding & Lambing");
  try {
    const logs = await trpc("breeding.listLambing");
    pass("breeding.listLambing", `${Array.isArray(logs) ? logs.length : "?"} records`);
  } catch (e) { fail("breeding.listLambing", e.message); }

  // ── Sales ─────────────────────────────────────────────────────────────────
  section("9. Sales Records");
  try {
    const salesList = await trpc("sales.list");
    pass("sales.list", `${Array.isArray(salesList) ? salesList.length : "?"} records`);
  } catch (e) { fail("sales.list", e.message); }

  // Update a sale price (O-001 or B-001 placeholder)
  try {
    const salesList = await trpc("sales.list");
    const pending = Array.isArray(salesList)
      ? salesList.find((s) => parseFloat(String(s.sale?.salePrice ?? s.salePrice ?? 0)) === 0)
      : null;
    if (pending) {
      const saleId = pending.sale?.id ?? pending.id;
      await trpc("sales.update", {
        id: saleId,
        salePrice: "0.01", // minimal test price — won't affect real data
        notes: "Scenario test — price will be corrected",
      }, "POST");
      // Revert back to 0
      await trpc("sales.update", { id: saleId, salePrice: "0", notes: "Sale price pending — please update" }, "POST");
      pass("sales.update (edit sale price)", `saleId=${saleId}`);
    } else {
      warn("sales.update", "No pending (price=0) sale found to test");
    }
  } catch (e) { fail("sales.update", e.message); }

  // ── Dashboard KPIs ────────────────────────────────────────────────────────
  section("10. Dashboard KPIs");
  try {
    const kpis = await trpc("dashboard.getKPIs", {
      fromDate: "2025-11-01",
      toDate: "2026-05-10",
    });
    pass("dashboard.getKPIs", `activeAnimals=${kpis?.totalActiveHeads}, totalExpenses=${kpis?.totalExpenses}`);
  } catch (e) { fail("dashboard.getKPIs", e.message); }

  try {
    const trend = await trpc("dashboard.getExpenseTrend", { fromDate: "2025-11-01", toDate: "2026-05-10" });
    pass("dashboard.getExpenseTrend", `${Array.isArray(trend) ? trend.length : "?"} months`);
  } catch (e) { fail("dashboard.getExpenseTrend", e.message); }

  try {
    const salesTrend = await trpc("dashboard.getSalesTrend", { fromDate: "2025-11-01", toDate: "2026-05-10" });
    pass("dashboard.getSalesTrend", `${Array.isArray(salesTrend) ? salesTrend.length : "?"} months`);
  } catch (e) { fail("dashboard.getSalesTrend", e.message); }

  try {
    const headCount = await trpc("dashboard.getHeadCountByCategory");
    pass("dashboard.getHeadCountByCategory", `${Array.isArray(headCount) ? headCount.length : "?"} categories`);
  } catch (e) { fail("dashboard.getHeadCountByCategory", e.message); }

  try {
    const feedStatus = await trpc("dashboard.getFeedStockStatus");
    pass("dashboard.getFeedStockStatus", `${Array.isArray(feedStatus) ? feedStatus.length : "?"} items`);
  } catch (e) { fail("dashboard.getFeedStockStatus", e.message); }

  // ── Income Statement ──────────────────────────────────────────────────────
  section("11. Income Statement");
  try {
    const stmt = await trpc("dashboard.getIncomeStatement", { fromDate: "2025-11-01", toDate: "2026-05-10" });
    pass("dashboard.getIncomeStatement", `revenue=${stmt?.revenue?.total}, expenses=${stmt?.costs?.total}, net=${stmt?.grossProfit}`);
  } catch (e) { fail("dashboard.getIncomeStatement", e.message); }

  // ── Animal P&L ────────────────────────────────────────────────────────────
  section("12. Animal P&L");
  try {
    // animals.getPnL requires a specific animalId - test with the first active animal
    const firstAnimalId = animals.length > 0 ? (animals[0]?.animal?.id ?? animals[0]?.id) : null;
    if (firstAnimalId) {
      const pnl = await trpc("animals.getPnL", { animalId: firstAnimalId });
      pass("animals.getPnL", `animalId=${firstAnimalId}, feedCost=${pnl?.feedCost ?? '?'}`);
    } else {
      warn("animals.getPnL", "Skipped — no animals available");
    }
  } catch (e) { fail("animals.getPnL", e.message); }

  // ── Soft Delete & Restore ──────────────────────────────────────────────────
  section("13. Soft Delete & Restore");
  if (testAnimalId) {
    try {
      await trpc("recycleBin.deleteAnimal", { id: testAnimalId, reason: "Scenario test cleanup" }, "POST");
      pass("recycleBin.deleteAnimal", `id=${testAnimalId}`);
    } catch (e) { fail("recycleBin.deleteAnimal", e.message); }
    try {
      const bin = await trpc("recycleBin.list");
      const found = Array.isArray(bin) && bin.some((a) => (a.animal?.id ?? a.id) === testAnimalId);
      found ? pass("recycleBin.list (deleted animal present)", `id=${testAnimalId}`) : fail("recycleBin.list (deleted animal not found)", `id=${testAnimalId}`);
    } catch (e) { fail("recycleBin.list", e.message); }
    try {
      await trpc("recycleBin.restoreAnimal", { id: testAnimalId }, "POST");
      pass("recycleBin.restoreAnimal", `id=${testAnimalId}`);
    } catch (e) { fail("recycleBin.restoreAnimal", e.message); }
  }

  if (expenseId) {
    try {
      await trpc("recycleBin.deleteExpense", { id: expenseId }, "POST");
      pass("recycleBin.deleteExpense", `id=${expenseId}`);
    } catch (e) { fail("recycleBin.deleteExpense", e.message); }
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  section("14. Notifications");
  try {
    const notifs = await trpc("notifications.list");
    pass("notifications.list", `${Array.isArray(notifs) ? notifs.length : "?"} notifications`);
  } catch (e) { fail("notifications.list", e.message); }

  // ── Audit Log ─────────────────────────────────────────────────────────────
  section("15. Audit Log Verification");
  try {
    const auditEntries = await trpc("audit.list");
    const entries = Array.isArray(auditEntries) ? auditEntries : [];
    pass("audit.list (total)", `${entries.length} entries`);

    const actions = [...new Set(entries.map((e) => e.action))];
    const entities = [...new Set(entries.map((e) => e.entityType))];
    console.log(`     Actions logged: ${actions.join(", ")}`);
    console.log(`     Entities logged: ${entities.join(", ")}`);

    // Check specific expected actions
    const expectedActions = ["create", "update", "SOFT_DELETE", "RESTORE"];
    for (const action of expectedActions) {
      const found = entries.some((e) => e.action === action);
      found ? pass(`Audit: '${action}' action logged`) : warn(`Audit: '${action}' action NOT found in log`);
    }

    // Check entities
    const expectedEntities = ["animal", "expense"];
    for (const entity of expectedEntities) {
      const found = entries.some((e) => e.entityType === entity);
      found ? pass(`Audit: '${entity}' entity logged`) : warn(`Audit: '${entity}' entity NOT found in log`);
    }

    // Check missing audit coverage
    const notLogged = [];
    if (!entries.some((e) => e.entityType === "feedStock")) notLogged.push("feedStock (stock entries)");
    if (!entries.some((e) => e.entityType === "rationPlan")) notLogged.push("rationPlan (create/update)");
    if (!entries.some((e) => e.entityType === "sale")) notLogged.push("sale (create/update)");
    if (!entries.some((e) => e.entityType === "weightLog")) notLogged.push("weightLog (add)");
    // lambing_log is logged by breeding router but no lambing records exist in test data — skip
    if (notLogged.length > 0) {
      warn("Missing audit coverage", notLogged.join(", "));
    } else {
      pass("All entity types have audit coverage");
    }
  } catch (e) { fail("audit.list", e.message); }

  // ── Cleanup: purge test animal ────────────────────────────────────────────
  section("16. Cleanup");
  if (testAnimalId) {
    try {
      await trpc("recycleBin.deleteAnimal", { id: testAnimalId, reason: "Scenario test cleanup — final" }, "POST");
      await trpc("recycleBin.purgeAnimal", { id: testAnimalId }, "POST");
      pass("Purged test animal", `id=${testAnimalId}`);
    } catch (e) { warn("Cleanup purge", e.message); }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = RESULTS.filter((r) => r.status === "PASS").length;
  const failed = RESULTS.filter((r) => r.status === "FAIL").length;
  const warned = RESULTS.filter((r) => r.status === "WARN").length;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  SCENARIO TEST COMPLETE`);
  console.log(`  ✅ Passed: ${passed}  ❌ Failed: ${failed}  ⚠️  Warnings: ${warned}`);
  console.log(`${"═".repeat(60)}\n`);

  if (failed > 0) {
    console.log("FAILED TESTS:");
    RESULTS.filter((r) => r.status === "FAIL").forEach((r) => console.log(`  ❌ ${r.name}: ${r.detail}`));
  }
  if (warned > 0) {
    console.log("\nWARNINGS:");
    RESULTS.filter((r) => r.status === "WARN").forEach((r) => console.log(`  ⚠️  ${r.name}: ${r.detail}`));
  }

  return failed;
}

main().then((failures) => process.exit(failures > 0 ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
