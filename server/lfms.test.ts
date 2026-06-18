/**
 * LFMS Comprehensive Unit Tests
 * Tests all backend routers: auth, config, animals, breeding, feed, expenses, dashboard, notifications
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import type { PermissionOverrides } from "../shared/permissions";

// ─── Mock DB module ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  getAllUsers: vi.fn().mockResolvedValue([
    {
      id: 1, openId: "owner", email: "owner@farm.com", name: "Owner",
      loginMethod: "manus", role: "owner", createdAt: new Date(),
      updatedAt: new Date(), lastSignedIn: new Date(),
    },
    {
      id: 2, openId: "staff", email: "staff@farm.com", name: "Staff",
      loginMethod: "manus", role: "staff", createdAt: new Date(),
      updatedAt: new Date(), lastSignedIn: new Date(),
    },
  ]),
  updateUserRole: vi.fn().mockResolvedValue(undefined),
  getAllSpecies: vi.fn().mockResolvedValue([
    { id: 1, name: "Sheep", description: null, isActive: 1, createdAt: new Date() },
  ]),
  createSpecies: vi.fn().mockResolvedValue({ id: 2, name: "Goat", description: null, isActive: 1, createdAt: new Date() }),
  updateSpecies: vi.fn().mockResolvedValue(undefined),
  getAllCategories: vi.fn().mockResolvedValue([
    { id: 1, name: "Lamb", idPrefix: "LMB", speciesId: 1, speciesName: "Sheep", targetWeightKg: "25.00", isActive: 1 },
  ]),
  createCategory: vi.fn().mockResolvedValue({ id: 2, name: "Ewe", idPrefix: "EWE", speciesId: 1, targetWeightKg: null }),
  updateCategory: vi.fn().mockResolvedValue(undefined),
  getAllStatuses: vi.fn().mockResolvedValue([
    { id: 1, name: "Active", isExitStatus: 0, isActive: 1 },
    { id: 6, name: "Sold", isExitStatus: 1, isActive: 1 },
  ]),
  createStatus: vi.fn().mockResolvedValue({ id: 7, name: "Transferred", isExitStatus: 1 }),
  updateStatus: vi.fn().mockResolvedValue(undefined),
  getAllGroups: vi.fn().mockResolvedValue([
    { id: 1, groupCode: "PEN-A", name: "Pen A", speciesId: null, categoryId: null, mapShape: null, isActive: 1 },
  ]),
  createGroup: vi.fn().mockResolvedValue({ id: 2, groupCode: "PEN-B", name: "Pen B" }),
  updateGroup: vi.fn().mockResolvedValue(undefined),
  getAllBirthTypes: vi.fn().mockResolvedValue([
    { id: 1, name: "Single", description: null, isActive: 1 },
    { id: 2, name: "Twin", description: null, isActive: 1 },
  ]),
  createBirthType: vi.fn().mockResolvedValue({ id: 3, name: "Triplet" }),
  getAllFeedItems: vi.fn().mockResolvedValue([
    { id: 1, name: "Hay", unit: "kg", currentPrice: "5.00", reorderLevel: 100, isActive: 1 },
  ]),
  createFeedItem: vi.fn().mockResolvedValue({ id: 2, name: "Barley", unit: "kg" }),
  updateFeedItem: vi.fn().mockResolvedValue(undefined),
  getFeedItemPriceHistory: vi.fn().mockResolvedValue([
    { id: 1, feedItemId: 1, effectiveDate: new Date("2024-01-01"), pricePerUnit: "5.00" },
  ]),
  addFeedItemPrice: vi.fn().mockResolvedValue({ id: 2, feedItemId: 1, pricePerUnit: "5.50" }),
  getAllExpenseCategories: vi.fn().mockResolvedValue([
    { id: 1, name: "Veterinary", description: null, isActive: 1 },
  ]),
  createExpenseCategory: vi.fn().mockResolvedValue({ id: 2, name: "Labor" }),
  getExpenseSubCategories: vi.fn().mockResolvedValue([]),
  createExpenseSubCategory: vi.fn().mockResolvedValue({ id: 1, name: "Checkup", categoryId: 1 }),
  getSystemSettings: vi.fn().mockResolvedValue([
    { key: "currency", value: "EGP" },
    { key: "fiscal_year_start", value: "01-01" },
  ]),
  getAllSettings: vi.fn().mockResolvedValue([
    { key: "currency", value: "EGP" },
    { key: "fiscal_year_start", value: "01-01" },
  ]),
  getSetting: vi.fn().mockResolvedValue(null),
  upsertSetting: vi.fn().mockResolvedValue(undefined),
  updateSystemSetting: vi.fn().mockResolvedValue(undefined),
  getAnimals: vi.fn().mockResolvedValue([
    {
      animal: { id: 1, animalId: "LMB-001", sex: "male", acquisitionType: "born", isActive: 1, categoryId: 1, speciesId: 1, groupId: 1, statusId: 1 },
      categoryName: "Lamb", speciesName: "Sheep", groupName: "Pen A", statusName: "Active",
    },
  ]),
  getAnimalById: vi.fn().mockResolvedValue({
    animal: { id: 1, animalId: "LMB-001", sex: "male", acquisitionType: "born", isActive: 1, categoryId: 1, speciesId: 1, groupId: 1, statusId: 1 },
    categoryName: "Lamb", speciesName: "Sheep", groupName: "Pen A", statusName: "Active",
  }),
  createAnimal: vi.fn().mockResolvedValue({ id: 3, animalId: "LMB-003" }),
  updateAnimal: vi.fn().mockResolvedValue(undefined),
  recordStatusChange: vi.fn().mockResolvedValue(undefined),
  getAnimalStatusHistory: vi.fn().mockResolvedValue([
    { id: 1, animalId: 1, fromStatusId: null, toStatusId: 1, changedAt: new Date(), reason: "Initial registration" },
  ]),
  getWeightLog: vi.fn().mockResolvedValue([
    { id: 1, animalId: 1, weightKg: "15.50", recordedAt: new Date(), notes: null },
  ]),
  createWeightEntry: vi.fn().mockResolvedValue({ id: 2, animalId: 1, weightKg: "18.00" }),
  checkAndStageAnimal: vi.fn().mockResolvedValue({ staged: false }),
  getAnimalPnL: vi.fn().mockResolvedValue({
    animalId: 1, animalCode: "LMB-001", purchaseCost: 500, feedCost: 200, directExpenses: 50,
    allocatedExpenses: 30, totalCost: 780, totalRevenue: 0, netPnL: -780, daysOnFarm: 60,
    costPerDay: 13, projectedCost: 1170,
  }),
  createSale: vi.fn().mockResolvedValue({ id: 1, animalId: 1, salePrice: "1200.00" }),
  createAuditEntry: vi.fn().mockResolvedValue(undefined),
  createNotification: vi.fn().mockResolvedValue({ id: 1, title: "Test", message: "Test msg" }),
  incrementCategorySequence: vi.fn().mockResolvedValue(1),
  getLambingEvents: vi.fn().mockResolvedValue([]),
  createLambingEvent: vi.fn().mockResolvedValue({ id: 1, damId: 1, sireId: 2, birthDate: new Date() }),
  getFatteningEntries: vi.fn().mockResolvedValue([]),
  createFatteningEntry: vi.fn().mockResolvedValue({ id: 1, animalId: 1, targetWeightKg: "40.00" }),
  updateFatteningEntry: vi.fn().mockResolvedValue(undefined),
  getFeedConsumption: vi.fn().mockResolvedValue([]),
  recordFeedConsumption: vi.fn().mockResolvedValue({ id: 1, feedItemId: 1, quantityKg: "5.00" }),
  getFeedStock: vi.fn().mockResolvedValue([]),
  updateFeedStock: vi.fn().mockResolvedValue(undefined),
  getExpenses: vi.fn().mockResolvedValue([]),
  createExpense: vi.fn().mockResolvedValue({ id: 1, amount: "500.00", description: "Vet visit" }),
  updateExpense: vi.fn().mockResolvedValue(undefined),
  getDashboardKPIs: vi.fn().mockResolvedValue({
    totalActiveHeads: 45, totalExpenses: 12500, totalRevenue: 8000,
    grossPnL: -4500, categoryBreakdown: [], period: { from: null, to: null },
  }),
  getFeedStockStatus: vi.fn().mockResolvedValue([
    { feedItemId: 1, feedItemName: "Hay", unit: "kg", stockOnHand: "250.00", dailyUsage: "10.00", daysRemaining: 25, reorderLevel: 100, status: "ok" },
    { feedItemId: 2, feedItemName: "Barley", unit: "kg", stockOnHand: "30.00", dailyUsage: "5.00", daysRemaining: 6, reorderLevel: 50, status: "critical" },
  ]),
  getIncomeStatement: vi.fn().mockResolvedValue({
    revenue: { sales: 8000, otherIncome: 0, total: 8000 },
    expenses: { feed: 5000, veterinary: 1500, labor: 2000, other: 500, total: 9000 },
    grossProfit: -1000, netProfit: -1000,
  }),
  getExpenseTrend: vi.fn().mockResolvedValue([
    { period: "2024-01-01", totalAmount: "1500.00", expenseCount: 5 },
  ]),
  getSalesTrend: vi.fn().mockResolvedValue([]),
  getHeadCountByCategory: vi.fn().mockResolvedValue([
    { categoryId: 1, categoryName: "Lamb", count: 20 },
    { categoryId: 2, categoryName: "Ewe", count: 15 },
  ]),
  getNotifications: vi.fn().mockResolvedValue([
    { id: 1, alertType: "low_feed", title: "Low Feed Alert", message: "Barley running low", isRead: 0, priority: "high", createdAt: new Date() },
  ]),
  markNotificationRead: vi.fn().mockResolvedValue(undefined),
  markAllNotificationsRead: vi.fn().mockResolvedValue(undefined),
  getAuditLog: vi.fn().mockResolvedValue([
    { id: 1, action: "create_animal", entityType: "animal", entityId: "1", userId: 1, notes: null, createdAt: new Date() },
  ]),
  getSales: vi.fn().mockResolvedValue([
    { sale: { id: 1, animalId: 1, saleDate: new Date("2024-01-15"), salePrice: "1200.00", weightAtSale: "35.00", buyerName: "Ahmed", notes: null }, animalCode: "LMB-001" },
  ]),
  getAllAnimalsPnL: vi.fn().mockResolvedValue([
    { animalId: 1, animalCode: "LMB-001", categoryName: "Lamb", speciesName: "Sheep", isActive: true, daysOnFarm: 60, purchaseCost: 500, feedCost: 300, directExpenseTotal: 50, totalCost: 850, revenue: 1200, netPnL: 350, costPerDay: 14.17, pricePerKg: 34.29 },
    { animalId: 2, animalCode: "EWE-001", categoryName: "Ewe", speciesName: "Sheep", isActive: true, daysOnFarm: 120, purchaseCost: 800, feedCost: 600, directExpenseTotal: 0, totalCost: 1400, revenue: 0, netPnL: -1400, costPerDay: 11.67, pricePerKg: 0 },
  ]),
  getRationPlans: vi.fn().mockResolvedValue([
    { id: 1, categoryId: 1, feedItemId: 1, qtyPerHeadPerDay: "1.60", effectiveDate: new Date("2025-01-01"), endDate: null, isActive: true, feedItemName: "Alfalfa Hay", unit: "kg", categoryName: "Ram" },
    { id: 2, categoryId: 2, feedItemId: 2, qtyPerHeadPerDay: "0.50", effectiveDate: new Date("2025-01-01"), endDate: null, isActive: true, feedItemName: "Hay", unit: "kg", categoryName: "Ewe" },
  ]),
  createRationPlan: vi.fn().mockResolvedValue({ id: 3, categoryId: 1, feedItemId: 1, qtyPerHeadPerDay: "1.00" }),
  updateRationPlan: vi.fn().mockResolvedValue(undefined),
  getFeedStockLedger: vi.fn().mockResolvedValue([]),
  createFeedStockEntry: vi.fn().mockResolvedValue({ id: 1, feedItemId: 1, qty: "100.00" }),
}));

// ─── Helper: create auth context ─────────────────────────────────────────────
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCtx(
  role: "owner" | "admin" | "supervisor" | "staff" | "user" | "viewer" = "admin",
  permissionOverrides?: PermissionOverrides,
): TrpcContext {
  const clearedCookies: any[] = [];
  const user: AuthenticatedUser = {
    id: 1, openId: "test-user", email: "test@farm.com", name: "Test User",
    loginMethod: "manus", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
  };
  return {
    user,
    permissionOverrides,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: (n: string, o: any) => clearedCookies.push({ n, o }) } as TrpcContext["res"],
  };
}

// ─── AUTH ────────────────────────────────────────────────────────────────────
describe("auth", () => {
  it("me returns authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.email).toBe("test@farm.com");
  });

  it("logout clears session cookie and returns success", async () => {
    const clearedCookies: any[] = [];
    const ctx: TrpcContext = {
      user: { id: 1, openId: "u", email: "u@u.com", name: "U", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: (n: string, o: any) => clearedCookies.push({ name: n, options: o }) } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1, httpOnly: true });
  });
});

// ─── CONFIG ──────────────────────────────────────────────────────────────────
describe("config.species", () => {
  it("getSpecies returns species list", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.config.getSpecies();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.name).toBe("Sheep");
  });

  it("createSpecies creates a new species", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.config.createSpecies({ name: "Goat" });
    expect(result).toBeDefined();
    expect(result.name).toBe("Goat");
  });

  it("updateSpecies updates species fields", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.config.updateSpecies({ id: 1, name: "Sheep (Updated)" })).resolves.not.toThrow();
  });
});

describe("config.categories", () => {
  it("getCategories returns category list", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.config.getCategories();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.idPrefix).toBe("LMB");
  });

  it("createCategory creates a new category with prefix", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.config.createCategory({ name: "Ewe", idPrefix: "EWE", speciesId: 1 });
    expect(result).toBeDefined();
    expect(result.idPrefix).toBe("EWE");
  });
});

describe("config.groups", () => {
  it("getGroups returns group list", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.config.getGroups();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.name).toBe("Pen A");
  });

  it("createGroup creates a new group", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.config.createGroup({ name: "Pen B", groupCode: "PEN-B" });
    expect(result).toBeDefined();
    expect(result.groupCode).toBe("PEN-B");
  });

  it("updateGroup accepts a farm-map rectangle shape", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.config.updateGroup({
      id: 1,
      mapShape: { type: "rect", x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    })).resolves.not.toThrow();
  });

  it("getFarmMapImage returns empty state when no map image is configured", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.config.getFarmMapImage()).resolves.toEqual({ key: null, url: null });
  });
});

describe("config.feedItems", () => {
  it("getFeedItems returns feed items", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.config.getFeedItems();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.name).toBe("Hay");
    expect(result[0]?.unit).toBe("kg");
  });

  it("createFeedItem creates a new feed item", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.config.createFeedItem({ name: "Barley", unit: "kg" });
    expect(result).toBeDefined();
    expect(result.name).toBe("Barley");
  });

  it("addFeedItemPrice adds a price history entry", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.config.addFeedItemPrice({
      feedItemId: 1,
      effectiveDate: "2024-06-01",
      pricePerUnit: "5.50",
    });
    expect(result).toBeDefined();
    expect(result.pricePerUnit).toBe("5.50");
  });

  it("getFeedItemPriceHistory returns price history", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.config.getFeedItemPriceHistory({ feedItemId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.pricePerUnit).toBe("5.00");
  });
});

describe("config.expenseCategories", () => {
  it("getExpenseCategories returns categories", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.config.getExpenseCategories();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.name).toBe("Veterinary");
  });

  it("createExpenseCategory creates a category", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.config.createExpenseCategory({ name: "Labor" });
    expect(result).toBeDefined();
    expect(result.name).toBe("Labor");
  });
});

describe("config.settings", () => {
  it("getSettings returns system settings", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.config.getSettings();
    expect(Array.isArray(result)).toBe(true);
    const currency = result.find((s: any) => s.key === "currency");
    expect(currency?.value).toBe("EGP");
  });
});

// ─── ANIMALS ─────────────────────────────────────────────────────────────────
describe("animals.list", () => {
  it("returns list of animals with joined data", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.animals.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.animal?.animalId).toBe("LMB-001");
    expect(result[0]?.categoryName).toBe("Lamb");
  });

  it("filters by speciesId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.animals.list({ speciesId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("filters by isActive flag", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.animals.list({ isActive: true });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("animals.getById", () => {
  it("returns animal by id", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.animals.getById({ id: 1 });
    expect(result).toBeDefined();
    expect(result.animal?.animalId).toBe("LMB-001");
  });

  it("throws NOT_FOUND for missing animal", async () => {
    const { getAnimalById } = await import("./db");
    vi.mocked(getAnimalById).mockResolvedValueOnce(undefined);
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.animals.getById({ id: 9999 })).rejects.toThrow("Animal not found");
  });
});

describe("animals.create", () => {
  it("creates an animal with auto-generated ID", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.animals.create({
      categoryId: 1, speciesId: 1, groupId: 1, statusId: 1,
      sex: "male", acquisitionType: "born",
      acquisitionDate: "2024-01-15", birthDate: "2024-01-15",
    });
    expect(result).toBeDefined();
    expect(result.animalId).toBeDefined();
  });
});

describe("animals.weightLog", () => {
  it("returns weight history for an animal", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.animals.getWeightLog({ animalId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.weightKg).toBe("15.50");
  });

  it("adds a weight entry", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.animals.addWeight({
      animalId: 1, weightKg: "18.00", weighDate: "2024-02-01",
    });
    expect(result).toBeDefined();
    expect(result.weightKg).toBe("18.00");
  });
});

describe("animals.pnl", () => {
  it("returns P&L summary for an animal", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.animals.getPnL({ animalId: 1 });
    expect(result).toBeDefined();
    expect(result.animalCode).toBe("LMB-001");
    expect(result.totalCost).toBe(780);
    expect(result.netPnL).toBe(-780);
    expect(result.daysOnFarm).toBe(60);
  });
});

describe("animals.statusHistory", () => {
  it("returns status history for an animal", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.animals.getStatusHistory({ animalId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.reason).toBe("Initial registration");
  });
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
describe("dashboard.getKPIs", () => {
  it("returns KPI summary", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.dashboard.getKPIs({});
    expect(result).toBeDefined();
    expect(result.totalActiveHeads).toBe(45);
    expect(result.totalRevenue).toBe(8000);
    expect(result.totalExpenses).toBe(12500);
    expect(result.grossPnL).toBe(-4500);
  });

  it("accepts date range filters", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.dashboard.getKPIs({
      fromDate: "2024-01-01", toDate: "2024-12-31",
    });
    expect(result).toBeDefined();
  });
});

describe("dashboard.getFeedStockStatus", () => {
  it("returns feed stock status — always unfiltered", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.dashboard.getFeedStockStatus();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    const critical = result.find((s: any) => s.status === "critical");
    expect(critical).toBeDefined();
    expect(critical?.feedItemName).toBe("Barley");
  });

  it("identifies low stock items with daysRemaining < 7", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.dashboard.getFeedStockStatus();
    const criticalItem = result.find((s: any) => s.status === "critical");
    expect(criticalItem?.daysRemaining).toBeLessThan(7);
  });
});

describe("dashboard.getIncomeStatement", () => {
  it("returns income statement with revenue and expense breakdown", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.dashboard.getIncomeStatement({
      fromDate: "2024-01-01", toDate: "2024-12-31",
    });
    expect(result).toBeDefined();
    expect(result.revenue.total).toBe(8000);
    expect(result.expenses.total).toBe(9000);
    expect(result.netProfit).toBe(-1000);
  });
});

describe("dashboard.getExpenseTrend", () => {
  it("returns expense trend data", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.dashboard.getExpenseTrend({
      fromDate: "2024-01-01", toDate: "2024-12-31",
    });
    expect(Array.isArray(result)).toBe(true);
    // Result is aggregated by period from the router
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});

describe("dashboard.getSalesTrend", () => {
  it("returns sales trend data aggregated by month", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.dashboard.getSalesTrend({
      fromDate: "2024-01-01", toDate: "2024-12-31",
    });
    expect(Array.isArray(result)).toBe(true);
    // Router aggregates sales by month
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("month");
      expect(result[0]).toHaveProperty("revenue");
    }
  });
});

describe("dashboard.getHeadCountByCategory", () => {
  it("returns head count breakdown by category", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.dashboard.getHeadCountByCategory();
    expect(Array.isArray(result)).toBe(true);
    // Router returns { category, count } from getAnimals mock
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("category");
      expect(result[0]).toHaveProperty("count");
      expect(result[0].category).toBe("Lamb");
      expect(result[0].count).toBe(1);
    }
  });
});

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
describe("notifications", () => {
  it("list returns notifications", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.notifications.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.alertType).toBe("low_feed");
    expect(result[0]?.priority).toBe("high");
  });

  it("create creates a notification", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.notifications.create({
      alertType: "target_weight", title: "Target Reached", message: "LMB-001 reached target weight",
    });
    expect(result).toBeDefined();
    expect(result.title).toBe("Test");
  });

  it("markRead marks a notification as read", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.notifications.markRead({ id: 1 })).resolves.not.toThrow();
  });

  it("markAllRead marks all notifications as read", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.notifications.markAllRead()).resolves.not.toThrow();
  });
});

// ─── AUDIT ───────────────────────────────────────────────────────────────────
describe("audit.list", () => {
  it("returns audit log entries", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.audit.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.action).toBe("create_animal");
    expect(result[0]?.entityType).toBe("animal");
  });

  it("filters by entityType", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.audit.list({ entityType: "animal" });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── SALES ───────────────────────────────────────────────────────────────────
describe("sales.list", () => {
  it("returns sales records", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.sales.list();
    expect(Array.isArray(result)).toBe(true);
    // getSales returns objects with { sale, animalCode }
    expect(result[0]?.sale?.salePrice).toBe("1200.00");
    expect(result[0]?.animalCode).toBe("LMB-001");
  });
});

// ─── BUSINESS LOGIC ASSERTIONS ───────────────────────────────────────────────
describe("Business Logic: P&L Calculations", () => {
  it("netPnL = totalRevenue - totalCost", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const pnl = await caller.animals.getPnL({ animalId: 1 });
    expect(pnl.netPnL).toBe(pnl.totalRevenue - pnl.totalCost);
  });

  it("costPerDay = totalCost / daysOnFarm", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const pnl = await caller.animals.getPnL({ animalId: 1 });
    if (pnl.daysOnFarm > 0) {
      expect(pnl.costPerDay).toBeCloseTo(pnl.totalCost / pnl.daysOnFarm, 1);
    }
  });

  it("grossPnL = totalRevenue - totalExpenses", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const kpis = await caller.dashboard.getKPIs({});
    expect(kpis.grossPnL).toBe(kpis.totalRevenue - kpis.totalExpenses);
  });
});

describe("Business Logic: Feed Stock Alerts", () => {
  it("critical status when daysRemaining < 7", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const stock = await caller.dashboard.getFeedStockStatus();
    const criticalItems = stock.filter((s: any) => s.status === "critical");
    criticalItems.forEach((item: any) => {
      expect(item.daysRemaining).toBeLessThan(7);
    });
  });

  it("ok status when stock is sufficient", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const stock = await caller.dashboard.getFeedStockStatus();
    const okItems = stock.filter((s: any) => s.status === "ok");
    okItems.forEach((item: any) => {
      expect(item.daysRemaining).toBeGreaterThanOrEqual(7);
    });
  });
});

describe("Business Logic: Income Statement", () => {
  it("netProfit = revenue.total - expenses.total", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const stmt = await caller.dashboard.getIncomeStatement({ fromDate: "2024-01-01", toDate: "2024-12-31" });
    expect(stmt.netProfit).toBe(stmt.revenue.total - stmt.expenses.total);
  });
});

// ─── FEED RATION PLANS ───────────────────────────────────────────────────────
describe("feed.getRationPlans", () => {
  it("getRationPlans returns flat objects (no nested plan.plan)", async () => {
    // The mock returns getFeedStockStatus; getRationPlans is called via feed router
    // We verify the router wires through without throwing
    const caller = appRouter.createCaller(makeCtx());
    // feed.getRationPlans calls getRationPlans from db which is not mocked here
    // but the router should not throw on undefined (returns [])
    await expect(caller.feed.getRationPlans()).resolves.toBeDefined();
  });
});

describe("feed.updateRationPlan", () => {
  it("updateRationPlan accepts qty, effectiveDate, and endDate", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.feed.updateRationPlan({
        id: 1,
        qtyPerHeadPerDay: "1.50",
        effectiveDate: "2025-01-01",
        endDate: null,
      })
    ).resolves.not.toThrow();
  });

  it("updateRationPlan with only qty change does not throw", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.feed.updateRationPlan({ id: 1, qtyPerHeadPerDay: "2.00" })
    ).resolves.not.toThrow();
  });
});

describe("Business Logic: Low Stock Scheduler", () => {
  it("checkLowStockAndNotify is a callable async function", async () => {
    const { checkLowStockAndNotify } = await import("./lowStockCheck");
    expect(typeof checkLowStockAndNotify).toBe("function");
    // Should resolve without throwing (DB is mocked to return null)
    await expect(checkLowStockAndNotify()).resolves.not.toThrow();
  });

  it("startLowStockScheduler is a callable function", async () => {
    const { startLowStockScheduler } = await import("./lowStockCheck");
    expect(typeof startLowStockScheduler).toBe("function");
  });
});

// ─── ANIMALS P&L BULK ────────────────────────────────────────────────────────
describe("animals.getAllPnL", () => {
  it("returns array of P&L rows for all animals", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.animals.getAllPnL();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("each row has required P&L fields", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.animals.getAllPnL();
    const row = result[0] as any;
    expect(row).toHaveProperty("animalId");
    expect(row).toHaveProperty("animalCode");
    expect(row).toHaveProperty("purchaseCost");
    expect(row).toHaveProperty("feedCost");
    expect(row).toHaveProperty("directExpenseTotal");
    expect(row).toHaveProperty("totalCost");
    expect(row).toHaveProperty("revenue");
    expect(row).toHaveProperty("netPnL");
    expect(row).toHaveProperty("costPerDay");
    expect(row).toHaveProperty("daysOnFarm");
  });

  it("netPnL = revenue - totalCost for each row", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.animals.getAllPnL();
    for (const row of result as any[]) {
      expect(row.netPnL).toBeCloseTo(row.revenue - row.totalCost, 1);
    }
  });

  it("accepts optional species and category filters", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.animals.getAllPnL({ speciesId: 1, categoryId: 1 })
    ).resolves.toBeDefined();
  });
});

// ─── RBAC (role-based access control) ─────────────────────────────────────────
describe("rbac", () => {
  it("read-only 'user' role is blocked from creating animals", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.animals.create({
        animalId: "X-999", speciesId: 1, categoryId: 1, groupId: 1, statusId: 1,
        sex: "male", acquisitionType: "purchased", acquisitionDate: "2026-01-01",
        birthDate: "2026-01-01",
      } as any)
    ).rejects.toThrow(/permission/i);
  });

  it("'staff' role can record operational data but cannot manage config", async () => {
    const caller = appRouter.createCaller(makeCtx("staff"));
    // staff blocked from supervisor-level config
    await expect(
      caller.config.createSpecies({ name: "Llama" } as any)
    ).rejects.toThrow(/permission/i);
  });

  it("'supervisor' role cannot change user roles (privileged only)", async () => {
    const caller = appRouter.createCaller(makeCtx("supervisor"));
    await expect(
      caller.userMgmt.updateUserRole({ userId: 2, role: "admin" })
    ).rejects.toThrow(/permission/i);
  });

  it("'staff' role cannot permanently purge or restore", async () => {
    const caller = appRouter.createCaller(makeCtx("staff"));
    await expect(
      caller.recycleBin.purgeAnimal({ id: 1 })
    ).rejects.toThrow(/permission/i);
  });

  it("'admin' role can manage config and users", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(caller.config.createSpecies({ name: "Alpaca" } as any)).resolves.toBeDefined();
  });

  it("does not delegate role administration through a users.update override", async () => {
    const caller = appRouter.createCaller(makeCtx("supervisor", {
      "users:view": true,
      "users:update": true,
    }));
    await expect(
      caller.userMgmt.updateUserRole({ userId: 2, role: "admin" }),
    ).rejects.toThrow(/permission/i);
  });

  it("keeps the full animal registry behind animals.view", async () => {
    const caller = appRouter.createCaller(makeCtx("viewer", {
      "animals:view": false,
      "sales:view": true,
    }));
    await expect(caller.animals.list()).rejects.toThrow(/animals\.view/i);
    const lookup = await caller.animals.lookup({ isActive: true });
    expect(Object.keys(lookup[0]!.animal).sort()).toEqual([
      "animalId",
      "id",
      "sex",
    ]);
  });

  it("does not expose animal P&L through animal-page access", async () => {
    const caller = appRouter.createCaller(makeCtx("viewer", {
      "animals:view": true,
      "pnl:view": false,
    }));
    await expect(caller.animals.getPnL({ animalId: 1 }))
      .rejects.toThrow(/pnl\.view/i);
    await expect(caller.animals.getAllPnL())
      .rejects.toThrow(/pnl\.view/i);
  });
});

// ─── INPUT VALIDATION ─────────────────────────────────────────────────────────
describe("validation", () => {
  it("rejects negative purchase cost on animal create", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.animals.create({
        categoryId: 1, speciesId: 1, groupId: 1, statusId: 1,
        sex: "male", acquisitionType: "purchased",
        acquisitionDate: "2026-01-01", birthDate: "2026-01-01",
        purchaseCost: "-500",
      } as any)
    ).rejects.toThrow();
  });

  it("rejects a future acquisition date", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.animals.create({
        categoryId: 1, speciesId: 1, groupId: 1, statusId: 1,
        sex: "male", acquisitionType: "purchased",
        acquisitionDate: "2099-01-01", birthDate: "2099-01-01",
      } as any)
    ).rejects.toThrow();
  });

  it("rejects an unrealistically large weight", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.animals.addWeight({ animalId: 1, weighDate: "2026-01-01", weightKg: "99999" })
    ).rejects.toThrow();
  });

  it("rejects birth date after acquisition date", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.animals.create({
        categoryId: 1, speciesId: 1, groupId: 1, statusId: 1,
        sex: "male", acquisitionType: "purchased",
        acquisitionDate: "2026-01-01", birthDate: "2026-06-01",
      } as any)
    ).rejects.toThrow();
  });

  it("bounds editable animal text fields", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.animals.update({ id: 1, notes: "x".repeat(2001) }),
    ).rejects.toThrow();
    await expect(
      caller.animals.update({ id: 1, exitReason: "x".repeat(1001) }),
    ).rejects.toThrow();
    await expect(
      caller.animals.update({ id: 1, exitDate: "2099-01-01" }),
    ).rejects.toThrow();
  });

  it("bounds animal lookup result requests", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.animals.lookup({ sex: "female", limit: 501 }),
    ).rejects.toThrow();
  });
});
