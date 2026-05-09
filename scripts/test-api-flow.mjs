/**
 * LFMS Full API Flow Test Script
 * Tests the complete end-to-end flow via HTTP against the running dev server.
 *
 * Usage:
 *   node scripts/test-api-flow.mjs [BASE_URL]
 *
 * Defaults to http://localhost:3000 if no BASE_URL is provided.
 *
 * This script requires a valid session cookie. Since the app uses Manus OAuth,
 * we test the public endpoints and the tRPC procedures that are accessible
 * without authentication (public procedures) and simulate the auth context
 * for protected procedures by checking the server is alive and responding.
 *
 * For a full authenticated flow test, run this after logging in via the browser
 * and exporting your session cookie as SESSION_COOKIE env var.
 */

const BASE_URL = process.argv[2] ?? "http://localhost:3000";
const SESSION_COOKIE = process.env.SESSION_COOKIE ?? "";

let passed = 0;
let failed = 0;
const results = [];

// ─── Utility ─────────────────────────────────────────────────────────────────
function log(icon, msg) {
  console.log(`${icon} ${msg}`);
}

function pass(name) {
  passed++;
  results.push({ name, status: "PASS" });
  log("✅", name);
}

function fail(name, reason) {
  failed++;
  results.push({ name, status: "FAIL", reason });
  log("❌", `${name} — ${reason}`);
}

async function trpcQuery(path, input, cookie = SESSION_COOKIE) {
  const url = `${BASE_URL}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input ?? {}))}`;
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(url, { headers });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

async function trpcMutation(path, input, cookie = SESSION_COOKIE) {
  const url = `${BASE_URL}/api/trpc/${path}`;
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(input ?? {}),
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function testServerHealth() {
  log("🔍", "Testing server health...");
  try {
    const res = await fetch(`${BASE_URL}/`);
    if (res.status === 200 || res.status === 304) {
      pass("Server is alive and serving frontend");
    } else {
      fail("Server health check", `Expected 200/304, got ${res.status}`);
    }
  } catch (e) {
    fail("Server health check", `Connection refused: ${e.message}`);
  }
}

async function testAuthMe() {
  log("🔍", "Testing auth.me endpoint...");
  try {
    const { status, data } = await trpcQuery("auth.me", {});
    if (status === 200) {
      const result = data?.result?.data;
      if (result === null || result === undefined) {
        pass("auth.me returns null for unauthenticated user");
      } else if (result?.email) {
        pass(`auth.me returns authenticated user: ${result.email}`);
      } else {
        pass("auth.me endpoint responds correctly");
      }
    } else {
      fail("auth.me", `Unexpected status ${status}`);
    }
  } catch (e) {
    fail("auth.me", e.message);
  }
}

async function testConfigSpecies() {
  log("🔍", "Testing config.getSpecies...");
  try {
    const { status, data } = await trpcQuery("config.getSpecies", {});
    if (status === 200) {
      const species = data?.result?.data;
      if (Array.isArray(species)) {
        pass(`config.getSpecies returns ${species.length} species`);
        if (species.length > 0) {
          const names = species.map((s) => s.name).join(", ");
          log("  ℹ️", `Species: ${names}`);
        }
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("config.getSpecies correctly requires authentication");
      } else {
        fail("config.getSpecies", `Unexpected response: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("config.getSpecies correctly requires authentication (401)");
    } else if (status === 401) {
      pass("config.getSpecies correctly requires authentication (401)");
    } else {
      fail("config.getSpecies", `Status ${status}`);
    }
  } catch (e) {
    fail("config.getSpecies", e.message);
  }
}

async function testConfigCategories() {
  log("🔍", "Testing config.getCategories...");
  try {
    const { status, data } = await trpcQuery("config.getCategories", {});
    if (status === 200) {
      const cats = data?.result?.data;
      if (Array.isArray(cats)) {
        pass(`config.getCategories returns ${cats.length} categories`);
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("config.getCategories correctly requires authentication");
      } else {
        fail("config.getCategories", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("config.getCategories correctly requires authentication (401)");
    } else if (status === 401) {
      pass("config.getCategories correctly requires authentication (401)");
    } else {
      fail("config.getCategories", `Status ${status}`);
    }
  } catch (e) {
    fail("config.getCategories", e.message);
  }
}

async function testConfigGroups() {
  log("🔍", "Testing config.getGroups...");
  try {
    const { status, data } = await trpcQuery("config.getGroups", {});
    if (status === 200) {
      const groups = data?.result?.data;
      if (Array.isArray(groups)) {
        pass(`config.getGroups returns ${groups.length} groups`);
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("config.getGroups correctly requires authentication");
      } else {
        fail("config.getGroups", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("config.getGroups correctly requires authentication (401)");
    } else {
      fail("config.getGroups", `Status ${status}`);
    }
  } catch (e) {
    fail("config.getGroups", e.message);
  }
}

async function testConfigFeedItems() {
  log("🔍", "Testing config.getFeedItems...");
  try {
    const { status, data } = await trpcQuery("config.getFeedItems", {});
    if (status === 200) {
      const items = data?.result?.data;
      if (Array.isArray(items)) {
        pass(`config.getFeedItems returns ${items.length} feed items`);
        if (items.length > 0) {
          log("  ℹ️", `Feed items: ${items.map((i) => i.name).join(", ")}`);
        }
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("config.getFeedItems correctly requires authentication");
      } else {
        fail("config.getFeedItems", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("config.getFeedItems correctly requires authentication (401)");
    } else {
      fail("config.getFeedItems", `Status ${status}`);
    }
  } catch (e) {
    fail("config.getFeedItems", e.message);
  }
}

async function testAnimalsList() {
  log("🔍", "Testing animals.list...");
  try {
    const { status, data } = await trpcQuery("animals.list", {});
    if (status === 200) {
      const animals = data?.result?.data;
      if (Array.isArray(animals)) {
        pass(`animals.list returns ${animals.length} animals`);
        if (animals.length > 0) {
          log("  ℹ️", `First animal: ${animals[0]?.animal?.animalId} (${animals[0]?.categoryName})`);
        }
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("animals.list correctly requires authentication");
      } else {
        fail("animals.list", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("animals.list correctly requires authentication (401)");
    } else {
      fail("animals.list", `Status ${status}`);
    }
  } catch (e) {
    fail("animals.list", e.message);
  }
}

async function testDashboardKPIs() {
  log("🔍", "Testing dashboard.getKPIs...");
  try {
    const { status, data } = await trpcQuery("dashboard.getKPIs", {});
    if (status === 200) {
      const kpis = data?.result?.data;
      if (kpis && typeof kpis.totalActiveHeads === "number") {
        pass(`dashboard.getKPIs: ${kpis.totalActiveHeads} active heads, revenue EGP ${kpis.totalRevenue}`);
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("dashboard.getKPIs correctly requires authentication");
      } else {
        fail("dashboard.getKPIs", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("dashboard.getKPIs correctly requires authentication (401)");
    } else {
      fail("dashboard.getKPIs", `Status ${status}`);
    }
  } catch (e) {
    fail("dashboard.getKPIs", e.message);
  }
}

async function testFeedStockStatus() {
  log("🔍", "Testing dashboard.getFeedStockStatus (always unfiltered)...");
  try {
    const { status, data } = await trpcQuery("dashboard.getFeedStockStatus", {});
    if (status === 200) {
      const stock = data?.result?.data;
      if (Array.isArray(stock)) {
        pass(`dashboard.getFeedStockStatus returns ${stock.length} feed items`);
        const critical = stock.filter((s) => s.status === "critical");
        const low = stock.filter((s) => s.status === "low");
        if (critical.length > 0) log("  ⚠️", `${critical.length} critical stock items`);
        if (low.length > 0) log("  ⚠️", `${low.length} low stock items`);
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("dashboard.getFeedStockStatus correctly requires authentication");
      } else {
        fail("dashboard.getFeedStockStatus", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("dashboard.getFeedStockStatus correctly requires authentication (401)");
    } else {
      fail("dashboard.getFeedStockStatus", `Status ${status}`);
    }
  } catch (e) {
    fail("dashboard.getFeedStockStatus", e.message);
  }
}

async function testNotificationsList() {
  log("🔍", "Testing notifications.list...");
  try {
    const { status, data } = await trpcQuery("notifications.list", {});
    if (status === 200) {
      const notifs = data?.result?.data;
      if (Array.isArray(notifs)) {
        pass(`notifications.list returns ${notifs.length} notifications`);
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("notifications.list correctly requires authentication");
      } else {
        fail("notifications.list", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("notifications.list correctly requires authentication (401)");
    } else {
      fail("notifications.list", `Status ${status}`);
    }
  } catch (e) {
    fail("notifications.list", e.message);
  }
}

async function testSalesList() {
  log("🔍", "Testing sales.list...");
  try {
    const { status, data } = await trpcQuery("sales.list", {});
    if (status === 200) {
      const sales = data?.result?.data;
      if (Array.isArray(sales)) {
        pass(`sales.list returns ${sales.length} sales records`);
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("sales.list correctly requires authentication");
      } else {
        fail("sales.list", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("sales.list correctly requires authentication (401)");
    } else {
      fail("sales.list", `Status ${status}`);
    }
  } catch (e) {
    fail("sales.list", e.message);
  }
}

async function testAuditLog() {
  log("🔍", "Testing audit.list...");
  try {
    const { status, data } = await trpcQuery("audit.list", {});
    if (status === 200) {
      const entries = data?.result?.data;
      if (Array.isArray(entries)) {
        pass(`audit.list returns ${entries.length} audit entries`);
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("audit.list correctly requires authentication");
      } else {
        fail("audit.list", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("audit.list correctly requires authentication (401)");
    } else {
      fail("audit.list", `Status ${status}`);
    }
  } catch (e) {
    fail("audit.list", e.message);
  }
}

async function testIncomeStatement() {
  log("🔍", "Testing dashboard.getIncomeStatement...");
  try {
    const { status, data } = await trpcQuery("dashboard.getIncomeStatement", {
      fromDate: "2024-01-01",
      toDate: "2024-12-31",
    });
    if (status === 200) {
      const stmt = data?.result?.data;
      if (stmt && typeof stmt.netProfit === "number") {
        pass(`dashboard.getIncomeStatement: net profit EGP ${stmt.netProfit}`);
        log("  ℹ️", `Revenue: ${stmt.revenue?.total}, Expenses: ${stmt.expenses?.total}`);
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("dashboard.getIncomeStatement correctly requires authentication");
      } else {
        fail("dashboard.getIncomeStatement", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("dashboard.getIncomeStatement correctly requires authentication (401)");
    } else {
      fail("dashboard.getIncomeStatement", `Status ${status}`);
    }
  } catch (e) {
    fail("dashboard.getIncomeStatement", e.message);
  }
}

async function testExpenseTrend() {
  log("🔍", "Testing dashboard.getExpenseTrend...");
  try {
    const { status, data } = await trpcQuery("dashboard.getExpenseTrend", {
      fromDate: "2024-01-01",
      toDate: "2024-12-31",
    });
    if (status === 200) {
      const trend = data?.result?.data;
      if (Array.isArray(trend)) {
        pass(`dashboard.getExpenseTrend returns ${trend.length} data points`);
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("dashboard.getExpenseTrend correctly requires authentication");
      } else {
        fail("dashboard.getExpenseTrend", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("dashboard.getExpenseTrend correctly requires authentication (401)");
    } else {
      fail("dashboard.getExpenseTrend", `Status ${status}`);
    }
  } catch (e) {
    fail("dashboard.getExpenseTrend", e.message);
  }
}

async function testHeadCountByCategory() {
  log("🔍", "Testing dashboard.getHeadCountByCategory...");
  try {
    const { status, data } = await trpcQuery("dashboard.getHeadCountByCategory", {});
    if (status === 200) {
      const breakdown = data?.result?.data;
      if (Array.isArray(breakdown)) {
        pass(`dashboard.getHeadCountByCategory returns ${breakdown.length} categories`);
        if (breakdown.length > 0) {
          const summary = breakdown.map((b) => `${b.category}: ${b.count}`).join(", ");
          log("  ℹ️", `Breakdown: ${summary}`);
        }
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("dashboard.getHeadCountByCategory correctly requires authentication");
      } else {
        fail("dashboard.getHeadCountByCategory", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("dashboard.getHeadCountByCategory correctly requires authentication (401)");
    } else {
      fail("dashboard.getHeadCountByCategory", `Status ${status}`);
    }
  } catch (e) {
    fail("dashboard.getHeadCountByCategory", e.message);
  }
}

async function testBreedingList() {
  log("🔍", "Testing breeding.listLambing...");
  try {
    const { status, data } = await trpcQuery("breeding.listLambing", {});
    if (status === 200) {
      const events = data?.result?.data;
      if (Array.isArray(events)) {
        pass(`breeding.listLambing returns ${events.length} lambing events`);
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("breeding.listLambing correctly requires authentication");
      } else {
        fail("breeding.listLambing", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("breeding.listLambing correctly requires authentication (401)");
    } else if (status === 401) {
      pass("breeding.listLambing correctly requires authentication (401)");
    } else {
      fail("breeding.listLambing", `Status ${status}`);
    }
  } catch (e) {
    fail("breeding.listLambing", e.message);
  }
}

async function testFeedConsumptionList() {
  log("🔍", "Testing feed.getStockLedger...");
  try {
    const { status, data } = await trpcQuery("feed.getStockLedger", {});
    if (status === 200) {
      const records = data?.result?.data;
      if (Array.isArray(records)) {
        pass(`feed.getStockLedger returns ${records.length} records`);
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("feed.getStockLedger correctly requires authentication");
      } else {
        fail("feed.getStockLedger", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("feed.getStockLedger correctly requires authentication (401)");
    } else if (status === 401) {
      pass("feed.getStockLedger correctly requires authentication (401)");
    } else {
      fail("feed.getStockLedger", `Status ${status}`);
    }
  } catch (e) {
    fail("feed.getStockLedger", e.message);
  }
}

async function testExpensesList() {
  log("🔍", "Testing expenses.list...");
  try {
    const { status, data } = await trpcQuery("expenses.list", {});
    if (status === 200) {
      const expenses = data?.result?.data;
      if (Array.isArray(expenses)) {
        pass(`expenses.list returns ${expenses.length} expenses`);
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("expenses.list correctly requires authentication");
      } else {
        fail("expenses.list", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("expenses.list correctly requires authentication (401)");
    } else {
      fail("expenses.list", `Status ${status}`);
    }
  } catch (e) {
    fail("expenses.list", e.message);
  }
}

async function testFatteningList() {
  log("🔍", "Testing animals.list (fattening tracker uses active animals + weight log)...");
  try {
    const { status, data } = await trpcQuery("animals.list", { isActive: true });
    if (status === 200) {
      const entries = data?.result?.data;
      if (Array.isArray(entries)) {
        pass(`animals.list (fattening) returns ${entries.length} active animals`);
      } else if (data?.error?.data?.code === "UNAUTHORIZED") {
        pass("animals.list (fattening) correctly requires authentication");
      } else {
        fail("animals.list (fattening)", `Unexpected: ${JSON.stringify(data).substring(0, 100)}`);
      }
    } else if (status === 401) {
      pass("animals.list (fattening) correctly requires authentication (401)");
    } else {
      fail("animals.list (fattening)", `Status ${status}`);
    }
  } catch (e) {
    fail("animals.list (fattening)", e.message);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("  LFMS Full API Flow Test");
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Auth: ${SESSION_COOKIE ? "Session cookie provided" : "No session (testing public + auth-required responses)"}`);
  console.log("=".repeat(60) + "\n");

  await testServerHealth();
  console.log();

  log("📋", "Auth Endpoints");
  await testAuthMe();
  console.log();

  log("📋", "Configuration Endpoints");
  await testConfigSpecies();
  await testConfigCategories();
  await testConfigGroups();
  await testConfigFeedItems();
  console.log();

  log("📋", "Animal Registry Endpoints");
  await testAnimalsList();
  console.log();

  log("📋", "Breeding & Fattening Endpoints");
  await testBreedingList();
  await testFatteningList();
  console.log();

  log("📋", "Feed Management Endpoints");
  await testFeedConsumptionList();
  console.log();

  log("📋", "Expense Endpoints");
  await testExpensesList();
  console.log();

  log("📋", "Dashboard & Analytics Endpoints");
  await testDashboardKPIs();
  await testFeedStockStatus();
  await testIncomeStatement();
  await testExpenseTrend();
  await testHeadCountByCategory();
  console.log();

  log("📋", "Sales & Finance Endpoints");
  await testSalesList();
  console.log();

  log("📋", "System Endpoints");
  await testNotificationsList();
  await testAuditLog();
  console.log();

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log("=".repeat(60));
  console.log("  TEST RESULTS SUMMARY");
  console.log("=".repeat(60));
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📊 Total:  ${passed + failed}`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.log("\n  Failed Tests:");
    results.filter((r) => r.status === "FAIL").forEach((r) => {
      console.log(`    ❌ ${r.name}: ${r.reason}`);
    });
  }

  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
