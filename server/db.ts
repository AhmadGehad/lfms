import { and, desc, eq, isNotNull, isNull, or, sql, lte, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  animalCategories,
  animalStatusHistory,
  animalStatuses,
  animals,
  auditLog,
  birthTypes,
  expenseCategories,
  expenseSubCategories,
  expenses,
  feedItemPriceHistory,
  feedItems,
  feedStockLedger,
  groups,
  InsertUser,
  lambingLog,
  notifications,
  rationPlans,
  sales,
  species,
  systemSettings,
  users,
  weightLog,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── USER HELPERS ─────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function updateUserRole(userId: number, role: "owner" | "supervisor" | "staff" | "admin" | "user") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

// ─── SPECIES ──────────────────────────────────────────────────────────────────

export async function getAllSpecies() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(species).where(isNull(species.deletedAt)).orderBy(species.name);
}

export async function createSpecies(data: { name: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(species).values(data);
  return result;
}

export async function updateSpecies(id: number, data: Partial<{ name: string; description: string; isActive: boolean }>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(species).set(data).where(eq(species.id, id));
}

// ─── ANIMAL CATEGORIES ────────────────────────────────────────────────────────

export async function getAllCategories(speciesId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (speciesId) {
    return db.select().from(animalCategories).where(and(eq(animalCategories.speciesId, speciesId), isNull(animalCategories.deletedAt))).orderBy(animalCategories.name);
  }
  return db.select().from(animalCategories).where(isNull(animalCategories.deletedAt)).orderBy(animalCategories.name);
}

export async function createCategory(data: {
  name: string;
  speciesId: number;
  idPrefix: string;
  targetWeightKg?: string;
  expectedCycleDays?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(animalCategories).values(data);
  return result;
}

export async function updateCategory(id: number, data: Partial<typeof animalCategories.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(animalCategories).set(data).where(eq(animalCategories.id, id));
}

export async function incrementCategorySequence(categoryId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(animalCategories)
    .set({ idSequence: sql`${animalCategories.idSequence} + 1` })
    .where(eq(animalCategories.id, categoryId));
  const [cat] = await db.select({ idSequence: animalCategories.idSequence, idPrefix: animalCategories.idPrefix }).from(animalCategories).where(eq(animalCategories.id, categoryId));
  return cat?.idSequence ?? 1;
}

// ─── ANIMAL STATUSES ──────────────────────────────────────────────────────────

export async function getAllStatuses() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(animalStatuses).where(isNull(animalStatuses.deletedAt)).orderBy(animalStatuses.name);
}

export async function createStatus(data: { name: string; description?: string; isExitStatus?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(animalStatuses).values(data);
  return result;
}

export async function updateStatus(id: number, data: Partial<typeof animalStatuses.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(animalStatuses).set(data).where(eq(animalStatuses.id, id));
}

// ─── GROUPS ───────────────────────────────────────────────────────────────────

export async function getAllGroups(speciesId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (speciesId) {
    return db.select().from(groups).where(and(or(eq(groups.speciesId, speciesId), isNull(groups.speciesId)), isNull(groups.deletedAt)));
  }
  return db.select().from(groups).where(isNull(groups.deletedAt)).orderBy(groups.groupCode);
}

export async function createGroup(data: { groupCode: string; name: string; speciesId?: number; categoryId?: number; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(groups).values(data);
  return result;
}

export async function updateGroup(id: number, data: Partial<typeof groups.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(groups).set(data).where(eq(groups.id, id));
}

// ─── BIRTH TYPES ──────────────────────────────────────────────────────────────

export async function getAllBirthTypes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(birthTypes).where(isNull(birthTypes.deletedAt)).orderBy(birthTypes.name);
}

export async function createBirthType(data: { name: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(birthTypes).values(data);
  return result;
}
export async function updateBirthType(id: number, data: Partial<{ name: string; description: string; isActive: boolean }>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(birthTypes).set(data).where(eq(birthTypes.id, id));
}
// ─── FEED ITEMS ───────────────────────────────────────────────────────────────

export async function getAllFeedItems() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(feedItems).where(isNull(feedItems.deletedAt)).orderBy(feedItems.name);
}

export async function createFeedItem(data: { name: string; unit?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(feedItems).values(data);
  return result;
}

export async function updateFeedItem(id: number, data: Partial<typeof feedItems.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(feedItems).set(data).where(eq(feedItems.id, id));
}

export async function getFeedItemPriceHistory(feedItemId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(feedItemPriceHistory)
    .where(eq(feedItemPriceHistory.feedItemId, feedItemId))
    .orderBy(desc(feedItemPriceHistory.effectiveDate));
}

export async function addFeedItemPrice(data: { feedItemId: number; effectiveDate: string; pricePerUnit: string; notes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(feedItemPriceHistory).values({
    feedItemId: data.feedItemId,
    effectiveDate: sql`${data.effectiveDate}`,
    pricePerUnit: data.pricePerUnit,
    notes: data.notes,
  } as any);
  return result;
}

export async function getFeedPriceOnDate(feedItemId: number, dateStr: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ pricePerUnit: feedItemPriceHistory.pricePerUnit })
    .from(feedItemPriceHistory)
    .where(and(eq(feedItemPriceHistory.feedItemId, feedItemId), sql`${feedItemPriceHistory.effectiveDate} <= ${dateStr}`))
    .orderBy(desc(feedItemPriceHistory.effectiveDate))
    .limit(1);
  return rows.length > 0 ? parseFloat(rows[0].pricePerUnit) : 0;
}

// ─── EXPENSE CATEGORIES ───────────────────────────────────────────────────────

export async function getAllExpenseCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(expenseCategories).where(isNull(expenseCategories.deletedAt)).orderBy(expenseCategories.name);
}

export async function createExpenseCategory(data: { name: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(expenseCategories).values(data);
  return result;
}
export async function updateExpenseCategory(id: number, data: Partial<{ name: string; description: string; isActive: boolean }>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(expenseCategories).set(data).where(eq(expenseCategories.id, id));
}
export async function getAllExpenseSubCategories(categoryId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (categoryId) {
    return db.select().from(expenseSubCategories).where(eq(expenseSubCategories.categoryId, categoryId));
  }
  return db.select().from(expenseSubCategories).orderBy(expenseSubCategories.name);
}

export async function createExpenseSubCategory(data: { categoryId: number; name: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(expenseSubCategories).values(data);
  return result;
}
export async function updateExpenseSubCategory(id: number, data: Partial<{ name: string; description: string; isActive: boolean }>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(expenseSubCategories).set(data).where(eq(expenseSubCategories.id, id));
}
// ─── SYSTEM SETTINGS ──────────────────────────────────────────────────────────

export async function getAllSettings() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(systemSettings);
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(systemSettings).where(eq(systemSettings.settingKey, key)).limit(1);
  return rows.length > 0 ? rows[0].settingValue : null;
}

export async function upsertSetting(key: string, value: string, updatedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .insert(systemSettings)
    .values({ settingKey: key, settingValue: value, updatedBy })
    .onDuplicateKeyUpdate({ set: { settingValue: value, updatedBy } });
}

// ─── ANIMALS ──────────────────────────────────────────────────────────────────

export async function getAnimals(filters?: {
  speciesId?: number;
  categoryId?: number;
  groupId?: number;
  statusId?: number;
  isActive?: boolean;
  search?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [];
  conditions.push(isNull(animals.deletedAt));
  if (filters?.speciesId) conditions.push(eq(animals.speciesId, filters.speciesId));
  if (filters?.categoryId) conditions.push(eq(animals.categoryId, filters.categoryId));
  if (filters?.groupId) conditions.push(eq(animals.groupId, filters.groupId));
  if (filters?.statusId) conditions.push(eq(animals.statusId, filters.statusId));
  if (filters?.isActive !== undefined) conditions.push(eq(animals.isActive, filters.isActive));

  const query = db
    .select({
      animal: animals,
      speciesName: species.name,
      categoryName: animalCategories.name,
      categoryPrefix: animalCategories.idPrefix,
      groupCode: groups.groupCode,
      groupName: groups.name,
      statusName: animalStatuses.name,
      isExitStatus: animalStatuses.isExitStatus,
    })
    .from(animals)
    .leftJoin(species, eq(animals.speciesId, species.id))
    .leftJoin(animalCategories, eq(animals.categoryId, animalCategories.id))
    .leftJoin(groups, eq(animals.groupId, groups.id))
    .leftJoin(animalStatuses, eq(animals.statusId, animalStatuses.id));

  if (conditions.length > 0) {
    return query.where(and(...conditions)).orderBy(desc(animals.createdAt));
  }
  return query.orderBy(desc(animals.createdAt));
}

export async function getAnimalById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      animal: animals,
      speciesName: species.name,
      categoryName: animalCategories.name,
      categoryPrefix: animalCategories.idPrefix,
      targetWeightKg: animalCategories.targetWeightKg,
      groupCode: groups.groupCode,
      groupName: groups.name,
      statusName: animalStatuses.name,
      isExitStatus: animalStatuses.isExitStatus,
    })
    .from(animals)
    .leftJoin(species, eq(animals.speciesId, species.id))
    .leftJoin(animalCategories, eq(animals.categoryId, animalCategories.id))
    .leftJoin(groups, eq(animals.groupId, groups.id))
    .leftJoin(animalStatuses, eq(animals.statusId, animalStatuses.id))
    .where(eq(animals.id, id))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function createAnimal(data: typeof animals.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(animals).values(data);
  return result;
}

export async function updateAnimal(id: number, data: Partial<typeof animals.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(animals).set(data).where(eq(animals.id, id));
}

export async function getActiveHeadCountByCategory(dateStr?: string): Promise<Record<number, number>> {
  const db = await getDb();
  if (!db) return {};
  const conditions = [eq(animals.isActive, true)];
  if (dateStr) {
    const exitCond = or(isNull(animals.exitDate), sql`${animals.exitDate} >= ${dateStr}`);
    if (exitCond) conditions.push(exitCond as any);
    conditions.push(sql`${animals.acquisitionDate} <= ${dateStr}` as any);
  }
  const rows = await db
    .select({ categoryId: animals.categoryId, count: sql<number>`COUNT(*)` })
    .from(animals)
    .where(and(...conditions))
    .groupBy(animals.categoryId);
  const result: Record<number, number> = {};
  rows.forEach((r) => { result[r.categoryId] = Number(r.count); });
  return result;
}

// ─── ANIMAL STATUS HISTORY ────────────────────────────────────────────────────

export async function getAnimalStatusHistory(animalId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: animalStatusHistory.id,
      animalId: animalStatusHistory.animalId,
      previousStatusId: animalStatusHistory.previousStatusId,
      newStatusId: animalStatusHistory.newStatusId,
      changedAt: animalStatusHistory.changedAt,
      changedBy: animalStatusHistory.changedBy,
      notes: animalStatusHistory.notes,
    })
    .from(animalStatusHistory)
    .where(eq(animalStatusHistory.animalId, animalId))
    .orderBy(desc(animalStatusHistory.changedAt));
}

export async function recordStatusChange(data: { animalId: number; previousStatusId?: number; newStatusId: number; changedBy?: number; notes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(animalStatusHistory).values(data);
}

// ─── SALES ────────────────────────────────────────────────────────────────────

export async function getSales(filters?: { animalId?: number; fromDate?: string; toDate?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.animalId) conditions.push(eq(sales.animalId, filters.animalId));
  if (filters?.fromDate) conditions.push(sql`${sales.saleDate} >= ${filters.fromDate}`);
  if (filters?.toDate) conditions.push(sql`${sales.saleDate} <= ${filters.toDate}`);
  const query = db
    .select({
      sale: sales,
      animalCode: animals.animalId,
      speciesName: species.name,
      categoryName: animalCategories.name,
    })
    .from(sales)
    .leftJoin(animals, eq(sales.animalId, animals.id))
    .leftJoin(species, eq(animals.speciesId, species.id))
    .leftJoin(animalCategories, eq(animals.categoryId, animalCategories.id));
  conditions.push(isNull(sales.deletedAt));
  return query.where(and(...conditions)).orderBy(desc(sales.saleDate));
}

export async function createSale(data: typeof sales.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(sales).values(data);
  return result;
}
export async function updateSale(id: number, data: Partial<{ salePrice: string; weightAtSale: string; saleDate: string; buyerName: string; notes: string }>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(sales).set(data as any).where(eq(sales.id, id));
}
// ─── LAMBING LOG ──────────────────────────────────────────────────────────────

export async function getLambingLog(filters?: { isPromoted?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const query = db
    .select({
      id: lambingLog.id,
      lambId: lambingLog.lambId,
      birthDate: lambingLog.birthDate,
      damId: lambingLog.damId,
      sireId: lambingLog.sireId,
      sex: lambingLog.sex,
      birthTypeId: lambingLog.birthTypeId,
      birthWeightKg: lambingLog.birthWeightKg,
      groupId: lambingLog.groupId,
      notes: lambingLog.notes,
      isPromoted: lambingLog.isPromoted,
      promotedHeadId: lambingLog.promotedHeadId,
      createdAt: lambingLog.createdAt,
      birthTypeName: birthTypes.name,
      groupCode: groups.groupCode,
    })
    .from(lambingLog)
    .leftJoin(birthTypes, eq(lambingLog.birthTypeId, birthTypes.id))
    .leftJoin(groups, eq(lambingLog.groupId, groups.id));
  const lambingConditions = [isNull(lambingLog.deletedAt)];
  if (filters?.isPromoted !== undefined) lambingConditions.push(eq(lambingLog.isPromoted, filters.isPromoted) as any);
  return query.where(and(...lambingConditions)).orderBy(desc(lambingLog.birthDate)) as Promise<any[]>;
}

export async function createLambingRecord(data: typeof lambingLog.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(lambingLog).values(data);
  return result;
}

export async function updateLambingRecord(id: number, data: Partial<typeof lambingLog.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(lambingLog).set(data).where(eq(lambingLog.id, id));
}

// ─── WEIGHT LOG ───────────────────────────────────────────────────────────────

export async function getWeightLog(animalId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(weightLog).where(and(eq(weightLog.animalId, animalId), isNull(weightLog.deletedAt))).orderBy(weightLog.weighDate);
}

export async function createWeightEntry(data: typeof weightLog.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(weightLog).values(data);
  return result;
}

export async function getLatestWeightForAnimals(animalIds: number[]) {
  const db = await getDb();
  if (!db) return [];
  if (animalIds.length === 0) return [];
  return db
    .select({
      animalId: weightLog.animalId,
      weightKg: weightLog.weightKg,
      weighDate: weightLog.weighDate,
    })
    .from(weightLog)
    .where(sql`${weightLog.animalId} IN (${sql.join(animalIds.map((id) => sql`${id}`), sql`, `)})`)
    .orderBy(desc(weightLog.weighDate));
}

// ─── RATION PLANS ─────────────────────────────────────────────────────────────

export async function getRationPlans(categoryId?: number) {
  const db = await getDb();
  if (!db) return [];
  const query = db
    .select({
      id: rationPlans.id,
      categoryId: rationPlans.categoryId,
      feedItemId: rationPlans.feedItemId,
      qtyPerHeadPerDay: rationPlans.qtyPerHeadPerDay,
      effectiveDate: rationPlans.effectiveDate,
      endDate: rationPlans.endDate,
      isActive: rationPlans.isActive,
      createdAt: rationPlans.createdAt,
      feedItemName: feedItems.name,
      unit: feedItems.unit,
      categoryName: animalCategories.name,
    })
    .from(rationPlans)
    .leftJoin(feedItems, eq(rationPlans.feedItemId, feedItems.id))
    .leftJoin(animalCategories, eq(rationPlans.categoryId, animalCategories.id));
  if (categoryId) return query.where(and(eq(rationPlans.categoryId, categoryId), eq(rationPlans.isActive, true), isNull(rationPlans.deletedAt)));
  return query.where(and(eq(rationPlans.isActive, true), isNull(rationPlans.deletedAt)));
}

export async function createRationPlan(data: typeof rationPlans.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(rationPlans).values(data);
  return result;
}

export async function updateRationPlan(id: number, data: Partial<typeof rationPlans.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(rationPlans).set(data).where(eq(rationPlans.id, id));
}

export async function getActivePlanOnDate(categoryId: number, dateStr: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(rationPlans)
    .where(
      and(
        eq(rationPlans.categoryId, categoryId),
        eq(rationPlans.isActive, true),
        sql`${rationPlans.effectiveDate} <= ${dateStr}`,
        or(isNull(rationPlans.endDate), sql`${rationPlans.endDate} >= ${dateStr}`)
      )
    );
}

// ─── FEED STOCK ───────────────────────────────────────────────────────────────

export async function getFeedStockLedger(feedItemId?: number) {
  const db = await getDb();
  if (!db) return [];
  const query = db
    .select({
      id: feedStockLedger.id,
      feedItemId: feedStockLedger.feedItemId,
      transactionDate: feedStockLedger.transactionDate,
      transactionType: feedStockLedger.transactionType,
      qty: feedStockLedger.qty,
      unitCost: feedStockLedger.unitCost,
      totalCost: feedStockLedger.totalCost,
      supplierName: feedStockLedger.supplierName,
      notes: feedStockLedger.notes,
      feedItemName: feedItems.name,
      feedItemUnit: feedItems.unit,
    })
    .from(feedStockLedger)
    .leftJoin(feedItems, eq(feedStockLedger.feedItemId, feedItems.id));
  if (feedItemId) return query.where(and(eq(feedStockLedger.feedItemId, feedItemId), isNull(feedStockLedger.deletedAt))).orderBy(desc(feedStockLedger.transactionDate));
  return query.where(isNull(feedStockLedger.deletedAt)).orderBy(desc(feedStockLedger.transactionDate));
}

export async function createFeedStockEntry(data: typeof feedStockLedger.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(feedStockLedger).values(data);
  return result;
}

// ─── EXPENSES ─────────────────────────────────────────────────────────────────

export async function getExpenses(filters?: {
  fromDate?: string;
  toDate?: string;
  categoryId?: number;
  targetType?: "general" | "category" | "head";
  headId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.fromDate) conditions.push(sql`${expenses.expenseDate} >= ${filters.fromDate}`);
  if (filters?.toDate) conditions.push(sql`${expenses.expenseDate} <= ${filters.toDate}`);
  if (filters?.categoryId) conditions.push(eq(expenses.categoryId, filters.categoryId));
  if (filters?.targetType) conditions.push(eq(expenses.targetType, filters.targetType));
  if (filters?.headId) conditions.push(eq(expenses.headId, filters.headId));
  const query = db
    .select({
      expense: expenses,
      categoryName: expenseCategories.name,
      subCategoryName: expenseSubCategories.name,
      animalCode: animals.animalId,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .leftJoin(expenseSubCategories, eq(expenses.subCategoryId, expenseSubCategories.id))
    .leftJoin(animals, eq(expenses.headId, animals.id));
  conditions.push(isNull(expenses.deletedAt));
  return query.where(and(...conditions)).orderBy(desc(expenses.expenseDate));
}

export async function createExpense(data: typeof expenses.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(expenses).values(data);
  return result;
}

export async function updateExpense(id: number, data: Partial<typeof expenses.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(expenses).set(data).where(eq(expenses.id, id));
}

export async function deleteExpense(id: number, deletedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(expenses).set({ deletedAt: new Date(), deletedBy: deletedBy ?? null }).where(eq(expenses.id, id));
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export async function getNotifications(userId?: number, unreadOnly?: boolean) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (userId) conditions.push(or(eq(notifications.userId, userId), isNull(notifications.userId)));
  if (unreadOnly) conditions.push(eq(notifications.isRead, false));
  const query = db.select().from(notifications);
  if (conditions.length > 0) return query.where(and(...conditions)).orderBy(desc(notifications.createdAt)).limit(50);
  return query.orderBy(desc(notifications.createdAt)).limit(50);
}

export async function createNotification(data: typeof notifications.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(notifications).values(data);
  return result;
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Mark both user-specific notifications AND system notifications (userId IS NULL) as read
  await db.update(notifications).set({ isRead: true }).where(
    or(eq(notifications.userId, userId), isNull(notifications.userId))
  );
}

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────

export async function createAuditEntry(data: typeof auditLog.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLog).values(data);
}

export async function getAuditLog(entityType?: string, entityId?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (entityType) conditions.push(eq(auditLog.entityType, entityType));
  if (entityId) conditions.push(eq(auditLog.entityId, entityId));
  const query = db.select().from(auditLog);
  if (conditions.length > 0) return query.where(and(...conditions)).orderBy(desc(auditLog.createdAt)).limit(100);
  return query.orderBy(desc(auditLog.createdAt)).limit(100);
}

// ─── COMPUTED / ANALYTICS ─────────────────────────────────────────────────────

export async function getAnimalPnL(animalId: number) {
  const db = await getDb();
  if (!db) return null;

  const animalRows = await db
    .select({
      animal: animals,
      category: animalCategories,
    })
    .from(animals)
    .leftJoin(animalCategories, eq(animals.categoryId, animalCategories.id))
    .where(eq(animals.id, animalId))
    .limit(1);
  if (!animalRows.length) return null;

  const animal = animalRows[0].animal;
  const category = animalRows[0].category;

  const today = new Date().toISOString().split("T")[0];
  const exitDate = animal.exitDate ? String(animal.exitDate) : today;
  const acquisitionDate = String(animal.acquisitionDate);

  // Days on farm
  const daysOnFarm = Math.max(
    1,
    Math.floor((new Date(exitDate).getTime() - new Date(acquisitionDate).getTime()) / 86400000)
  );

  // Purchase cost
  const purchaseCost = parseFloat(animal.purchaseCost ?? "0");

  // Direct expenses
  const directExpenses = await db
    .select({ total: sql<number>`SUM(amount)` })
    .from(expenses)
    .where(and(eq(expenses.headId, animalId), eq(expenses.targetType, "head")));
  const directExpenseTotal = parseFloat(String(directExpenses[0]?.total ?? 0));

  // Sale revenue
  const saleRows = await db.select().from(sales).where(eq(sales.animalId, animalId)).limit(1);
  const revenue = saleRows.length > 0 ? parseFloat(saleRows[0].salePrice) : 0;
  const weightAtSale = saleRows.length > 0 ? parseFloat(saleRows[0].weightAtSale ?? "0") : 0;

  // Feed cost (simplified: use ration plan × days × current price)
  const plans = await getActivePlanOnDate(animal.categoryId, String(acquisitionDate));
  let feedCost = 0;
  for (const plan of plans) {
    const price = await getFeedPriceOnDate(plan.feedItemId, acquisitionDate);
    feedCost += parseFloat(plan.qtyPerHeadPerDay) * daysOnFarm * price;
  }

  const totalCost = purchaseCost + feedCost + directExpenseTotal;
  const netPnL = revenue - totalCost;
  const costPerDay = daysOnFarm > 0 ? totalCost / daysOnFarm : 0;
  const pricePerKg = weightAtSale > 0 ? revenue / weightAtSale : 0;

  // Projected cost for active animals
  const targetWeight = parseFloat(category?.targetWeightKg ?? "0");
  const latestWeight = await db
    .select({ weightKg: weightLog.weightKg })
    .from(weightLog)
    .where(eq(weightLog.animalId, animalId))
    .orderBy(desc(weightLog.weighDate))
    .limit(1);
  const currentWeight = latestWeight.length > 0 ? parseFloat(latestWeight[0].weightKg) : parseFloat(animal.weightAtAcquisition ?? "0");
  const projectedCost = animal.isActive && targetWeight > currentWeight && costPerDay > 0
    ? totalCost + costPerDay * 30 // rough estimate
    : null;

  return {
    animalId,
    daysOnFarm,
    purchaseCost,
    feedCost,
    directExpenseTotal,
    totalCost,
    revenue,
    netPnL,
    costPerDay,
    pricePerKg,
    projectedCost,
    isActive: animal.isActive,
    saleRecord: saleRows[0] ?? null,
  };
}

/**
 * Bulk P&L for all animals — runs in a single pass using pre-fetched lookup tables
 * to avoid N+1 queries. Returns one row per animal.
 */
export async function getAllAnimalsPnL(filters?: { speciesId?: number; categoryId?: number }) {
  const db = await getDb();
  if (!db) return [];

  const today = new Date().toISOString().split("T")[0];

  // 1. Fetch all animals with category + species + status names
  const conditions = [isNotNull(animals.id)];
  if (filters?.speciesId) conditions.push(eq(animals.speciesId, filters.speciesId));
  if (filters?.categoryId) conditions.push(eq(animals.categoryId, filters.categoryId));

  const allAnimals = await db
    .select({
      animal: animals,
      categoryName: animalCategories.name,
      speciesName: species.name,
    })
    .from(animals)
    .leftJoin(animalCategories, eq(animals.categoryId, animalCategories.id))
    .leftJoin(species, eq(animals.speciesId, species.id))
    .where(and(...conditions))
    .orderBy(animals.animalId);

  if (!allAnimals.length) return [];

  // 2. Pre-fetch all sales (one query)
  const allSales = await db.select().from(sales);
  const saleByAnimal = new Map<number, typeof allSales[0]>();
  for (const s of allSales) saleByAnimal.set(s.animalId, s);

  // 3. Pre-fetch all direct expenses per animal (one query)
  const allDirectExp = await db
    .select({ headId: expenses.headId, total: sql<number>`SUM(amount)` })
    .from(expenses)
    .where(eq(expenses.targetType, "head"))
    .groupBy(expenses.headId);
  const directExpByAnimal = new Map<number, number>();
  for (const e of allDirectExp) {
    if (e.headId != null) directExpByAnimal.set(e.headId, parseFloat(String(e.total ?? 0)));
  }

  // 4. Pre-fetch all active ration plans (one query)
  const allPlans = await db
    .select()
    .from(rationPlans)
    .where(eq(rationPlans.isActive, true));
  // Group plans by categoryId
  const plansByCategory = new Map<number, typeof allPlans>();
  for (const p of allPlans) {
    if (!plansByCategory.has(p.categoryId)) plansByCategory.set(p.categoryId, []);
    plansByCategory.get(p.categoryId)!.push(p);
  }

  // 5. Pre-fetch latest feed prices per feed item (one query per unique feed item)
  const uniqueFeedItemIds = Array.from(new Set(allPlans.map((p) => p.feedItemId)));
  const feedPriceMap = new Map<number, number>();
  for (const feedItemId of uniqueFeedItemIds) {
    const price = await getFeedPriceOnDate(feedItemId, today);
    feedPriceMap.set(feedItemId, price);
  }

  // 6. Compute P&L per animal
  const results = [];
  for (const row of allAnimals) {
    const animal = row.animal;
    const exitDate = animal.exitDate ? String(animal.exitDate) : today;
    const acquisitionDate = String(animal.acquisitionDate ?? today);
    const daysOnFarm = Math.max(
      1,
      Math.floor((new Date(exitDate).getTime() - new Date(acquisitionDate).getTime()) / 86400000)
    );

    const purchaseCost = parseFloat(animal.purchaseCost ?? "0");
    const directExpenseTotal = directExpByAnimal.get(animal.id) ?? 0;

    const saleRow = saleByAnimal.get(animal.id);
    const revenue = saleRow ? parseFloat(saleRow.salePrice) : 0;
    const weightAtSale = saleRow ? parseFloat(saleRow.weightAtSale ?? "0") : 0;

    // Feed cost: sum over active ration plans for this category
    let feedCost = 0;
    const plans = plansByCategory.get(animal.categoryId) ?? [];
    for (const plan of plans) {
      const price = feedPriceMap.get(plan.feedItemId) ?? 0;
      feedCost += parseFloat(plan.qtyPerHeadPerDay) * daysOnFarm * price;
    }

    const totalCost = purchaseCost + feedCost + directExpenseTotal;
    const netPnL = revenue - totalCost;
    const costPerDay = daysOnFarm > 0 ? totalCost / daysOnFarm : 0;
    const pricePerKg = weightAtSale > 0 ? revenue / weightAtSale : 0;

    results.push({
      animalId: animal.id,
      animalCode: animal.animalId,
      categoryName: row.categoryName ?? "",
      speciesName: row.speciesName ?? "",
      isActive: animal.isActive,
      daysOnFarm,
      purchaseCost,
      feedCost,
      directExpenseTotal,
      totalCost,
      revenue,
      netPnL,
      costPerDay,
      pricePerKg,
    });
  }

  return results;
}

export async function getDashboardKPIs(filters?: {
  fromDate?: string;
  toDate?: string;
  speciesId?: number;
  categoryId?: number;
  groupId?: number;
}) {
  const db = await getDb();
  if (!db) return null;

  const today = new Date().toISOString().split("T")[0];
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const fromDate = filters?.fromDate ?? twelveMonthsAgo.toISOString().split("T")[0];
  const toDate = filters?.toDate ?? today;

  // Active head count
  const headConditions = [eq(animals.isActive, true)];
  if (filters?.speciesId) headConditions.push(eq(animals.speciesId, filters.speciesId));
  if (filters?.categoryId) headConditions.push(eq(animals.categoryId, filters.categoryId));
  if (filters?.groupId) headConditions.push(eq(animals.groupId, filters.groupId));

  const headCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(animals)
    .where(and(...headConditions));

  // Total expenses in period
  const totalExpenses = await db
    .select({ total: sql<number>`SUM(amount)` })
    .from(expenses)
    .where(and(sql`${expenses.expenseDate} >= ${fromDate}`, sql`${expenses.expenseDate} <= ${toDate}`));

  // Total sales revenue in period
  const totalRevenue = await db
    .select({ total: sql<number>`SUM(salePrice)` })
    .from(sales)
    .where(and(sql`${sales.saleDate} >= ${fromDate}`, sql`${sales.saleDate} <= ${toDate}`));

  // Category breakdown
  const categoryBreakdown = await db
    .select({
      categoryId: animals.categoryId,
      categoryName: animalCategories.name,
      headCount: sql<number>`COUNT(*)`,
    })
    .from(animals)
    .leftJoin(animalCategories, eq(animals.categoryId, animalCategories.id))
    .where(and(...headConditions))
    .groupBy(animals.categoryId, animalCategories.name);

  return {
    totalActiveHeads: Number(headCount[0]?.count ?? 0),
    totalExpenses: parseFloat(String(totalExpenses[0]?.total ?? 0)),
    totalRevenue: parseFloat(String(totalRevenue[0]?.total ?? 0)),
    grossPnL: parseFloat(String(totalRevenue[0]?.total ?? 0)) - parseFloat(String(totalExpenses[0]?.total ?? 0)),
    categoryBreakdown,
    period: { fromDate, toDate },
  };
}

export async function getFeedStockStatus() {
  const db = await getDb();
  if (!db) return [];

  const allFeedItems = await getAllFeedItems();
  const result = [];

  for (const item of allFeedItems) {
    // Last stock count
    const lastCount = await db
      .select({ qty: feedStockLedger.qty, transactionDate: feedStockLedger.transactionDate })
      .from(feedStockLedger)
      .where(and(eq(feedStockLedger.feedItemId, item.id), eq(feedStockLedger.transactionType, "stock_count")))
      .orderBy(desc(feedStockLedger.transactionDate))
      .limit(1);

    const lastCountDate = lastCount[0]?.transactionDate ?? "2020-01-01";
    const lastCountQty = parseFloat(lastCount[0]?.qty ?? "0");

    // Purchases since last count
    const purchases = await db
      .select({ total: sql<number>`SUM(qty)` })
      .from(feedStockLedger)
      .where(
        and(
          eq(feedStockLedger.feedItemId, item.id),
          eq(feedStockLedger.transactionType, "purchase"),
          sql`${feedStockLedger.transactionDate} >= ${lastCountDate}`
        )
      );
    const purchasedQty = parseFloat(String(purchases[0]?.total ?? 0));

    // Daily consumption from ration plans
  const plans = await db
    .select({ qty: rationPlans.qtyPerHeadPerDay, categoryId: rationPlans.categoryId })
    .from(rationPlans)
    .where(and(eq(rationPlans.feedItemId, item.id), eq(rationPlans.isActive, true)));

    let dailyConsumption = 0;
    const headCounts = await getActiveHeadCountByCategory();
    for (const plan of plans) {
      const heads = headCounts[plan.categoryId] ?? 0;
      dailyConsumption += parseFloat(plan.qty) * heads;
    }

    const stockOnHand = lastCountQty + purchasedQty;
    const daysRemaining = dailyConsumption > 0 ? Math.floor(stockOnHand / dailyConsumption) : 999;
    const runOutDate = dailyConsumption > 0
      ? new Date(Date.now() + daysRemaining * 86400000).toISOString().split("T")[0]
      : null;

    result.push({
      feedItemId: item.id,
      feedItemName: item.name,
      unit: item.unit,
      stockOnHand,
      dailyConsumption,
      daysRemaining,
      runOutDate,
      status: daysRemaining <= 3 ? "critical" : daysRemaining <= 7 ? "low" : "ok",
    });
  }

  return result;
}

export async function getIncomeStatement(filters: { fromDate: string; toDate: string; speciesId?: number; categoryId?: number }) {
  const db = await getDb();
  if (!db) return null;

  // Revenue: animal sales
  const salesData = await db
    .select({ total: sql<number>`SUM(salePrice)` })
    .from(sales)
    .where(and(sql`${sales.saleDate} >= ${filters.fromDate}`, sql`${sales.saleDate} <= ${filters.toDate}`));

  // Animal purchase costs
  const purchaseCosts = await db
    .select({ total: sql<number>`SUM(purchaseCost)` })
    .from(animals)
    .where(and(sql`${animals.acquisitionDate} >= ${filters.fromDate}`, sql`${animals.acquisitionDate} <= ${filters.toDate}`));

  // Expenses by category
  const expensesByCategory = await db
    .select({
      categoryName: expenseCategories.name,
      total: sql<number>`SUM(${expenses.amount})`,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(and(sql`${expenses.expenseDate} >= ${filters.fromDate}`, sql`${expenses.expenseDate} <= ${filters.toDate}`))
    .groupBy(expenseCategories.name);

  const totalRevenue = parseFloat(String(salesData[0]?.total ?? 0));
  const totalAnimalCost = parseFloat(String(purchaseCosts[0]?.total ?? 0));
  const totalOtherCost = expensesByCategory.reduce((sum, e) => sum + parseFloat(String(e.total ?? 0)), 0);
  const totalCost = totalAnimalCost + totalOtherCost;
  const grossProfit = totalRevenue - totalCost;

  return {
    period: { fromDate: filters.fromDate, toDate: filters.toDate },
    revenue: { animalSales: totalRevenue, total: totalRevenue },
    costs: {
      animalPurchases: totalAnimalCost,
      byCategory: expensesByCategory,
      totalOther: totalOtherCost,
      total: totalCost,
    },
    grossProfit,
    profitMargin: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
  };
}
