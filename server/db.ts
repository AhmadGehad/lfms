import { and, desc, eq, inArray, isNotNull, isNull, or, sql, lte, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { toMinor, toMajor, divMinor } from "./_core/money";
import { animalCategories, animalStatusHistory, animalStatuses, animals, auditLog, birthTypes, expenseCategories, expenseSubCategories, expenses, feedItemPriceHistory, feedItems, feedStockLedger, groups, InsertUser, lambingLog, notifications, rationPlans, sales, species, systemSettings, users, weightLog } from "../drizzle/schema";
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

/**
 * A database handle that is either the shared pool or an active transaction.
 * Write helpers accept an optional tx so multi-step flows can run atomically.
 */
type DbHandle = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<DbHandle["transaction"]>[0]>[0];
export type DbOrTx = DbHandle | Tx;

// ─── USER HELPERS ─────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach(field => {
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

  // Use alias for self-join on auto-stage target category
  const targetCat = db.$with("targetCat").as(db.select({ id: animalCategories.id, name: animalCategories.name }).from(animalCategories));

  const baseQuery = db
    .select({
      id: animalCategories.id,
      name: animalCategories.name,
      speciesId: animalCategories.speciesId,
      speciesName: species.name,
      idPrefix: animalCategories.idPrefix,
      idSequence: animalCategories.idSequence,
      targetWeightKg: animalCategories.targetWeightKg,
      expectedCycleDays: animalCategories.expectedCycleDays,
      autoStageWeightKg: animalCategories.autoStageWeightKg,
      autoStageTargetCategoryId: animalCategories.autoStageTargetCategoryId,
      isExitStatus: animalCategories.isExitStatus,
      isActive: animalCategories.isActive,
      createdAt: animalCategories.createdAt
    })
    .from(animalCategories)
    .leftJoin(species, eq(animalCategories.speciesId, species.id))
    .where(isNull(animalCategories.deletedAt))
    .orderBy(animalCategories.name);

  const rows = speciesId
    ? await db
        .select({
          id: animalCategories.id,
          name: animalCategories.name,
          speciesId: animalCategories.speciesId,
          speciesName: species.name,
          idPrefix: animalCategories.idPrefix,
          idSequence: animalCategories.idSequence,
          targetWeightKg: animalCategories.targetWeightKg,
          expectedCycleDays: animalCategories.expectedCycleDays,
          autoStageWeightKg: animalCategories.autoStageWeightKg,
          autoStageTargetCategoryId: animalCategories.autoStageTargetCategoryId,
          isExitStatus: animalCategories.isExitStatus,
          isActive: animalCategories.isActive,
          createdAt: animalCategories.createdAt
        })
        .from(animalCategories)
        .leftJoin(species, eq(animalCategories.speciesId, species.id))
        .where(and(eq(animalCategories.speciesId, speciesId), isNull(animalCategories.deletedAt)))
        .orderBy(animalCategories.name)
    : await baseQuery;

  return rows;
}

export async function createCategory(data: { name: string; speciesId: number; idPrefix: string; targetWeightKg?: string; expectedCycleDays?: number }) {
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

export async function incrementCategorySequence(categoryId: number, tx?: DbOrTx): Promise<number> {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  await db
    .update(animalCategories)
    .set({ idSequence: sql`${animalCategories.idSequence} + 1` })
    .where(eq(animalCategories.id, categoryId));
  const [cat] = await db
    .select({
      idSequence: animalCategories.idSequence,
      idPrefix: animalCategories.idPrefix
    })
    .from(animalCategories)
    .where(eq(animalCategories.id, categoryId));
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
    return db
      .select()
      .from(groups)
      .where(and(or(eq(groups.speciesId, speciesId), isNull(groups.speciesId)), isNull(groups.deletedAt)));
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
  return db.select().from(feedItemPriceHistory).where(eq(feedItemPriceHistory.feedItemId, feedItemId)).orderBy(desc(feedItemPriceHistory.effectiveDate));
}

export async function addFeedItemPrice(data: { feedItemId: number; effectiveDate: string; pricePerUnit: string; notes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(feedItemPriceHistory).values({
    feedItemId: data.feedItemId,
    effectiveDate: sql`${data.effectiveDate}`,
    pricePerUnit: data.pricePerUnit,
    notes: data.notes
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

export async function getAnimals(filters?: { speciesId?: number; categoryId?: number; groupId?: number; statusId?: number; isActive?: boolean; search?: string }) {
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
      targetWeightKg: animalCategories.targetWeightKg,
      groupCode: groups.groupCode,
      groupName: groups.name,
      statusName: animalStatuses.name,
      isExitStatus: animalStatuses.isExitStatus,
      latestWeightKg: sql<string | null>`(
        SELECT wl.weightKg FROM weight_log wl
        WHERE wl.animalId = ${animals.id} AND wl.deletedAt IS NULL
        ORDER BY wl.weighDate DESC LIMIT 1
      )`
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
      isExitStatus: animalStatuses.isExitStatus
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

export async function createAnimal(data: typeof animals.$inferInsert, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(animals).values(data);
  return result;
}

export async function updateAnimal(id: number, data: Partial<typeof animals.$inferInsert>, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  await db.update(animals).set(data).where(eq(animals.id, id));
}

export async function getActiveHeadCountByCategory(dateStr?: string): Promise<Record<number, number>> {
  const db = await getDb();
  if (!db) return {};
  const conditions = [eq(animals.isActive, true), isNull(animals.deletedAt)];
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
  rows.forEach(r => {
    result[r.categoryId] = Number(r.count);
  });
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
      notes: animalStatusHistory.notes
    })
    .from(animalStatusHistory)
    .where(eq(animalStatusHistory.animalId, animalId))
    .orderBy(desc(animalStatusHistory.changedAt));
}

export async function recordStatusChange(
  data: {
    animalId: number;
    previousStatusId?: number;
    newStatusId: number;
    changedBy?: number;
    notes?: string;
  },
  tx?: DbOrTx
) {
  const db = tx ?? (await getDb());
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
      categoryName: animalCategories.name
    })
    .from(sales)
    .leftJoin(animals, eq(sales.animalId, animals.id))
    .leftJoin(species, eq(animals.speciesId, species.id))
    .leftJoin(animalCategories, eq(animals.categoryId, animalCategories.id));
  conditions.push(isNull(sales.deletedAt));
  return query.where(and(...conditions)).orderBy(desc(sales.saleDate));
}

export async function createSale(data: typeof sales.$inferInsert, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(sales).values(data);
  return result;
}
export async function updateSale(
  id: number,
  data: Partial<{
    animalId: number;
    salePrice: string;
    weightAtSale: string | null;
    pricePerKg: string | null;
    saleDate: string;
    buyerName: string | null;
    notes: string | null;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(sales)
    .set(data as any)
    .where(eq(sales.id, id));
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
      groupCode: groups.groupCode
    })
    .from(lambingLog)
    .leftJoin(birthTypes, eq(lambingLog.birthTypeId, birthTypes.id))
    .leftJoin(groups, eq(lambingLog.groupId, groups.id));
  const lambingConditions = [isNull(lambingLog.deletedAt)];
  if (filters?.isPromoted !== undefined) lambingConditions.push(eq(lambingLog.isPromoted, filters.isPromoted) as any);
  return query.where(and(...lambingConditions)).orderBy(desc(lambingLog.birthDate)) as Promise<any[]>;
}

export async function createLambingRecord(data: typeof lambingLog.$inferInsert, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(lambingLog).values(data);
  return result;
}

export async function updateLambingRecord(id: number, data: Partial<typeof lambingLog.$inferInsert>, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  await db.update(lambingLog).set(data).where(eq(lambingLog.id, id));
}

// ─── WEIGHT LOG ───────────────────────────────────────────────────────────────

export async function getWeightLog(animalId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(weightLog)
    .where(and(eq(weightLog.animalId, animalId), isNull(weightLog.deletedAt)))
    .orderBy(weightLog.weighDate);
}

export async function createWeightEntry(data: typeof weightLog.$inferInsert, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
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
      weighDate: weightLog.weighDate
    })
    .from(weightLog)
    .where(
      sql`${weightLog.animalId} IN (${sql.join(
        animalIds.map(id => sql`${id}`),
        sql`, `
      )})`
    )
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
      categoryName: animalCategories.name
    })
    .from(rationPlans)
    .leftJoin(feedItems, eq(rationPlans.feedItemId, feedItems.id))
    .leftJoin(animalCategories, eq(rationPlans.categoryId, animalCategories.id));
  if (categoryId) return query.where(and(eq(rationPlans.categoryId, categoryId), eq(rationPlans.isActive, true), isNull(rationPlans.deletedAt)));
  return query.where(and(eq(rationPlans.isActive, true), isNull(rationPlans.deletedAt)));
}

export async function createRationPlan(data: typeof rationPlans.$inferInsert, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
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
    .where(and(eq(rationPlans.categoryId, categoryId), eq(rationPlans.isActive, true), sql`${rationPlans.effectiveDate} <= ${dateStr}`, or(isNull(rationPlans.endDate), sql`${rationPlans.endDate} >= ${dateStr}`)));
}

/**
 * Pure feed-cost segmentation math (no DB). Given a category's ration plans
 * and the full price history, compute total feed cost over [startStr, endStr).
 * Exported for unit testing and reused by both single + bulk P&L paths.
 */
export function segmentedFeedCostPure(
  plans: Array<{
    feedItemId: number;
    qtyPerHeadPerDay: string;
    effectiveDate: string;
    endDate: string | null;
    isActive: boolean;
  }>,
  pricesByItem: Map<number, Array<{ eff: string; price: number }>>,
  startStr: string,
  endStr: string
): number {
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (end <= start) return 0;
  const active = plans.filter(p => p.isActive);
  if (!active.length) return 0;

  const priceOnDate = (feedItemId: number, dateStr: string): number => {
    const arr = pricesByItem.get(feedItemId);
    if (!arr) return 0;
    let price = 0;
    for (const r of arr) {
      if (r.eff <= dateStr) price = r.price;
      else break;
    }
    return price;
  };

  const cps = new Set<number>([start.getTime(), end.getTime()]);
  const within = (t: number) => t > start.getTime() && t < end.getTime();
  for (const p of active) {
    const eff = new Date(p.effectiveDate).getTime();
    if (within(eff)) cps.add(eff);
    if (p.endDate) {
      const after = new Date(p.endDate).getTime() + 86400000;
      if (within(after)) cps.add(after);
    }
    for (const pr of pricesByItem.get(p.feedItemId) ?? []) {
      const e = new Date(pr.eff).getTime();
      if (within(e)) cps.add(e);
    }
  }
  const sorted = Array.from(cps).sort((a, b) => a - b);
  let totalMinor = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segDays = Math.round((sorted[i + 1] - segStart) / 86400000);
    if (segDays <= 0) continue;
    const segStartStr = new Date(segStart).toISOString().split("T")[0];
    for (const p of active) {
      const eff = p.effectiveDate;
      const endD = p.endDate;
      if (eff <= segStartStr && (!endD || endD >= segStartStr)) {
        // price is money → minor units; qty and days are plain multipliers.
        const priceMinor = Math.round(priceOnDate(p.feedItemId, segStartStr) * 100);
        totalMinor += Math.round(priceMinor * parseFloat(p.qtyPerHeadPerDay) * segDays);
      }
    }
  }
  return Math.round(totalMinor) / 100;
}

/**
 * Accurate feed cost for one animal over [startDate, endDate).
 *
 * Walks the period in segments, re-evaluating BOTH the active ration plan and
 * the feed price whenever either changes — instead of freezing a single
 * acquisition-date snapshot. This makes per-animal feed cost track plan
 * revisions and price inflation over the animal's life.
 *
 * Cost for a segment = Σ_plans (qtyPerHeadPerDay × segmentDays × priceOnSegmentStart).
 */
export async function computeFeedCostForPeriod(categoryId: number, startDate: string, endDate: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const start = new Date(startDate.split("T")[0]);
  const end = new Date(endDate.split("T")[0]);
  if (end <= start) return 0;

  // Fetch this category's active ration plans + the price history for their feed items.
  const planRows = await db
    .select()
    .from(rationPlans)
    .where(and(eq(rationPlans.categoryId, categoryId), eq(rationPlans.isActive, true)));

  const feedItemIds = Array.from(new Set(planRows.map(p => p.feedItemId)));
  const priceRows = feedItemIds.length ? await db.select().from(feedItemPriceHistory).where(inArray(feedItemPriceHistory.feedItemId, feedItemIds)) : [];

  const plansForPure = planRows.map(p => ({
    feedItemId: p.feedItemId,
    qtyPerHeadPerDay: p.qtyPerHeadPerDay,
    effectiveDate: String(p.effectiveDate).split("T")[0],
    endDate: p.endDate ? String(p.endDate).split("T")[0] : null,
    isActive: true
  }));
  const pricesMap = new Map<number, Array<{ eff: string; price: number }>>();
  for (const pr of priceRows) {
    const eff = String(pr.effectiveDate).split("T")[0];
    if (!pricesMap.has(pr.feedItemId)) pricesMap.set(pr.feedItemId, []);
    pricesMap.get(pr.feedItemId)!.push({ eff, price: parseFloat(pr.pricePerUnit) });
  }
  for (const arr of Array.from(pricesMap.values())) arr.sort((a, b) => (a.eff < b.eff ? -1 : 1));

  return segmentedFeedCostPure(plansForPure, pricesMap, start.toISOString().split("T")[0], end.toISOString().split("T")[0]);
}

/**
 * Head count in a category that overlapped a given date window — i.e. animals
 * acquired on/before windowEnd and not exited before windowStart. Used to
 * allocate category-level expenses fairly against the herd that actually
 * existed during the expense window, instead of today's (changing) count.
 */
export async function getCategoryHeadCountDuring(categoryId: number, windowStart: string, windowEnd: string): Promise<number> {
  const db = await getDb();
  if (!db) return 1;
  const ws = windowStart.split("T")[0];
  const we = windowEnd.split("T")[0];
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(animals)
    .where(and(eq(animals.categoryId, categoryId), isNull(animals.deletedAt), sql`${animals.acquisitionDate} <= ${we}`, or(isNull(animals.exitDate), sql`${animals.exitDate} >= ${ws}`)));
  return Math.max(1, Number(rows[0]?.count ?? 1));
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
      feedItemUnit: feedItems.unit
    })
    .from(feedStockLedger)
    .leftJoin(feedItems, eq(feedStockLedger.feedItemId, feedItems.id));
  if (feedItemId) return query.where(and(eq(feedStockLedger.feedItemId, feedItemId), isNull(feedStockLedger.deletedAt))).orderBy(desc(feedStockLedger.transactionDate));
  return query.where(isNull(feedStockLedger.deletedAt)).orderBy(desc(feedStockLedger.transactionDate));
}

export async function createFeedStockEntry(data: typeof feedStockLedger.$inferInsert, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(feedStockLedger).values(data);
  return result;
}

export async function updateFeedStockEntry(
  id: number,
  data: Partial<{
    feedItemId: number;
    transactionDate: string;
    transactionType: string;
    qty: string;
    unitCost: string | null;
    totalCost: string | null;
    supplierName: string | null;
    notes: string | null;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const updateData: Record<string, any> = { ...data };
  if (data.transactionDate) updateData.transactionDate = data.transactionDate as any;
  const [result] = await db.update(feedStockLedger).set(updateData).where(eq(feedStockLedger.id, id));
  return result;
}

// ─── EXPENSESS ─────────────────────────────────────────────────────────────────

export async function getExpenses(filters?: { fromDate?: string; toDate?: string; categoryId?: number; targetType?: "general" | "category" | "head"; headId?: number }) {
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
      animalCode: animals.animalId
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .leftJoin(expenseSubCategories, eq(expenses.subCategoryId, expenseSubCategories.id))
    .leftJoin(animals, eq(expenses.headId, animals.id));
  conditions.push(isNull(expenses.deletedAt));
  return query.where(and(...conditions)).orderBy(desc(expenses.expenseDate));
}

export async function createExpense(data: typeof expenses.$inferInsert, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
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
  await db
    .update(expenses)
    .set({ deletedAt: new Date(), deletedBy: deletedBy ?? null })
    .where(eq(expenses.id, id));
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export async function getNotifications(userId?: number, unreadOnly?: boolean) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (userId) conditions.push(or(eq(notifications.userId, userId), isNull(notifications.userId)));
  if (unreadOnly) conditions.push(eq(notifications.isRead, false));
  const query = db.select().from(notifications);
  if (conditions.length > 0)
    return query
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
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
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(or(eq(notifications.userId, userId), isNull(notifications.userId)));
}

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────

export async function createAuditEntry(data: typeof auditLog.$inferInsert, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
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
  if (conditions.length > 0)
    return query
      .where(and(...conditions))
      .orderBy(desc(auditLog.createdAt))
      .limit(100);
  return query.orderBy(desc(auditLog.createdAt)).limit(100);
}

// ─── COMPUTED / ANALYTICS ─────────────────────────────────────────────────────

export async function getAnimalPnL(animalId: number) {
  const db = await getDb();
  if (!db) return null;

  const animalRows = await db
    .select({
      animal: animals,
      category: animalCategories
    })
    .from(animals)
    .leftJoin(animalCategories, eq(animals.categoryId, animalCategories.id))
    .where(and(eq(animals.id, animalId), isNull(animals.deletedAt)));

  const animal = animalRows[0].animal;
  const category = animalRows[0].category;

  const today = new Date().toISOString().split("T")[0];
  const exitDate = animal.exitDate ? String(animal.exitDate) : today;
  const acquisitionDate = String(animal.acquisitionDate);

  // Days on farm
  const daysOnFarm = Math.max(1, Math.floor((new Date(exitDate).getTime() - new Date(acquisitionDate).getTime()) / 86400000));

  // Direct expenses (head-level only, exclude soft-deleted)
  const directExpenses = await db
    .select({ total: sql<number>`SUM(amount)` })
    .from(expenses)
    .where(and(eq(expenses.headId, animalId), eq(expenses.targetType, "head"), isNull(expenses.deletedAt)));
  const directExpenseTotalMinor = toMinor(String(directExpenses[0]?.total ?? 0));

  // Category-level expense allocation: animal's share of vet/vaccine bills etc
  // targeting the animal's category during its time on farm
  const acqDateStr = acquisitionDate.split("T")[0];
  const exitDateStr = exitDate.split("T")[0];
  const catExpensesRows = await db
    .select({ total: sql<number>`SUM(amount)` })
    .from(expenses)
    .where(and(eq(expenses.targetType, "category"), eq(expenses.categoryTarget, animal.categoryId), isNull(expenses.deletedAt), sql`${expenses.expenseDate} >= ${acqDateStr}`, sql`${expenses.expenseDate} <= ${exitDateStr}`));
  const catExpTotalMinor = toMinor(String(catExpensesRows[0]?.total ?? 0));

  // Allocate by the head count that overlapped the animal's time on farm —
  // not today's count — so historical P&L stays stable as the herd changes.
  const catHeadCount = await getCategoryHeadCountDuring(animal.categoryId, acqDateStr, exitDateStr);
  const categoryExpenseAllocationMinor = divMinor(catExpTotalMinor, catHeadCount);

  // Sale revenue (exclude soft-deleted sales)
  const saleRows = await db
    .select()
    .from(sales)
    .where(and(eq(sales.animalId, animalId), isNull(sales.deletedAt)))
    .limit(1);
  const revenueMinor = saleRows.length > 0 ? toMinor(saleRows[0].salePrice) : 0;
  const weightAtSale = saleRows.length > 0 ? parseFloat(saleRows[0].weightAtSale ?? "0") : 0;

  // Feed cost: time-segmented across ration-plan AND price changes over the
  // animal's life (not a single acquisition-date snapshot).
  const feedCost = await computeFeedCostForPeriod(animal.categoryId, acquisitionDate, exitDate);
  const feedCostMinor = toMinor(feedCost);

  const purchaseCostMinor = toMinor(animal.purchaseCost ?? "0");
  const totalCostMinor = purchaseCostMinor + feedCostMinor + directExpenseTotalMinor + categoryExpenseAllocationMinor;
  const netPnLMinor = revenueMinor - totalCostMinor;

  // Convert back to major-unit numbers at the boundary
  const purchaseCost = toMajor(purchaseCostMinor);
  const directExpenseTotal = toMajor(directExpenseTotalMinor);
  const categoryExpenseAllocation = toMajor(categoryExpenseAllocationMinor);
  const revenue = toMajor(revenueMinor);
  const totalCost = toMajor(totalCostMinor);
  const netPnL = toMajor(netPnLMinor);
  const costPerDay = daysOnFarm > 0 ? toMajor(divMinor(totalCostMinor, daysOnFarm)) : 0;
  const pricePerKg = weightAtSale > 0 ? toMajor(Math.round(revenueMinor / weightAtSale)) : 0;

  // Projected cost for active animals — based on actual growth rate and the
  // remaining distance to target weight, not a flat 30 days.
  const targetWeight = parseFloat(category?.targetWeightKg ?? "0");
  const weightRows = await db
    .select({ weightKg: weightLog.weightKg, weighDate: weightLog.weighDate })
    .from(weightLog)
    .where(and(eq(weightLog.animalId, animalId), isNull(weightLog.deletedAt)))
    .orderBy(desc(weightLog.weighDate))
    .limit(1);
  const acqWeight = parseFloat(animal.weightAtAcquisition ?? "0");
  const currentWeight = weightRows.length > 0 ? parseFloat(weightRows[0].weightKg) : acqWeight;

  // Average daily gain so far (kg/day); fall back to a conservative 0.15 kg/day
  // if we don't have enough data to measure it.
  const adg = currentWeight > acqWeight && daysOnFarm > 0 ? (currentWeight - acqWeight) / daysOnFarm : 0;
  let projectedCost: number | null = null;
  if (animal.isActive && targetWeight > currentWeight && totalCostMinor > 0 && daysOnFarm > 0) {
    const effectiveAdg = adg > 0 ? adg : 0.15;
    const daysToTarget = Math.ceil((targetWeight - currentWeight) / effectiveAdg);
    // cap projection horizon at 1 year to avoid runaway estimates
    const horizon = Math.min(daysToTarget, 365);
    const costPerDayMinor = divMinor(totalCostMinor, daysOnFarm);
    projectedCost = toMajor(totalCostMinor + costPerDayMinor * horizon);
  }

  return {
    animalId,
    daysOnFarm,
    purchaseCost,
    feedCost,
    directExpenseTotal,
    categoryExpenseAllocation,
    totalCost,
    revenue,
    netPnL,
    costPerDay,
    pricePerKg,
    projectedCost,
    isActive: animal.isActive,
    saleRecord: saleRows[0] ?? null
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
  const conditions = [isNotNull(animals.id), isNull(animals.deletedAt)];
  if (filters?.speciesId) conditions.push(eq(animals.speciesId, filters.speciesId));
  if (filters?.categoryId) conditions.push(eq(animals.categoryId, filters.categoryId));

  const allAnimals = await db
    .select({
      animal: animals,
      categoryName: animalCategories.name,
      speciesName: species.name,
      statusName: animalStatuses.name
    })
    .from(animals)
    .leftJoin(animalCategories, eq(animals.categoryId, animalCategories.id))
    .leftJoin(species, eq(animals.speciesId, species.id))
    .leftJoin(animalStatuses, eq(animals.statusId, animalStatuses.id))
    .where(and(...conditions))
    .orderBy(animals.animalId);

  if (!allAnimals.length) return [];

  // 2. Pre-fetch all sales (one query)
  const allSales = await db.select().from(sales).where(isNull(sales.deletedAt));
  const saleByAnimal = new Map<number, (typeof allSales)[0]>();
  for (const s of allSales) saleByAnimal.set(s.animalId, s);

  // 3. Pre-fetch all direct (head) expenses per animal
  const allDirectExp = await db
    .select({ headId: expenses.headId, total: sql<number>`SUM(amount)` })
    .from(expenses)
    .where(and(eq(expenses.targetType, "head"), isNull(expenses.deletedAt)))
    .groupBy(expenses.headId);
  const directExpByAnimal = new Map<number, number>(); // minor units
  for (const e of allDirectExp) {
    if (e.headId != null) directExpByAnimal.set(e.headId, toMinor(String(e.total ?? 0)));
  }

  // 4. Pre-fetch all CATEGORY-level expenses with date + categoryTarget (numeric FK → categoryId)
  const allCatExp = await db
    .select({
      id: expenses.id,
      amount: expenses.amount,
      expenseDate: expenses.expenseDate,
      categoryTarget: expenses.categoryTarget
    })
    .from(expenses)
    .where(and(eq(expenses.targetType, "category"), isNull(expenses.deletedAt)));

  // Build a map: categoryId → array of { amountMinor, date }
  const catExpByCatId = new Map<number, Array<{ amount: number; date: string }>>(); // amount in minor units
  for (const e of allCatExp) {
    if (e.categoryTarget == null) continue;
    const catId = Number(e.categoryTarget);
    const dateStr = e.expenseDate instanceof Date ? e.expenseDate.toISOString().split("T")[0] : String(e.expenseDate).split("T")[0];
    if (!catExpByCatId.has(catId)) catExpByCatId.set(catId, []);
    catExpByCatId.get(catId)!.push({ amount: toMinor(String(e.amount)), date: dateStr });
  }

  // Pre-build per-category animal list with acquisition/exit dates so we can
  // allocate each category expense against the head count that overlapped it.
  const animalsByCategory = new Map<number, Array<{ acq: string; exit: string | null }>>();
  for (const r of allAnimals) {
    const a = r.animal;
    const acq = a.acquisitionDate instanceof Date ? a.acquisitionDate.toISOString().split("T")[0] : String(a.acquisitionDate ?? today).split("T")[0];
    const exit = a.exitDate ? (a.exitDate instanceof Date ? a.exitDate.toISOString().split("T")[0] : String(a.exitDate).split("T")[0]) : null;
    if (!animalsByCategory.has(a.categoryId)) animalsByCategory.set(a.categoryId, []);
    animalsByCategory.get(a.categoryId)!.push({ acq, exit });
  }

  // 5. Pre-fetch ALL ration plans (active + historical) for accurate per-period cost
  const allPlans = await db.select().from(rationPlans).where(isNull(rationPlans.deletedAt));
  // Group by categoryId
  const plansByCategory = new Map<number, typeof allPlans>();
  for (const p of allPlans) {
    if (!plansByCategory.has(p.categoryId)) plansByCategory.set(p.categoryId, []);
    plansByCategory.get(p.categoryId)!.push(p);
  }

  // 6. Build feed price cache — key: `feedItemId:dateStr`
  // 6. Pre-fetch ALL feed price history (one query) for in-memory segmented costing.
  const allPriceRows = await db.select().from(feedItemPriceHistory);
  const pricesByItem = new Map<number, Array<{ eff: string; price: number }>>();
  for (const pr of allPriceRows) {
    const eff = pr.effectiveDate instanceof Date ? pr.effectiveDate.toISOString().split("T")[0] : String(pr.effectiveDate).split("T")[0];
    if (!pricesByItem.has(pr.feedItemId)) pricesByItem.set(pr.feedItemId, []);
    pricesByItem.get(pr.feedItemId)!.push({ eff, price: parseFloat(pr.pricePerUnit) });
  }
  for (const arr of Array.from(pricesByItem.values())) arr.sort((a, b) => (a.eff < b.eff ? -1 : 1));

  // In-memory segmented feed cost for one animal over [start, end), reusing the
  // same pure logic as the single-animal path so both views always agree.
  const segmentedFeedCost = (categoryId: number, startStr: string, endStr: string): number => {
    const plans = (plansByCategory.get(categoryId) ?? []).map(p => ({
      feedItemId: p.feedItemId,
      qtyPerHeadPerDay: p.qtyPerHeadPerDay,
      effectiveDate: String(p.effectiveDate).split("T")[0],
      endDate: p.endDate ? String(p.endDate).split("T")[0] : null,
      isActive: p.isActive
    }));
    return segmentedFeedCostPure(plans, pricesByItem, startStr, endStr);
  };

  // 7. Compute P&L per animal
  const results = [];
  for (const row of allAnimals) {
    const animal = row.animal;
    const acqDateStr = animal.acquisitionDate instanceof Date ? animal.acquisitionDate.toISOString().split("T")[0] : String(animal.acquisitionDate ?? today).split("T")[0];
    const exitDateStr = animal.exitDate ? (animal.exitDate instanceof Date ? animal.exitDate.toISOString().split("T")[0] : String(animal.exitDate).split("T")[0]) : today;
    const daysOnFarm = Math.max(1, Math.floor((new Date(exitDateStr).getTime() - new Date(acqDateStr).getTime()) / 86400000));

    const purchaseCostMinor = toMinor(animal.purchaseCost ?? "0");
    const directExpenseTotalMinor = directExpByAnimal.get(animal.id) ?? 0; // already minor

    const saleRow = saleByAnimal.get(animal.id);
    const revenueMinor = saleRow ? toMinor(saleRow.salePrice) : 0;
    const weightAtSale = saleRow ? parseFloat(saleRow.weightAtSale ?? "0") : 0;

    // Feed cost: time-segmented across ration-plan AND price changes (matches
    // getAnimalPnL). Reflects plan revisions and price inflation over the life.
    const feedCost = segmentedFeedCost(animal.categoryId, acqDateStr, exitDateStr);
    const feedCostMinor = toMinor(feedCost);

    // Category expense allocation: each expense divided by the head count that
    // overlapped THAT expense's window (animals acquired on/before the expense
    // and not yet exited), not today's total — so history stays stable.
    let categoryExpenseAllocationMinor = 0;
    const catExpenses = catExpByCatId.get(animal.categoryId) ?? [];
    const catAnimals = animalsByCategory.get(animal.categoryId) ?? [];
    for (const ce of catExpenses) {
      if (ce.date >= acqDateStr && ce.date <= exitDateStr) {
        const headsAtExpense = Math.max(1, catAnimals.filter(a => a.acq <= ce.date && (a.exit === null || a.exit >= ce.date)).length);
        categoryExpenseAllocationMinor += divMinor(ce.amount, headsAtExpense);
      }
    }

    const totalCostMinor = purchaseCostMinor + feedCostMinor + directExpenseTotalMinor + categoryExpenseAllocationMinor;
    const netPnLMinor = revenueMinor - totalCostMinor;

    const purchaseCost = toMajor(purchaseCostMinor);
    const directExpenseTotal = toMajor(directExpenseTotalMinor);
    const revenue = toMajor(revenueMinor);
    const totalCost = toMajor(totalCostMinor);
    const netPnL = toMajor(netPnLMinor);
    const costPerDay = daysOnFarm > 0 ? toMajor(divMinor(totalCostMinor, daysOnFarm)) : 0;
    const pricePerKg = weightAtSale > 0 ? toMajor(Math.round(revenueMinor / weightAtSale)) : 0;

    results.push({
      animalId: animal.id,
      animalCode: animal.animalId,
      categoryName: row.categoryName ?? "",
      speciesName: row.speciesName ?? "",
      isActive: animal.isActive,
      statusName: row.statusName ?? (animal.isActive ? "Active" : "Inactive"),
      daysOnFarm,
      purchaseCost,
      feedCost,
      directExpenseTotal,
      categoryExpenseAllocation: toMajor(categoryExpenseAllocationMinor),
      totalCost,
      revenue,
      netPnL,
      costPerDay,
      pricePerKg
    });
  }
  return results;
}

/**
 * Check if an animal should be auto-staged to another category based on its latest weight.
 * Called after every weight log entry. Returns the new categoryId if staged, null otherwise.
 */
export async function checkAndStageAnimal(animalId: number, currentWeightKg: number, changedBy?: number): Promise<{ staged: boolean; newCategoryId?: number; newAnimalId?: string }> {
  const db = await getDb();
  if (!db) return { staged: false };

  const animal = await getAnimalById(animalId);
  if (!animal) return { staged: false };

  // Get current category's auto-stage config
  const [catRow] = await db
    .select({
      autoStageWeightKg: animalCategories.autoStageWeightKg,
      autoStageTargetCategoryId: animalCategories.autoStageTargetCategoryId
    })
    .from(animalCategories)
    .where(eq(animalCategories.id, animal.animal.categoryId))
    .limit(1);

  if (!catRow?.autoStageWeightKg || !catRow?.autoStageTargetCategoryId) return { staged: false };

  const threshold = parseFloat(catRow.autoStageWeightKg);
  if (currentWeightKg < threshold) return { staged: false };

  // Get target category
  const [targetCat] = await db
    .select({
      id: animalCategories.id,
      idPrefix: animalCategories.idPrefix,
      idSequence: animalCategories.idSequence
    })
    .from(animalCategories)
    .where(eq(animalCategories.id, catRow.autoStageTargetCategoryId))
    .limit(1);

  if (!targetCat) return { staged: false };

  // Generate new animal ID in target category
  const newSeq = await incrementCategorySequence(targetCat.id);
  const newAnimalId = `${targetCat.idPrefix}${String(newSeq).padStart(4, "0")}`;

  // Update the animal — change category and update animalId
  await db
    .update(animals)
    .set({
      categoryId: targetCat.id,
      animalId: newAnimalId,
      updatedAt: new Date()
    })
    .where(eq(animals.id, animalId));

  // Record status history as a note
  await createAuditEntry({
    userId: changedBy,
    action: "update",
    entityType: "animal",
    entityId: String(animalId),
    oldValues: {
      categoryId: animal.animal.categoryId,
      animalId: animal.animal.animalId
    } as any,
    newValues: {
      categoryId: targetCat.id,
      animalId: newAnimalId,
      autoStagedAtWeightKg: currentWeightKg
    } as any
  });

  return { staged: true, newCategoryId: targetCat.id, newAnimalId };
}

export async function getDashboardKPIs(filters?: { fromDate?: string; toDate?: string; speciesId?: number; categoryId?: number; groupId?: number }) {
  const db = await getDb();
  if (!db) return null;

  const today = new Date().toISOString().split("T")[0];
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const fromDate = filters?.fromDate ?? twelveMonthsAgo.toISOString().split("T")[0];
  const toDate = filters?.toDate ?? today;

  // Active head count (exclude soft-deleted)
  const headConditions = [eq(animals.isActive, true), isNull(animals.deletedAt)];
  if (filters?.speciesId) headConditions.push(eq(animals.speciesId, filters.speciesId));
  if (filters?.categoryId) headConditions.push(eq(animals.categoryId, filters.categoryId));
  if (filters?.groupId) headConditions.push(eq(animals.groupId, filters.groupId));

  const headCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(animals)
    .where(and(...headConditions));

  // Total other expenses in period (vet, labour, vaccine etc — NOT feed)
  const totalOtherExpenses = await db
    .select({ total: sql<number>`SUM(amount)` })
    .from(expenses)
    .where(and(sql`${expenses.expenseDate} >= ${fromDate}`, sql`${expenses.expenseDate} <= ${toDate}`, isNull(expenses.deletedAt)));

  // Feed purchases in period (from feed_stock_ledger, matching Income Statement logic)
  const feedPurchasesInPeriod = await db
    .select({ total: sql<number>`SUM(totalCost)` })
    .from(feedStockLedger)
    .where(and(eq(feedStockLedger.transactionType, "purchase"), sql`${feedStockLedger.transactionDate} >= ${fromDate}`, sql`${feedStockLedger.transactionDate} <= ${toDate}`, isNull(feedStockLedger.deletedAt)));

  // Total sales revenue in period
  const totalRevenue = await db
    .select({ total: sql<number>`SUM(salePrice)` })
    .from(sales)
    .where(and(sql`${sales.saleDate} >= ${fromDate}`, sql`${sales.saleDate} <= ${toDate}`, isNull(sales.deletedAt)));

  // Category breakdown (active animals only)
  const categoryBreakdown = await db
    .select({
      categoryId: animals.categoryId,
      categoryName: animalCategories.name,
      headCount: sql<number>`COUNT(*)`
    })
    .from(animals)
    .leftJoin(animalCategories, eq(animals.categoryId, animalCategories.id))
    .where(and(...headConditions))
    .groupBy(animals.categoryId, animalCategories.name);

  const otherExpensesMinor = toMinor(String(totalOtherExpenses[0]?.total ?? 0));
  const feedExpensesMinor = toMinor(String(feedPurchasesInPeriod[0]?.total ?? 0));
  const totalExpensesMinor = otherExpensesMinor + feedExpensesMinor;
  const revenueMinor = toMinor(String(totalRevenue[0]?.total ?? 0));
  const activeHeads = Number(headCount[0]?.count ?? 0);

  const otherExpenses = toMajor(otherExpensesMinor);
  const feedExpenses = toMajor(feedExpensesMinor);
  const totalExpenses = toMajor(totalExpensesMinor);
  const revenueNum = toMajor(revenueMinor);

  // Cost per head per day (Excel's primary daily metric)
  const periodDays = Math.max(1, Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86400000));
  const costPerHeadPerDay = activeHeads > 0 && periodDays > 0 ? toMajor(divMinor(totalExpensesMinor, activeHeads * periodDays)) : 0;

  return {
    totalActiveHeads: activeHeads,
    otherExpenses,
    feedExpenses,
    totalExpenses,
    totalRevenue: revenueNum,
    grossPnL: toMajor(revenueMinor - totalExpensesMinor),
    costPerHeadPerDay,
    categoryBreakdown,
    period: { fromDate, toDate }
  };
}

/** Calculate feed consumed by doomed/exited animals between their exit date and today.
 *  "Doomed stock" = feed already issued/consumed for animals that have since exited
 *  (status isExitStatus=true, exitDate set). Used to show true remaining stock.
 */
export async function getDoomedFeedConsumption(): Promise<Record<number, number>> {
  const db = await getDb();
  if (!db) return {};

  const today = new Date().toISOString().split("T")[0];

  // Animals that exited within the last 90 days (recently doomed)
  const recentlyExited = await db
    .select({
      categoryId: animals.categoryId,
      exitDate: animals.exitDate,
      acquisitionDate: animals.acquisitionDate
    })
    .from(animals)
    .where(and(eq(animals.isActive, false), isNotNull(animals.exitDate), isNull(animals.deletedAt), sql`${animals.exitDate} >= DATE_SUB(${today}, INTERVAL 90 DAY)`));

  if (recentlyExited.length === 0) return {};

  // Get all active ration plans
  const allPlans = await db
    .select({
      feedItemId: rationPlans.feedItemId,
      categoryId: rationPlans.categoryId,
      qty: rationPlans.qtyPerHeadPerDay
    })
    .from(rationPlans)
    .where(and(eq(rationPlans.isActive, true), isNull(rationPlans.deletedAt)));

  // For each recently-exited animal, compute how many days of feed were consumed
  const feedConsumed: Record<number, number> = {};
  for (const animal of recentlyExited) {
    if (!animal.exitDate) continue;
    const exitDateStr = animal.exitDate instanceof Date ? animal.exitDate.toISOString().split("T")[0] : String(animal.exitDate).split("T")[0];
    const acqDateStr = animal.acquisitionDate instanceof Date ? animal.acquisitionDate.toISOString().split("T")[0] : String(animal.acquisitionDate).split("T")[0];

    const exitMs = new Date(exitDateStr).getTime();
    const todayMs = new Date(today).getTime();
    // Days the animal was consuming feed but is now gone (excess allocated stock)
    const daysAfterExit = Math.max(0, Math.floor((todayMs - exitMs) / 86400000));
    if (daysAfterExit === 0) continue;

    const plansForCategory = allPlans.filter(p => p.categoryId === animal.categoryId);
    for (const plan of plansForCategory) {
      const qty = parseFloat(plan.qty) * daysAfterExit;
      feedConsumed[plan.feedItemId] = (feedConsumed[plan.feedItemId] ?? 0) + qty;
    }
  }

  return feedConsumed;
}

export async function getFeedStockStatus() {
  const db = await getDb();
  if (!db) return [];

  const allFeedItems = await getAllFeedItems();
  const headCounts = await getActiveHeadCountByCategory();
  const doomedConsumed = await getDoomedFeedConsumption();
  const result = [];

  for (const item of allFeedItems) {
    // Last stock count
    const lastCount = await db
      .select({
        qty: feedStockLedger.qty,
        transactionDate: feedStockLedger.transactionDate
      })
      .from(feedStockLedger)
      .where(and(eq(feedStockLedger.feedItemId, item.id), eq(feedStockLedger.transactionType, "stock_count"), isNull(feedStockLedger.deletedAt)))
      .orderBy(desc(feedStockLedger.transactionDate))
      .limit(1);

    const lastCountDate = lastCount[0]?.transactionDate ?? "2020-01-01";
    const lastCountQty = parseFloat(lastCount[0]?.qty ?? "0");

    // Purchases since last count (excluding soft-deleted)
    const purchases = await db
      .select({ total: sql<number>`SUM(qty)` })
      .from(feedStockLedger)
      .where(and(eq(feedStockLedger.feedItemId, item.id), eq(feedStockLedger.transactionType, "purchase"), isNull(feedStockLedger.deletedAt), sql`${feedStockLedger.transactionDate} >= ${lastCountDate}`));
    const purchasedQty = parseFloat(String(purchases[0]?.total ?? 0));

    // Adjustments since last count
    const adjustments = await db
      .select({ total: sql<number>`SUM(qty)` })
      .from(feedStockLedger)
      .where(and(eq(feedStockLedger.feedItemId, item.id), eq(feedStockLedger.transactionType, "adjustment"), isNull(feedStockLedger.deletedAt), sql`${feedStockLedger.transactionDate} >= ${lastCountDate}`));
    const adjustmentQty = parseFloat(String(adjustments[0]?.total ?? 0));

    // Daily consumption from ration plans (using fresh head counts)
    const plans = await db
      .select({
        qty: rationPlans.qtyPerHeadPerDay,
        categoryId: rationPlans.categoryId
      })
      .from(rationPlans)
      .where(and(eq(rationPlans.feedItemId, item.id), eq(rationPlans.isActive, true), isNull(rationPlans.deletedAt)));

    let dailyConsumption = 0;
    const consumptionByCategory: Array<{
      categoryId: number;
      categoryDailyKg: number;
      heads: number;
    }> = [];
    for (const plan of plans) {
      const heads = headCounts[plan.categoryId] ?? 0;
      const categoryDailyKg = parseFloat(plan.qty) * heads;
      dailyConsumption += categoryDailyKg;
      if (heads > 0) {
        consumptionByCategory.push({
          categoryId: plan.categoryId,
          categoryDailyKg,
          heads
        });
      }
    }

    // Doomed stock: feed that was allocated for now-exited animals
    const doomedKg = doomedConsumed[item.id] ?? 0;

    // Excel formula: StockToday = LastCountQty + PurchSinceCount + Adjustments - (DailyUse × daysSinceCount)
    const lastCountDateStr = lastCount[0]?.transactionDate ? (lastCount[0].transactionDate instanceof Date ? lastCount[0].transactionDate.toISOString().split("T")[0] : String(lastCount[0].transactionDate).split("T")[0]) : "2020-01-01";
    const today = new Date().toISOString().split("T")[0];
    const daysSinceCount = Math.max(0, Math.floor((new Date(today).getTime() - new Date(lastCountDateStr).getTime()) / 86400000));
    const consumedSinceCount = dailyConsumption * daysSinceCount;

    const stockOnHand = Math.max(0, lastCountQty + purchasedQty + adjustmentQty - consumedSinceCount);
    const adjustedStock = Math.max(0, stockOnHand - doomedKg);
    const daysRemaining = dailyConsumption > 0 ? Math.floor(adjustedStock / dailyConsumption) : 999;
    const runOutDate = dailyConsumption > 0 ? new Date(Date.now() + daysRemaining * 86400000).toISOString().split("T")[0] : null;

    result.push({
      feedItemId: item.id,
      feedItemName: item.name,
      unit: item.unit,
      stockOnHand,
      adjustedStock,
      doomedKg: Math.round(doomedKg * 100) / 100,
      consumedSinceCount: Math.round(consumedSinceCount * 100) / 100,
      daysSinceCount,
      lastCountDate: lastCountDateStr,
      dailyConsumption,
      consumptionByCategory,
      daysRemaining,
      runOutDate,
      status: daysRemaining <= 3 ? "critical" : daysRemaining <= 7 ? "low" : "ok"
    });
  }

  return result;
}

export async function getIncomeStatement(filters: { fromDate: string; toDate: string; speciesId?: number; categoryId?: number }) {
  const db = await getDb();
  if (!db) return null;

  // Revenue: animal sales (exclude soft-deleted)
  const salesData = await db
    .select({ total: sql<number>`SUM(salePrice)` })
    .from(sales)
    .where(and(sql`${sales.saleDate} >= ${filters.fromDate}`, sql`${sales.saleDate} <= ${filters.toDate}`, isNull(sales.deletedAt)));

  // Animal purchase costs (exclude soft-deleted)
  const purchaseCosts = await db
    .select({ total: sql<number>`SUM(purchaseCost)` })
    .from(animals)
    .where(and(sql`${animals.acquisitionDate} >= ${filters.fromDate}`, sql`${animals.acquisitionDate} <= ${filters.toDate}`, isNull(animals.deletedAt)));

  // Expenses by category (exclude soft-deleted)
  const expensesByCategory = await db
    .select({
      categoryName: expenseCategories.name,
      total: sql<number>`SUM(${expenses.amount})`
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(and(sql`${expenses.expenseDate} >= ${filters.fromDate}`, sql`${expenses.expenseDate} <= ${filters.toDate}`, isNull(expenses.deletedAt)))
    .groupBy(expenseCategories.name);

  // Feed stock purchases in period (exclude soft-deleted)
  const feedPurchases = await db
    .select({ total: sql<number>`SUM(totalCost)` })
    .from(feedStockLedger)
    .where(and(eq(feedStockLedger.transactionType, "purchase"), sql`${feedStockLedger.transactionDate} >= ${filters.fromDate}`, sql`${feedStockLedger.transactionDate} <= ${filters.toDate}`, isNull(feedStockLedger.deletedAt)));
  const totalFeedCostMinor = toMinor(String(feedPurchases[0]?.total ?? 0));
  const totalRevenueMinor = toMinor(String(salesData[0]?.total ?? 0));
  const totalAnimalCostMinor = toMinor(String(purchaseCosts[0]?.total ?? 0));
  const totalOtherCostMinor = expensesByCategory.reduce((sum, e) => sum + toMinor(String(e.total ?? 0)), 0);
  const totalCostMinor = totalAnimalCostMinor + totalFeedCostMinor + totalOtherCostMinor;
  const grossProfitMinor = totalRevenueMinor - totalCostMinor;

  const totalFeedCost = toMajor(totalFeedCostMinor);
  const totalRevenue = toMajor(totalRevenueMinor);
  const totalAnimalCost = toMajor(totalAnimalCostMinor);
  const totalOtherCost = toMajor(totalOtherCostMinor);
  const totalCost = toMajor(totalCostMinor);
  const grossProfit = toMajor(grossProfitMinor);
  return {
    period: { fromDate: filters.fromDate, toDate: filters.toDate },
    revenue: { animalSales: totalRevenue, total: totalRevenue },
    costs: {
      animalPurchases: totalAnimalCost,
      feedPurchases: totalFeedCost,
      byCategory: expensesByCategory,
      totalOther: totalOtherCost,
      total: totalCost
    },
    grossProfit,
    profitMargin: totalRevenueMinor > 0 ? Math.round((grossProfitMinor / totalRevenueMinor) * 10000) / 100 : 0
  };
}
