import { and, desc, eq, inArray, isNotNull, isNull, or, sql, lte, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { toMinor, toMajor, divMinor } from "./_core/money";
import { animalCategories, animalStatusHistory, animalStatuses, animals, auditLog, birthTypes, expenseCategories, expenseSubCategories, expenses, feedItemPriceHistory, feedItems, feedStockLedger, groups, InsertUser, lambingLog, notifications, owners, rationPlans, sales, species, systemSettings, users, vaccines, vaccinationRecords, weightLog } from "../drizzle/schema";
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

/** Fetch a single status row (used to verify isExitStatus on exits). */
export async function getStatusById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(animalStatuses).where(eq(animalStatuses.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Fetch one lambing record by id, optionally inside a transaction. Used by
 * promoteLamb to re-read inside the transaction so the isPromoted check
 * cannot race against another concurrent promotion of the same lamb.
 */
export async function getLambingRecordById(id: number, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) return null;
  const rows = await db.select().from(lambingLog).where(eq(lambingLog.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Fetch one animal row (no joins), inside or outside a tx. */
export async function getRawAnimalById(id: number, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) return null;
  const rows = await db.select().from(animals).where(eq(animals.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Fetch many animals + joins in ONE query (avoids N+1 in bulk ops). */
export async function getAnimalsByIds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  return db
    .select({
      animal: animals,
      speciesName: species.name,
      categoryName: animalCategories.name,
      categoryPrefix: animalCategories.idPrefix,
      groupCode: groups.groupCode,
      groupName: groups.name,
      statusName: animalStatuses.name,
      isExitStatus: animalStatuses.isExitStatus,
      ownerName: owners.name,
    })
    .from(animals)
    .leftJoin(species, eq(animals.speciesId, species.id))
    .leftJoin(animalCategories, eq(animals.categoryId, animalCategories.id))
    .leftJoin(groups, eq(animals.groupId, groups.id))
    .leftJoin(animalStatuses, eq(animals.statusId, animalStatuses.id))
    .leftJoin(owners, eq(animals.ownerId, owners.id))
    .where(inArray(animals.id, ids));
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

export async function createGroup(data: { groupCode: string; name: string; speciesId?: number; categoryId?: number; description?: string; latitude?: string | null; longitude?: string | null }) {
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

// ─── OWNERS ───────────────────────────────────────────────────────────────────

export async function getAllOwners(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  const where = activeOnly
    ? and(isNull(owners.deletedAt), eq(owners.isActive, true))
    : isNull(owners.deletedAt);
  return db.select().from(owners).where(where).orderBy(owners.name);
}

export async function createOwner(data: { name: string; phone?: string; email?: string; notes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(owners).values(data);
  return result;
}

export async function updateOwner(id: number, data: Partial<typeof owners.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(owners).set(data).where(eq(owners.id, id));
}

export async function deleteOwner(id: number, deletedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(owners)
    .set({ deletedAt: new Date(), deletedBy: deletedBy ?? null, isActive: false })
    .where(eq(owners.id, id));
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
  const items = await db.select().from(feedItems).where(isNull(feedItems.deletedAt)).orderBy(feedItems.name);
  if (items.length === 0) return [];

  // Latest price per feed item — fetch all price rows once, reduce to the
  // newest per item in JS (robust, no fragile correlated subquery).
  const allPrices = await db
    .select({
      feedItemId: feedItemPriceHistory.feedItemId,
      pricePerUnit: feedItemPriceHistory.pricePerUnit,
      effectiveDate: feedItemPriceHistory.effectiveDate,
      id: feedItemPriceHistory.id,
    })
    .from(feedItemPriceHistory);

  const latestByItem = new Map<number, { price: string; eff: string; id: number }>();
  for (const p of allPrices) {
    const eff = p.effectiveDate instanceof Date ? p.effectiveDate.toISOString().split("T")[0] : String(p.effectiveDate).split("T")[0];
    const cur = latestByItem.get(p.feedItemId);
    // newest by effective date, then by id (latest write wins on same date)
    if (!cur || eff > cur.eff || (eff === cur.eff && p.id > cur.id)) {
      latestByItem.set(p.feedItemId, { price: p.pricePerUnit, eff, id: p.id });
    }
  }

  return items.map((it) => ({
    ...it,
    currentPrice: latestByItem.get(it.id)?.price ?? null,
  }));
}

export async function createFeedItem(data: { name: string; unit?: string; initialPrice?: string; priceEffectiveDate?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(feedItems).values({ name: data.name, unit: data.unit });
  const feedItemId = (result as any).insertId;
  // Seed an initial price-history row so feed cost isn't zero until a price is
  // added separately. Without at least one price, segmented feed costing can't
  // value the ration plan.
  if (feedItemId && data.initialPrice != null && data.initialPrice !== "" && parseFloat(data.initialPrice) > 0) {
    await db.insert(feedItemPriceHistory).values({
      feedItemId,
      effectiveDate: (data.priceEffectiveDate ?? new Date().toISOString().split("T")[0]) as any,
      pricePerUnit: data.initialPrice,
    });
  }
  return result;
}

/** Latest price for a feed item (for display in the feed items list). */
export async function getCurrentFeedItemPrice(feedItemId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ pricePerUnit: feedItemPriceHistory.pricePerUnit })
    .from(feedItemPriceHistory)
    .where(eq(feedItemPriceHistory.feedItemId, feedItemId))
    .orderBy(desc(feedItemPriceHistory.effectiveDate))
    .limit(1);
  return rows.length > 0 ? rows[0].pricePerUnit : null;
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
  const effDate = data.effectiveDate.split("T")[0]; // normalize to YYYY-MM-DD
  // If a price already exists for this item on the same effective date,
  // update it in place instead of stacking a duplicate row.
  const existing = await db
    .select({ id: feedItemPriceHistory.id })
    .from(feedItemPriceHistory)
    .where(and(
      eq(feedItemPriceHistory.feedItemId, data.feedItemId),
      eq(feedItemPriceHistory.effectiveDate, effDate as any)
    ))
    .limit(1);
  if (existing.length > 0) {
    await db.update(feedItemPriceHistory)
      .set({ pricePerUnit: data.pricePerUnit, notes: data.notes })
      .where(eq(feedItemPriceHistory.id, existing[0].id));
    return existing[0];
  }
  const [result] = await db.insert(feedItemPriceHistory).values({
    feedItemId: data.feedItemId,
    effectiveDate: effDate as any,
    pricePerUnit: data.pricePerUnit,
    notes: data.notes
  });
  return result;
}

/** All price-history rows across every feed item, newest first, with the feed item name. */
export async function getAllFeedItemPrices() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: feedItemPriceHistory.id,
      feedItemId: feedItemPriceHistory.feedItemId,
      feedItemName: feedItems.name,
      unit: feedItems.unit,
      pricePerUnit: feedItemPriceHistory.pricePerUnit,
      effectiveDate: feedItemPriceHistory.effectiveDate,
      notes: feedItemPriceHistory.notes,
      createdAt: feedItemPriceHistory.createdAt,
    })
    .from(feedItemPriceHistory)
    .leftJoin(feedItems, eq(feedItemPriceHistory.feedItemId, feedItems.id))
    .orderBy(desc(feedItemPriceHistory.effectiveDate), desc(feedItemPriceHistory.id));
}

export async function updateFeedItemPrice(
  id: number,
  data: Partial<{ effectiveDate: string; pricePerUnit: string; notes: string | null }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const set: Record<string, unknown> = {};
  if (data.pricePerUnit != null) set.pricePerUnit = data.pricePerUnit;
  if (data.notes !== undefined) set.notes = data.notes;
  if (data.effectiveDate) set.effectiveDate = data.effectiveDate.split("T")[0] as any;
  await db.update(feedItemPriceHistory).set(set).where(eq(feedItemPriceHistory.id, id));
}

/** Hard delete — this table has no soft-delete column. */
export async function deleteFeedItemPrice(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(feedItemPriceHistory).where(eq(feedItemPriceHistory.id, id));
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

export async function getAnimals(filters?: { speciesId?: number; categoryId?: number; groupId?: number; statusId?: number; ownerId?: number; acquisitionType?: string; isActive?: boolean; search?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [];
  conditions.push(isNull(animals.deletedAt));
  if (filters?.speciesId) conditions.push(eq(animals.speciesId, filters.speciesId));
  if (filters?.categoryId) conditions.push(eq(animals.categoryId, filters.categoryId));
  if (filters?.groupId) conditions.push(eq(animals.groupId, filters.groupId));
  if (filters?.statusId) conditions.push(eq(animals.statusId, filters.statusId));
  if (filters?.ownerId) conditions.push(eq(animals.ownerId, filters.ownerId));
  if (filters?.acquisitionType) conditions.push(eq(animals.acquisitionType, filters.acquisitionType as "purchased" | "born"));
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
      ownerName: owners.name,
      latestWeightKg: sql<string | null>`(
        SELECT wl.weightKg FROM weight_log wl
        WHERE wl.animalId = ${animals.id} AND wl.deletedAt IS NULL
        ORDER BY wl.weighDate DESC LIMIT 1
      )`,
      nextVaccineDate: sql<string | null>`(
        SELECT vr.nextDueDate FROM vaccination_records vr
        WHERE vr.animalId = ${animals.id} AND vr.deletedAt IS NULL AND vr.isCompleted = false AND vr.nextDueDate IS NOT NULL
        ORDER BY vr.nextDueDate ASC LIMIT 1
      )`,
      nextVaccineName: sql<string | null>`(
        SELECT v.name FROM vaccination_records vr
        INNER JOIN vaccines v ON vr.vaccineId = v.id
        WHERE vr.animalId = ${animals.id} AND vr.deletedAt IS NULL AND vr.isCompleted = false AND vr.nextDueDate IS NOT NULL
        ORDER BY vr.nextDueDate ASC LIMIT 1
      )`
    })
    .from(animals)
    .leftJoin(species, eq(animals.speciesId, species.id))
    .leftJoin(animalCategories, eq(animals.categoryId, animalCategories.id))
    .leftJoin(groups, eq(animals.groupId, groups.id))
    .leftJoin(animalStatuses, eq(animals.statusId, animalStatuses.id))
    .leftJoin(owners, eq(animals.ownerId, owners.id));

  if (conditions.length > 0) {
    return query.where(and(...conditions)).orderBy(desc(animals.acquisitionDate));
  }
  return query.orderBy(desc(animals.acquisitionDate));
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
      ownerName: owners.name,
      nextVaccineDate: sql<string | null>`(
        SELECT vr.nextDueDate FROM vaccination_records vr
        WHERE vr.animalId = ${animals.id} AND vr.deletedAt IS NULL AND vr.isCompleted = false AND vr.nextDueDate IS NOT NULL
        ORDER BY vr.nextDueDate ASC LIMIT 1
      )`,
      nextVaccineName: sql<string | null>`(
        SELECT v.name FROM vaccination_records vr
        INNER JOIN vaccines v ON vr.vaccineId = v.id
        WHERE vr.animalId = ${animals.id} AND vr.deletedAt IS NULL AND vr.isCompleted = false AND vr.nextDueDate IS NOT NULL
        ORDER BY vr.nextDueDate ASC LIMIT 1
      )`
    })
    .from(animals)
    .leftJoin(species, eq(animals.speciesId, species.id))
    .leftJoin(animalCategories, eq(animals.categoryId, animalCategories.id))
    .leftJoin(groups, eq(animals.groupId, groups.id))
    .leftJoin(animalStatuses, eq(animals.statusId, animalStatuses.id))
    .leftJoin(owners, eq(animals.ownerId, owners.id))
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

export async function getSales(filters?: { animalId?: number; fromDate?: string; toDate?: string; ownerId?: number; outstandingOnly?: boolean; buyer?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.animalId) conditions.push(eq(sales.animalId, filters.animalId));
  if (filters?.fromDate) conditions.push(sql`${sales.saleDate} >= ${filters.fromDate}`);
  if (filters?.toDate) conditions.push(sql`${sales.saleDate} <= ${filters.toDate}`);
  if (filters?.ownerId) conditions.push(eq(animals.ownerId, filters.ownerId));
  if (filters?.buyer) conditions.push(sql`${sales.buyerName} LIKE ${'%' + filters.buyer + '%'}`);
  if (filters?.outstandingOnly) conditions.push(sql`(${sales.salePrice} - ${sales.amountPaid}) > 0`);
  const query = db
    .select({
      sale: sales,
      animalCode: animals.animalId,
      speciesName: species.name,
      categoryName: animalCategories.name,
      ownerName: owners.name,
      outstanding: sql<string>`(${sales.salePrice} - ${sales.amountPaid})`,
    })
    .from(sales)
    .leftJoin(animals, eq(sales.animalId, animals.id))
    .leftJoin(species, eq(animals.speciesId, species.id))
    .leftJoin(animalCategories, eq(animals.categoryId, animalCategories.id))
    .leftJoin(owners, eq(animals.ownerId, owners.id));
  conditions.push(isNull(sales.deletedAt));
  return query.where(and(...conditions)).orderBy(desc(sales.saleDate));
}

export async function createSale(data: typeof sales.$inferInsert, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(sales).values(data);
  return result;
}

/** Single sale row (P2 perf: replaces load-all-then-find patterns). */
export async function getSaleById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(sales).where(and(eq(sales.id, id), isNull(sales.deletedAt))).limit(1);
  return rows[0] ?? null;
}

/** Single expense row (P2 perf: replaces load-all-then-find patterns). */
export async function getExpenseById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(expenses).where(and(eq(expenses.id, id), isNull(expenses.deletedAt))).limit(1);
  return rows[0] ?? null;
}
export async function updateSale(
  id: number,
  data: Partial<{
    animalId: number;
    salePrice: string;
    amountPaid: string;
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
      valueUsed: lambingLog.valueUsed,
      groupId: lambingLog.groupId,
      notes: lambingLog.notes,
      isPromoted: lambingLog.isPromoted,
      promotedHeadId: lambingLog.promotedHeadId,
      createdAt: lambingLog.createdAt,
      birthTypeName: birthTypes.name,
      groupCode: groups.groupCode,
      damAnimalId: sql<string>`(SELECT a.animalId FROM animals a WHERE a.id = ${lambingLog.damId})`,
      sireAnimalId: sql<string>`(SELECT a.animalId FROM animals a WHERE a.id = ${lambingLog.sireId})`
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

/** Fetch one weight-log row (for validation before delete). */
export async function getWeightEntryById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(weightLog).where(and(eq(weightLog.id, id), isNull(weightLog.deletedAt))).limit(1);
  return rows[0] ?? null;
}

/** Soft-delete a weight-log entry. */
export async function softDeleteWeightEntry(id: number, deletedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(weightLog)
    .set({ deletedAt: new Date(), deletedBy: deletedBy ?? null })
    .where(eq(weightLog.id, id));
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
      categoryName: animalCategories.name,
      currentPrice: sql<string | null>`(
        SELECT ph.pricePerUnit FROM feed_item_price_history ph
        WHERE ph.feedItemId = ${rationPlans.feedItemId}
        ORDER BY ph.effectiveDate DESC, ph.id DESC LIMIT 1
      )`
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
 * Build the price-by-item map used for segmented feed costing, collapsing any
 * duplicate rows that share the same (feedItemId, effectiveDate) to the one
 * with the highest id (the latest-entered correction). Without this, a stray
 * duplicate price for a day (e.g. a fat-finger 16000 alongside the real 16)
 * could be the one applied, massively inflating feed cost. Result arrays are
 * sorted ascending by effective date, as segmentedFeedCostPure expects.
 */
export function buildPricesByItem(
  rows: Array<{ feedItemId: number; effectiveDate: Date | string; pricePerUnit: string; id: number }>
): Map<number, Array<{ eff: string; price: number }>> {
  // feedItemId -> (eff -> { price, id }), keeping the highest id per eff.
  const byItem = new Map<number, Map<string, { price: number; id: number }>>();
  for (const pr of rows) {
    const eff = pr.effectiveDate instanceof Date ? pr.effectiveDate.toISOString().split("T")[0] : String(pr.effectiveDate).split("T")[0];
    if (!byItem.has(pr.feedItemId)) byItem.set(pr.feedItemId, new Map());
    const perEff = byItem.get(pr.feedItemId)!;
    const cur = perEff.get(eff);
    if (!cur || pr.id > cur.id) perEff.set(eff, { price: parseFloat(pr.pricePerUnit), id: pr.id });
  }
  const out = new Map<number, Array<{ eff: string; price: number }>>();
  for (const [itemId, perEff] of Array.from(byItem.entries())) {
    const arr = Array.from(perEff.entries()).map(([eff, v]) => ({ eff, price: v.price }));
    arr.sort((a, b) => (a.eff < b.eff ? -1 : 1));
    out.set(itemId, arr);
  }
  return out;
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
    if (!arr || arr.length === 0) return 0;
    let price = 0;
    let found = false;
    for (const r of arr) {
      if (r.eff <= dateStr) { price = r.price; found = true; }
      else break;
    }
    // If the date is BEFORE the first recorded price, fall back to the
    // earliest known price rather than 0 — otherwise an animal acquired
    // before the first price entry shows zero feed cost for its whole life.
    // arr is sorted ascending by effective date.
    if (!found) price = arr[0].price;
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
  // Earliest-effective active plan per feed item — used as a fallback when a
  // segment predates the plan's effectiveDate (e.g. plan entered after the
  // animal was acquired), so feed cost isn't falsely zero for early days.
  let totalMinor = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segDays = Math.round((sorted[i + 1] - segStart) / 86400000);
    if (segDays <= 0) continue;
    const segStartStr = new Date(segStart).toISOString().split("T")[0];
    // Plans whose window covers this segment.
    let segPlans = active.filter(p => p.effectiveDate <= segStartStr && (!p.endDate || p.endDate >= segStartStr));
    // Fallback: if no plan is effective yet at this (early) segment, use the
    // active plans that have the earliest effective date — the best estimate
    // of what the animal was being fed before the plan was formally recorded.
    if (segPlans.length === 0 && active.length > 0) {
      const earliestEff = active.reduce((min, p) => (p.effectiveDate < min ? p.effectiveDate : min), active[0].effectiveDate);
      segPlans = active.filter(p => p.effectiveDate === earliestEff && (!p.endDate || p.endDate >= segStartStr));
    }
    // Collapse to ONE plan per feed item: a category may hold several
    // overlapping active plans for the same feed item (e.g. a new ration was
    // added without end-dating the old one). The latest-effective plan
    // supersedes the others — summing them all would multiply feed cost.
    // Different feed items still each contribute once.
    const latestPerItem = new Map<number, (typeof segPlans)[number]>();
    for (const p of segPlans) {
      const cur = latestPerItem.get(p.feedItemId);
      if (!cur || p.effectiveDate > cur.effectiveDate) latestPerItem.set(p.feedItemId, p);
    }
    for (const p of Array.from(latestPerItem.values())) {
      // price is money → minor units; qty and days are plain multipliers.
      const priceMinor = Math.round(priceOnDate(p.feedItemId, segStartStr) * 100);
      totalMinor += Math.round(priceMinor * parseFloat(p.qtyPerHeadPerDay) * segDays);
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

  // Normalize to YYYY-MM-DD — guard against Date objects or locale strings
  // accidentally passed as startDate/endDate (e.g. "Fri Nov 01 2025...").
  const normalizeDate = (d: string): string => {
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.split("T")[0];
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) throw new Error(`computeFeedCostForPeriod: invalid date "${d}"`);
    return parsed.toISOString().split("T")[0];
  };
  const start = new Date(normalizeDate(startDate));
  const end = new Date(normalizeDate(endDate));
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
    effectiveDate: p.effectiveDate instanceof Date ? p.effectiveDate.toISOString().split("T")[0] : String(p.effectiveDate).split("T")[0],
    endDate: p.endDate ? (p.endDate instanceof Date ? p.endDate.toISOString().split("T")[0] : String(p.endDate).split("T")[0]) : null,
    isActive: true
  }));
  const pricesMap = buildPricesByItem(priceRows);

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

/**
 * Total herd head count alive on a specific date — animals acquired on/before
 * the date and not exited before it. Used to split "herd" (animal-wide)
 * expenses equally across the whole farm on the expense date.
 */
export async function getHerdHeadCountOnDate(dateStr: string): Promise<number> {
  const db = await getDb();
  if (!db) return 1;
  const d = dateStr.split("T")[0];
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(animals)
    .where(and(isNull(animals.deletedAt), sql`${animals.acquisitionDate} <= ${d}`, or(isNull(animals.exitDate), sql`${animals.exitDate} >= ${d}`)));
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

export async function getExpenses(filters?: { fromDate?: string; toDate?: string; categoryId?: number; targetType?: "general" | "category" | "head" | "herd"; headId?: number; ownerId?: number; vendor?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.fromDate) conditions.push(sql`${expenses.expenseDate} >= ${filters.fromDate}`);
  if (filters?.toDate) conditions.push(sql`${expenses.expenseDate} <= ${filters.toDate}`);
  if (filters?.categoryId) conditions.push(eq(expenses.categoryId, filters.categoryId));
  if (filters?.targetType) conditions.push(eq(expenses.targetType, filters.targetType));
  if (filters?.headId) conditions.push(eq(expenses.headId, filters.headId));
  if (filters?.vendor) conditions.push(sql`${expenses.vendorName} LIKE ${'%' + filters.vendor + '%'}`);
  if (filters?.ownerId) {
    // An expense is "related to" an owner if (a) it's targeted at a head owned by them,
    // OR (b) it's targeted at a category in which the owner has at least one animal.
    const ownerId = filters.ownerId;
    conditions.push(sql`(
      (${expenses.targetType} = 'head'     AND ${expenses.headId} IN (SELECT id FROM animals WHERE ownerId = ${ownerId} AND deletedAt IS NULL))
      OR
      (${expenses.targetType} = 'category' AND ${expenses.categoryTarget} IN (SELECT DISTINCT categoryId FROM animals WHERE ownerId = ${ownerId} AND deletedAt IS NULL))
    )`);
  }
  const query = db
    .select({
      expense: expenses,
      categoryName: expenseCategories.name,
      subCategoryName: expenseSubCategories.name,
      animalCode: animals.animalId,
      animalOwnerId: animals.ownerId,
      ownerName: owners.name,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .leftJoin(expenseSubCategories, eq(expenses.subCategoryId, expenseSubCategories.id))
    .leftJoin(animals, eq(expenses.headId, animals.id))
    .leftJoin(owners, eq(animals.ownerId, owners.id));
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

  if (animalRows.length === 0) return null;
  const animal = animalRows[0].animal;
  const category = animalRows[0].category;

  const today = new Date().toISOString().split("T")[0];
  const exitDate = animal.exitDate
    ? (animal.exitDate instanceof Date ? animal.exitDate.toISOString().split("T")[0] : String(animal.exitDate).split("T")[0])
    : today;
  const acquisitionDate = animal.acquisitionDate instanceof Date
    ? animal.acquisitionDate.toISOString().split("T")[0]
    : String(animal.acquisitionDate).split("T")[0];

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
  let categoryExpenseAllocationMinor = 0;
  try {
    const catHeadCount = await getCategoryHeadCountDuring(animal.categoryId, acqDateStr, exitDateStr);
    categoryExpenseAllocationMinor = divMinor(catExpTotalMinor, catHeadCount);
  } catch (err) {
    console.error(`getAnimalPnL: category allocation failed for animal ${animalId}:`, err);
  }

  // Herd (animal-wide) expenses: each such expense in the animal's window is
  // split equally across all animals alive on the expense's date.
  let herdExpenseAllocationMinor = 0;
  try {
    const herdExpenseRows = await db
      .select({ amount: expenses.amount, expenseDate: expenses.expenseDate })
      .from(expenses)
      .where(and(eq(expenses.targetType, "herd"), isNull(expenses.deletedAt), sql`${expenses.expenseDate} >= ${acqDateStr}`, sql`${expenses.expenseDate} <= ${exitDateStr}`));
    for (const he of herdExpenseRows) {
      const dStr = he.expenseDate instanceof Date ? he.expenseDate.toISOString().split("T")[0] : String(he.expenseDate).split("T")[0];
      const herdCount = await getHerdHeadCountOnDate(dStr);
      herdExpenseAllocationMinor += divMinor(toMinor(String(he.amount)), herdCount);
    }
  } catch (err) {
    console.error(`getAnimalPnL: herd allocation failed for animal ${animalId}:`, err);
  }

  // Sale revenue (exclude soft-deleted sales)
  const saleRows = await db
    .select()
    .from(sales)
    .where(and(eq(sales.animalId, animalId), isNull(sales.deletedAt)))
    .limit(1);
  const revenueMinor = saleRows.length > 0 ? toMinor(saleRows[0].salePrice) : 0;
  const weightAtSale = saleRows.length > 0 ? parseFloat(saleRows[0].weightAtSale ?? "0") : 0;

  // Feed cost: time-segmented across ration-plan AND price changes over the
  // animal's life (not a single acquisition-date snapshot). Wrapped so a
  // failure here can't zero out the entire financial summary.
  let feedCost = 0;
  try {
    feedCost = await computeFeedCostForPeriod(animal.categoryId, acquisitionDate, exitDate);
  } catch (err) {
    console.error(`getAnimalPnL: feed cost failed for animal ${animalId}:`, err);
  }
  const feedCostMinor = toMinor(feedCost);

  const purchaseCostMinor = toMinor(String(animal.purchaseCost ?? "0"));
  // Operating cost = everything EXCEPT purchase cost. Computed by direct
  // addition (not totalCost - purchaseCost) so it's immune to purchaseCost
  // parsing issues.
  const operatingCostMinor = feedCostMinor + directExpenseTotalMinor + categoryExpenseAllocationMinor + herdExpenseAllocationMinor;
  const totalCostMinor = purchaseCostMinor + operatingCostMinor;
  const netPnLMinor = revenueMinor - totalCostMinor;

  const purchaseCost = toMajor(purchaseCostMinor);
  const directExpenseTotal = toMajor(directExpenseTotalMinor);
  const categoryExpenseAllocation = toMajor(categoryExpenseAllocationMinor);
  const herdExpenseAllocation = toMajor(herdExpenseAllocationMinor);
  const revenue = toMajor(revenueMinor);
  const totalCost = toMajor(totalCostMinor);
  const netPnL = toMajor(netPnLMinor);
  const costPerDay = daysOnFarm > 0 ? toMajor(divMinor(operatingCostMinor, daysOnFarm)) : 0;
  const costPerMonth = daysOnFarm > 0 ? toMajor(operatingCostMinor * 30 / daysOnFarm) : 0;
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
  if (animal.isActive && targetWeight > currentWeight && operatingCostMinor > 0 && daysOnFarm > 0) {
    const effectiveAdg = adg > 0 ? adg : 0.15;
    const daysToTarget = Math.ceil((targetWeight - currentWeight) / effectiveAdg);
    // cap projection horizon at 1 year to avoid runaway estimates
    const horizon = Math.min(daysToTarget, 365);
    const costPerDayMinor = divMinor(operatingCostMinor, daysOnFarm);
    projectedCost = toMajor(operatingCostMinor + costPerDayMinor * horizon);
  }

  return {
    animalId,
    daysOnFarm,
    purchaseCost,
    feedCost,
    directExpenseTotal,
    categoryExpenseAllocation,
    herdExpenseAllocation,
    totalCost,
    revenue,
    netPnL,
    costPerDay,
    costPerMonth,
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
export async function getAllAnimalsPnL(filters?: { speciesId?: number; categoryId?: number; ownerId?: number }) {
  const db = await getDb();
  if (!db) return [];

  const today = new Date().toISOString().split("T")[0];

  // 1. Fetch all animals with category + species + status names
  const conditions = [isNotNull(animals.id), isNull(animals.deletedAt)];
  if (filters?.speciesId) conditions.push(eq(animals.speciesId, filters.speciesId));
  if (filters?.categoryId) conditions.push(eq(animals.categoryId, filters.categoryId));
  if (filters?.ownerId) conditions.push(eq(animals.ownerId, filters.ownerId));

  const allAnimals = await db
    .select({
      animal: animals,
      categoryName: animalCategories.name,
      speciesName: species.name,
      statusName: animalStatuses.name,
      ownerName: owners.name
    })
    .from(animals)
    .leftJoin(animalCategories, eq(animals.categoryId, animalCategories.id))
    .leftJoin(species, eq(animals.speciesId, species.id))
    .leftJoin(animalStatuses, eq(animals.statusId, animalStatuses.id))
    .leftJoin(owners, eq(animals.ownerId, owners.id))
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

  // Herd (animal-wide) expenses: each split equally across all animals alive on
  // its date. Load them once and precompute the per-expense allocation in minor
  // units using an in-memory herd-count-on-date over allAnimals.
  const allHerdExp = await db
    .select({ amount: expenses.amount, expenseDate: expenses.expenseDate })
    .from(expenses)
    .where(and(eq(expenses.targetType, "herd"), isNull(expenses.deletedAt)));
  const allAnimalDates = allAnimals.map((r: any) => {
    const a = r.animal;
    const acq = a.acquisitionDate instanceof Date ? a.acquisitionDate.toISOString().split("T")[0] : String(a.acquisitionDate ?? today).split("T")[0];
    const exit = a.exitDate ? (a.exitDate instanceof Date ? a.exitDate.toISOString().split("T")[0] : String(a.exitDate).split("T")[0]) : null;
    return { acq, exit };
  });
  const herdCountOnDate = (dateStr: string) => Math.max(1, allAnimalDates.filter((a) => a.acq <= dateStr && (a.exit === null || a.exit >= dateStr)).length);
  // Pre-split each herd expense → { date, perHeadMinor } so each animal alive
  // that day picks up the same per-head share.
  const herdExpenseShares = allHerdExp.map((he: any) => {
    const dateStr = he.expenseDate instanceof Date ? he.expenseDate.toISOString().split("T")[0] : String(he.expenseDate).split("T")[0];
    return { date: dateStr, perHeadMinor: divMinor(toMinor(String(he.amount)), herdCountOnDate(dateStr)) };
  });

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
  const pricesByItem = buildPricesByItem(allPriceRows);

  // In-memory segmented feed cost for one animal over [start, end), reusing the
  // same pure logic as the single-animal path so both views always agree.
  const segmentedFeedCost = (categoryId: number, startStr: string, endStr: string): number => {
    const plans = (plansByCategory.get(categoryId) ?? []).map(p => ({
      feedItemId: p.feedItemId,
      qtyPerHeadPerDay: p.qtyPerHeadPerDay,
      effectiveDate: p.effectiveDate instanceof Date ? p.effectiveDate.toISOString().split("T")[0] : String(p.effectiveDate).split("T")[0],
      endDate: p.endDate ? (p.endDate instanceof Date ? p.endDate.toISOString().split("T")[0] : String(p.endDate).split("T")[0]) : null,
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

    const purchaseCostMinor = toMinor(String(animal.purchaseCost ?? "0"));
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

    // Herd (animal-wide) allocation: this animal's per-head share of each herd
    // expense that fell within its time on farm.
    let herdExpenseAllocationMinor = 0;
    for (const hs of herdExpenseShares) {
      if (hs.date >= acqDateStr && hs.date <= exitDateStr) {
        herdExpenseAllocationMinor += hs.perHeadMinor;
      }
    }

    // Operating cost = feed + direct + category + herd (NOT purchase cost).
    // Direct sum avoids any purchaseCost parsing issues.
    const operatingCostMinor = feedCostMinor + directExpenseTotalMinor + categoryExpenseAllocationMinor + herdExpenseAllocationMinor;
    const totalCostMinor = purchaseCostMinor + operatingCostMinor;
    const netPnLMinor = revenueMinor - totalCostMinor;

    const purchaseCost = toMajor(purchaseCostMinor);
    const directExpenseTotal = toMajor(directExpenseTotalMinor);
    const revenue = toMajor(revenueMinor);
    const totalCost = toMajor(totalCostMinor);
    const netPnL = toMajor(netPnLMinor);
    const costPerDay = daysOnFarm > 0 ? toMajor(divMinor(operatingCostMinor, daysOnFarm)) : 0;
    const costPerMonth = daysOnFarm > 0 ? toMajor(operatingCostMinor * 30 / daysOnFarm) : 0;
    const pricePerKg = weightAtSale > 0 ? toMajor(Math.round(revenueMinor / weightAtSale)) : 0;

    results.push({
      animalId: animal.id,
      animalCode: animal.animalId,
      categoryName: row.categoryName ?? "",
      speciesName: row.speciesName ?? "",
      ownerName: row.ownerName ?? null,
      isActive: animal.isActive,
      statusName: row.statusName ?? (animal.isActive ? "Active" : "Inactive"),
      daysOnFarm,
      purchaseCost,
      feedCost,
      directExpenseTotal,
      categoryExpenseAllocation: toMajor(categoryExpenseAllocationMinor),
      herdExpenseAllocation: toMajor(herdExpenseAllocationMinor),
      totalCost,
      revenue,
      netPnL,
      costPerDay,
      costPerMonth,
      pricePerKg
    });
  }
  return results;
}

/**
 * Check if an animal should be auto-staged to another category based on its latest weight.
 * Called after every weight log entry. Returns the new categoryId if staged.
 *
 * IMPORTANT (F5): the animal KEEPS its lifetime animalId code. Changing the
 * display code on promotion broke historical references (audit entries,
 * expense notes, exported reports all pointed at a code that no longer
 * existed). Identity is for life; the category change alone is recorded.
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

  // Confirm target category exists
  const [targetCat] = await db
    .select({ id: animalCategories.id })
    .from(animalCategories)
    .where(eq(animalCategories.id, catRow.autoStageTargetCategoryId))
    .limit(1);

  if (!targetCat) return { staged: false };

  // F6: category change + audit entry are atomic.
  await db.transaction(async (tx) => {
    await tx
      .update(animals)
      .set({
        categoryId: targetCat.id,
        updatedAt: new Date()
      })
      .where(eq(animals.id, animalId));

    await createAuditEntry({
      userId: changedBy,
      action: "auto_stage",
      entityType: "animal",
      entityId: String(animalId),
      oldValues: {
        categoryId: animal.animal.categoryId,
      } as any,
      newValues: {
        categoryId: targetCat.id,
        autoStagedAtWeightKg: currentWeightKg
      } as any
    }, tx);
  });

  return { staged: true, newCategoryId: targetCat.id, newAnimalId: animal.animal.animalId };
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

  // Total sales revenue in period — F9: track BOTH accrued (salePrice) and
  // cash actually received (amountPaid) so the dashboard can show outstanding.
  const totalRevenue = await db
    .select({
      total: sql<number>`SUM(salePrice)`,
      paid: sql<number>`SUM(amountPaid)`,
    })
    .from(sales)
    .where(and(sql`${sales.saleDate} >= ${fromDate}`, sql`${sales.saleDate} <= ${toDate}`, isNull(sales.deletedAt)));

  // B3: AVERAGE head count over the period (not today's count). An animal
  // contributes the fraction of the period it was actually on the farm:
  // overlapDays(animal, period) summed across animals / periodDays.
  const periodDaysForAvg = Math.max(1, Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86400000));
  const avgHeadRows = await db
    .select({
      totalHeadDays: sql<number>`SUM(
        GREATEST(0, DATEDIFF(
          LEAST(COALESCE(exitDate, ${toDate}), ${toDate}),
          GREATEST(acquisitionDate, ${fromDate})
        ) + 1)
      )`,
    })
    .from(animals)
    .where(and(
      isNull(animals.deletedAt),
      sql`${animals.acquisitionDate} <= ${toDate}`,
      sql`(${animals.exitDate} IS NULL OR ${animals.exitDate} >= ${fromDate})`,
    ));
  const totalHeadDays = Number(avgHeadRows[0]?.totalHeadDays ?? 0);
  const avgHeads = totalHeadDays / periodDaysForAvg;

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
  const cashReceivedMinor = toMinor(String(totalRevenue[0]?.paid ?? 0));
  const outstandingMinor = revenueMinor - cashReceivedMinor;
  const activeHeads = Number(headCount[0]?.count ?? 0);

  const otherExpenses = toMajor(otherExpensesMinor);
  const feedExpenses = toMajor(feedExpensesMinor);
  const totalExpenses = toMajor(totalExpensesMinor);
  const revenueNum = toMajor(revenueMinor);

  // Cost per head per day (Excel's primary daily metric) — B3: divide by the
  // AVERAGE headcount over the period so selling animals mid-period doesn't
  // inflate the metric. totalHeadDays is exactly Σ(days each head was present).
  const costPerHeadPerDay = totalHeadDays > 0 ? toMajor(divMinor(totalExpensesMinor, totalHeadDays)) : 0;

  return {
    totalActiveHeads: activeHeads,
    averageHeads: Math.round(avgHeads * 10) / 10,
    otherExpenses,
    feedExpenses,
    totalExpenses,
    totalRevenue: revenueNum,
    cashReceived: toMajor(cashReceivedMinor),
    outstandingReceivables: toMajor(outstandingMinor),
    grossPnL: toMajor(revenueMinor - totalExpensesMinor),
    costPerHeadPerDay,
    categoryBreakdown,
    period: { fromDate, toDate }
  };
}

export async function getFeedStockStatus() {
  const db = await getDb();
  if (!db) return [];

  const allFeedItems = await getAllFeedItems();
  const headCounts = await getActiveHeadCountByCategory();
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

    // Excel formula: StockToday = LastCountQty + PurchSinceCount + Adjustments - (DailyUse × daysSinceCount)
    const lastCountDateStr = lastCount[0]?.transactionDate ? (lastCount[0].transactionDate instanceof Date ? lastCount[0].transactionDate.toISOString().split("T")[0] : String(lastCount[0].transactionDate).split("T")[0]) : "2020-01-01";
    const today = new Date().toISOString().split("T")[0];
    const daysSinceCount = Math.max(0, Math.floor((new Date(today).getTime() - new Date(lastCountDateStr).getTime()) / 86400000));
    const consumedSinceCount = dailyConsumption * daysSinceCount;

    const stockOnHand = Math.max(0, lastCountQty + purchasedQty + adjustmentQty - consumedSinceCount);
    const daysRemaining = dailyConsumption > 0 ? Math.floor(stockOnHand / dailyConsumption) : 999;
    const runOutDate = dailyConsumption > 0 ? new Date(Date.now() + daysRemaining * 86400000).toISOString().split("T")[0] : null;

    result.push({
      feedItemId: item.id,
      feedItemName: item.name,
      unit: item.unit,
      stockOnHand,
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

/**
 * Feed shrinkage = stock lost/wasted: the gap between the stock the system
 * EXPECTED at a stock count and the quantity actually counted.
 *
 *   expectedAtCount = previousCountQty + purchasesBetween + adjustmentsBetween
 *                     − rationConsumptionBetween
 *   shrinkage       = expectedAtCount − actualCountedQty   (positive = loss)
 *
 * Computed per consecutive pair of stock_count rows for each feed item.
 * Returns the rows plus, per feed item, the most recent shrinkage (for the
 * stock table) and a monthly roll-up (for statistics).
 */
async function computeRationConsumptionBetween(
  feedItemId: number,
  startStr: string,
  endStr: string
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const days = Math.max(0, Math.floor((new Date(endStr).getTime() - new Date(startStr).getTime()) / 86400000));
  if (days === 0) return 0;
  // Active plans for this feed item, with the head count over the window.
  const plans = await db
    .select({ qty: rationPlans.qtyPerHeadPerDay, categoryId: rationPlans.categoryId })
    .from(rationPlans)
    .where(and(eq(rationPlans.feedItemId, feedItemId), eq(rationPlans.isActive, true), isNull(rationPlans.deletedAt)));
  let total = 0;
  for (const p of plans) {
    const heads = await getCategoryHeadCountDuring(p.categoryId, startStr, endStr);
    total += parseFloat(p.qty) * heads * days;
  }
  return total;
}

export interface ShrinkageRow {
  feedItemId: number;
  feedItemName: string;
  unit: string;
  fromDate: string;
  toDate: string;
  expectedQty: number;
  actualQty: number;
  shrinkageQty: number;   // positive = lost/wasted
  shrinkageValue: number; // EGP, using the item's current price
}

export async function getFeedShrinkage(): Promise<{
  rows: ShrinkageRow[];
  byItemLatest: Record<number, { shrinkageQty: number; shrinkageValue: number; toDate: string } | undefined>;
  byMonth: Array<{ month: string; shrinkageQty: number; shrinkageValue: number }>;
}> {
  const db = await getDb();
  if (!db) return { rows: [], byItemLatest: {}, byMonth: [] };

  const items = await getAllFeedItems();
  const rows: ShrinkageRow[] = [];
  const byItemLatest: Record<number, { shrinkageQty: number; shrinkageValue: number; toDate: string } | undefined> = {};

  const ds = (d: any) => (d instanceof Date ? d.toISOString().split("T")[0] : String(d).split("T")[0]);

  for (const item of items) {
    const price = item.currentPrice != null ? parseFloat(item.currentPrice) : 0;

    // All stock counts for this item, oldest → newest.
    const counts = await db
      .select({ qty: feedStockLedger.qty, transactionDate: feedStockLedger.transactionDate })
      .from(feedStockLedger)
      .where(and(eq(feedStockLedger.feedItemId, item.id), eq(feedStockLedger.transactionType, "stock_count"), isNull(feedStockLedger.deletedAt)))
      .orderBy(feedStockLedger.transactionDate);

    if (counts.length === 0) continue;

    // Earliest ledger transaction date for this item — the anchor when there's
    // no prior stock count (e.g. a purchase happened before the first count).
    const firstTxn = await db
      .select({ transactionDate: feedStockLedger.transactionDate })
      .from(feedStockLedger)
      .where(and(eq(feedStockLedger.feedItemId, item.id), isNull(feedStockLedger.deletedAt)))
      .orderBy(feedStockLedger.transactionDate)
      .limit(1);
    const firstTxnDate = firstTxn.length > 0 ? ds(firstTxn[0].transactionDate) : null;

    for (let i = 0; i < counts.length; i++) {
      const toDate = ds(counts[i].transactionDate);
      const actualQty = parseFloat(counts[i].qty);

      let fromDate: string;
      let startQty: number;
      let purchaseLowerExclusive: boolean; // whether to exclude the boundary purchase

      if (i === 0) {
        // First count: anchor at the earliest transaction (qty 0), and count
        // ALL purchases up to and including the count date. This lets a single
        // stock count preceded by purchases still measure shrinkage.
        if (!firstTxnDate || firstTxnDate >= toDate) {
          // No prior purchases to establish a baseline → can't measure yet.
          continue;
        }
        fromDate = firstTxnDate;
        startQty = 0;
        purchaseLowerExclusive = false; // include purchases ON the first day
      } else {
        // Subsequent counts: anchor at the previous count.
        fromDate = ds(counts[i - 1].transactionDate);
        startQty = parseFloat(counts[i - 1].qty);
        purchaseLowerExclusive = true; // exclude the prior count's own day
      }

      // Purchases + adjustments in (fromDate, toDate] (or [fromDate, toDate]
      // for the first-count case).
      const lowerBound = purchaseLowerExclusive
        ? sql`${feedStockLedger.transactionDate} > ${fromDate}`
        : sql`${feedStockLedger.transactionDate} >= ${fromDate}`;
      const pa = await db
        .select({
          purchases: sql<number>`SUM(CASE WHEN ${feedStockLedger.transactionType} = 'purchase' THEN ${feedStockLedger.qty} ELSE 0 END)`,
          adjustments: sql<number>`SUM(CASE WHEN ${feedStockLedger.transactionType} = 'adjustment' THEN ${feedStockLedger.qty} ELSE 0 END)`,
        })
        .from(feedStockLedger)
        .where(and(
          eq(feedStockLedger.feedItemId, item.id),
          isNull(feedStockLedger.deletedAt),
          lowerBound,
          sql`${feedStockLedger.transactionDate} <= ${toDate}`,
        ));
      const purchases = parseFloat(String(pa[0]?.purchases ?? 0));
      const adjustments = parseFloat(String(pa[0]?.adjustments ?? 0));

      const consumption = await computeRationConsumptionBetween(item.id, fromDate, toDate);
      const expectedQty = startQty + purchases + adjustments - consumption;
      const shrinkageQty = Math.round((expectedQty - actualQty) * 1000) / 1000;
      const shrinkageValue = Math.round(shrinkageQty * price * 100) / 100;

      const row: ShrinkageRow = {
        feedItemId: item.id,
        feedItemName: item.name,
        unit: item.unit,
        fromDate,
        toDate,
        expectedQty: Math.round(expectedQty * 1000) / 1000,
        actualQty,
        shrinkageQty,
        shrinkageValue,
      };
      rows.push(row);
      byItemLatest[item.id] = { shrinkageQty, shrinkageValue, toDate };
    }
  }

  // Monthly roll-up keyed by the closing count's month (YYYY-MM).
  const monthMap = new Map<string, { qty: number; value: number }>();
  for (const r of rows) {
    const month = r.toDate.slice(0, 7);
    const cur = monthMap.get(month) ?? { qty: 0, value: 0 };
    cur.qty += r.shrinkageQty;
    cur.value += r.shrinkageValue;
    monthMap.set(month, cur);
  }
  const byMonth = Array.from(monthMap.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, v]) => ({
      month,
      shrinkageQty: Math.round(v.qty * 1000) / 1000,
      shrinkageValue: Math.round(v.value * 100) / 100,
    }));

  return { rows, byItemLatest, byMonth };
}

export async function getIncomeStatement(filters: { fromDate: string; toDate: string; speciesId?: number; categoryId?: number; ownerId?: number }) {
  const db = await getDb();
  if (!db) return null;

  // When scoped to an owner, restrict sales + animal purchases + head/category
  // expenses to that owner's animals. Farm-wide (general) costs and feed are
  // NOT owner-specific, so they're only included in the unscoped (whole-farm)
  // statement.
  const ownerId = filters.ownerId;
  const ownedAnimalIds: number[] = ownerId
    ? (await db.select({ id: animals.id }).from(animals).where(and(eq(animals.ownerId, ownerId), isNull(animals.deletedAt)))).map((r) => r.id)
    : [];
  const ownerSalesCond = ownerId
    ? (ownedAnimalIds.length > 0 ? inArray(sales.animalId, ownedAnimalIds) : sql`1 = 0`)
    : sql`1 = 1`;

  // Revenue: animal sales (exclude soft-deleted). F9: capture both accrued
  // (salePrice) and cash actually received (amountPaid).
  const salesData = await db
    .select({
      total: sql<number>`SUM(salePrice)`,
      paid: sql<number>`SUM(amountPaid)`,
    })
    .from(sales)
    .where(and(sql`${sales.saleDate} >= ${filters.fromDate}`, sql`${sales.saleDate} <= ${filters.toDate}`, isNull(sales.deletedAt), ownerSalesCond));

  // Animal purchase costs (exclude soft-deleted)
  const purchaseCosts = await db
    .select({ total: sql<number>`SUM(purchaseCost)` })
    .from(animals)
    .where(and(
      sql`${animals.acquisitionDate} >= ${filters.fromDate}`,
      sql`${animals.acquisitionDate} <= ${filters.toDate}`,
      isNull(animals.deletedAt),
      ownerId ? eq(animals.ownerId, ownerId) : sql`1 = 1`,
    ));

  // Expenses by category (exclude soft-deleted). When owner-scoped, only
  // head/category expenses tied to that owner's animals count.
  const ownerCategoryIds: number[] = ownerId
    ? Array.from(new Set(
        (await db.select({ categoryId: animals.categoryId }).from(animals).where(and(eq(animals.ownerId, ownerId), isNull(animals.deletedAt)))).map((r) => r.categoryId)
      ))
    : [];
  const ownerExpenseConds: any[] = [];
  if (ownedAnimalIds.length > 0) ownerExpenseConds.push(inArray(expenses.headId, ownedAnimalIds));
  if (ownerCategoryIds.length > 0) ownerExpenseConds.push(inArray(expenses.categoryTarget, ownerCategoryIds));
  const ownerExpenseCond = ownerId
    ? (ownerExpenseConds.length > 0 ? or(...ownerExpenseConds) : sql`1 = 0`)
    : sql`1 = 1`;
  const expensesByCategory = await db
    .select({
      categoryName: expenseCategories.name,
      total: sql<number>`SUM(${expenses.amount})`
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(and(sql`${expenses.expenseDate} >= ${filters.fromDate}`, sql`${expenses.expenseDate} <= ${filters.toDate}`, isNull(expenses.deletedAt), ownerExpenseCond))
    .groupBy(expenseCategories.name);

  // Expenses split by allocation type, for the running-cost farm-wide vs
  // animal-wide breakdown. general = farm-wide; head/category/herd = animal-wide.
  const expensesByTarget = await db
    .select({
      targetType: expenses.targetType,
      total: sql<number>`SUM(${expenses.amount})`,
    })
    .from(expenses)
    .where(and(sql`${expenses.expenseDate} >= ${filters.fromDate}`, sql`${expenses.expenseDate} <= ${filters.toDate}`, isNull(expenses.deletedAt), ownerExpenseCond))
    .groupBy(expenses.targetType);
  const expByTarget: Record<string, number> = {};
  for (const r of expensesByTarget) expByTarget[r.targetType] = toMinor(String(r.total ?? 0));

  // Feed stock purchases in period (exclude soft-deleted). Feed is farm-wide.
  const feedPurchases = await db
    .select({ total: sql<number>`SUM(totalCost)` })
    .from(feedStockLedger)
    .where(and(eq(feedStockLedger.transactionType, "purchase"), sql`${feedStockLedger.transactionDate} >= ${filters.fromDate}`, sql`${feedStockLedger.transactionDate} <= ${filters.toDate}`, isNull(feedStockLedger.deletedAt)));
  const totalFeedCostMinor = ownerId ? 0 : toMinor(String(feedPurchases[0]?.total ?? 0));
  const totalRevenueMinor = toMinor(String(salesData[0]?.total ?? 0));
  const cashReceivedMinor = toMinor(String(salesData[0]?.paid ?? 0));
  const outstandingMinor = totalRevenueMinor - cashReceivedMinor;
  const totalAnimalCostMinor = toMinor(String(purchaseCosts[0]?.total ?? 0));
  const totalOtherCostMinor = expensesByCategory.reduce((sum, e) => sum + toMinor(String(e.total ?? 0)), 0);
  const totalCostMinor = totalAnimalCostMinor + totalFeedCostMinor + totalOtherCostMinor;
  const grossProfitMinor = totalRevenueMinor - totalCostMinor;

  // ── Running cost per month ────────────────────────────────────────────────
  // Operating cost only (excludes one-off animal purchases): farm-wide
  // (general expenses + feed) + animal-wide (head/category/herd expenses),
  // normalized to a month over the selected period.
  const farmWideGeneralMinor = expByTarget["general"] ?? 0;
  const farmWideOperatingMinor = farmWideGeneralMinor + totalFeedCostMinor;
  const animalWideOperatingMinor = (expByTarget["head"] ?? 0) + (expByTarget["category"] ?? 0) + (expByTarget["herd"] ?? 0);
  const totalOperatingMinor = farmWideOperatingMinor + animalWideOperatingMinor;

  const periodDays = Math.max(1, Math.round((new Date(filters.toDate).getTime() - new Date(filters.fromDate).getTime()) / 86400000) + 1);
  const months = periodDays / 30.4375; // average days per month
  const perMonth = (minor: number) => toMajor(Math.round(minor / months));

  const totalFeedCost = toMajor(totalFeedCostMinor);
  const totalRevenue = toMajor(totalRevenueMinor);
  const totalAnimalCost = toMajor(totalAnimalCostMinor);
  const totalOtherCost = toMajor(totalOtherCostMinor);
  const totalCost = toMajor(totalCostMinor);
  const grossProfit = toMajor(grossProfitMinor);
  return {
    period: { fromDate: filters.fromDate, toDate: filters.toDate },
    ownerId: ownerId ?? null,
    revenue: {
      animalSales: totalRevenue,
      total: totalRevenue,
      cashReceived: toMajor(cashReceivedMinor),
      outstandingReceivables: toMajor(outstandingMinor),
    },
    costs: {
      animalPurchases: totalAnimalCost,
      feedPurchases: totalFeedCost,
      byCategory: expensesByCategory,
      totalOther: totalOtherCost,
      total: totalCost
    },
    runningCostPerMonth: {
      farmWide: perMonth(farmWideOperatingMinor),
      animalWide: perMonth(animalWideOperatingMinor),
      total: perMonth(totalOperatingMinor),
      // also expose the raw period operating totals for transparency
      periodFarmWide: toMajor(farmWideOperatingMinor),
      periodAnimalWide: toMajor(animalWideOperatingMinor),
      periodTotal: toMajor(totalOperatingMinor),
      monthsInPeriod: Math.round(months * 100) / 100,
    },
    grossProfit,
    profitMargin: totalRevenueMinor > 0 ? Math.round((grossProfitMinor / totalRevenueMinor) * 10000) / 100 : 0
  };
}

// ─── VACCINE MANAGEMENT ─────────────────────────────────────────────────────────────

export async function getVaccines() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(vaccines).where(isNull(vaccines.deletedAt)).orderBy(vaccines.name);
}

export async function addVaccine(data: { name: string; description?: string; validityPeriod: number; validityUnit: "days" | "months"; boosterRequired: boolean; boosterInterval?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(vaccines).values(data);
  return result;
}

export async function updateVaccine(id: number, data: { name?: string; description?: string; validityPeriod?: number; validityUnit?: "days" | "months"; boosterRequired?: boolean; boosterInterval?: number; isActive?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(vaccines).set(data).where(eq(vaccines.id, id));
}

export async function deleteVaccine(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(vaccines).set({ deletedAt: new Date() }).where(eq(vaccines.id, id));
}

export async function getVaccinationRecords(animalId?: number) {
  const db = await getDb();
  if (!db) return [];
  const query = db
    .select({
      id: vaccinationRecords.id,
      animalId: vaccinationRecords.animalId,
      animalIdStr: animals.animalId,
      vaccineId: vaccinationRecords.vaccineId,
      vaccineName: vaccines.name,
      vaccinationDate: vaccinationRecords.vaccinationDate,
      nextDueDate: vaccinationRecords.nextDueDate,
      batchNumber: vaccinationRecords.batchNumber,
      notes: vaccinationRecords.notes,
      veterinarian: vaccinationRecords.veterinarian,
      isCompleted: vaccinationRecords.isCompleted,
      createdAt: vaccinationRecords.createdAt,
    })
    .from(vaccinationRecords)
    .innerJoin(vaccines, eq(vaccinationRecords.vaccineId, vaccines.id))
    .innerJoin(animals, eq(vaccinationRecords.animalId, animals.id))
    .where(isNull(vaccinationRecords.deletedAt))
    .orderBy(vaccinationRecords.vaccinationDate);
  
  if (animalId) {
    query.where(eq(vaccinationRecords.animalId, animalId));
  }
  
  return await query;
}

export async function addVaccinationRecord(data: { animalId: number; vaccineId: number; vaccinationDate: string; batchNumber?: string; notes?: string; veterinarian?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  
  // Get vaccine config to calculate next due date
  const vaccine = await db.select().from(vaccines).where(eq(vaccines.id, data.vaccineId)).limit(1);
  if (!vaccine.length) throw new Error("Vaccine not found");
  
  const nextDueDate = calculateNextDueDate(vaccine[0], data.vaccinationDate);
  
  const [result] = await db.insert(vaccinationRecords).values({
    ...data,
    nextDueDate,
  });
  return result;
}

export async function updateVaccinationRecord(id: number, data: { vaccinationDate?: string; batchNumber?: string; notes?: string; veterinarian?: string; isCompleted?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  
  let nextDueDate: string | undefined;
  if (data.vaccinationDate) {
    const record = await db.select({ vaccineId: vaccinationRecords.vaccineId }).from(vaccinationRecords).where(eq(vaccinationRecords.id, id)).limit(1);
    if (record.length) {
      const vaccine = await db.select().from(vaccines).where(eq(vaccines.id, record[0].vaccineId)).limit(1);
      if (vaccine.length) {
        nextDueDate = calculateNextDueDate(vaccine[0], data.vaccinationDate);
      }
    }
  }
  
  await db.update(vaccinationRecords).set({ ...data, nextDueDate }).where(eq(vaccinationRecords.id, id));
}

export async function deleteVaccinationRecord(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(vaccinationRecords).set({ deletedAt: new Date() }).where(eq(vaccinationRecords.id, id));
}

export function calculateNextDueDate(vaccine: { validityPeriod: number; validityUnit: "days" | "months"; boosterRequired: boolean; boosterInterval?: number }, lastDate: string): string {
  const date = new Date(lastDate);
  const daysToAdd = vaccine.validityUnit === "months" ? vaccine.validityPeriod * 30 : vaccine.validityPeriod;
  date.setDate(date.getDate() + daysToAdd);
  return date.toISOString().split("T")[0];
}

export function getVaccinationStatus(record: { nextDueDate: Date | string | null; isCompleted: boolean }): "completed" | "overdue" | "due" | "upcoming" {
  if (record.isCompleted) return "completed";
  if (!record.nextDueDate) return "upcoming";
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(record.nextDueDate instanceof Date ? record.nextDueDate.toISOString() : record.nextDueDate);
  dueDate.setHours(0, 0, 0, 0);
  
  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
  
  if (diffDays < 0) return "overdue";
  if (diffDays <= 7) return "due";
  return "upcoming";
}

export async function getUpcomingVaccinations(days: number = 30) {
  const db = await getDb();
  if (!db) return [];
  
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  
  return await db
    .select({
      id: vaccinationRecords.id,
      animalId: vaccinationRecords.animalId,
      animalIdStr: animals.animalId,
      vaccineName: vaccines.name,
      nextDueDate: vaccinationRecords.nextDueDate,
      isCompleted: vaccinationRecords.isCompleted,
    })
    .from(vaccinationRecords)
    .innerJoin(vaccines, eq(vaccinationRecords.vaccineId, vaccines.id))
    .innerJoin(animals, eq(vaccinationRecords.animalId, animals.id))
    .where(
      and(
        isNull(vaccinationRecords.deletedAt),
        eq(vaccinationRecords.isCompleted, false),
        sql`${vaccinationRecords.nextDueDate} <= ${cutoff.toISOString().split("T")[0]}`
      )
    )
    .orderBy(vaccinationRecords.nextDueDate);
}

export async function getVaccinationCompliance() {
  const db = await getDb();
  if (!db) return [];
  
  const today = new Date().toISOString().split("T")[0];
  
  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(vaccinationRecords)
    .where(isNull(vaccinationRecords.deletedAt));
  
  const overdue = await db
    .select({ count: sql<number>`count(*)` })
    .from(vaccinationRecords)
    .where(
      and(
        isNull(vaccinationRecords.deletedAt),
        eq(vaccinationRecords.isCompleted, false),
        sql`${vaccinationRecords.nextDueDate} < ${today}`
      )
    );
  
  const completed = await db
    .select({ count: sql<number>`count(*)` })
    .from(vaccinationRecords)
    .where(
      and(
        isNull(vaccinationRecords.deletedAt),
        eq(vaccinationRecords.isCompleted, true)
      )
    );
  
  return {
    total: total[0]?.count ?? 0,
    overdue: overdue[0]?.count ?? 0,
    completed: completed[0]?.count ?? 0,
    complianceRate: total[0]?.count ? Math.round(((completed[0]?.count ?? 0) / total[0].count) * 100) : 100,
  };
}

export async function getNextVaccinationDate(animalId: number): Promise<{ nextDueDate: string | null; vaccineName: string | null } | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db
    .select({
      nextDueDate: vaccinationRecords.nextDueDate,
      vaccineName: vaccines.name,
    })
    .from(vaccinationRecords)
    .innerJoin(vaccines, eq(vaccinationRecords.vaccineId, vaccines.id))
    .where(
      and(
        eq(vaccinationRecords.animalId, animalId),
        isNull(vaccinationRecords.deletedAt),
        eq(vaccinationRecords.isCompleted, false),
        isNotNull(vaccinationRecords.nextDueDate)
      )
    )
    .orderBy(vaccinationRecords.nextDueDate)
    .limit(1);
  
  if (result.length === 0) return null;
  return { nextDueDate: result[0].nextDueDate, vaccineName: result[0].vaccineName };
}
