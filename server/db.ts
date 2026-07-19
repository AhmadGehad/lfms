import { AsyncLocalStorage } from "node:async_hooks";
import { and, desc, eq, inArray, isNotNull, isNull, or, sql, lte, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";
import { toMinor, toMajor, divMinor } from "./_core/money";
import { animalCategories, animalStatusHistory, animalStatuses, animals, auditLog, birthTypes, companyMemberships, expenseCategories, expenseSubCategories, expenses, feedItemPriceHistory, feedItems, feedStockLedger, groups, InsertUser, lambingLog, notificationReceipts, notifications, owners, pregnancyRecords, rationPlans, sales, species, systemSettings, userSettings, users, vaccines, vaccinationRecords, weightLog } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { generatePublicId } from "./tenancy/publicIds";
import { requireTenantUserContext } from "./tenancy/runtime";
import { tenantScope } from "./tenancy/scope";
import { assertWithinLimit, getEffectiveLimit, lockCompanyQuota } from "./entitlements/limits";
import { logger, redactLogFields } from "./observability/logger";
import { executeVersionedUpdate } from "./concurrency/versioning";
import { versionedTenantUpdateScope } from "./concurrency/tenantVersioning";

type LfmsDatabase = ReturnType<typeof drizzle<Record<string, never>, Pool>>;
type LfmsTransaction = Parameters<Parameters<LfmsDatabase["transaction"]>[0]>[0];
export type DbOrTx = LfmsDatabase | LfmsTransaction;

let _db: LfmsDatabase | null = null;
let _pool: Pool | null = null;
const transactionStorage = new AsyncLocalStorage<DbOrTx>();

function databasePoolOptions(value: string) {
  const url = new URL(value);
  const poolOptions = {
    uri: value,
    waitForConnections: true,
    connectionLimit: ENV.databasePoolConnectionLimit,
    queueLimit: ENV.databasePoolQueueLimit,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };
  const rawSsl = url.searchParams.get("ssl") ?? "";
  const ssl = rawSsl.toLowerCase();
  const sslMode = (url.searchParams.get("ssl-mode") ?? "").toUpperCase();
  // Managed platforms (TiDB Cloud via Manus) inject mysql2's JSON ssl profile:
  // ssl={"rejectUnauthorized":true}
  const jsonSslVerified = (() => {
    if (!rawSsl.startsWith("{")) return false;
    try {
      const profile = JSON.parse(rawSsl) as { rejectUnauthorized?: unknown };
      return profile.rejectUnauthorized !== false;
    } catch {
      return false;
    }
  })();
  const verifiedTlsRequested = ssl === "true" || ssl === "verify_identity" ||
    sslMode === "VERIFY_CA" || sslMode === "VERIFY_IDENTITY" || jsonSslVerified;
  if (ENV.isProduction && !verifiedTlsRequested) {
    throw new Error("DATABASE_URL must require verified TLS in production");
  }
  if (!verifiedTlsRequested) return poolOptions;

  // mysql2 does not implement MySQL's ssl-mode URI option and interprets
  // ssl=true as a boolean profile, which it rejects. Convert the validated URI
  // convention into an explicit TLS object with certificate/hostname checks.
  url.searchParams.delete("ssl");
  url.searchParams.delete("ssl-mode");
  return {
    ...poolOptions,
    uri: url.toString(),
    ssl: { rejectUnauthorized: true, verifyIdentity: true },
  };
}

export async function getDb(): Promise<DbOrTx | null> {
  const transaction = transactionStorage.getStore();
  if (transaction) return transaction;
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = createPool(databasePoolOptions(process.env.DATABASE_URL));
      _db = drizzle(_pool);
    } catch (error) {
      logger.warn("database.connection_initialization_failed", { error });
      _db = null;
    }
  }
  return _db;
}

export async function closeDatabasePool(): Promise<void> {
  const pool = _pool;
  _pool = null;
  _db = null;
  if (pool) await pool.end();
}

export function runWithDbTransaction<T>(transaction: DbOrTx, operation: () => T): T {
  return transactionStorage.run(transaction, operation);
}

/**
 * A database handle that is either the shared pool or an active transaction.
 * Write helpers accept an optional tx so multi-step flows can run atomically.
 */
type TenantCreateInput<T> = Omit<T, "publicId" | "companyId" | "farmId">;

function mutationAffectedOne(result: unknown): boolean {
  return Number((result as { affectedRows?: number } | undefined)?.affectedRows ?? 0) === 1;
}

function tenantInsert<T extends object>(data: T, farmScoped: true): T & {
  publicId: string;
  companyId: number;
  farmId: number;
};
function tenantInsert<T extends object>(data: T, farmScoped?: false): T & {
  publicId: string;
  companyId: number;
};
function tenantInsert<T extends object>(data: T, farmScoped = false) {
  const tenant = requireTenantUserContext();
  if (farmScoped && tenant.selectedFarmId === null) {
    throw new Error("FARM_SELECTION_REQUIRED");
  }
  return {
    ...data,
    publicId: generatePublicId(),
    companyId: tenant.companyId,
    ...(farmScoped ? { farmId: tenant.selectedFarmId as number } : {}),
  };
}

// ─── USER HELPERS ─────────────────────────────────────────────────────────────

type UpsertUserInput = Omit<InsertUser, "publicId"> & { publicId?: string };

export async function upsertUser(user: UpsertUserInput): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = {
    openId: user.openId,
    publicId: user.publicId ?? generatePublicId(),
  };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach(field => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });
  if (user.email !== undefined) {
    const normalizedEmail = user.email?.trim().toLowerCase() || null;
    values.normalizedEmail = normalizedEmail;
    updateSet.normalizedEmail = normalizedEmail;
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  // Always check if this is the owner first
  if (user.openId === ENV.ownerOpenId) {
    values.role = "owner";
    updateSet.role = "owner";
  } else if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else {
    // Default NEW users to viewer (insert only). CRITICAL: do NOT put role in
    // updateSet here — otherwise every session-refresh upsert (which carries
    // no role) would overwrite an existing user's real role with "viewer",
    // silently demoting them. Updates must leave the stored role untouched.
    values.role = "viewer";
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
  const tenant = requireTenantUserContext();
  return db
    .select({
      id: users.id,
      publicId: users.publicId,
      openId: users.openId,
      name: users.name,
      email: users.email,
      normalizedEmail: users.normalizedEmail,
      loginMethod: users.loginMethod,
      role: companyMemberships.role,
      status: users.status,
      authVersion: users.authVersion,
      failedLoginAttempts: users.failedLoginAttempts,
      lockedUntil: users.lockedUntil,
      lastPasswordChange: users.lastPasswordChange,
      version: companyMemberships.version,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(companyMemberships)
    .innerJoin(users, eq(companyMemberships.userId, users.id))
    .where(and(
      eq(companyMemberships.companyId, tenant.companyId),
      eq(companyMemberships.status, "active"),
    ))
    .orderBy(desc(users.createdAt));
}

export async function updateUserRole(
  userId: number,
  role: "owner" | "supervisor" | "staff" | "admin" | "user" | "viewer",
  expectedVersion: number,
  dbOrTx?: DbOrTx,
) {
  const db = dbOrTx ?? await getDb();
  if (!db) return;
  const tenant = requireTenantUserContext();
  const [result] = await db
    .update(companyMemberships)
    .set({
      role,
      authorizationVersion: sql`${companyMemberships.authorizationVersion} + 1`,
      version: sql`${companyMemberships.version} + 1`,
    })
    .where(and(
      eq(companyMemberships.companyId, tenant.companyId),
      eq(companyMemberships.userId, userId),
      eq(companyMemberships.status, "active"),
      eq(companyMemberships.version, expectedVersion),
    ));
  return Number((result as { affectedRows?: number }).affectedRows ?? 0);
}

// ─── SPECIES ──────────────────────────────────────────────────────────────────

export async function getAllSpecies() {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  return db.select().from(species).where(and(
    eq(species.companyId, tenant.companyId),
    isNull(species.deletedAt),
  )).orderBy(species.name);
}

export async function createSpecies(data: { name: string; description?: string; gestationDays?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(species).values(tenantInsert(data));
  return result;
}

export async function updateSpecies(id: number, data: Partial<{ name: string; description: string; isActive: boolean; gestationDays: number; readyToSellThreshold: number }>, expectedVersion: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.update(species).set({ ...data, version: sql`${species.version} + 1` }).where(and(
    eq(species.companyId, tenant.companyId),
    eq(species.id, id),
    eq(species.version, expectedVersion),
    isNull(species.deletedAt),
  ));
  return mutationAffectedOne(result);
}

// ─── ANIMAL CATEGORIES ────────────────────────────────────────────────────────

export async function getAllCategories(speciesId?: number) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();

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
      lambIdSequence: animalCategories.lambIdSequence,
      targetWeightKg: animalCategories.targetWeightKg,
      expectedCycleDays: animalCategories.expectedCycleDays,
      autoStageWeightKg: animalCategories.autoStageWeightKg,
      autoStageTargetCategoryId: animalCategories.autoStageTargetCategoryId,
      version: animalCategories.version,
      isExitStatus: animalCategories.isExitStatus,
      isActive: animalCategories.isActive,
      createdAt: animalCategories.createdAt
    })
    .from(animalCategories)
    .leftJoin(species, and(
      eq(animalCategories.speciesId, species.id),
      eq(species.companyId, tenant.companyId),
    ))
    .where(and(
      eq(animalCategories.companyId, tenant.companyId),
      isNull(animalCategories.deletedAt),
    ))
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
          lambIdSequence: animalCategories.lambIdSequence,
          targetWeightKg: animalCategories.targetWeightKg,
          expectedCycleDays: animalCategories.expectedCycleDays,
          autoStageWeightKg: animalCategories.autoStageWeightKg,
          autoStageTargetCategoryId: animalCategories.autoStageTargetCategoryId,
          version: animalCategories.version,
          isExitStatus: animalCategories.isExitStatus,
          isActive: animalCategories.isActive,
          createdAt: animalCategories.createdAt
        })
        .from(animalCategories)
        .leftJoin(species, and(
          eq(animalCategories.speciesId, species.id),
          eq(species.companyId, tenant.companyId),
        ))
        .where(and(
          eq(animalCategories.companyId, tenant.companyId),
          eq(animalCategories.speciesId, speciesId),
          isNull(animalCategories.deletedAt),
        ))
        .orderBy(animalCategories.name)
    : await baseQuery;

  return rows;
}

export async function createCategory(data: { name: string; speciesId: number; idPrefix: string; targetWeightKg?: string; expectedCycleDays?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(animalCategories).values(tenantInsert(data));
  return result;
}

export async function updateCategory(
  id: number,
  data: Partial<typeof animalCategories.$inferInsert>,
  expectedVersion: number,
  tx?: DbOrTx,
) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.update(animalCategories).set({ ...data, version: sql`${animalCategories.version} + 1` }).where(and(
    eq(animalCategories.companyId, tenant.companyId),
    eq(animalCategories.id, id),
    eq(animalCategories.version, expectedVersion),
    isNull(animalCategories.deletedAt),
  ));
  return mutationAffectedOne(result);
}

/** Lock one category while an ID is allocated or its prefix is changed. */
export async function getCategoryForUpdate(id: number, tx: DbOrTx) {
  const tenant = requireTenantUserContext();
  const rows = await tx
    .select()
    .from(animalCategories)
    .where(and(
      eq(animalCategories.companyId, tenant.companyId),
      eq(animalCategories.id, id),
    ))
    .limit(1)
    .for("update");
  return rows[0] ?? null;
}

/**
 * Includes active/deleted animals and all birth records because both ID
 * namespaces permanently depend on the category prefix.
 */
export async function categoryHasAnimals(categoryId: number, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) return false;
  const tenant = requireTenantUserContext();
  const animalRows = await db
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.companyId, tenant.companyId), eq(animals.categoryId, categoryId)))
    .limit(1);
  const birthRows = await db
    .select({ id: lambingLog.id })
    .from(lambingLog)
    .where(and(eq(lambingLog.companyId, tenant.companyId), eq(lambingLog.categoryId, categoryId)))
    .limit(1);
  return animalRows.length > 0 || birthRows.length > 0;
}

export async function incrementCategorySequence(categoryId: number, tx?: DbOrTx): Promise<number> {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  await db
    .update(animalCategories)
    .set({ idSequence: sql`${animalCategories.idSequence} + 1` })
    .where(and(eq(animalCategories.companyId, tenant.companyId), eq(animalCategories.id, categoryId)));
  const [cat] = await db
    .select({
      idSequence: animalCategories.idSequence,
      idPrefix: animalCategories.idPrefix
    })
    .from(animalCategories)
    .where(and(eq(animalCategories.companyId, tenant.companyId), eq(animalCategories.id, categoryId)));
  return cat?.idSequence ?? 1;
}

export async function ensureCategorySequenceAtLeast(
  categoryId: number,
  sequence: number,
  tx?: DbOrTx,
) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  await db
    .update(animalCategories)
    .set({
      idSequence: sql`GREATEST(${animalCategories.idSequence}, ${sequence})`,
    })
    .where(and(eq(animalCategories.companyId, tenant.companyId), eq(animalCategories.id, categoryId)));
}

export async function incrementCategoryLambSequence(
  categoryId: number,
  tx?: DbOrTx,
): Promise<number> {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  await db
    .update(animalCategories)
    .set({ lambIdSequence: sql`${animalCategories.lambIdSequence} + 1` })
    .where(and(eq(animalCategories.companyId, tenant.companyId), eq(animalCategories.id, categoryId)));
  const [cat] = await db
    .select({ lambIdSequence: animalCategories.lambIdSequence })
    .from(animalCategories)
    .where(and(eq(animalCategories.companyId, tenant.companyId), eq(animalCategories.id, categoryId)));
  return cat?.lambIdSequence ?? 1;
}

export async function ensureCategoryLambSequenceAtLeast(
  categoryId: number,
  sequence: number,
  tx?: DbOrTx,
) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  await db
    .update(animalCategories)
    .set({
      lambIdSequence: sql`GREATEST(${animalCategories.lambIdSequence}, ${sequence})`,
    })
    .where(and(eq(animalCategories.companyId, tenant.companyId), eq(animalCategories.id, categoryId)));
}

export async function getRawLambingByLambId(lambId: string, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) return null;
  const tenant = requireTenantUserContext();
  const rows = await db
    .select()
    .from(lambingLog)
    .where(and(eq(lambingLog.companyId, tenant.companyId), eq(lambingLog.lambId, lambId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function generateNextLambId(
  categoryId: number,
  prefix: string,
  tx?: DbOrTx,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sequence = await incrementCategoryLambSequence(categoryId, tx);
    const lambId = `${prefix}${String(sequence).padStart(4, "0")}`;
    if (!await getRawLambingByLambId(lambId, tx)) return lambId;
  }
  throw new Error("Could not allocate a unique lamb ID");
}

export async function generateNextAnimalId(
  categoryId: number,
  prefix: string,
  tx?: DbOrTx,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sequence = await incrementCategorySequence(categoryId, tx);
    const animalId = `${prefix}${String(sequence).padStart(4, "0")}`;
    if (!await getRawAnimalByAnimalId(animalId, tx)) return animalId;
  }
  throw new Error("Could not allocate a unique animal ID");
}

// ─── ANIMAL STATUSES ──────────────────────────────────────────────────────────

export async function getAllStatuses() {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  return db.select().from(animalStatuses).where(and(
    eq(animalStatuses.companyId, tenant.companyId),
    isNull(animalStatuses.deletedAt),
  )).orderBy(animalStatuses.name);
}

/** Fetch a single status row (used to verify isExitStatus on exits). */
export async function getStatusById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const tenant = requireTenantUserContext();
  const rows = await db.select().from(animalStatuses).where(and(
    eq(animalStatuses.companyId, tenant.companyId),
    eq(animalStatuses.id, id),
  )).limit(1);
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
  const tenant = requireTenantUserContext();
  const rows = await db.select().from(lambingLog).where(and(
    tenantScope(tenant, lambingLog),
    eq(lambingLog.id, id),
  )).limit(1);
  return rows[0] ?? null;
}

/** Lock one lambing row for a promotion transaction. */
export async function getLambingRecordForUpdate(id: number, tx: DbOrTx) {
  const tenant = requireTenantUserContext();
  const rows = await tx
    .select()
    .from(lambingLog)
    .where(and(tenantScope(tenant, lambingLog), eq(lambingLog.id, id)))
    .limit(1)
    .for("update");
  return rows[0] ?? null;
}

/** Fetch one animal row (no joins), inside or outside a tx. */
export async function getRawAnimalById(id: number, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) return null;
  const tenant = requireTenantUserContext();
  const rows = await db.select().from(animals).where(and(
    tenantScope(tenant, animals),
    eq(animals.id, id),
  )).limit(1);
  return rows[0] ?? null;
}

/** Lock one animal before an edit or automatic category transition. */
export async function getRawAnimalForUpdate(id: number, tx: DbOrTx) {
  const tenant = requireTenantUserContext();
  const rows = await tx
    .select()
    .from(animals)
    .where(and(tenantScope(tenant, animals), eq(animals.id, id)))
    .limit(1)
    .for("update");
  return rows[0] ?? null;
}

/** Fetch an animal by its exact registry ID, including soft-deleted rows. */
export async function getRawAnimalByAnimalId(animalId: string, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) return null;
  const tenant = requireTenantUserContext();
  const rows = await db.select().from(animals).where(and(
    eq(animals.companyId, tenant.companyId),
    eq(animals.animalId, animalId),
  )).limit(1);
  return rows[0] ?? null;
}

/** Fetch one owner including inactive and soft-deleted records. */
export async function getRawOwnerById(id: number, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) return null;
  const tenant = requireTenantUserContext();
  const rows = await db.select().from(owners).where(and(
    eq(owners.companyId, tenant.companyId),
    eq(owners.id, id),
  )).limit(1);
  return rows[0] ?? null;
}

/** Fetch many animals + joins in ONE query (avoids N+1 in bulk ops). */
export async function getAnimalsByIds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  const tenant = requireTenantUserContext();
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
    .leftJoin(species, and(eq(animals.speciesId, species.id), eq(species.companyId, tenant.companyId)))
    .leftJoin(animalCategories, and(eq(animals.categoryId, animalCategories.id), eq(animalCategories.companyId, tenant.companyId)))
    .leftJoin(groups, and(eq(animals.groupId, groups.id), eq(groups.companyId, tenant.companyId)))
    .leftJoin(animalStatuses, and(eq(animals.statusId, animalStatuses.id), eq(animalStatuses.companyId, tenant.companyId)))
    .leftJoin(owners, and(eq(animals.ownerId, owners.id), eq(owners.companyId, tenant.companyId)))
    .where(and(tenantScope(tenant, animals), inArray(animals.id, ids)));
}

export async function createStatus(data: { name: string; description?: string; isExitStatus?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(animalStatuses).values(tenantInsert(data));
  return result;
}

export async function updateStatus(id: number, data: Partial<typeof animalStatuses.$inferInsert>, expectedVersion: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.update(animalStatuses).set({ ...data, version: sql`${animalStatuses.version} + 1` }).where(and(
    eq(animalStatuses.companyId, tenant.companyId),
    eq(animalStatuses.id, id),
    eq(animalStatuses.version, expectedVersion),
    isNull(animalStatuses.deletedAt),
  ));
  return mutationAffectedOne(result);
}

// ─── GROUPS ───────────────────────────────────────────────────────────────────

export async function getAllGroups(speciesId?: number) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  if (speciesId) {
    return db
      .select()
      .from(groups)
      .where(and(
        tenantScope(tenant, groups),
        or(eq(groups.speciesId, speciesId), isNull(groups.speciesId)),
        isNull(groups.deletedAt),
      ));
  }
  return db.select().from(groups).where(and(
    tenantScope(tenant, groups),
    isNull(groups.deletedAt),
  )).orderBy(groups.groupCode);
}

export async function createGroup(data: {
  groupCode: string;
  name: string;
  speciesId?: number;
  categoryId?: number;
  description?: string;
  latitude?: string | null;
  longitude?: string | null;
  mapShape?: unknown;
  color?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(groups).values(tenantInsert(data, true));
  return result;
}

export async function updateGroup(id: number, data: Partial<typeof groups.$inferInsert>, expectedVersion: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.update(groups).set({ ...data, version: sql`${groups.version} + 1` }).where(and(
    tenantScope(tenant, groups),
    eq(groups.id, id),
    eq(groups.version, expectedVersion),
    isNull(groups.deletedAt),
  ));
  return mutationAffectedOne(result);
}

// ─── OWNERS ───────────────────────────────────────────────────────────────────

export async function getAllOwners(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  const where = activeOnly
    ? and(eq(owners.companyId, tenant.companyId), isNull(owners.deletedAt), eq(owners.isActive, true))
    : and(eq(owners.companyId, tenant.companyId), isNull(owners.deletedAt));
  return db.select().from(owners).where(where).orderBy(owners.name);
}

export async function createOwner(data: { name: string; phone?: string; email?: string; notes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(owners).values(tenantInsert(data));
  return result;
}

export async function updateOwner(id: number, data: Partial<typeof owners.$inferInsert>, expectedVersion: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.update(owners).set({ ...data, version: sql`${owners.version} + 1` }).where(and(
    eq(owners.companyId, tenant.companyId),
    eq(owners.id, id),
    eq(owners.version, expectedVersion),
    isNull(owners.deletedAt),
  ));
  return mutationAffectedOne(result);
}

export async function deleteOwner(id: number, expectedVersion: number, deletedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.update(owners)
    .set({ deletedAt: new Date(), deletedBy: deletedBy ?? null, isActive: false, version: sql`${owners.version} + 1` })
    .where(and(
      eq(owners.companyId, tenant.companyId),
      eq(owners.id, id),
      eq(owners.version, expectedVersion),
      isNull(owners.deletedAt),
    ));
  return mutationAffectedOne(result);
}

// ─── BIRTH TYPES ──────────────────────────────────────────────────────────────

export async function getAllBirthTypes() {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  return db.select().from(birthTypes).where(and(
    eq(birthTypes.companyId, tenant.companyId),
    isNull(birthTypes.deletedAt),
  )).orderBy(birthTypes.name);
}

export async function createBirthType(data: { name: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(birthTypes).values(tenantInsert(data));
  return result;
}
export async function updateBirthType(id: number, data: Partial<{ name: string; description: string; isActive: boolean }>, expectedVersion: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.update(birthTypes).set({ ...data, version: sql`${birthTypes.version} + 1` }).where(and(
    eq(birthTypes.companyId, tenant.companyId),
    eq(birthTypes.id, id),
    eq(birthTypes.version, expectedVersion),
    isNull(birthTypes.deletedAt),
  ));
  return mutationAffectedOne(result);
}
// ─── FEED ITEMS ───────────────────────────────────────────────────────────────

export async function getAllFeedItems() {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  const priceFarmScope = tenant.selectedFarmId !== null
    ? sql`AND ph.farmId = ${tenant.selectedFarmId}`
    : tenant.farmAccessMode === "all" || tenant.accessibleFarmIds === "all"
      ? sql``
      : tenant.accessibleFarmIds.length > 0
        ? sql`AND ph.farmId IN (${sql.join(tenant.accessibleFarmIds.map(id => sql`${id}`), sql`, `)})`
        : sql`AND FALSE`;
  return db
    .select({
      id: feedItems.id,
      name: feedItems.name,
      unit: feedItems.unit,
      isActive: feedItems.isActive,
      createdAt: feedItems.createdAt,
      updatedAt: feedItems.updatedAt,
      createdBy: feedItems.createdBy,
      deletedAt: feedItems.deletedAt,
      deletedBy: feedItems.deletedBy,
      version: feedItems.version,
      currentPrice: sql<string | null>`(
        SELECT ph.pricePerUnit
        FROM saas_azal_feed_item_price_history ph
        WHERE ph.feedItemId = ${sql.raw("`saas_azal_feed_items`.`id`")}
          AND ph.companyId = ${tenant.companyId}
          ${priceFarmScope}
        ORDER BY ph.effectiveDate DESC, ph.id DESC
        LIMIT 1
      )`.as("currentPrice"),
    })
    .from(feedItems)
    .where(and(eq(feedItems.companyId, tenant.companyId), isNull(feedItems.deletedAt)))
    .orderBy(feedItems.name);
}

export async function createFeedItem(data: { name: string; unit?: string; initialPrice?: string; priceEffectiveDate?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(feedItems).values(tenantInsert({ name: data.name, unit: data.unit }));
  const feedItemId = (result as any).insertId;
  // Seed an initial price-history row so feed cost isn't zero until a price is
  // added separately. Without at least one price, segmented feed costing can't
  // value the ration plan.
  if (feedItemId && data.initialPrice != null && data.initialPrice !== "" && parseFloat(data.initialPrice) > 0) {
    await db.insert(feedItemPriceHistory).values(tenantInsert({
      feedItemId,
      effectiveDate: (data.priceEffectiveDate ?? new Date().toISOString().split("T")[0]) as any,
      pricePerUnit: data.initialPrice,
    }, true));
  }
  return result;
}

/** Latest price for a feed item (for display in the feed items list). */
export async function getCurrentFeedItemPrice(feedItemId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const tenant = requireTenantUserContext();
  const rows = await db
    .select({ pricePerUnit: feedItemPriceHistory.pricePerUnit })
    .from(feedItemPriceHistory)
    .where(and(
      tenantScope(tenant, feedItemPriceHistory),
      eq(feedItemPriceHistory.feedItemId, feedItemId),
    ))
    .orderBy(desc(feedItemPriceHistory.effectiveDate))
    .limit(1);
  return rows.length > 0 ? rows[0].pricePerUnit : null;
}

export async function updateFeedItem(id: number, data: Partial<typeof feedItems.$inferInsert>, expectedVersion: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.update(feedItems).set({ ...data, version: sql`${feedItems.version} + 1` }).where(and(
    eq(feedItems.companyId, tenant.companyId),
    eq(feedItems.id, id),
    eq(feedItems.version, expectedVersion),
    isNull(feedItems.deletedAt),
  ));
  return mutationAffectedOne(result);
}

export async function getFeedItemPriceHistory(feedItemId: number) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  return db.select().from(feedItemPriceHistory).where(and(
    tenantScope(tenant, feedItemPriceHistory),
    eq(feedItemPriceHistory.feedItemId, feedItemId),
  )).orderBy(desc(feedItemPriceHistory.effectiveDate));
}

export async function addFeedItemPrice(data: { feedItemId: number; effectiveDate: string; pricePerUnit: string; notes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const effDate = data.effectiveDate.split("T")[0]; // normalize to YYYY-MM-DD
  // If a price already exists for this item on the same effective date,
  // update it in place instead of stacking a duplicate row.
  const existing = await db
    .select({ id: feedItemPriceHistory.id })
    .from(feedItemPriceHistory)
    .where(and(
      tenantScope(tenant, feedItemPriceHistory),
      eq(feedItemPriceHistory.feedItemId, data.feedItemId),
      eq(feedItemPriceHistory.effectiveDate, effDate as any)
    ))
    .limit(1);
  if (existing.length > 0) {
    await db.update(feedItemPriceHistory)
      .set({ pricePerUnit: data.pricePerUnit, notes: data.notes })
      .where(and(tenantScope(tenant, feedItemPriceHistory), eq(feedItemPriceHistory.id, existing[0].id)));
    return existing[0];
  }
  const [result] = await db.insert(feedItemPriceHistory).values(tenantInsert({
    feedItemId: data.feedItemId,
    effectiveDate: effDate as any,
    pricePerUnit: data.pricePerUnit,
    notes: data.notes
  }, true));
  return result;
}

/** All price-history rows across every feed item, newest first, with the feed item name. */
export async function getAllFeedItemPrices() {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
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
      version: feedItemPriceHistory.version,
    })
    .from(feedItemPriceHistory)
    .leftJoin(feedItems, and(
      eq(feedItemPriceHistory.feedItemId, feedItems.id),
      eq(feedItems.companyId, tenant.companyId),
    ))
    .where(tenantScope(tenant, feedItemPriceHistory))
    .orderBy(desc(feedItemPriceHistory.effectiveDate), desc(feedItemPriceHistory.id));
}

export async function updateFeedItemPrice(
  id: number,
  data: Partial<{ effectiveDate: string; pricePerUnit: string; notes: string | null }>,
  expectedVersion: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const set: Record<string, unknown> = {};
  if (data.pricePerUnit != null) set.pricePerUnit = data.pricePerUnit;
  if (data.notes !== undefined) set.notes = data.notes;
  if (data.effectiveDate) set.effectiveDate = data.effectiveDate.split("T")[0] as any;
  set.version = sql`${feedItemPriceHistory.version} + 1`;
  const [result] = await db.update(feedItemPriceHistory).set(set).where(and(
    tenantScope(tenant, feedItemPriceHistory),
    eq(feedItemPriceHistory.id, id),
    eq(feedItemPriceHistory.version, expectedVersion),
  ));
  return mutationAffectedOne(result);
}

/** Hard delete — this table has no soft-delete column. */
export async function deleteFeedItemPrice(id: number, expectedVersion: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.delete(feedItemPriceHistory).where(and(
    tenantScope(tenant, feedItemPriceHistory),
    eq(feedItemPriceHistory.id, id),
    eq(feedItemPriceHistory.version, expectedVersion),
  ));
  return mutationAffectedOne(result);
}

export async function getFeedPriceOnDate(feedItemId: number, dateStr: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const tenant = requireTenantUserContext();
  const rows = await db
    .select({ pricePerUnit: feedItemPriceHistory.pricePerUnit })
    .from(feedItemPriceHistory)
    .where(and(
      tenantScope(tenant, feedItemPriceHistory),
      eq(feedItemPriceHistory.feedItemId, feedItemId),
      sql`${feedItemPriceHistory.effectiveDate} <= ${dateStr}`,
    ))
    .orderBy(desc(feedItemPriceHistory.effectiveDate))
    .limit(1);
  return rows.length > 0 ? parseFloat(rows[0].pricePerUnit) : 0;
}

// ─── EXPENSE CATEGORIES ───────────────────────────────────────────────────────

export async function getAllExpenseCategories() {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  return db.select().from(expenseCategories).where(and(
    eq(expenseCategories.companyId, tenant.companyId),
    isNull(expenseCategories.deletedAt),
  )).orderBy(expenseCategories.name);
}

export async function createExpenseCategory(data: { name: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(expenseCategories).values(tenantInsert(data));
  return result;
}
export async function updateExpenseCategory(id: number, data: Partial<{ name: string; description: string; isActive: boolean }>, expectedVersion: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.update(expenseCategories).set({ ...data, version: sql`${expenseCategories.version} + 1` }).where(and(
    eq(expenseCategories.companyId, tenant.companyId),
    eq(expenseCategories.id, id),
    eq(expenseCategories.version, expectedVersion),
    isNull(expenseCategories.deletedAt),
  ));
  return mutationAffectedOne(result);
}
export async function getAllExpenseSubCategories(categoryId?: number) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  if (categoryId) {
    return db.select().from(expenseSubCategories).where(and(
      eq(expenseSubCategories.companyId, tenant.companyId),
      eq(expenseSubCategories.categoryId, categoryId),
    ));
  }
  return db.select().from(expenseSubCategories).where(
    eq(expenseSubCategories.companyId, tenant.companyId),
  ).orderBy(expenseSubCategories.name);
}

export async function createExpenseSubCategory(data: { categoryId: number; name: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(expenseSubCategories).values(tenantInsert(data));
  return result;
}
export async function updateExpenseSubCategory(id: number, data: Partial<{ categoryId: number; name: string; description: string; isActive: boolean }>, expectedVersion: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.update(expenseSubCategories).set({ ...data, version: sql`${expenseSubCategories.version} + 1` }).where(and(
    eq(expenseSubCategories.companyId, tenant.companyId),
    eq(expenseSubCategories.id, id),
    eq(expenseSubCategories.version, expectedVersion),
    isNull(expenseSubCategories.deletedAt),
  ));
  return mutationAffectedOne(result);
}
// ─── SYSTEM SETTINGS ──────────────────────────────────────────────────────────

export async function getAllSettings() {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  return db.select().from(systemSettings).where(eq(systemSettings.companyId, tenant.companyId));
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const tenant = requireTenantUserContext();
  const rows = await db.select().from(systemSettings).where(and(
    eq(systemSettings.companyId, tenant.companyId),
    eq(systemSettings.settingKey, key),
  )).limit(1);
  return rows.length > 0 ? rows[0].settingValue : null;
}

export async function upsertSetting(key: string, value: string, updatedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  await db
    .insert(systemSettings)
    .values(tenantInsert({ settingKey: key, settingValue: value, updatedBy }))
    .onDuplicateKeyUpdate({ set: { settingValue: value, updatedBy } });
}

// ─── PER-USER SETTINGS ──────────────────────────────────────────────────────────

export async function getUserSettings(userId: number): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const tenant = requireTenantUserContext();
  try {
    const rows = await db
      .select({
        settingKey: userSettings.settingKey,
        settingValue: userSettings.settingValue,
      })
      .from(userSettings)
      .where(and(
        eq(userSettings.companyId, tenant.companyId),
        eq(userSettings.userId, userId),
      ));
    return Object.fromEntries(rows.map(r => [r.settingKey, r.settingValue]));
  } catch (error) {
    logger.warn("preferences.read_failed", { error });
    return {};
  }
}

export async function upsertUserSetting(userId: number, key: string, value: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  try {
    await db
      .insert(userSettings)
      .values(tenantInsert({ userId, settingKey: key, settingValue: value }))
      .onDuplicateKeyUpdate({ set: { settingValue: value } });
  } catch (error) {
    logger.warn("preferences.write_failed", { error });
  }
}

// ─── ANIMALS ──────────────────────────────────────────────────────────────────

export async function getAnimals(filters?: { speciesId?: number; categoryId?: number; groupId?: number; statusId?: number; ownerId?: number; acquisitionType?: string; isActive?: boolean; sex?: "male" | "female"; search?: string; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  const conditions: any[] = [tenantScope(tenant, animals)];
  conditions.push(isNull(animals.deletedAt));
  if (filters?.speciesId) conditions.push(eq(animals.speciesId, filters.speciesId));
  if (filters?.categoryId) conditions.push(eq(animals.categoryId, filters.categoryId));
  if (filters?.groupId) conditions.push(eq(animals.groupId, filters.groupId));
  if (filters?.statusId) conditions.push(eq(animals.statusId, filters.statusId));
  if (filters?.ownerId) conditions.push(eq(animals.ownerId, filters.ownerId));
  if (filters?.acquisitionType) conditions.push(eq(animals.acquisitionType, filters.acquisitionType as "purchased" | "born"));
  if (filters?.isActive !== undefined) conditions.push(eq(animals.isActive, filters.isActive));
  if (filters?.sex) conditions.push(eq(animals.sex, filters.sex));

  const query = db
    .select({
      animal: animals,
      speciesName: species.name,
      categoryName: animalCategories.name,
      categoryReadyToSellThreshold: animalCategories.readyToSellThreshold,
      categoryPrefix: animalCategories.idPrefix,
      targetWeightKg: animalCategories.targetWeightKg,
      groupCode: groups.groupCode,
      groupName: groups.name,
      statusName: animalStatuses.name,
      isExitStatus: animalStatuses.isExitStatus,
      ownerName: owners.name,
      latestWeightKg: sql<string | null>`(
        SELECT wl.weightKg FROM saas_azal_weight_log wl
        WHERE wl.companyId = ${tenant.companyId} AND wl.animalId = ${animals.id} AND wl.deletedAt IS NULL
        ORDER BY wl.weighDate DESC LIMIT 1
      )`,
      nextVaccineDate: sql<string | null>`(
        SELECT vr.nextDueDate FROM saas_azal_vaccination_records vr
        WHERE vr.companyId = ${tenant.companyId} AND vr.animalId = ${animals.id} AND vr.deletedAt IS NULL AND vr.isCompleted = false AND vr.nextDueDate IS NOT NULL
        ORDER BY vr.nextDueDate ASC LIMIT 1
      )`,
      nextVaccineName: sql<string | null>`(
        SELECT v.name FROM saas_azal_vaccination_records vr
        INNER JOIN saas_azal_vaccines v ON vr.vaccineId = v.id AND v.companyId = ${tenant.companyId}
        WHERE vr.companyId = ${tenant.companyId} AND vr.animalId = ${animals.id} AND vr.deletedAt IS NULL AND vr.isCompleted = false AND vr.nextDueDate IS NOT NULL
        ORDER BY vr.nextDueDate ASC LIMIT 1
      )`,
      nextBoosterDate: sql<string | null>`(
        SELECT vr.boosterDueDate FROM saas_azal_vaccination_records vr
        WHERE vr.companyId = ${tenant.companyId} AND vr.animalId = ${animals.id} AND vr.deletedAt IS NULL AND vr.isCompleted = false AND vr.boosterDueDate IS NOT NULL
        ORDER BY vr.boosterDueDate ASC LIMIT 1
      )`,
      nextBoosterName: sql<string | null>`(
        SELECT v.name FROM saas_azal_vaccination_records vr
        INNER JOIN saas_azal_vaccines v ON vr.vaccineId = v.id AND v.companyId = ${tenant.companyId}
        WHERE vr.companyId = ${tenant.companyId} AND vr.animalId = ${animals.id} AND vr.deletedAt IS NULL AND vr.isCompleted = false AND vr.boosterDueDate IS NOT NULL
        ORDER BY vr.boosterDueDate ASC LIMIT 1
      )`
    })
    .from(animals)
    .leftJoin(species, and(eq(animals.speciesId, species.id), eq(species.companyId, tenant.companyId)))
    .leftJoin(animalCategories, and(eq(animals.categoryId, animalCategories.id), eq(animalCategories.companyId, tenant.companyId)))
    .leftJoin(groups, and(eq(animals.groupId, groups.id), eq(groups.companyId, tenant.companyId)))
    .leftJoin(animalStatuses, and(eq(animals.statusId, animalStatuses.id), eq(animalStatuses.companyId, tenant.companyId)))
    .leftJoin(owners, and(eq(animals.ownerId, owners.id), eq(owners.companyId, tenant.companyId)));

  const orderedQuery = conditions.length > 0
    ? query.where(and(...conditions)).orderBy(desc(animals.acquisitionDate))
    : query.orderBy(desc(animals.acquisitionDate));

  return filters?.limit ? orderedQuery.limit(filters.limit) : orderedQuery;
}

export async function getAnimalById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const tenant = requireTenantUserContext();
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
        SELECT vr.nextDueDate FROM saas_azal_vaccination_records vr
        WHERE vr.companyId = ${tenant.companyId} AND vr.animalId = ${animals.id} AND vr.deletedAt IS NULL AND vr.isCompleted = false AND vr.nextDueDate IS NOT NULL
        ORDER BY vr.nextDueDate ASC LIMIT 1
      )`,
      nextVaccineName: sql<string | null>`(
        SELECT v.name FROM saas_azal_vaccination_records vr
        INNER JOIN saas_azal_vaccines v ON vr.vaccineId = v.id AND v.companyId = ${tenant.companyId}
        WHERE vr.companyId = ${tenant.companyId} AND vr.animalId = ${animals.id} AND vr.deletedAt IS NULL AND vr.isCompleted = false AND vr.nextDueDate IS NOT NULL
        ORDER BY vr.nextDueDate ASC LIMIT 1
      )`,
      nextBoosterDate: sql<string | null>`(
        SELECT vr.boosterDueDate FROM saas_azal_vaccination_records vr
        WHERE vr.companyId = ${tenant.companyId} AND vr.animalId = ${animals.id} AND vr.deletedAt IS NULL AND vr.isCompleted = false AND vr.boosterDueDate IS NOT NULL
        ORDER BY vr.boosterDueDate ASC LIMIT 1
      )`,
      nextBoosterName: sql<string | null>`(
        SELECT v.name FROM saas_azal_vaccination_records vr
        INNER JOIN saas_azal_vaccines v ON vr.vaccineId = v.id AND v.companyId = ${tenant.companyId}
        WHERE vr.companyId = ${tenant.companyId} AND vr.animalId = ${animals.id} AND vr.deletedAt IS NULL AND vr.isCompleted = false AND vr.boosterDueDate IS NOT NULL
        ORDER BY vr.boosterDueDate ASC LIMIT 1
      )`
    })
    .from(animals)
    .leftJoin(species, and(eq(animals.speciesId, species.id), eq(species.companyId, tenant.companyId)))
    .leftJoin(animalCategories, and(eq(animals.categoryId, animalCategories.id), eq(animalCategories.companyId, tenant.companyId)))
    .leftJoin(groups, and(eq(animals.groupId, groups.id), eq(groups.companyId, tenant.companyId)))
    .leftJoin(animalStatuses, and(eq(animals.statusId, animalStatuses.id), eq(animalStatuses.companyId, tenant.companyId)))
    .leftJoin(owners, and(eq(animals.ownerId, owners.id), eq(owners.companyId, tenant.companyId)))
    .where(and(tenantScope(tenant, animals), eq(animals.id, id), isNull(animals.deletedAt)))
    .limit(1);
  if (rows.length === 0) return null;
  const [originBirthRecord] = await db
    .select({
      id: lambingLog.id,
      lambId: lambingLog.lambId,
      birthDate: lambingLog.birthDate,
    })
    .from(lambingLog)
    .where(and(
      tenantScope(tenant, lambingLog),
      eq(lambingLog.promotedHeadId, id),
      isNull(lambingLog.deletedAt),
    ))
    .limit(1);
  return {
    ...rows[0],
    originBirthRecord: originBirthRecord ?? null,
  };
}

export async function createAnimal(data: TenantCreateInput<typeof animals.$inferInsert>, tx?: DbOrTx) {
  const sharedDb = await getDb();
  if (!sharedDb) throw new Error("DB not available");
  const operation = async (handle: DbOrTx) => {
    const tenant = requireTenantUserContext();
    await lockCompanyQuota(handle, tenant.companyId);
    const [count] = await handle.select({ count: sql<number>`COUNT(*)` })
      .from(animals)
      .where(and(eq(animals.companyId, tenant.companyId), isNull(animals.deletedAt)));
    const limit = await getEffectiveLimit(handle, tenant.companyId, "animals_limit");
    assertWithinLimit(Number(count?.count ?? 0), 1, limit, "animals");
    const scopedData = tenantInsert(data, true);
    const [result] = await handle.insert(animals).values(scopedData);
    const newId = (result as any)?.insertId;
    const acqWeight = data.weightAtAcquisition != null
      ? parseFloat(String(data.weightAtAcquisition))
      : 0;
    if (newId && acqWeight > 0 && data.acquisitionDate) {
      await handle.insert(weightLog).values(tenantInsert({
        animalId: Number(newId),
        weighDate: data.acquisitionDate as any,
        weightKg: String(data.weightAtAcquisition),
        notes: "Acquisition weight",
        createdBy: data.createdBy ?? null,
      }, true));
    }
    return result;
  };
  return tx ? operation(tx) : sharedDb.transaction(operation);
}

export async function updateAnimal(
  id: number,
  data: Partial<typeof animals.$inferInsert>,
  tx?: DbOrTx,
  expectedVersion?: number,
) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const { companyId: _companyId, farmId: _farmId, ...safeData } = data;
  const conditions = [tenantScope(tenant, animals), eq(animals.id, id), isNull(animals.deletedAt)];
  if (expectedVersion !== undefined) conditions.push(eq(animals.version, expectedVersion));
  const [result] = await db
    .update(animals)
    .set({ ...safeData, version: sql`${animals.version} + 1` })
    .where(and(...conditions));
  const affected = Number((result as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
  if (expectedVersion !== undefined && affected !== 1) return 0;
  const parentage: Partial<typeof lambingLog.$inferInsert> = {};
  if (Object.prototype.hasOwnProperty.call(data, "damId")) {
    parentage.damId = data.damId ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(data, "sireId")) {
    parentage.sireId = data.sireId ?? null;
  }
  if (Object.keys(parentage).length > 0) {
    await db
      .update(lambingLog)
      .set(parentage)
      .where(and(tenantScope(tenant, lambingLog), eq(lambingLog.promotedHeadId, id)));
  }
  return expectedVersion === undefined ? 1 : affected;
}

export async function getActiveHeadCountByCategory(dateStr?: string): Promise<Record<number, number>> {
  const db = await getDb();
  if (!db) return {};
  const tenant = requireTenantUserContext();
  const conditions: any[] = [tenantScope(tenant, animals), eq(animals.isActive, true), isNull(animals.deletedAt)];
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

type CurrentHeadCountFilters = {
  speciesId?: number;
  categoryId?: number;
  groupId?: number;
  ownerId?: number;
};

function activeAnimalHeadConditions(filters?: CurrentHeadCountFilters) {
  const tenant = requireTenantUserContext();
  const conditions: any[] = [tenantScope(tenant, animals), eq(animals.isActive, true), isNull(animals.deletedAt)];
  if (filters?.speciesId) conditions.push(eq(animals.speciesId, filters.speciesId));
  if (filters?.categoryId) conditions.push(eq(animals.categoryId, filters.categoryId));
  if (filters?.groupId) conditions.push(eq(animals.groupId, filters.groupId));
  if (filters?.ownerId) conditions.push(eq(animals.ownerId, filters.ownerId));
  return conditions;
}

function unpromotedLambHeadConditions(filters?: CurrentHeadCountFilters) {
  const tenant = requireTenantUserContext();
  const conditions: any[] = [tenantScope(tenant, lambingLog), eq(lambingLog.isPromoted, false), isNull(lambingLog.deletedAt)];
  if (filters?.speciesId) conditions.push(eq(lambingLog.speciesId, filters.speciesId));
  if (filters?.categoryId) conditions.push(eq(lambingLog.categoryId, filters.categoryId));
  if (filters?.groupId) conditions.push(eq(lambingLog.groupId, filters.groupId));
  if (filters?.ownerId) {
    conditions.push(sql`${lambingLog.damId} IN (SELECT id FROM saas_azal_animals WHERE companyId = ${tenant.companyId} AND farmId = ${lambingLog.farmId} AND ownerId = ${filters.ownerId} AND deletedAt IS NULL)`);
  }
  return conditions;
}

type HeadCountCategoryRow = {
  categoryId: number | null;
  categoryName: string | null;
  headCount: number;
};

function mergeHeadCountCategoryRows(rows: HeadCountCategoryRow[]) {
  const byCategory = new Map<string, HeadCountCategoryRow>();
  for (const row of rows) {
    const key = row.categoryId == null ? `unknown:${row.categoryName ?? ""}` : String(row.categoryId);
    const existing = byCategory.get(key);
    if (existing) {
      existing.headCount += Number(row.headCount ?? 0);
    } else {
      byCategory.set(key, {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        headCount: Number(row.headCount ?? 0),
      });
    }
  }
  return Array.from(byCategory.values());
}

async function getUnpromotedLambHeadStats(filters?: CurrentHeadCountFilters) {
  const db = await getDb();
  if (!db) return { total: 0, byCategory: [] as HeadCountCategoryRow[] };
  const tenant = requireTenantUserContext();
  const conditions = unpromotedLambHeadConditions(filters);
  const totalRows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(lambingLog)
    .where(and(...conditions));
  const byCategory = await db
    .select({
      categoryId: lambingLog.categoryId,
      categoryName: animalCategories.name,
      headCount: sql<number>`COUNT(*)`,
    })
    .from(lambingLog)
    .leftJoin(animalCategories, and(
      eq(lambingLog.categoryId, animalCategories.id),
      eq(animalCategories.companyId, tenant.companyId),
    ))
    .where(and(...conditions))
    .groupBy(lambingLog.categoryId, animalCategories.name);

  return {
    total: Number(totalRows[0]?.count ?? 0),
    byCategory: byCategory.map(row => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      headCount: Number(row.headCount ?? 0),
    })),
  };
}

async function getUnpromotedLambHeadDays(filters: CurrentHeadCountFilters | undefined, fromDate: string, toDate: string) {
  const db = await getDb();
  if (!db) return 0;
  const conditions = [
    ...unpromotedLambHeadConditions(filters),
    sql`${lambingLog.birthDate} <= ${toDate}`,
  ];
  const rows = await db
    .select({
      totalHeadDays: sql<number>`SUM(
        GREATEST(0, DATEDIFF(${toDate}, GREATEST(${lambingLog.birthDate}, ${fromDate})) + 1)
      )`,
    })
    .from(lambingLog)
    .where(and(...conditions));
  return Number(rows[0]?.totalHeadDays ?? 0);
}

export async function getCurrentHeadCountByCategory(filters?: CurrentHeadCountFilters) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  const animalRows = await db
    .select({
      categoryId: animals.categoryId,
      categoryName: animalCategories.name,
      headCount: sql<number>`COUNT(*)`,
    })
    .from(animals)
    .leftJoin(animalCategories, and(
      eq(animals.categoryId, animalCategories.id),
      eq(animalCategories.companyId, tenant.companyId),
    ))
    .where(and(...activeAnimalHeadConditions(filters)))
    .groupBy(animals.categoryId, animalCategories.name);
  const lambStats = await getUnpromotedLambHeadStats(filters);
  return mergeHeadCountCategoryRows([
    ...animalRows.map(row => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      headCount: Number(row.headCount ?? 0),
    })),
    ...lambStats.byCategory,
  ]);
}

// ─── ANIMAL STATUS HISTORY ────────────────────────────────────────────────────

export async function getAnimalStatusHistory(animalId: number) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
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
    .where(and(
      tenantScope(tenant, animalStatusHistory),
      eq(animalStatusHistory.animalId, animalId),
    ))
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
  await db.insert(animalStatusHistory).values(tenantInsert(data, true));
}

// ─── SALES ────────────────────────────────────────────────────────────────────

export async function getSales(filters?: { animalId?: number; fromDate?: string; toDate?: string; ownerId?: number; outstandingOnly?: boolean; buyer?: string }) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  const conditions = [tenantScope(tenant, sales)];
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
    .leftJoin(animals, and(
      eq(sales.animalId, animals.id),
      eq(animals.companyId, tenant.companyId),
    ))
    .leftJoin(species, and(eq(animals.speciesId, species.id), eq(species.companyId, tenant.companyId)))
    .leftJoin(animalCategories, and(eq(animals.categoryId, animalCategories.id), eq(animalCategories.companyId, tenant.companyId)))
    .leftJoin(owners, and(eq(animals.ownerId, owners.id), eq(owners.companyId, tenant.companyId)));
  conditions.push(isNull(sales.deletedAt));
  return query.where(and(...conditions)).orderBy(desc(sales.saleDate));
}

export async function createSale(data: TenantCreateInput<typeof sales.$inferInsert>, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(sales).values(tenantInsert(data, true));
  return result;
}

/** Single sale row (P2 perf: replaces load-all-then-find patterns). */
export async function getSaleById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const tenant = requireTenantUserContext();
  const rows = await db.select().from(sales).where(and(tenantScope(tenant, sales), eq(sales.id, id), isNull(sales.deletedAt))).limit(1);
  return rows[0] ?? null;
}

/** Lock one sale row while a payment or edit is applied (read-modify-write). */
export async function getSaleForUpdate(id: number, tx: DbOrTx) {
  const tenant = requireTenantUserContext();
  const rows = await tx
    .select()
    .from(sales)
    .where(and(tenantScope(tenant, sales), eq(sales.id, id), isNull(sales.deletedAt)))
    .limit(1)
    .for("update");
  return rows[0] ?? null;
}

/** Single expense row (P2 perf: replaces load-all-then-find patterns). */
export async function getExpenseById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const tenant = requireTenantUserContext();
  const rows = await db.select().from(expenses).where(and(tenantScope(tenant, expenses), eq(expenses.id, id), isNull(expenses.deletedAt))).limit(1);
  return rows[0] ?? null;
}
export async function updateSale(
  id: number,
  expectedVersion: number,
  data: Partial<{
    animalId: number;
    salePrice: string;
    amountPaid: string;
    weightAtSale: string | null;
    pricePerKg: string | null;
    saleDate: string;
    buyerName: string | null;
    notes: string | null;
  }>,
  tx?: DbOrTx
) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db
    .update(sales)
    .set({ ...data, version: sql`${sales.version} + 1` } as any)
    .where(and(
      tenantScope(tenant, sales),
      eq(sales.id, id),
      eq(sales.version, expectedVersion),
      isNull(sales.deletedAt),
    ));
  return Number((result as { affectedRows?: number }).affectedRows ?? 0);
}
// ─── LAMBING LOG ──────────────────────────────────────────────────────────────

export async function getLambingLog(filters?: { isPromoted?: boolean; ownerId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  const query = db
    .select({
      id: lambingLog.id,
      lambId: lambingLog.lambId,
      speciesId: lambingLog.speciesId,
      categoryId: lambingLog.categoryId,
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
      promotedAnimalCode: sql<string | null>`COALESCE(
        (SELECT a.animalId FROM saas_azal_animals a WHERE a.id = ${lambingLog.promotedHeadId} AND a.companyId = ${tenant.companyId} AND a.farmId = ${lambingLog.farmId}),
        ${lambingLog.promotedAnimalCode}
      )`,
      promotedAnimalDeletedAt: sql<Date | null>`(
        SELECT a.deletedAt FROM saas_azal_animals a WHERE a.id = ${lambingLog.promotedHeadId} AND a.companyId = ${tenant.companyId} AND a.farmId = ${lambingLog.farmId}
      )`,
      promotedAnimalPurgedAt: lambingLog.promotedAnimalPurgedAt,
      createdAt: lambingLog.createdAt,
      version: lambingLog.version,
      birthTypeName: birthTypes.name,
      groupCode: groups.groupCode,
      speciesName: species.name,
      categoryName: animalCategories.name,
      effectiveDamId: lambingLog.damId,
      effectiveSireId: lambingLog.sireId,
      damAnimalId: sql<string | null>`(SELECT a.animalId FROM saas_azal_animals a WHERE a.id = ${lambingLog.damId} AND a.companyId = ${tenant.companyId} AND a.farmId = ${lambingLog.farmId})`,
      sireAnimalId: sql<string | null>`(SELECT a.animalId FROM saas_azal_animals a WHERE a.id = ${lambingLog.sireId} AND a.companyId = ${tenant.companyId} AND a.farmId = ${lambingLog.farmId})`
    })
    .from(lambingLog)
    .leftJoin(birthTypes, and(eq(lambingLog.birthTypeId, birthTypes.id), eq(birthTypes.companyId, tenant.companyId)))
    .leftJoin(groups, and(eq(lambingLog.groupId, groups.id), eq(groups.companyId, tenant.companyId)))
    .leftJoin(species, and(eq(lambingLog.speciesId, species.id), eq(species.companyId, tenant.companyId)))
    .leftJoin(animalCategories, and(eq(lambingLog.categoryId, animalCategories.id), eq(animalCategories.companyId, tenant.companyId)));
  const lambingConditions = [tenantScope(tenant, lambingLog), isNull(lambingLog.deletedAt)];
  if (filters?.isPromoted !== undefined) lambingConditions.push(eq(lambingLog.isPromoted, filters.isPromoted) as any);
  // Owner scope: lambs are attributed to the dam's owner.
  if (filters?.ownerId) {
    lambingConditions.push(sql`${lambingLog.damId} IN (SELECT id FROM saas_azal_animals WHERE companyId = ${tenant.companyId} AND farmId = ${lambingLog.farmId} AND ownerId = ${filters.ownerId} AND deletedAt IS NULL)` as any);
  }
  return query.where(and(...lambingConditions)).orderBy(desc(lambingLog.birthDate)) as Promise<any[]>;
}

export async function getLambingSummary(filters?: { ownerId?: number }) {
  const db = await getDb();
  if (!db) return { total: 0, pending: 0, promoted: 0 };
  const tenant = requireTenantUserContext();
  const lambingConditions = [tenantScope(tenant, lambingLog), isNull(lambingLog.deletedAt)];
  // Owner scope: lambs are attributed to the dam's owner, matching getLambingLog.
  if (filters?.ownerId) {
    lambingConditions.push(sql`${lambingLog.damId} IN (SELECT id FROM saas_azal_animals WHERE companyId = ${tenant.companyId} AND farmId = ${lambingLog.farmId} AND ownerId = ${filters.ownerId} AND deletedAt IS NULL)` as any);
  }
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`SUM(CASE WHEN ${lambingLog.isPromoted} = false THEN 1 ELSE 0 END)`,
      promoted: sql<number>`SUM(CASE WHEN ${lambingLog.isPromoted} = true THEN 1 ELSE 0 END)`,
    })
    .from(lambingLog)
    .where(and(...lambingConditions));
  return {
    total: Number(row?.total ?? 0),
    pending: Number(row?.pending ?? 0),
    promoted: Number(row?.promoted ?? 0),
  };
}

export async function createLambingRecord(data: TenantCreateInput<typeof lambingLog.$inferInsert>, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(lambingLog).values(tenantInsert(data, true));
  return result;
}

export async function updateLambingRecord(
  id: number,
  data: Partial<typeof lambingLog.$inferInsert>,
  tx?: DbOrTx,
  expectedVersion?: number,
) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const { companyId: _companyId, farmId: _farmId, publicId: _publicId, ...safeData } = data;
  const [result] = await db.update(lambingLog).set({ ...safeData, version: sql`${lambingLog.version} + 1` }).where(and(
    tenantScope(tenant, lambingLog),
    eq(lambingLog.id, id),
    isNull(lambingLog.deletedAt),
    expectedVersion === undefined ? undefined : eq(lambingLog.version, expectedVersion),
  ));
  return mutationAffectedOne(result);
}

// ─── WEIGHT LOG ───────────────────────────────────────────────────────────────

export async function getWeightLog(animalId: number) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  return db
    .select()
    .from(weightLog)
    .where(and(tenantScope(tenant, weightLog), eq(weightLog.animalId, animalId), isNull(weightLog.deletedAt)))
    .orderBy(weightLog.weighDate);
}

export async function createWeightEntry(data: TenantCreateInput<typeof weightLog.$inferInsert>, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(weightLog).values(tenantInsert(data, true));
  return result;
}

/** Fetch one weight-log row (for validation before delete). */
export async function getWeightEntryById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const tenant = requireTenantUserContext();
  const rows = await db.select().from(weightLog).where(and(tenantScope(tenant, weightLog), eq(weightLog.id, id), isNull(weightLog.deletedAt))).limit(1);
  return rows[0] ?? null;
}

/** Soft-delete a weight-log entry. */
export async function softDeleteWeightEntry(id: number, expectedVersion: number, deletedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.update(weightLog)
    .set({ deletedAt: new Date(), deletedBy: deletedBy ?? null, version: sql`${weightLog.version} + 1` })
    .where(and(
      tenantScope(tenant, weightLog),
      eq(weightLog.id, id),
      eq(weightLog.version, expectedVersion),
      isNull(weightLog.deletedAt),
    ));
  return mutationAffectedOne(result);
}

export async function getLatestWeightForAnimals(animalIds: number[]) {
  const db = await getDb();
  if (!db) return [];
  if (animalIds.length === 0) return [];
  const tenant = requireTenantUserContext();
  return db
    .select({
      animalId: weightLog.animalId,
      weightKg: weightLog.weightKg,
      weighDate: weightLog.weighDate
    })
    .from(weightLog)
    .where(and(
      tenantScope(tenant, weightLog),
      sql`${weightLog.animalId} IN (${sql.join(
        animalIds.map(id => sql`${id}`),
        sql`, `
      )})`,
    ))
    .orderBy(desc(weightLog.weighDate));
}

// ─── RATION PLANS ─────────────────────────────────────────────────────────────

export async function getRationPlans(categoryId?: number) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  const query = db
    .select({
      id: rationPlans.id,
      categoryId: rationPlans.categoryId,
      feedItemId: rationPlans.feedItemId,
      qtyPerHeadPerDay: rationPlans.qtyPerHeadPerDay,
      effectiveDate: rationPlans.effectiveDate,
      endDate: rationPlans.endDate,
      isActive: rationPlans.isActive,
      version: rationPlans.version,
      createdAt: rationPlans.createdAt,
      feedItemName: feedItems.name,
      unit: feedItems.unit,
      categoryName: animalCategories.name,
      currentPrice: sql<string | null>`(
        SELECT ph.pricePerUnit FROM saas_azal_feed_item_price_history ph
        WHERE ph.feedItemId = ${rationPlans.feedItemId} AND ph.companyId = ${tenant.companyId} AND ph.farmId = ${rationPlans.farmId}
        ORDER BY ph.effectiveDate DESC, ph.id DESC LIMIT 1
      )`
    })
    .from(rationPlans)
    .leftJoin(feedItems, and(eq(rationPlans.feedItemId, feedItems.id), eq(feedItems.companyId, tenant.companyId)))
    .leftJoin(animalCategories, and(eq(rationPlans.categoryId, animalCategories.id), eq(animalCategories.companyId, tenant.companyId)));
  if (categoryId) return query.where(and(tenantScope(tenant, rationPlans), eq(rationPlans.categoryId, categoryId), eq(rationPlans.isActive, true), isNull(rationPlans.deletedAt)));
  return query.where(and(tenantScope(tenant, rationPlans), eq(rationPlans.isActive, true), isNull(rationPlans.deletedAt)));
}

export async function createRationPlan(data: TenantCreateInput<typeof rationPlans.$inferInsert>, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(rationPlans).values(tenantInsert(data, true));
  return result;
}

export async function updateRationPlan(
  id: number,
  expectedVersion: number,
  data: Partial<typeof rationPlans.$inferInsert>,
  audit: { userId?: number; ipAddress?: string },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const { companyId: _companyId, farmId: _farmId, publicId: _publicId, version: _version, ...safeData } = data;
  return db.transaction(async tx => {
    const result = await executeVersionedUpdate({
      expectedVersion,
      lockCurrent: async () => {
        const [row] = await tx.select().from(rationPlans).where(and(
          tenantScope(tenant, rationPlans),
          eq(rationPlans.id, id),
          isNull(rationPlans.deletedAt),
        )).limit(1).for("update");
        return row ?? null;
      },
      compareAndSwap: async () => {
        const [updated] = await tx.update(rationPlans).set({
          ...safeData,
          version: sql`${rationPlans.version} + 1`,
        }).where(and(
          versionedTenantUpdateScope(tenant, rationPlans, id, expectedVersion),
          isNull(rationPlans.deletedAt),
        ));
        return Number((updated as { affectedRows?: number }).affectedRows ?? 0);
      },
      appendAudit: async current => {
        const oldValues = Object.fromEntries([
          ...Object.keys(safeData).map(key => [key, current[key as keyof typeof current]]),
          ["version", current.version],
        ]);
        await createAuditEntry({
          userId: audit.userId,
          action: "update",
          ipAddress: audit.ipAddress,
          entityType: "rationPlan",
          entityId: String(id),
          oldValues,
          newValues: { ...safeData, version: expectedVersion + 1 },
        }, tx);
      },
    });
    return { id, ...result };
  });
}

export async function getActivePlanOnDate(categoryId: number, dateStr: string) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  return db
    .select()
    .from(rationPlans)
    .where(and(tenantScope(tenant, rationPlans), eq(rationPlans.categoryId, categoryId), eq(rationPlans.isActive, true), sql`${rationPlans.effectiveDate} <= ${dateStr}`, or(isNull(rationPlans.endDate), sql`${rationPlans.endDate} >= ${dateStr}`)));
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
  const tenant = requireTenantUserContext();

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
    .where(and(tenantScope(tenant, rationPlans), eq(rationPlans.categoryId, categoryId), eq(rationPlans.isActive, true)));

  const feedItemIds = Array.from(new Set(planRows.map(p => p.feedItemId)));
  const priceRows = feedItemIds.length ? await db.select().from(feedItemPriceHistory).where(and(
    tenantScope(tenant, feedItemPriceHistory),
    inArray(feedItemPriceHistory.feedItemId, feedItemIds),
  )) : [];

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
  const tenant = requireTenantUserContext();
  const ws = windowStart.split("T")[0];
  const we = windowEnd.split("T")[0];
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(animals)
    .where(and(tenantScope(tenant, animals), eq(animals.categoryId, categoryId), isNull(animals.deletedAt), sql`${animals.acquisitionDate} <= ${we}`, or(isNull(animals.exitDate), sql`${animals.exitDate} >= ${ws}`)));
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
  const tenant = requireTenantUserContext();
  const d = dateStr.split("T")[0];
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(animals)
    .where(and(tenantScope(tenant, animals), isNull(animals.deletedAt), sql`${animals.acquisitionDate} <= ${d}`, or(isNull(animals.exitDate), sql`${animals.exitDate} >= ${d}`)));
  return Math.max(1, Number(rows[0]?.count ?? 1));
}

/**
 * Raw active head counts per category on a specific date — same aliveness
 * predicate as getHerdHeadCountOnDate, grouped by category. Unlike the
 * clamped helpers above this returns 0 for empty categories, which the
 * expense splitter needs to weigh (and drop) zero-head categories honestly.
 */
export async function getCategoryHeadCountsOnDate(categoryIds: number[], dateStr: string): Promise<Map<number, number>> {
  const counts = new Map<number, number>(categoryIds.map(id => [id, 0]));
  const db = await getDb();
  if (!db || categoryIds.length === 0) return counts;
  const tenant = requireTenantUserContext();
  const d = dateStr.split("T")[0];
  const rows = await db
    .select({ categoryId: animals.categoryId, count: sql<number>`COUNT(*)` })
    .from(animals)
    .where(and(tenantScope(tenant, animals), inArray(animals.categoryId, categoryIds), isNull(animals.deletedAt), sql`${animals.acquisitionDate} <= ${d}`, or(isNull(animals.exitDate), sql`${animals.exitDate} >= ${d}`)))
    .groupBy(animals.categoryId);
  for (const row of rows) counts.set(Number(row.categoryId), Number(row.count ?? 0));
  return counts;
}

// ─── FEED STOCK ───────────────────────────────────────────────────────────────

export async function getFeedStockLedger(feedItemId?: number) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
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
      version: feedStockLedger.version,
      feedItemName: feedItems.name,
      feedItemUnit: feedItems.unit
    })
    .from(feedStockLedger)
    .leftJoin(feedItems, and(eq(feedStockLedger.feedItemId, feedItems.id), eq(feedItems.companyId, tenant.companyId)));
  if (feedItemId) return query.where(and(tenantScope(tenant, feedStockLedger), eq(feedStockLedger.feedItemId, feedItemId), isNull(feedStockLedger.deletedAt))).orderBy(desc(feedStockLedger.transactionDate));
  return query.where(and(tenantScope(tenant, feedStockLedger), isNull(feedStockLedger.deletedAt))).orderBy(desc(feedStockLedger.transactionDate));
}

export async function createFeedStockEntry(data: TenantCreateInput<typeof feedStockLedger.$inferInsert>, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(feedStockLedger).values(tenantInsert(data, true));
  return result;
}

export async function updateFeedStockEntry(
  id: number,
  expectedVersion: number,
  data: Partial<{
    feedItemId: number;
    transactionDate: string;
    transactionType: string;
    qty: string;
    unitCost: string | null;
    totalCost: string | null;
    supplierName: string | null;
    notes: string | null;
  }>,
  audit: { userId?: number; ipAddress?: string },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const updateData: Record<string, any> = { ...data };
  if (data.transactionDate) updateData.transactionDate = data.transactionDate as any;
  return db.transaction(async tx => {
    const result = await executeVersionedUpdate({
      expectedVersion,
      lockCurrent: async () => {
        const [row] = await tx.select().from(feedStockLedger).where(and(
          tenantScope(tenant, feedStockLedger),
          eq(feedStockLedger.id, id),
          isNull(feedStockLedger.deletedAt),
        )).limit(1).for("update");
        return row ?? null;
      },
      compareAndSwap: async () => {
        const [updated] = await tx.update(feedStockLedger).set({
          ...updateData,
          version: sql`${feedStockLedger.version} + 1`,
        }).where(and(
          versionedTenantUpdateScope(tenant, feedStockLedger, id, expectedVersion),
          isNull(feedStockLedger.deletedAt),
        ));
        return Number((updated as { affectedRows?: number }).affectedRows ?? 0);
      },
      appendAudit: async current => {
        const oldValues = Object.fromEntries([
          ...Object.keys(updateData).map(key => [key, current[key as keyof typeof current]]),
          ["version", current.version],
        ]);
        await createAuditEntry({
          userId: audit.userId,
          action: "update",
          ipAddress: audit.ipAddress,
          entityType: "feedStock",
          entityId: String(id),
          oldValues,
          newValues: { ...updateData, version: expectedVersion + 1 },
        }, tx);
      },
    });
    return { id, ...result };
  });
}

// ─── EXPENSESS ─────────────────────────────────────────────────────────────────

export async function getGeneralExpensesTotal(filters?: { fromDate?: string; toDate?: string }) {
  const db = await getDb();
  if (!db) return 0;
  const tenant = requireTenantUserContext();
  const conditions = [tenantScope(tenant, expenses), eq(expenses.targetType, "general"), isNull(expenses.deletedAt)];
  if (filters?.fromDate) conditions.push(sql`${expenses.expenseDate} >= ${filters.fromDate}`);
  if (filters?.toDate) conditions.push(sql`${expenses.expenseDate} <= ${filters.toDate}`);
  const rows = await db
    .select({ total: sql<number>`SUM(amount)` })
    .from(expenses)
    .where(and(...conditions));
  return toMajor(toMinor(String(rows[0]?.total ?? 0)));
}

export async function getExpenses(filters?: { fromDate?: string; toDate?: string; categoryId?: number; targetType?: "general" | "category" | "head" | "herd"; headId?: number; ownerId?: number; vendor?: string }) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  const conditions = [tenantScope(tenant, expenses)];
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
      (${expenses.targetType} = 'head'     AND ${expenses.headId} IN (SELECT id FROM saas_azal_animals WHERE companyId = ${tenant.companyId} AND farmId = ${expenses.farmId} AND ownerId = ${ownerId} AND deletedAt IS NULL))
      OR
      (${expenses.targetType} = 'category' AND ${expenses.categoryTarget} IN (SELECT DISTINCT categoryId FROM saas_azal_animals WHERE companyId = ${tenant.companyId} AND farmId = ${expenses.farmId} AND ownerId = ${ownerId} AND deletedAt IS NULL))
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
    .leftJoin(expenseCategories, and(eq(expenses.categoryId, expenseCategories.id), eq(expenseCategories.companyId, tenant.companyId)))
    .leftJoin(expenseSubCategories, and(eq(expenses.subCategoryId, expenseSubCategories.id), eq(expenseSubCategories.companyId, tenant.companyId)))
    .leftJoin(animals, and(eq(expenses.headId, animals.id), eq(animals.companyId, tenant.companyId)))
    .leftJoin(owners, and(eq(animals.ownerId, owners.id), eq(owners.companyId, tenant.companyId)));
  conditions.push(isNull(expenses.deletedAt));
  return query.where(and(...conditions)).orderBy(desc(expenses.expenseDate));
}

export async function createExpense(data: TenantCreateInput<typeof expenses.$inferInsert>, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(expenses).values(tenantInsert(data, true));
  return result;
}

export async function updateExpense(
  id: number,
  expectedVersion: number,
  data: Partial<typeof expenses.$inferInsert>,
  audit: { userId?: number; ipAddress?: string },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const { companyId: _companyId, farmId: _farmId, publicId: _publicId, version: _version, ...safeData } = data;
  return db.transaction(async tx => {
    const result = await executeVersionedUpdate({
      expectedVersion,
      lockCurrent: async () => {
        const [row] = await tx.select().from(expenses).where(and(
          tenantScope(tenant, expenses),
          eq(expenses.id, id),
          isNull(expenses.deletedAt),
        )).limit(1).for("update");
        return row ?? null;
      },
      compareAndSwap: async () => {
        const [updated] = await tx.update(expenses).set({
          ...safeData,
          version: sql`${expenses.version} + 1`,
        }).where(and(
          versionedTenantUpdateScope(tenant, expenses, id, expectedVersion),
          isNull(expenses.deletedAt),
        ));
        return Number((updated as { affectedRows?: number }).affectedRows ?? 0);
      },
      appendAudit: async current => {
        const oldValues = Object.fromEntries([
          ...Object.keys(safeData).map(key => [key, current[key as keyof typeof current]]),
          ["version", current.version],
        ]);
        await createAuditEntry({
          userId: audit.userId,
          action: "update",
          ipAddress: audit.ipAddress,
          entityType: "expense",
          entityId: String(id),
          oldValues,
          newValues: { ...safeData, version: expectedVersion + 1 },
        }, tx);
      },
    });
    return { id, ...result };
  });
}

export async function deleteExpense(
  id: number,
  expectedVersion: number,
  audit: { userId?: number; ipAddress?: string },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  return db.transaction(async tx => {
    const deletedAt = new Date();
    const result = await executeVersionedUpdate({
      expectedVersion,
      lockCurrent: async () => {
        const [row] = await tx.select().from(expenses).where(and(
          tenantScope(tenant, expenses),
          eq(expenses.id, id),
          isNull(expenses.deletedAt),
        )).limit(1).for("update");
        return row ?? null;
      },
      compareAndSwap: async () => {
        const [updated] = await tx.update(expenses).set({
          deletedAt,
          deletedBy: audit.userId ?? null,
          version: sql`${expenses.version} + 1`,
        }).where(and(
          versionedTenantUpdateScope(tenant, expenses, id, expectedVersion),
          isNull(expenses.deletedAt),
        ));
        return Number((updated as { affectedRows?: number }).affectedRows ?? 0);
      },
      appendAudit: current => createAuditEntry({
        userId: audit.userId,
        action: "delete",
        ipAddress: audit.ipAddress,
        entityType: "expense",
        entityId: String(id),
        oldValues: {
          amount: current.amount,
          vendorName: current.vendorName,
          deletedAt: current.deletedAt,
          version: current.version,
        },
        newValues: { deletedAt, version: expectedVersion + 1 },
      }, tx),
    });
    return { id, ...result };
  });
}

// ─── PREGNANCY TRACKING ───────────────────────────────────────────────────────

/** Expected delivery date = confirmation date + gestation days. Pure.
 * All arithmetic in UTC so results never shift across DST transitions. */
export function calculatePregnancyDueDate(confirmationDate: string, gestationDays: number): string {
  const date = new Date(String(confirmationDate).split("T")[0]);
  // Due date = confirmation date + the species gestation period.
  date.setUTCDate(date.getUTCDate() + gestationDays);
  return date.toISOString().split("T")[0];
}

// Calendar date as UTC-midnight epoch ms: local date-part for Date instances
// ("today"), literal date-part for date strings. Differences between two such
// values are exact multiples of 86400000 regardless of DST.
const utcMidnight = (d: Date | string): number => {
  if (d instanceof Date) return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const dt = new Date(String(d).split("T")[0]); // date-only strings parse as UTC midnight
  return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
};

/** Derived, never-stored pregnancy progress fields shown in the UI. */
export function pregnancyProgress(confirmationDate: Date | string, expectedDueDate: Date | string, gestationDays: number, status: string) {
  const today = utcMidnight(new Date());
  const conf = utcMidnight(confirmationDate);
  const due = utcMidnight(expectedDueDate);
  const daysPregnant = Math.max(0, Math.floor((today - conf) / 86400000));
  const daysRemaining = Math.ceil((due - today) / 86400000);
  const progressPct = gestationDays > 0 ? Math.min(100, Math.max(0, Math.round((daysPregnant / gestationDays) * 100))) : 0;
  let displayStatus = status;
  if (status === "active") displayStatus = daysRemaining < 0 ? "overdue" : daysRemaining <= 7 ? "due" : "active";
  return { daysPregnant, daysRemaining, progressPct, displayStatus };
}

export async function createPregnancyRecord(data: {
  animalId: number;
  confirmationDate: string;
  sireId?: number | null;
  notifyBeforeDue?: number;
  checkupDate?: string | null;
  notifyBeforeCheckup?: number;
  notes?: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();

  const [animal] = await db
    .select({ id: animals.id, sex: animals.sex, isActive: animals.isActive, deletedAt: animals.deletedAt, speciesId: animals.speciesId })
    .from(animals)
    .where(and(tenantScope(tenant, animals), eq(animals.id, data.animalId)))
    .limit(1);
  if (!animal || animal.deletedAt) throw new Error("Animal not found");
  if (animal.sex !== "female") throw new Error("Only female animals can have a pregnancy record");

  const existingActive = await db
    .select({ id: pregnancyRecords.id })
    .from(pregnancyRecords)
    .where(and(tenantScope(tenant, pregnancyRecords), eq(pregnancyRecords.animalId, data.animalId), eq(pregnancyRecords.status, "active"), isNull(pregnancyRecords.deletedAt)))
    .limit(1);
  if (existingActive.length) throw new Error("This animal already has an active pregnancy");

  const [sp] = await db.select({ gestationDays: species.gestationDays }).from(species).where(and(eq(species.companyId, tenant.companyId), eq(species.id, animal.speciesId))).limit(1);
  const gestationDays = sp?.gestationDays ?? 150;
  const expectedDueDate = calculatePregnancyDueDate(data.confirmationDate, gestationDays);

  const [result] = await db.insert(pregnancyRecords).values(tenantInsert({
    animalId: data.animalId,
    sireId: data.sireId ?? null,
    confirmationDate: new Date(data.confirmationDate),
    gestationDays,
    expectedDueDate: new Date(expectedDueDate),
    notifyBeforeDue: data.notifyBeforeDue ?? 7,
    checkupDate: data.checkupDate ? new Date(data.checkupDate) : null,
    notifyBeforeCheckup: data.notifyBeforeCheckup ?? 3,
    notes: data.notes,
    createdBy: data.createdBy,
  }, true));
  return result;
}

export async function updatePregnancyRecord(id: number, data: {
  confirmationDate?: string;
  sireId?: number | null;
  notifyBeforeDue?: number;
  checkupDate?: string | null;
  notifyBeforeCheckup?: number;
  status?: "active" | "delivered" | "aborted" | "lost";
  completedDate?: string | null;
  notes?: string;
}, expectedVersion: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const updateData: any = { ...data };
  if (data.confirmationDate !== undefined) {
    const [rec] = await db.select({ gestationDays: pregnancyRecords.gestationDays }).from(pregnancyRecords).where(and(tenantScope(tenant, pregnancyRecords), eq(pregnancyRecords.id, id))).limit(1);
    if (rec) {
      updateData.confirmationDate = new Date(data.confirmationDate);
      updateData.expectedDueDate = new Date(calculatePregnancyDueDate(data.confirmationDate, rec.gestationDays));
    }
  }
  if (data.checkupDate !== undefined) updateData.checkupDate = data.checkupDate ? new Date(data.checkupDate) : null;
  if (data.completedDate !== undefined) updateData.completedDate = data.completedDate ? new Date(data.completedDate) : null;
  const [result] = await db.update(pregnancyRecords).set({
    ...updateData,
    version: sql`${pregnancyRecords.version} + 1`,
  }).where(and(
    tenantScope(tenant, pregnancyRecords),
    eq(pregnancyRecords.id, id),
    eq(pregnancyRecords.version, expectedVersion),
    isNull(pregnancyRecords.deletedAt),
  ));
  return mutationAffectedOne(result);
}

export async function deletePregnancyRecord(id: number, expectedVersion: number, deletedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.update(pregnancyRecords).set({
    deletedAt: new Date(),
    deletedBy: deletedBy ?? null,
    version: sql`${pregnancyRecords.version} + 1`,
  }).where(and(
    tenantScope(tenant, pregnancyRecords),
    eq(pregnancyRecords.id, id),
    eq(pregnancyRecords.version, expectedVersion),
    isNull(pregnancyRecords.deletedAt),
  ));
  return mutationAffectedOne(result);
}

export async function restorePregnancyRecord(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  await db.update(pregnancyRecords).set({ deletedAt: null, deletedBy: null }).where(and(tenantScope(tenant, pregnancyRecords), eq(pregnancyRecords.id, id)));
}

export async function getPregnancies(filters?: { animalId?: number; status?: string; ownerId?: number; dueWithinDays?: number }) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  const conditions = [tenantScope(tenant, pregnancyRecords), isNull(pregnancyRecords.deletedAt)];
  if (filters?.animalId) conditions.push(eq(pregnancyRecords.animalId, filters.animalId));
  if (filters?.status) conditions.push(eq(pregnancyRecords.status, filters.status as any));
  if (filters?.ownerId) conditions.push(eq(animals.ownerId, filters.ownerId));
  if (filters?.dueWithinDays != null) {
    const target = new Date();
    target.setDate(target.getDate() + filters.dueWithinDays);
    const targetStr = target.toISOString().split("T")[0];
    conditions.push(eq(pregnancyRecords.status, "active"));
    conditions.push(sql`${pregnancyRecords.expectedDueDate} <= ${targetStr}`);
  }
  const rows = await db
    .select({
      record: pregnancyRecords,
      animalCode: animals.animalId,
      speciesName: species.name,
      ownerId: animals.ownerId,
      ownerName: owners.name,
    })
    .from(pregnancyRecords)
    .innerJoin(animals, and(eq(pregnancyRecords.animalId, animals.id), eq(animals.companyId, tenant.companyId)))
    .leftJoin(species, and(eq(animals.speciesId, species.id), eq(species.companyId, tenant.companyId)))
    .leftJoin(owners, and(eq(animals.ownerId, owners.id), eq(owners.companyId, tenant.companyId)))
    .where(and(...conditions))
    .orderBy(pregnancyRecords.expectedDueDate);
  return rows.map(r => ({
    ...r,
    ...pregnancyProgress(r.record.confirmationDate, r.record.expectedDueDate, r.record.gestationDays, r.record.status),
  }));
}

export async function getActivePregnancyByAnimal(animalId: number) {
  const rows = await getPregnancies({ animalId });
  return rows.find(r => r.record.status === "active") ?? null;
}

export async function getPregnancyRecordById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const tenant = requireTenantUserContext();
  const [row] = await db.select().from(pregnancyRecords).where(and(tenantScope(tenant, pregnancyRecords), eq(pregnancyRecords.id, id))).limit(1);
  return row ?? null;
}

/** Close the dam's active pregnancy when a birth/animal is registered against her. */
export async function closePregnancyOnBirth(damId: number, lambingLogId: number | null, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) return;
  const tenant = requireTenantUserContext();
  const today = new Date(new Date().toISOString().split("T")[0]);
  await db
    .update(pregnancyRecords)
    .set({
      status: "delivered",
      outcomeLambingLogId: lambingLogId ?? null,
      completedDate: today,
      version: sql`${pregnancyRecords.version} + 1`,
    })
    .where(and(tenantScope(tenant, pregnancyRecords), eq(pregnancyRecords.animalId, damId), eq(pregnancyRecords.status, "active"), isNull(pregnancyRecords.deletedAt)));
}

export async function getUpcomingPregnancyDueDates(days = 30) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  const target = new Date();
  target.setDate(target.getDate() + days);
  const targetStr = target.toISOString().split("T")[0];
  return db
    .select({
      id: pregnancyRecords.id,
      animalId: pregnancyRecords.animalId,
      animalIdStr: animals.animalId,
      expectedDueDate: pregnancyRecords.expectedDueDate,
      notifyBeforeDue: pregnancyRecords.notifyBeforeDue,
    })
    .from(pregnancyRecords)
    .innerJoin(animals, and(eq(pregnancyRecords.animalId, animals.id), eq(animals.companyId, tenant.companyId)))
    .where(and(tenantScope(tenant, pregnancyRecords), eq(pregnancyRecords.status, "active"), isNull(pregnancyRecords.deletedAt), sql`${pregnancyRecords.expectedDueDate} <= ${targetStr}`))
    .orderBy(pregnancyRecords.expectedDueDate);
}

export async function getUpcomingPregnancyCheckups(days = 30) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  const target = new Date();
  target.setDate(target.getDate() + days);
  const targetStr = target.toISOString().split("T")[0];
  return db
    .select({
      id: pregnancyRecords.id,
      animalId: pregnancyRecords.animalId,
      animalIdStr: animals.animalId,
      checkupDate: pregnancyRecords.checkupDate,
      notifyBeforeCheckup: pregnancyRecords.notifyBeforeCheckup,
    })
    .from(pregnancyRecords)
    .innerJoin(animals, and(eq(pregnancyRecords.animalId, animals.id), eq(animals.companyId, tenant.companyId)))
    .where(and(tenantScope(tenant, pregnancyRecords), eq(pregnancyRecords.status, "active"), isNull(pregnancyRecords.deletedAt), isNotNull(pregnancyRecords.checkupDate), sql`${pregnancyRecords.checkupDate} <= ${targetStr}`))
    .orderBy(pregnancyRecords.checkupDate);
}

export async function getPregnancySummary(ownerId?: number) {
  const active = await getPregnancies({ status: "active", ownerId });
  const delivered = await getPregnancies({ status: "delivered", ownerId });
  return {
    active: active.length,
    dueSoon: active.filter(p => p.displayStatus === "due").length,
    overdue: active.filter(p => p.displayStatus === "overdue").length,
    delivered: delivered.length,
  };
}

export async function getReproductiveHistory(animalId: number) {
  const all = await getPregnancies({ animalId });
  const completed = all.filter(p => p.record.completedDate);
  const lastDelivery = completed
    .map(p => p.record.completedDate)
    .filter(Boolean)
    .sort()
    .pop() ?? null;
  return {
    totalPregnancies: all.length,
    delivered: all.filter(p => p.record.status === "delivered").length,
    aborted: all.filter(p => p.record.status === "aborted").length,
    lost: all.filter(p => p.record.status === "lost").length,
    active: all.filter(p => p.record.status === "active").length,
    lastDeliveryDate: lastDelivery,
  };
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export async function getNotifications(userId?: number, unreadOnly?: boolean) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  if (userId !== undefined && userId !== tenant.userId) return [];
  const conditions = [tenantScope(tenant, notifications)];
  if (userId) {
    const audience = or(eq(notifications.userId, userId), isNull(notifications.userId));
    if (audience) conditions.push(audience);
  }
  if (unreadOnly) {
    const unread = or(
      and(isNotNull(notifications.userId), eq(notifications.isRead, false)),
      and(isNull(notifications.userId), isNull(notificationReceipts.readAt)),
    );
    if (unread) conditions.push(unread);
  }
  const rows = await db
    .select({ notification: notifications, receiptReadAt: notificationReceipts.readAt })
    .from(notifications)
    .leftJoin(notificationReceipts, and(
      eq(notificationReceipts.companyId, tenant.companyId),
      eq(notificationReceipts.notificationId, notifications.id),
      eq(notificationReceipts.companyMembershipId, tenant.membershipId),
    ))
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  return rows.map(row => ({
    ...row.notification,
    isRead: row.notification.userId === null
      ? row.receiptReadAt !== null
      : row.notification.isRead,
  }));
}

export async function createNotification(
  data: TenantCreateInput<typeof notifications.$inferInsert>,
  tx?: DbOrTx,
) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.insert(notifications).values({
    ...tenantInsert(data),
    farmId: tenant.selectedFarmId,
  });
  return result;
}

export async function markNotificationRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  if (userId !== tenant.userId) return false;
  return db.transaction(async tx => {
    const [notification] = await tx
      .select({ id: notifications.id, userId: notifications.userId })
      .from(notifications)
      .where(and(tenantScope(tenant, notifications), eq(notifications.id, id)))
      .limit(1)
      .for("update");
    if (!notification || (notification.userId !== null && notification.userId !== tenant.userId)) {
      return false;
    }
    if (notification.userId !== null) {
      await tx.update(notifications).set({ isRead: true }).where(and(
        tenantScope(tenant, notifications),
        eq(notifications.id, id),
        eq(notifications.userId, tenant.userId),
      ));
    } else {
      await tx.insert(notificationReceipts).values({
        companyId: tenant.companyId,
        notificationId: id,
        companyMembershipId: tenant.membershipId,
        deliveredAt: new Date(),
        readAt: new Date(),
      }).onDuplicateKeyUpdate({ set: { readAt: new Date() } });
    }
    return true;
  });
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  if (userId !== tenant.userId) return;
  await db.transaction(async tx => {
    await tx.update(notifications).set({ isRead: true }).where(and(
      tenantScope(tenant, notifications),
      eq(notifications.userId, tenant.userId),
    ));
    const systemRows = await tx.select({ id: notifications.id })
      .from(notifications)
      .where(and(tenantScope(tenant, notifications), isNull(notifications.userId)));
    if (systemRows.length > 0) {
      const now = new Date();
      await tx.insert(notificationReceipts).values(systemRows.map(row => ({
        companyId: tenant.companyId,
        notificationId: row.id,
        companyMembershipId: tenant.membershipId,
        deliveredAt: now,
        readAt: now,
      }))).onDuplicateKeyUpdate({ set: { readAt: now } });
    }
  });
}

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────

type TenantAuditEntryInput = Omit<
  typeof auditLog.$inferInsert,
  | "publicId"
  | "companyId"
  | "farmId"
  | "userId"
  | "membershipId"
  | "actorType"
  | "actionCategory"
  | "requestId"
  | "outcome"
> & Partial<Pick<
  typeof auditLog.$inferInsert,
  | "companyId"
  | "farmId"
  | "userId"
  | "membershipId"
  | "actorType"
  | "actionCategory"
  | "requestId"
  | "outcome"
>>;

function redactAuditJson(value: unknown) {
  if (!value || typeof value !== "object") return value;
  return redactLogFields(value as Record<string, unknown>);
}

export async function createAuditEntry(data: TenantAuditEntryInput, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) return;
  const tenant = requireTenantUserContext();
  // `null` is an intentional company-level audit scope; only an omitted value
  // inherits the selected farm from the request context.
  const farmId = data.farmId === undefined ? tenant.selectedFarmId : data.farmId;
  if (
    farmId !== null &&
    tenant.accessibleFarmIds !== "all" &&
    !tenant.accessibleFarmIds.includes(farmId)
  ) {
    throw new Error("FARM_ACCESS_DENIED");
  }
  await db.insert(auditLog).values({
    ...data,
    publicId: generatePublicId(),
    companyId: tenant.companyId,
    farmId,
    userId: tenant.userId,
    membershipId: tenant.membershipId,
    actorType: "tenant_user",
    actionCategory: data.actionCategory ?? "crud",
    requestId: data.requestId ?? tenant.requestId,
    outcome: data.outcome ?? "success",
    oldValues: redactAuditJson(data.oldValues),
    newValues: redactAuditJson(data.newValues),
    metadata: redactAuditJson(data.metadata),
  });
}

// entityType (as written to the audit log) → table, for capturing the
// prior values an action overwrote so it can be reverted. Mirrors the
// registry in server/revert.ts.
const AUDIT_TABLES: Record<string, any> = {
  species, category: animalCategories, status: animalStatuses, group: groups,
  birthType: birthTypes, feedItem: feedItems, expenseCategory: expenseCategories,
  expenseSubCategory: expenseSubCategories, owner: owners, vaccine: vaccines,
  vaccinationRecord: vaccinationRecords, rationPlan: rationPlans,
  feedStock: feedStockLedger, feedItemPrice: feedItemPriceHistory,
  expense: expenses, sale: sales, weightLog: weightLog,
  pregnancyRecord: pregnancyRecords, lambingLog: lambingLog, animal: animals,
};

/** Prior values of exactly the fields being changed, for a revertable update.
 * Best-effort: never throws — capturing audit context must not break the
 * mutation it accompanies. */
export async function captureChangedOldValues(
  entityType: string,
  id: number,
  data: Record<string, unknown>,
  dbOrTx?: DbOrTx,
) {
  try {
    const table = AUDIT_TABLES[entityType];
    if (!table) return undefined;
    const db = dbOrTx ?? await getDb();
    if (!db) return undefined;
    const tenant = requireTenantUserContext();
    const [row] = await db.select().from(table).where(and(tenantScope(tenant, table), eq(table.id, id))).limit(1);
    if (!row) return undefined;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(data)) if (k in (row as any)) out[k] = (row as any)[k];
    return out;
  } catch {
    return undefined;
  }
}

/** Full row snapshot, for re-inserting after a hard delete. Best-effort. */
export async function captureRowSnapshot(entityType: string, id: number) {
  try {
    const table = AUDIT_TABLES[entityType];
    if (!table) return undefined;
    const db = await getDb();
    if (!db) return undefined;
    const tenant = requireTenantUserContext();
    const [row] = await db.select().from(table).where(and(tenantScope(tenant, table), eq(table.id, id))).limit(1);
    return row ?? undefined;
  } catch {
    return undefined;
  }
}

export async function getAuditLog(entityType?: string, entityId?: string) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  // The tenant feed shows work done inside the company; platform-admin and
  // migration entries stay visible only in the Admin portal audit page.
  // Rows imported from the legacy audit table carry a NULL actorType and are
  // tenant actions by definition.
  const conditions = [
    tenantScope(tenant, auditLog),
    or(
      isNull(auditLog.actorType),
      inArray(auditLog.actorType, ["tenant_user", "support", "system_job"]),
    )!,
  ];
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
  const tenant = requireTenantUserContext();

  const animalRows = await db
    .select({
      animal: animals,
      category: animalCategories
    })
    .from(animals)
    .leftJoin(animalCategories, and(eq(animals.categoryId, animalCategories.id), eq(animalCategories.companyId, tenant.companyId)))
    .where(and(tenantScope(tenant, animals), eq(animals.id, animalId), isNull(animals.deletedAt)));

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
    .where(and(tenantScope(tenant, expenses), eq(expenses.headId, animalId), eq(expenses.targetType, "head"), isNull(expenses.deletedAt)));
  const directExpenseTotalMinor = toMinor(String(directExpenses[0]?.total ?? 0));

  // Category-level expense allocation: animal's share of vet/vaccine bills etc
  // targeting the animal's category during its time on farm
  const acqDateStr = acquisitionDate.split("T")[0];
  const exitDateStr = exitDate.split("T")[0];
  const catExpensesRows = await db
    .select({ amount: expenses.amount, expenseDate: expenses.expenseDate })
    .from(expenses)
    .where(and(tenantScope(tenant, expenses), eq(expenses.targetType, "category"), eq(expenses.categoryTarget, animal.categoryId), isNull(expenses.deletedAt), sql`${expenses.expenseDate} >= ${acqDateStr}`, sql`${expenses.expenseDate} <= ${exitDateStr}`));

  // Allocate every bill by the category head count on that bill's date. This
  // keeps historical P&L stable and matches the bulk P&L calculation.
  let categoryExpenseAllocationMinor = 0;
  const categoryHeadCountByDate = new Map<string, number>();
  try {
    for (const expense of catExpensesRows) {
      const dateStr = expense.expenseDate instanceof Date ? expense.expenseDate.toISOString().split("T")[0] : String(expense.expenseDate).split("T")[0];
      let headCount = categoryHeadCountByDate.get(dateStr);
      if (headCount == null) {
        const counts = await getCategoryHeadCountsOnDate([animal.categoryId], dateStr);
        headCount = counts.get(animal.categoryId) ?? 1;
        categoryHeadCountByDate.set(dateStr, headCount);
      }
      categoryExpenseAllocationMinor += divMinor(toMinor(String(expense.amount)), headCount);
    }
  } catch (err) {
    logger.error("pnl.category_allocation_failed", { animalId, error: err });
  }

  // Herd (animal-wide) expenses: each such expense in the animal's window is
  // split equally across all animals alive on the expense's date.
  let herdExpenseAllocationMinor = 0;
  try {
    const herdExpenseRows = await db
      .select({ amount: expenses.amount, expenseDate: expenses.expenseDate })
      .from(expenses)
      .where(and(tenantScope(tenant, expenses), eq(expenses.targetType, "herd"), isNull(expenses.deletedAt), sql`${expenses.expenseDate} >= ${acqDateStr}`, sql`${expenses.expenseDate} <= ${exitDateStr}`));
    for (const he of herdExpenseRows) {
      const dStr = he.expenseDate instanceof Date ? he.expenseDate.toISOString().split("T")[0] : String(he.expenseDate).split("T")[0];
      const herdCount = await getHerdHeadCountOnDate(dStr);
      herdExpenseAllocationMinor += divMinor(toMinor(String(he.amount)), herdCount);
    }
  } catch (err) {
    logger.error("pnl.herd_allocation_failed", { animalId, error: err });
  }

  // General farm expenses (water, electricity, labour, etc.) are also real
  // operating costs. Attribute each bill equally to the animals alive on its
  // date so every animal's P&L reflects its full share of the farm's spending.
  let generalExpenseAllocationMinor = 0;
  try {
    const generalExpenseRows = await db
      .select({ amount: expenses.amount, expenseDate: expenses.expenseDate })
      .from(expenses)
      .where(and(tenantScope(tenant, expenses), eq(expenses.targetType, "general"), isNull(expenses.deletedAt), sql`${expenses.expenseDate} >= ${acqDateStr}`, sql`${expenses.expenseDate} <= ${exitDateStr}`));
    for (const ge of generalExpenseRows) {
      const dStr = ge.expenseDate instanceof Date ? ge.expenseDate.toISOString().split("T")[0] : String(ge.expenseDate).split("T")[0];
      generalExpenseAllocationMinor += divMinor(toMinor(String(ge.amount)), await getHerdHeadCountOnDate(dStr));
    }
  } catch (err) {
    console.error(`getAnimalPnL: general allocation failed for animal ${animalId}:`, err);
  }

  // Loaded only for the clicked animal. The list view stays compact while this
  // response gives the dialog an exact, category-level audit trail.
  const expenseDetailRows = await db
    .select({
      targetType: expenses.targetType,
      amount: expenses.amount,
      expenseDate: expenses.expenseDate,
      categoryName: expenseCategories.name,
      subCategoryName: expenseSubCategories.name,
    })
    .from(expenses)
    .leftJoin(expenseCategories, and(eq(expenses.categoryId, expenseCategories.id), eq(expenseCategories.companyId, tenant.companyId)))
    .leftJoin(expenseSubCategories, and(eq(expenses.subCategoryId, expenseSubCategories.id), eq(expenseSubCategories.companyId, tenant.companyId)))
    .where(and(
      tenantScope(tenant, expenses),
      isNull(expenses.deletedAt),
      or(
        and(eq(expenses.targetType, "head"), eq(expenses.headId, animalId)),
        and(eq(expenses.targetType, "category"), eq(expenses.categoryTarget, animal.categoryId), sql`${expenses.expenseDate} >= ${acqDateStr}`, sql`${expenses.expenseDate} <= ${exitDateStr}`),
        and(eq(expenses.targetType, "herd"), sql`${expenses.expenseDate} >= ${acqDateStr}`, sql`${expenses.expenseDate} <= ${exitDateStr}`),
        and(eq(expenses.targetType, "general"), sql`${expenses.expenseDate} >= ${acqDateStr}`, sql`${expenses.expenseDate} <= ${exitDateStr}`),
      ),
    ));
  const expenseBreakdown = new Map<string, {
    categoryName: string;
    subCategoryName: string | null;
    targetType: "head" | "category" | "herd" | "general";
    amountMinor: number;
  }>();
  const addExpenseBreakdown = (
    targetType: "head" | "category" | "herd" | "general",
    categoryName: string,
    subCategoryName: string | null,
    amountMinor: number,
  ) => {
    if (amountMinor === 0) return;
    const key = `${targetType}:${categoryName}:${subCategoryName ?? ""}`;
    const current = expenseBreakdown.get(key);
    if (current) current.amountMinor += amountMinor;
    else expenseBreakdown.set(key, { categoryName, subCategoryName, targetType, amountMinor });
  };
  const herdCountByDate = new Map<string, number>();
  let detailedCategoryAllocationMinor = 0;
  for (const expense of expenseDetailRows) {
    const amountMinor = toMinor(String(expense.amount));
    const categoryName = expense.categoryName ?? "Other expense";
    const subCategoryName = expense.subCategoryName ?? null;
    if (expense.targetType === "head") {
      addExpenseBreakdown("head", categoryName, subCategoryName, amountMinor);
      continue;
    }
    if (expense.targetType === "category") {
      const dateStr = expense.expenseDate instanceof Date ? expense.expenseDate.toISOString().split("T")[0] : String(expense.expenseDate).split("T")[0];
      const shareMinor = divMinor(amountMinor, categoryHeadCountByDate.get(dateStr) ?? 1);
      detailedCategoryAllocationMinor += shareMinor;
      addExpenseBreakdown("category", categoryName, subCategoryName, shareMinor);
      continue;
    }
    const dateStr = expense.expenseDate instanceof Date ? expense.expenseDate.toISOString().split("T")[0] : String(expense.expenseDate).split("T")[0];
    let herdCount = herdCountByDate.get(dateStr);
    if (herdCount == null) {
      herdCount = await getHerdHeadCountOnDate(dateStr);
      herdCountByDate.set(dateStr, herdCount);
    }
    addExpenseBreakdown(expense.targetType, categoryName, subCategoryName, divMinor(amountMinor, herdCount));
  }
  // Keep the headline total and detailed category rows on the same allocation
  // basis, including minor-unit rounding for each individual bill.
  categoryExpenseAllocationMinor = detailedCategoryAllocationMinor;

  // Sale revenue (exclude soft-deleted sales)
  const saleRows = await db
    .select()
    .from(sales)
    .where(and(tenantScope(tenant, sales), eq(sales.animalId, animalId), isNull(sales.deletedAt)))
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
    logger.error("pnl.feed_cost_failed", { animalId, error: err });
  }
  const feedCostMinor = toMinor(feedCost);

  const purchaseCostMinor = toMinor(String(animal.purchaseCost ?? "0"));
  // Operating cost = everything EXCEPT purchase cost. Computed by direct
  // addition (not totalCost - purchaseCost) so it's immune to purchaseCost
  // parsing issues.
  const animalOperatingCostMinor = feedCostMinor + directExpenseTotalMinor + categoryExpenseAllocationMinor + herdExpenseAllocationMinor + generalExpenseAllocationMinor;
  const operatingCostMinor = animalOperatingCostMinor;
  const totalCostMinor = purchaseCostMinor + operatingCostMinor;
  const netPnLMinor = revenueMinor - totalCostMinor;

  const purchaseCost = toMajor(purchaseCostMinor);
  const directExpenseTotal = toMajor(directExpenseTotalMinor);
  const categoryExpenseAllocation = toMajor(categoryExpenseAllocationMinor);
  const herdExpenseAllocation = toMajor(herdExpenseAllocationMinor);
  const generalExpenseAllocation = toMajor(generalExpenseAllocationMinor);
  const revenue = toMajor(revenueMinor);
  const totalCost = toMajor(totalCostMinor);
  const netPnL = toMajor(netPnLMinor);
  const costPerDay = daysOnFarm > 0 ? toMajor(divMinor(operatingCostMinor, daysOnFarm)) : 0;
  const costPerMonth = daysOnFarm > 0 ? toMajor(operatingCostMinor * 30 / daysOnFarm) : 0;
  const feedCostPerMonth = daysOnFarm > 0 ? toMajor(feedCostMinor * 30 / daysOnFarm) : 0;
  const pricePerKg = weightAtSale > 0 ? toMajor(Math.round(revenueMinor / weightAtSale)) : 0;

  // Projected cost for active animals — based on actual growth rate and the
  // remaining distance to target weight, not a flat 30 days.
  const targetWeight = parseFloat(category?.targetWeightKg ?? "0");
  const weightRows = await db
    .select({ weightKg: weightLog.weightKg, weighDate: weightLog.weighDate })
    .from(weightLog)
    .where(and(tenantScope(tenant, weightLog), eq(weightLog.animalId, animalId), isNull(weightLog.deletedAt)))
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

  const animalOperatingCost = toMajor(animalOperatingCostMinor);

  return {
    animalId,
    daysOnFarm,
    purchaseCost,
    animalOperatingCost,
    feedCost,
    directExpenseTotal,
    categoryExpenseAllocation,
    herdExpenseAllocation,
    generalExpenseAllocation,
    expenseBreakdown: Array.from(expenseBreakdown.values())
      .filter(item => item.amountMinor > 0)
      .sort((a, b) => b.amountMinor - a.amountMinor)
      .map(({ amountMinor, ...item }) => ({ ...item, amount: toMajor(amountMinor) })),
    totalCost,
    revenue,
    netPnL,
    costPerDay,
    costPerMonth,
    feedCostPerMonth,
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
  const tenant = requireTenantUserContext();

  const today = new Date().toISOString().split("T")[0];

  // 1. Fetch all animals with category + species + status names
  const conditions = [tenantScope(tenant, animals), isNotNull(animals.id), isNull(animals.deletedAt)];
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
    .leftJoin(animalCategories, and(eq(animals.categoryId, animalCategories.id), eq(animalCategories.companyId, tenant.companyId)))
    .leftJoin(species, and(eq(animals.speciesId, species.id), eq(species.companyId, tenant.companyId)))
    .leftJoin(animalStatuses, and(eq(animals.statusId, animalStatuses.id), eq(animalStatuses.companyId, tenant.companyId)))
    .leftJoin(owners, and(eq(animals.ownerId, owners.id), eq(owners.companyId, tenant.companyId)))
    .where(and(...conditions))
    .orderBy(animals.animalId);

  if (!allAnimals.length) return [];

  // 2. Pre-fetch all sales (one query)
  const allSales = await db.select().from(sales).where(and(tenantScope(tenant, sales), isNull(sales.deletedAt)));
  const saleByAnimal = new Map<number, (typeof allSales)[0]>();
  for (const s of allSales) saleByAnimal.set(s.animalId, s);

  // 3. Pre-fetch all direct (head) expenses per animal.
  const allDirectExp = await db
    .select({ headId: expenses.headId, total: sql<number>`SUM(amount)` })
    .from(expenses)
    .where(and(tenantScope(tenant, expenses), eq(expenses.targetType, "head"), isNull(expenses.deletedAt)))
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
    .where(and(tenantScope(tenant, expenses), eq(expenses.targetType, "category"), isNull(expenses.deletedAt)));

  // Build a map: categoryId → array of { amountMinor, date }.
  const catExpByCatId = new Map<number, Array<{ amount: number; date: string }>>(); // amounts in minor units
  for (const e of allCatExp) {
    if (e.categoryTarget == null) continue;
    const catId = Number(e.categoryTarget);
    const dateStr = e.expenseDate instanceof Date ? e.expenseDate.toISOString().split("T")[0] : String(e.expenseDate).split("T")[0];
    if (!catExpByCatId.has(catId)) catExpByCatId.set(catId, []);
    catExpByCatId.get(catId)!.push({ amount: toMinor(String(e.amount)), date: dateStr });
  }

  // Allocation denominators must be the WHOLE farm, independent of the display
  // filter (owner/species/category). A category/herd expense is shared by every
  // animal that overlapped it — not just the filtered subset — otherwise a
  // single owner's animals would absorb the full expense and the per-animal P&L
  // would no longer reconcile with the Dashboard / Income Statement.
  const denomAnimals = await db
    .select({ categoryId: animals.categoryId, acquisitionDate: animals.acquisitionDate, exitDate: animals.exitDate })
    .from(animals)
    .where(and(tenantScope(tenant, animals), isNull(animals.deletedAt)));
  const normAcq = (d: any) => d instanceof Date ? d.toISOString().split("T")[0] : String(d ?? today).split("T")[0];
  const normExit = (d: any) => d ? (d instanceof Date ? d.toISOString().split("T")[0] : String(d).split("T")[0]) : null;

  // Pre-build per-category animal list with acquisition/exit dates so we can
  // allocate each category expense against the head count that overlapped it.
  const animalsByCategory = new Map<number, Array<{ acq: string; exit: string | null }>>();
  for (const a of denomAnimals) {
    const acq = normAcq(a.acquisitionDate);
    const exit = normExit(a.exitDate);
    if (!animalsByCategory.has(a.categoryId)) animalsByCategory.set(a.categoryId, []);
    animalsByCategory.get(a.categoryId)!.push({ acq, exit });
  }

  // Herd (animal-wide) expenses: each split equally across all animals alive on
  // its date. Load them once and precompute the per-expense allocation in minor
  // units using an in-memory herd-count-on-date over the WHOLE farm.
  const allHerdExp = await db
    .select({ amount: expenses.amount, expenseDate: expenses.expenseDate })
    .from(expenses)
    .where(and(tenantScope(tenant, expenses), eq(expenses.targetType, "herd"), isNull(expenses.deletedAt)));
  const allAnimalDates = denomAnimals.map(a => ({ acq: normAcq(a.acquisitionDate), exit: normExit(a.exitDate) }));
  const herdCountOnDate = (dateStr: string) => Math.max(1, allAnimalDates.filter((a) => a.acq <= dateStr && (a.exit === null || a.exit >= dateStr)).length);
  // Pre-split each herd expense → { date, perHeadMinor } so each animal alive
  // that day picks up the same per-head share.
  const herdExpenseShares = allHerdExp.map((he: any) => {
    const dateStr = he.expenseDate instanceof Date ? he.expenseDate.toISOString().split("T")[0] : String(he.expenseDate).split("T")[0];
    return { date: dateStr, perHeadMinor: divMinor(toMinor(String(he.amount)), herdCountOnDate(dateStr)) };
  });

  // General farm bills are shared over the same live herd denominator as
  // animal-wide bills.
  const allGeneralExp = await db
    .select({ amount: expenses.amount, expenseDate: expenses.expenseDate })
    .from(expenses)
    .where(and(tenantScope(tenant, expenses), eq(expenses.targetType, "general"), isNull(expenses.deletedAt)));
  const generalExpenseShares = allGeneralExp.map((ge: any) => {
    const dateStr = ge.expenseDate instanceof Date ? ge.expenseDate.toISOString().split("T")[0] : String(ge.expenseDate).split("T")[0];
    return { date: dateStr, perHeadMinor: divMinor(toMinor(String(ge.amount)), herdCountOnDate(dateStr)) };
  });

  // 5. Pre-fetch ALL ration plans (active + historical) for accurate per-period cost
  const allPlans = await db.select().from(rationPlans).where(and(tenantScope(tenant, rationPlans), isNull(rationPlans.deletedAt)));
  // Group by categoryId
  const plansByCategory = new Map<number, typeof allPlans>();
  for (const p of allPlans) {
    if (!plansByCategory.has(p.categoryId)) plansByCategory.set(p.categoryId, []);
    plansByCategory.get(p.categoryId)!.push(p);
  }

  // 6. Build feed price cache — key: `feedItemId:dateStr`
  // 6. Pre-fetch ALL feed price history (one query) for in-memory segmented costing.
  const allPriceRows = await db.select().from(feedItemPriceHistory).where(tenantScope(tenant, feedItemPriceHistory));
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
        const shareMinor = divMinor(ce.amount, headsAtExpense);
        categoryExpenseAllocationMinor += shareMinor;
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

    let generalExpenseAllocationMinor = 0;
    for (const gs of generalExpenseShares) {
      if (gs.date >= acqDateStr && gs.date <= exitDateStr) {
        generalExpenseAllocationMinor += gs.perHeadMinor;
      }
    }

    // Operating cost = feed + direct + category + herd + general (NOT purchase cost).
    // Direct sum avoids any purchaseCost parsing issues.
    const animalOperatingCostMinor = feedCostMinor + directExpenseTotalMinor + categoryExpenseAllocationMinor + herdExpenseAllocationMinor + generalExpenseAllocationMinor;
    const operatingCostMinor = animalOperatingCostMinor;
    const totalCostMinor = purchaseCostMinor + operatingCostMinor;
    const netPnLMinor = revenueMinor - totalCostMinor;

    const purchaseCost = toMajor(purchaseCostMinor);
    const directExpenseTotal = toMajor(directExpenseTotalMinor);
    const revenue = toMajor(revenueMinor);
    const totalCost = toMajor(totalCostMinor);
    const netPnL = toMajor(netPnLMinor);
    const costPerDay = daysOnFarm > 0 ? toMajor(divMinor(operatingCostMinor, daysOnFarm)) : 0;
    const costPerMonth = daysOnFarm > 0 ? toMajor(operatingCostMinor * 30 / daysOnFarm) : 0;
    const feedCostPerMonth = daysOnFarm > 0 ? toMajor(feedCostMinor * 30 / daysOnFarm) : 0;
    const pricePerKg = weightAtSale > 0 ? toMajor(Math.round(revenueMinor / weightAtSale)) : 0;

    const animalOperatingCost = toMajor(animalOperatingCostMinor);

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
      animalOperatingCost,
      feedCost,
      directExpenseTotal,
      categoryExpenseAllocation: toMajor(categoryExpenseAllocationMinor),
      herdExpenseAllocation: toMajor(herdExpenseAllocationMinor),
      generalExpenseAllocation: toMajor(generalExpenseAllocationMinor),
      totalCost,
      revenue,
      netPnL,
      costPerDay,
      costPerMonth,
      feedCostPerMonth,
      pricePerKg
    });
  }
  return results;
}

/**
 * Check if an animal should be auto-staged to another category based on its latest weight.
 * Called after every weight log entry. Returns the new categoryId if staged.
 *
 * The category prefix is part of the registry ID. Auto-staging therefore
 * allocates a new ID from the target category's sequence.
 */
export async function checkAndStageAnimal(
  animalId: number,
  currentWeightKg: number,
  changedBy?: number,
  tx?: DbOrTx,
): Promise<{ staged: boolean; newCategoryId?: number; newAnimalId?: string }> {
  const sharedDb = tx ?? (await getDb());
  if (!sharedDb) return { staged: false };
  const tenant = requireTenantUserContext();

  const stageWithin = async (scope: DbOrTx) => {
    const lockedAnimal = await getRawAnimalForUpdate(animalId, scope);
    if (!lockedAnimal || lockedAnimal.deletedAt) return { staged: false };

    const [catRow] = await scope
      .select({
        autoStageWeightKg: animalCategories.autoStageWeightKg,
        autoStageTargetCategoryId: animalCategories.autoStageTargetCategoryId,
      })
      .from(animalCategories)
      .where(and(eq(animalCategories.companyId, tenant.companyId), eq(animalCategories.id, lockedAnimal.categoryId)))
      .limit(1);

    if (!catRow?.autoStageWeightKg || !catRow.autoStageTargetCategoryId) {
      return { staged: false };
    }
    if (currentWeightKg < parseFloat(catRow.autoStageWeightKg)) {
      return { staged: false };
    }

    const targetCat = await getCategoryForUpdate(
      catRow.autoStageTargetCategoryId,
      scope,
    );
    if (!targetCat?.isActive ||
        targetCat.deletedAt ||
        targetCat.speciesId !== lockedAnimal.speciesId ||
        targetCat.id === lockedAnimal.categoryId) {
      return { staged: false };
    }

    const stagedAnimalId = await generateNextAnimalId(
      targetCat.id,
      targetCat.idPrefix,
      scope,
    );
    await scope
      .update(animals)
      .set({
        categoryId: targetCat.id,
        animalId: stagedAnimalId,
        updatedAt: new Date(),
      })
      .where(and(tenantScope(tenant, animals), eq(animals.id, animalId), isNull(animals.deletedAt)));

    await createAuditEntry({
      userId: changedBy,
      action: "auto_stage",
      entityType: "animal",
      entityId: String(animalId),
      oldValues: {
        categoryId: lockedAnimal.categoryId,
        animalId: lockedAnimal.animalId,
      } as any,
      newValues: {
        categoryId: targetCat.id,
        animalId: stagedAnimalId,
        autoStagedAtWeightKg: currentWeightKg,
      } as any,
    }, scope);

    return {
      staged: true,
      newCategoryId: targetCat.id,
      newAnimalId: stagedAnimalId,
    };
  };

  return tx
    ? stageWithin(tx)
    : sharedDb.transaction(stageWithin);
}

// ─── OWNER-SCOPED COST HELPERS ────────────────────────────────────────────────
// Feed purchases (feed_stock_ledger) are recorded farm-wide and are NOT tagged
// by owner. To still answer "what did THIS owner's animals cost to feed?", we
// model feed on a CONSUMPTION basis: for each of the owner's animals we apply
// its category ration plan × the feed price in force, over the days the animal
// was on the farm within [fromDate, toDate]. This mirrors the per-animal feed
// math used by the P&L (segmentedFeedCostPure), so the owner's feed number is
// always consistent with that animal's P&L row.
export async function getOwnerFeedCostMinor(ownerId: number, fromDate: string, toDate: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const tenant = requireTenantUserContext();

  const norm = (d: Date | string | null): string | null => {
    if (d == null) return null;
    return d instanceof Date ? d.toISOString().split("T")[0] : String(d).split("T")[0];
  };

  const owned = await db
    .select({
      categoryId: animals.categoryId,
      acquisitionDate: animals.acquisitionDate,
      exitDate: animals.exitDate,
    })
    .from(animals)
    .where(and(tenantScope(tenant, animals), eq(animals.ownerId, ownerId), isNull(animals.deletedAt)));
  if (!owned.length) return 0;

  const allPlans = await db.select().from(rationPlans).where(and(tenantScope(tenant, rationPlans), isNull(rationPlans.deletedAt)));
  const plansByCategory = new Map<number, typeof allPlans>();
  for (const p of allPlans) {
    if (!plansByCategory.has(p.categoryId)) plansByCategory.set(p.categoryId, []);
    plansByCategory.get(p.categoryId)!.push(p);
  }
  const allPriceRows = await db.select().from(feedItemPriceHistory).where(tenantScope(tenant, feedItemPriceHistory));
  const pricesByItem = buildPricesByItem(allPriceRows);

  let totalMinor = 0;
  for (const a of owned) {
    const acq = norm(a.acquisitionDate) ?? fromDate;
    const exit = norm(a.exitDate) ?? toDate;
    // Clamp the animal's time on farm to the requested period.
    const start = acq > fromDate ? acq : fromDate;
    const end = exit < toDate ? exit : toDate;
    if (end <= start) continue;
    const plans = (plansByCategory.get(a.categoryId) ?? []).map(p => ({
      feedItemId: p.feedItemId,
      qtyPerHeadPerDay: p.qtyPerHeadPerDay,
      effectiveDate: p.effectiveDate instanceof Date ? p.effectiveDate.toISOString().split("T")[0] : String(p.effectiveDate).split("T")[0],
      endDate: p.endDate ? (p.endDate instanceof Date ? p.endDate.toISOString().split("T")[0] : String(p.endDate).split("T")[0]) : null,
      isActive: p.isActive,
    }));
    totalMinor += toMinor(String(segmentedFeedCostPure(plans, pricesByItem, start, end)));
  }
  return totalMinor;
}

// ─── OWNER EXPENSE ALLOCATION ─────────────────────────────────────────────────
// An owner's true share of operating expenses, matching the per-animal P&L:
//   • head expenses          → counted in full when the head is the owner's
//   • category expenses       → owner's SHARE = amount × (owner heads in the
//                               category on the expense date) ÷ (all heads in
//                               the category on that date)
//   • herd (animal-wide)      → owner's SHARE = amount × (owner heads alive on
//                               the expense date) ÷ (all heads alive that date)
//   • general (overhead)      → EXCLUDED (e.g. electricity — not owner-related)
// This is the same allocation getAllAnimalsPnL applies per animal, so the
// Dashboard, Income Statement and P&L always reconcile. Pure for unit testing.
export function allocateOwnerExpensesPure(params: {
  ownedAnimalIds: Set<number>;
  animals: Array<{ id: number; categoryId: number; acq: string; exit: string | null }>;
  expenses: Array<{ targetType: string; headId: number | null; categoryTarget: number | null; amountMinor: number; date: string; categoryName: string }>;
}): { byCategory: Map<string, number>; headMinor: number; categoryMinor: number; herdMinor: number } {
  const { ownedAnimalIds, animals: allAnimals, expenses: exp } = params;
  const alive = (a: { acq: string; exit: string | null }, d: string) => a.acq <= d && (a.exit === null || a.exit >= d);
  const byCategory = new Map<string, number>();
  const add = (name: string, minor: number) => {
    if (minor === 0) return;
    byCategory.set(name, (byCategory.get(name) ?? 0) + minor);
  };

  let headMinor = 0;
  let categoryMinor = 0;
  let herdMinor = 0;

  for (const e of exp) {
    if (e.targetType === "head") {
      if (e.headId == null || !ownedAnimalIds.has(e.headId)) continue;
      headMinor += e.amountMinor;
      add(e.categoryName, e.amountMinor);
    } else if (e.targetType === "category") {
      if (e.categoryTarget == null) continue;
      let total = 0;
      let ownerHeads = 0;
      for (const a of allAnimals) {
        if (a.categoryId !== e.categoryTarget || !alive(a, e.date)) continue;
        total++;
        if (ownedAnimalIds.has(a.id)) ownerHeads++;
      }
      if (total === 0 || ownerHeads === 0) continue;
      const share = divMinor(e.amountMinor, total) * ownerHeads;
      categoryMinor += share;
      add(e.categoryName, share);
    } else if (e.targetType === "herd") {
      let total = 0;
      let ownerHeads = 0;
      for (const a of allAnimals) {
        if (!alive(a, e.date)) continue;
        total++;
        if (ownedAnimalIds.has(a.id)) ownerHeads++;
      }
      if (total === 0 || ownerHeads === 0) continue;
      const share = divMinor(e.amountMinor, total) * ownerHeads;
      herdMinor += share;
      add(e.categoryName, share);
    }
    // general → excluded
  }
  return { byCategory, headMinor, categoryMinor, herdMinor };
}

// DB wrapper for allocateOwnerExpensesPure over the period [fromDate, toDate].
export async function getOwnerExpenseBreakdownMinor(ownerId: number, fromDate: string, toDate: string): Promise<{
  byCategory: Array<{ categoryName: string; total: number }>;
  headMinor: number;
  categoryMinor: number;
  herdMinor: number;
  totalOtherMinor: number;
}> {
  const empty = { byCategory: [], headMinor: 0, categoryMinor: 0, herdMinor: 0, totalOtherMinor: 0 };
  const db = await getDb();
  if (!db) return empty;
  const tenant = requireTenantUserContext();

  const norm = (d: Date | string | null): string | null =>
    d == null ? null : (d instanceof Date ? d.toISOString().split("T")[0] : String(d).split("T")[0]);

  const allAnimals = await db
    .select({ id: animals.id, categoryId: animals.categoryId, ownerId: animals.ownerId, acquisitionDate: animals.acquisitionDate, exitDate: animals.exitDate })
    .from(animals)
    .where(and(tenantScope(tenant, animals), isNull(animals.deletedAt)));
  const ownedAnimalIds = new Set(allAnimals.filter(a => a.ownerId === ownerId).map(a => a.id));
  if (ownedAnimalIds.size === 0) return empty;

  const animalsForCalc = allAnimals.map(a => ({
    id: a.id,
    categoryId: a.categoryId,
    acq: norm(a.acquisitionDate) ?? fromDate,
    exit: norm(a.exitDate),
  }));

  const expRows = await db
    .select({
      targetType: expenses.targetType,
      headId: expenses.headId,
      categoryTarget: expenses.categoryTarget,
      amount: expenses.amount,
      expenseDate: expenses.expenseDate,
      categoryName: expenseCategories.name,
    })
    .from(expenses)
    .leftJoin(expenseCategories, and(eq(expenses.categoryId, expenseCategories.id), eq(expenseCategories.companyId, tenant.companyId)))
    .where(and(tenantScope(tenant, expenses), sql`${expenses.expenseDate} >= ${fromDate}`, sql`${expenses.expenseDate} <= ${toDate}`, isNull(expenses.deletedAt)));

  const expForCalc = expRows.map(e => ({
    targetType: e.targetType,
    headId: e.headId,
    categoryTarget: e.categoryTarget,
    amountMinor: toMinor(String(e.amount ?? 0)),
    date: norm(e.expenseDate) ?? fromDate,
    categoryName: e.categoryName ?? "Other",
  }));

  const { byCategory, headMinor, categoryMinor, herdMinor } = allocateOwnerExpensesPure({
    ownedAnimalIds,
    animals: animalsForCalc,
    expenses: expForCalc,
  });

  return {
    byCategory: Array.from(byCategory.entries()).map(([categoryName, minor]) => ({ categoryName, total: toMajor(minor) })),
    headMinor,
    categoryMinor,
    herdMinor,
    totalOtherMinor: headMinor + categoryMinor + herdMinor,
  };
}

export async function getDashboardKPIs(filters?: { fromDate?: string; toDate?: string; speciesId?: number; categoryId?: number; groupId?: number; ownerId?: number }) {
  const db = await getDb();
  if (!db) return null;
  const tenant = requireTenantUserContext();

  const today = new Date().toISOString().split("T")[0];
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const fromDate = filters?.fromDate ?? twelveMonthsAgo.toISOString().split("T")[0];
  const toDate = filters?.toDate ?? today;

  // ── Owner scoping ───────────────────────────────────────────────────────────
  // When scoped to an owner, every number reflects only that owner's animals.
  // General overhead (e.g. electricity) and bulk feed PURCHASES are not
  // attributable to an owner and are excluded. The owner's expense share is
  // computed by the same allocation as the per-animal P&L (head in full,
  // category/herd by head count on the expense date); feed is modeled from the
  // owner's ration-plan consumption.
  const ownerId = filters?.ownerId;
  const ownedAnimalIds: number[] = ownerId
    ? (await db.select({ id: animals.id }).from(animals).where(and(tenantScope(tenant, animals), eq(animals.ownerId, ownerId), isNull(animals.deletedAt)))).map(r => r.id)
    : [];
  const ownerSalesCond = ownerId
    ? (ownedAnimalIds.length > 0 ? inArray(sales.animalId, ownedAnimalIds) : sql`1 = 0`)
    : sql`1 = 1`;
  const ownerBreakdown = ownerId ? await getOwnerExpenseBreakdownMinor(ownerId, fromDate, toDate) : null;

  // Active head count (exclude soft-deleted)
  const headFilters = {
    speciesId: filters?.speciesId,
    categoryId: filters?.categoryId,
    groupId: filters?.groupId,
    ownerId,
  };
  const headConditions = activeAnimalHeadConditions(headFilters);
  const lambHeadStats = await getUnpromotedLambHeadStats(headFilters);

  const headCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(animals)
    .where(and(...headConditions));

  // Total other expenses in period (vet, labour, vaccine etc — NOT feed).
  // Whole-farm = every expense; owner scope = the owner's allocated share
  // (head + category + herd; general/overhead excluded), via ownerBreakdown.
  const totalOtherExpenses = await db
    .select({ total: sql<number>`SUM(amount)` })
    .from(expenses)
    .where(and(tenantScope(tenant, expenses), sql`${expenses.expenseDate} >= ${fromDate}`, sql`${expenses.expenseDate} <= ${toDate}`, isNull(expenses.deletedAt)));

  // Feed cost in period. Whole-farm = actual bulk purchases (cash basis).
  // Owner-scoped = modeled consumption of the owner's animals (accrual basis),
  // because purchases aren't tagged by owner.
  const feedPurchasesInPeriod = await db
    .select({ total: sql<number>`SUM(totalCost)` })
    .from(feedStockLedger)
    .where(and(tenantScope(tenant, feedStockLedger), eq(feedStockLedger.transactionType, "purchase"), sql`${feedStockLedger.transactionDate} >= ${fromDate}`, sql`${feedStockLedger.transactionDate} <= ${toDate}`, isNull(feedStockLedger.deletedAt)));
  const ownerFeedMinor = ownerId ? await getOwnerFeedCostMinor(ownerId, fromDate, toDate) : 0;

  // Total sales revenue in period — F9: track BOTH accrued (salePrice) and
  // cash actually received (amountPaid) so the dashboard can show outstanding.
  const totalRevenue = await db
    .select({
      total: sql<number>`SUM(salePrice)`,
      paid: sql<number>`SUM(amountPaid)`,
    })
    .from(sales)
    .where(and(tenantScope(tenant, sales), sql`${sales.saleDate} >= ${fromDate}`, sql`${sales.saleDate} <= ${toDate}`, isNull(sales.deletedAt), ownerSalesCond));

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
      tenantScope(tenant, animals),
      isNull(animals.deletedAt),
      sql`${animals.acquisitionDate} <= ${toDate}`,
      sql`(${animals.exitDate} IS NULL OR ${animals.exitDate} >= ${fromDate})`,
      ownerId ? eq(animals.ownerId, ownerId) : sql`1 = 1`,
    ));
  const totalHeadDays = Number(avgHeadRows[0]?.totalHeadDays ?? 0);
  const lambHeadDays = await getUnpromotedLambHeadDays(headFilters, fromDate, toDate);
  const combinedHeadDays = totalHeadDays + lambHeadDays;
  const avgHeads = combinedHeadDays / periodDaysForAvg;

  // Category breakdown includes active animal rows plus unpromoted lambing rows.
  const categoryBreakdown = await getCurrentHeadCountByCategory(headFilters);

  const otherExpensesMinor = ownerBreakdown ? ownerBreakdown.totalOtherMinor : toMinor(String(totalOtherExpenses[0]?.total ?? 0));
  const feedExpensesMinor = ownerId ? ownerFeedMinor : toMinor(String(feedPurchasesInPeriod[0]?.total ?? 0));
  const totalExpensesMinor = otherExpensesMinor + feedExpensesMinor;
  const revenueMinor = toMinor(String(totalRevenue[0]?.total ?? 0));
  const cashReceivedMinor = toMinor(String(totalRevenue[0]?.paid ?? 0));
  const outstandingMinor = revenueMinor - cashReceivedMinor;
  const activeHeads = Number(headCount[0]?.count ?? 0) + lambHeadStats.total;

  const otherExpenses = toMajor(otherExpensesMinor);
  const feedExpenses = toMajor(feedExpensesMinor);
  const totalExpenses = toMajor(totalExpensesMinor);
  const revenueNum = toMajor(revenueMinor);

  // Cost per head per day (Excel's primary daily metric) — B3: divide by the
  // AVERAGE headcount over the period so selling animals mid-period doesn't
  // inflate the metric. totalHeadDays is exactly Σ(days each head was present).
  const costPerHeadPerDay = combinedHeadDays > 0 ? toMajor(divMinor(totalExpensesMinor, combinedHeadDays)) : 0;

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
    ownerId: ownerId ?? null,
    period: { fromDate, toDate }
  };
}

export async function getFeedStockStatus(timings?: Record<string, number>, tx?: DbOrTx) {
  const started = Date.now();
  const db = tx ?? (await getDb());
  if (!db) return [];
  const tenant = requireTenantUserContext();

  const today = new Date().toISOString().split("T")[0];
  const scopedFarmIds = tenant.selectedFarmId !== null
    ? [tenant.selectedFarmId]
    : tenant.accessibleFarmIds === "all"
      ? null
      : [...tenant.accessibleFarmIds];
  const allFarms = tenant.selectedFarmId === null &&
    (tenant.farmAccessMode === "all" || scopedFarmIds === null);
  const farmList = scopedFarmIds?.map(id => sql`${id}`) ?? [];
  const stockFarmScope = allFarms
    ? sql`TRUE`
    : farmList.length > 0
      ? sql`farmId IN (${sql.join(farmList, sql`, `)})`
      : sql`FALSE`;
  const stockAliasFarmScope = allFarms
    ? sql`TRUE`
    : farmList.length > 0
      ? sql`l.farmId IN (${sql.join(farmList, sql`, `)})`
      : sql`FALSE`;
  const animalFarmScope = allFarms
    ? sql`TRUE`
    : farmList.length > 0
      ? sql`farmId IN (${sql.join(farmList, sql`, `)})`
      : sql`FALSE`;
  const rationFarmScope = allFarms
    ? sql`TRUE`
    : farmList.length > 0
      ? sql`rp.farmId IN (${sql.join(farmList, sql`, `)})`
      : sql`FALSE`;

  type FeedStockStatusRow = {
    farmId: number | null;
    feedItemId: number;
    feedItemName: string;
    unit: string;
    lastCountQty: string | number | null;
    lastCountDate: string | Date | null;
    purchasedQty: string | number | null;
    adjustmentQty: string | number | null;
    categoryId: number | null;
    planQty: string | number | null;
    heads: string | number | null;
  };

  const queryStarted = Date.now();
  const [rows] = await db.execute(sql`
    WITH latest_counts AS (
      SELECT farmId, feedItemId, qty, transactionDate
      FROM (
        SELECT
          farmId,
          feedItemId,
          qty,
          transactionDate,
          ROW_NUMBER() OVER (
            PARTITION BY farmId, feedItemId
            ORDER BY transactionDate DESC, id DESC
          ) AS rn
        FROM saas_azal_feed_stock_ledger
        WHERE transactionType = 'stock_count'
          AND companyId = ${tenant.companyId}
          AND ${stockFarmScope}
          AND deletedAt IS NULL
      ) ranked_counts
      WHERE rn = 1
    ),
    tx_sums AS (
      SELECT
        l.farmId,
        l.feedItemId,
        SUM(CASE WHEN l.transactionType = 'purchase' THEN l.qty ELSE 0 END) AS purchasedQty,
        SUM(CASE WHEN l.transactionType = 'adjustment' THEN l.qty ELSE 0 END) AS adjustmentQty
      FROM saas_azal_feed_stock_ledger l
      LEFT JOIN latest_counts lc
        ON lc.farmId = l.farmId AND lc.feedItemId = l.feedItemId
      WHERE l.transactionType IN ('purchase', 'adjustment')
        AND l.companyId = ${tenant.companyId}
        AND ${stockAliasFarmScope}
        AND l.deletedAt IS NULL
        AND l.transactionDate >= COALESCE(lc.transactionDate, '2020-01-01')
      GROUP BY l.farmId, l.feedItemId
    ),
    head_counts AS (
      SELECT farmId, categoryId, COUNT(*) AS heads
      FROM saas_azal_animals
      WHERE isActive = TRUE
        AND companyId = ${tenant.companyId}
        AND ${animalFarmScope}
        AND deletedAt IS NULL
      GROUP BY farmId, categoryId
    ),
    farm_feed AS (
      SELECT farmId, feedItemId FROM latest_counts
      UNION
      SELECT farmId, feedItemId FROM tx_sums
      UNION
      SELECT rp.farmId, rp.feedItemId
      FROM saas_azal_ration_plans rp
      WHERE rp.companyId = ${tenant.companyId}
        AND ${rationFarmScope}
        AND rp.isActive = TRUE
        AND rp.deletedAt IS NULL
    )
    SELECT
      ff.farmId AS farmId,
      fi.id AS feedItemId,
      fi.name AS feedItemName,
      fi.unit AS unit,
      lc.qty AS lastCountQty,
      lc.transactionDate AS lastCountDate,
      COALESCE(tx.purchasedQty, 0) AS purchasedQty,
      COALESCE(tx.adjustmentQty, 0) AS adjustmentQty,
      rp.categoryId AS categoryId,
      rp.qtyPerHeadPerDay AS planQty,
      COALESCE(hc.heads, 0) AS heads
    FROM saas_azal_feed_items fi
    LEFT JOIN farm_feed ff ON ff.feedItemId = fi.id
    LEFT JOIN latest_counts lc
      ON lc.farmId = ff.farmId AND lc.feedItemId = fi.id
    LEFT JOIN tx_sums tx
      ON tx.farmId = ff.farmId AND tx.feedItemId = fi.id
    LEFT JOIN saas_azal_ration_plans rp
      ON rp.feedItemId = fi.id
      AND rp.farmId = ff.farmId
      AND rp.companyId = ${tenant.companyId}
      AND ${rationFarmScope}
      AND rp.isActive = TRUE
      AND rp.deletedAt IS NULL
    LEFT JOIN head_counts hc
      ON hc.farmId = rp.farmId AND hc.categoryId = rp.categoryId
    WHERE fi.companyId = ${tenant.companyId}
      AND fi.deletedAt IS NULL
    ORDER BY fi.name
  `) as unknown as [FeedStockStatusRow[], unknown];
  timings && (timings["feedStock.sqlMs"] = Date.now() - queryStarted);

  const shapeStarted = Date.now();
  const toDateString = (value: string | Date | null | undefined) => {
    if (!value) return null;
    return value instanceof Date
      ? value.toISOString().split("T")[0]
      : String(value).split("T")[0];
  };

  const byFarmItem = new Map<string, {
    feedItemId: number;
    feedItemName: string;
    unit: string;
    lastCountDateStr: string;
    lastCountQty: number;
    purchasedQty: number;
    adjustmentQty: number;
    dailyConsumption: number;
    consumptionByCategory: Array<{
      categoryId: number;
      categoryDailyKg: number;
      heads: number;
    }>;
  }>();

  for (const row of rows) {
    const key = `${row.farmId ?? "none"}:${row.feedItemId}`;
    let item = byFarmItem.get(key);
    if (!item) {
      item = {
        feedItemId: row.feedItemId,
        feedItemName: row.feedItemName,
        unit: row.unit,
        lastCountDateStr: toDateString(row.lastCountDate) ?? "2020-01-01",
        lastCountQty: parseFloat(String(row.lastCountQty ?? "0")),
        purchasedQty: parseFloat(String(row.purchasedQty ?? "0")),
        adjustmentQty: parseFloat(String(row.adjustmentQty ?? "0")),
        dailyConsumption: 0,
        consumptionByCategory: [],
      };
      byFarmItem.set(key, item);
    }

    if (row.categoryId != null) {
      const heads = Number(row.heads ?? 0);
      const categoryDailyKg = parseFloat(String(row.planQty ?? "0")) * heads;
      item.dailyConsumption += categoryDailyKg;
      if (heads > 0) {
        item.consumptionByCategory.push({
          categoryId: row.categoryId,
          categoryDailyKg,
          heads,
        });
      }
    }
  }

  const aggregated = new Map<number, {
    feedItemId: number;
    feedItemName: string;
    unit: string;
    stockOnHand: number;
    consumedSinceCount: number;
    daysSinceCount: number;
    lastCountDate: string;
    dailyConsumption: number;
    consumptionByCategory: Map<number, { categoryDailyKg: number; heads: number }>;
  }>();

  for (const item of Array.from(byFarmItem.values())) {
    const lastCountDateStr = item.lastCountDateStr;
    const lastCountQty = item.lastCountQty;
    const purchasedQty = item.purchasedQty;
    const adjustmentQty = item.adjustmentQty;
    const dailyConsumption = item.dailyConsumption;
    const consumptionByCategory = item.consumptionByCategory;

    // Excel formula: StockToday = LastCountQty + PurchSinceCount + Adjustments - (DailyUse × daysSinceCount)
    const daysSinceCount = Math.max(0, Math.floor((new Date(today).getTime() - new Date(lastCountDateStr).getTime()) / 86400000));
    const consumedSinceCount = dailyConsumption * daysSinceCount;

    const farmStockOnHand = Math.max(
      0,
      lastCountQty + purchasedQty + adjustmentQty - consumedSinceCount,
    );
    let aggregate = aggregated.get(item.feedItemId);
    if (!aggregate) {
      aggregate = {
        feedItemId: item.feedItemId,
        feedItemName: item.feedItemName,
        unit: item.unit,
        stockOnHand: 0,
        consumedSinceCount: 0,
        daysSinceCount: 0,
        lastCountDate: lastCountDateStr,
        dailyConsumption: 0,
        consumptionByCategory: new Map(),
      };
      aggregated.set(item.feedItemId, aggregate);
    }
    aggregate.stockOnHand += farmStockOnHand;
    aggregate.consumedSinceCount += consumedSinceCount;
    aggregate.dailyConsumption += dailyConsumption;
    if (daysSinceCount > aggregate.daysSinceCount) {
      aggregate.daysSinceCount = daysSinceCount;
      aggregate.lastCountDate = lastCountDateStr;
    }
    for (const category of consumptionByCategory) {
      const existing = aggregate.consumptionByCategory.get(category.categoryId) ?? {
        categoryDailyKg: 0,
        heads: 0,
      };
      existing.categoryDailyKg += category.categoryDailyKg;
      existing.heads += category.heads;
      aggregate.consumptionByCategory.set(category.categoryId, existing);
    }
  }

  const result = Array.from(aggregated.values()).map(item => {
    const daysRemaining = item.dailyConsumption > 0
      ? Math.floor(item.stockOnHand / item.dailyConsumption)
      : 999;
    return {
      feedItemId: item.feedItemId,
      feedItemName: item.feedItemName,
      unit: item.unit,
      stockOnHand: item.stockOnHand,
      consumedSinceCount: Math.round(item.consumedSinceCount * 100) / 100,
      daysSinceCount: item.daysSinceCount,
      lastCountDate: item.lastCountDate,
      dailyConsumption: item.dailyConsumption,
      consumptionByCategory: Array.from(item.consumptionByCategory, ([categoryId, values]) => ({
        categoryId,
        ...values,
      })),
      daysRemaining,
      runOutDate: item.dailyConsumption > 0
        ? new Date(Date.now() + daysRemaining * 86400000).toISOString().split("T")[0]
        : null,
      status: daysRemaining <= 3 ? "critical" : daysRemaining <= 7 ? "low" : "ok",
    };
  });

  timings && (timings["feedStock.shapeMs"] = Date.now() - shapeStarted);
  timings && (timings["feedStock.totalMs"] = Date.now() - started);

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
  const tenant = requireTenantUserContext();
  const days = Math.max(0, Math.floor((new Date(endStr).getTime() - new Date(startStr).getTime()) / 86400000));
  if (days === 0) return 0;
  // Active plans for this feed item, with the head count over the window.
  const plans = await db
    .select({ qty: rationPlans.qtyPerHeadPerDay, categoryId: rationPlans.categoryId })
    .from(rationPlans)
    .where(and(tenantScope(tenant, rationPlans), eq(rationPlans.feedItemId, feedItemId), eq(rationPlans.isActive, true), isNull(rationPlans.deletedAt)));
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
  const tenant = requireTenantUserContext();

  const items = await getAllFeedItems();
  const rows: ShrinkageRow[] = [];
  const byItemLatest: Record<number, { shrinkageQty: number; shrinkageValue: number; toDate: string } | undefined> = {};

  const ds = (d: any) => (d instanceof Date ? d.toISOString().split("T")[0] : String(d).split("T")[0]);

  for (const item of items) {
    const scopedPrice = await getCurrentFeedItemPrice(item.id);
    const price = scopedPrice != null ? parseFloat(scopedPrice) : 0;

    // All stock counts for this item, oldest → newest.
    const counts = await db
      .select({ qty: feedStockLedger.qty, transactionDate: feedStockLedger.transactionDate })
      .from(feedStockLedger)
      .where(and(tenantScope(tenant, feedStockLedger), eq(feedStockLedger.feedItemId, item.id), eq(feedStockLedger.transactionType, "stock_count"), isNull(feedStockLedger.deletedAt)))
      .orderBy(feedStockLedger.transactionDate);

    if (counts.length === 0) continue;

    // Earliest ledger transaction date for this item — the anchor when there's
    // no prior stock count (e.g. a purchase happened before the first count).
    const firstTxn = await db
      .select({ transactionDate: feedStockLedger.transactionDate })
      .from(feedStockLedger)
      .where(and(tenantScope(tenant, feedStockLedger), eq(feedStockLedger.feedItemId, item.id), isNull(feedStockLedger.deletedAt)))
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
          tenantScope(tenant, feedStockLedger),
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
  const tenant = requireTenantUserContext();

  // When scoped to an owner: sales, animal purchases and feed are restricted to
  // that owner's animals; expenses are the owner's ALLOCATED share (head in
  // full, category/herd split by head count on the expense date — matching the
  // per-animal P&L). General overhead (e.g. electricity) is excluded.
  const ownerId = filters.ownerId;
  const ownedAnimalIds: number[] = ownerId
    ? (await db.select({ id: animals.id }).from(animals).where(and(tenantScope(tenant, animals), eq(animals.ownerId, ownerId), isNull(animals.deletedAt)))).map((r) => r.id)
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
    .where(and(tenantScope(tenant, sales), sql`${sales.saleDate} >= ${filters.fromDate}`, sql`${sales.saleDate} <= ${filters.toDate}`, isNull(sales.deletedAt), ownerSalesCond));

  // Animal purchase costs (exclude soft-deleted)
  const purchaseCosts = await db
    .select({ total: sql<number>`SUM(purchaseCost)` })
    .from(animals)
    .where(and(
      tenantScope(tenant, animals),
      sql`${animals.acquisitionDate} >= ${filters.fromDate}`,
      sql`${animals.acquisitionDate} <= ${filters.toDate}`,
      isNull(animals.deletedAt),
      ownerId ? eq(animals.ownerId, ownerId) : sql`1 = 1`,
    ));

  // Expenses (exclude soft-deleted). Whole-farm: every expense grouped by
  // category and by target type. Owner-scoped: the owner's allocated share via
  // getOwnerExpenseBreakdownMinor (general/overhead excluded).
  let expensesByCategory: Array<{ categoryName: string | null; total: number }>;
  const expByTarget: Record<string, number> = {};
  let totalOtherCostMinor: number;
  if (ownerId) {
    const bd = await getOwnerExpenseBreakdownMinor(ownerId, filters.fromDate, filters.toDate);
    expensesByCategory = bd.byCategory;
    expByTarget.head = bd.headMinor;
    expByTarget.category = bd.categoryMinor;
    expByTarget.herd = bd.herdMinor;
    expByTarget.general = 0;
    totalOtherCostMinor = bd.totalOtherMinor;
  } else {
    expensesByCategory = await db
      .select({
        categoryName: expenseCategories.name,
        total: sql<number>`SUM(${expenses.amount})`
      })
      .from(expenses)
      .leftJoin(expenseCategories, and(eq(expenses.categoryId, expenseCategories.id), eq(expenseCategories.companyId, tenant.companyId)))
      .where(and(tenantScope(tenant, expenses), sql`${expenses.expenseDate} >= ${filters.fromDate}`, sql`${expenses.expenseDate} <= ${filters.toDate}`, isNull(expenses.deletedAt)))
      .groupBy(expenseCategories.name);
    const expensesByTarget = await db
      .select({
        targetType: expenses.targetType,
        total: sql<number>`SUM(${expenses.amount})`,
      })
      .from(expenses)
      .where(and(tenantScope(tenant, expenses), sql`${expenses.expenseDate} >= ${filters.fromDate}`, sql`${expenses.expenseDate} <= ${filters.toDate}`, isNull(expenses.deletedAt)))
      .groupBy(expenses.targetType);
    for (const r of expensesByTarget) expByTarget[r.targetType] = toMinor(String(r.total ?? 0));
    totalOtherCostMinor = expensesByCategory.reduce((sum, e) => sum + toMinor(String(e.total ?? 0)), 0);
  }

  // Feed cost in period. Whole-farm = actual bulk purchases from the stock
  // ledger (cash basis). Owner-scoped = modeled consumption of the owner's
  // animals via their ration plans (accrual basis), because feed purchases are
  // not tagged by owner — so a 0 here would understate the owner's true cost.
  const feedPurchases = await db
    .select({ total: sql<number>`SUM(totalCost)` })
    .from(feedStockLedger)
    .where(and(tenantScope(tenant, feedStockLedger), eq(feedStockLedger.transactionType, "purchase"), sql`${feedStockLedger.transactionDate} >= ${filters.fromDate}`, sql`${feedStockLedger.transactionDate} <= ${filters.toDate}`, isNull(feedStockLedger.deletedAt)));
  const totalFeedCostMinor = ownerId
    ? await getOwnerFeedCostMinor(ownerId, filters.fromDate, filters.toDate)
    : toMinor(String(feedPurchases[0]?.total ?? 0));
  const totalRevenueMinor = toMinor(String(salesData[0]?.total ?? 0));
  const cashReceivedMinor = toMinor(String(salesData[0]?.paid ?? 0));
  const outstandingMinor = totalRevenueMinor - cashReceivedMinor;
  const totalAnimalCostMinor = toMinor(String(purchaseCosts[0]?.total ?? 0));
  const totalCostMinor = totalAnimalCostMinor + totalFeedCostMinor + totalOtherCostMinor;
  const grossProfitMinor = totalRevenueMinor - totalCostMinor;

  // ── Running cost per month ────────────────────────────────────────────────
  // Operating cost only (excludes one-off animal purchases): farm-wide
  // (general expenses + feed) + animal-wide (head/category/herd expenses),
  // normalized to a month over the selected period.
  // Farm-wide = general/overhead expenses only (not tied to animals).
  // Animal-wide = feed (consumed by animals) + head/category/herd expenses.
  const farmWideOperatingMinor = expByTarget["general"] ?? 0;
  const animalWideOperatingMinor = totalFeedCostMinor + (expByTarget["head"] ?? 0) + (expByTarget["category"] ?? 0) + (expByTarget["herd"] ?? 0);
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
  const tenant = requireTenantUserContext();
  return await db.select().from(vaccines).where(and(eq(vaccines.companyId, tenant.companyId), isNull(vaccines.deletedAt))).orderBy(vaccines.name);
}

export async function addVaccine(data: { name: string; description?: string; validityPeriod: number; validityUnit: "days" | "months"; boosterRequired: boolean; boosterInterval?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(vaccines).values(tenantInsert(data));
  return result;
}

export async function updateVaccine(
  id: number,
  data: { name?: string; description?: string; validityPeriod?: number; validityUnit?: "days" | "months"; boosterRequired?: boolean; boosterInterval?: number; isActive?: boolean },
  expectedVersion: number,
  dbOrTx?: DbOrTx,
) {
  const db = dbOrTx ?? await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.update(vaccines).set({ ...data, version: sql`${vaccines.version} + 1` }).where(and(
    eq(vaccines.companyId, tenant.companyId),
    eq(vaccines.id, id),
    eq(vaccines.version, expectedVersion),
    isNull(vaccines.deletedAt),
  ));
  if (!mutationAffectedOne(result)) return false;

  // If the schedule-affecting fields changed, recompute next-due and booster
  // dates for all (non-deleted, not-completed) records of this vaccine — this
  // backfills records that were created while the vaccine had no booster
  // interval, so their booster due date stops being empty.
  if (
    data.validityPeriod !== undefined ||
    data.validityUnit !== undefined ||
    data.boosterRequired !== undefined ||
    data.boosterInterval !== undefined
  ) {
    await recomputeVaccinationDatesForVaccine(id, db);
  }
  return true;
}

/** Recompute nextDueDate + boosterDueDate for every active record of a vaccine. */
export async function recomputeVaccinationDatesForVaccine(vaccineId: number, dbOrTx?: DbOrTx) {
  const db = dbOrTx ?? await getDb();
  if (!db) return;
  const tenant = requireTenantUserContext();
  const vaccine = await db.select().from(vaccines).where(and(eq(vaccines.companyId, tenant.companyId), eq(vaccines.id, vaccineId))).limit(1);
  if (!vaccine.length) return;
  const v = vaccine[0];

  const records = await db
    .select({
      id: vaccinationRecords.id,
      vaccinationDate: vaccinationRecords.vaccinationDate,
      version: vaccinationRecords.version,
    })
    .from(vaccinationRecords)
    .where(and(tenantScope(tenant, vaccinationRecords), eq(vaccinationRecords.vaccineId, vaccineId), isNull(vaccinationRecords.deletedAt), eq(vaccinationRecords.isCompleted, false)))
    .for("update");

  for (const rec of records) {
    const dateStr = rec.vaccinationDate instanceof Date
      ? rec.vaccinationDate.toISOString().split("T")[0]
      : String(rec.vaccinationDate).split("T")[0];
    const nextDueDateStr = calculateNextDueDate(
      { validityPeriod: v.validityPeriod, validityUnit: v.validityUnit as "days" | "months", boosterRequired: v.boosterRequired, boosterInterval: v.boosterInterval ?? undefined },
      dateStr
    );
    const boosterDueDateStr = calculateBoosterDueDate(
      { boosterRequired: v.boosterRequired, boosterInterval: v.boosterInterval ?? undefined },
      dateStr
    );
    const [result] = await db.update(vaccinationRecords)
      .set({
        nextDueDate: new Date(nextDueDateStr),
        boosterDueDate: boosterDueDateStr ? new Date(boosterDueDateStr) : null,
        version: sql`${vaccinationRecords.version} + 1`,
      })
      .where(and(
        tenantScope(tenant, vaccinationRecords),
        eq(vaccinationRecords.id, rec.id),
        eq(vaccinationRecords.version, rec.version),
        isNull(vaccinationRecords.deletedAt),
      ));
    if (!mutationAffectedOne(result)) {
      throw new Error("VACCINATION_RECORD_VERSION_CONFLICT");
    }
  }
}

export async function deleteVaccine(id: number, expectedVersion: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.update(vaccines).set({
    deletedAt: new Date(),
    isActive: false,
    version: sql`${vaccines.version} + 1`,
  }).where(and(
    eq(vaccines.companyId, tenant.companyId),
    eq(vaccines.id, id),
    eq(vaccines.version, expectedVersion),
    isNull(vaccines.deletedAt),
  ));
  return mutationAffectedOne(result);
}

export async function getVaccinationRecords(animalId?: number, ownerId?: number) {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();
  const conditions = [tenantScope(tenant, vaccinationRecords), isNull(vaccinationRecords.deletedAt)];
  if (animalId) {
    conditions.push(eq(vaccinationRecords.animalId, animalId));
  }
  // Owner scope: only records for animals owned by this owner.
  if (ownerId) {
    conditions.push(eq(animals.ownerId, ownerId));
  }

  return await db
    .select({
      id: vaccinationRecords.id,
      animalId: vaccinationRecords.animalId,
      animalIdStr: animals.animalId,
      vaccineId: vaccinationRecords.vaccineId,
      vaccineName: vaccines.name,
      vaccinationDate: vaccinationRecords.vaccinationDate,
      nextDueDate: vaccinationRecords.nextDueDate,
      boosterDueDate: vaccinationRecords.boosterDueDate,
      notifyBeforeNext: vaccinationRecords.notifyBeforeNext,
      notifyBeforeBooster: vaccinationRecords.notifyBeforeBooster,
      batchNumber: vaccinationRecords.batchNumber,
      notes: vaccinationRecords.notes,
      veterinarian: vaccinationRecords.veterinarian,
      isCompleted: vaccinationRecords.isCompleted,
      createdAt: vaccinationRecords.createdAt,
      version: vaccinationRecords.version,
    })
    .from(vaccinationRecords)
    .innerJoin(vaccines, and(eq(vaccinationRecords.vaccineId, vaccines.id), eq(vaccines.companyId, tenant.companyId)))
    .innerJoin(animals, and(eq(vaccinationRecords.animalId, animals.id), eq(animals.companyId, tenant.companyId)))
    .where(and(...conditions))
    .orderBy(vaccinationRecords.vaccinationDate);
}

export async function addVaccinationRecord(data: { animalId: number; vaccineId: number; vaccinationDate: string; batchNumber?: string; notes?: string; veterinarian?: string; notifyBeforeNext?: number; notifyBeforeBooster?: number }, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();

  // Get vaccine config to calculate next due date
  const vaccine = await db.select().from(vaccines).where(and(eq(vaccines.companyId, tenant.companyId), eq(vaccines.id, data.vaccineId))).limit(1);
  if (!vaccine.length) throw new Error("Vaccine not found");
  const accessibleAnimal = await db.select({ id: animals.id }).from(animals).where(and(
    tenantScope(tenant, animals),
    eq(animals.id, data.animalId),
    isNull(animals.deletedAt),
  )).limit(1);
  if (!accessibleAnimal.length) throw new Error("Animal not found");

  const nextDueDateStr = calculateNextDueDate(
    {
      validityPeriod: vaccine[0].validityPeriod,
      validityUnit: vaccine[0].validityUnit as "days" | "months",
      boosterRequired: vaccine[0].boosterRequired,
      boosterInterval: vaccine[0].boosterInterval ?? undefined,
    },
    data.vaccinationDate
  );

  const boosterDueDateStr = calculateBoosterDueDate(
    {
      boosterRequired: vaccine[0].boosterRequired,
      boosterInterval: vaccine[0].boosterInterval ?? undefined,
    },
    data.vaccinationDate
  );

  const [result] = await db.insert(vaccinationRecords).values(tenantInsert({
    animalId: data.animalId,
    vaccineId: data.vaccineId,
    vaccinationDate: new Date(data.vaccinationDate),
    batchNumber: data.batchNumber,
    notes: data.notes,
    veterinarian: data.veterinarian,
    nextDueDate: new Date(nextDueDateStr),
    boosterDueDate: boosterDueDateStr ? new Date(boosterDueDateStr) : null,
    notifyBeforeNext: data.notifyBeforeNext ?? 7,
    notifyBeforeBooster: data.notifyBeforeBooster ?? 7,
  }, true));
  return result;
}

export async function updateVaccinationRecord(id: number, data: { vaccinationDate?: string; batchNumber?: string; notes?: string; veterinarian?: string; isCompleted?: boolean }, expectedVersion: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();

  const updateData: any = { ...data };
  if (data.vaccinationDate) {
    const record = await db.select({ vaccineId: vaccinationRecords.vaccineId }).from(vaccinationRecords).where(and(tenantScope(tenant, vaccinationRecords), eq(vaccinationRecords.id, id))).limit(1);
    if (record.length) {
      const vaccine = await db.select().from(vaccines).where(and(eq(vaccines.companyId, tenant.companyId), eq(vaccines.id, record[0].vaccineId))).limit(1);
      if (vaccine.length) {
        const nextDueDateStr = calculateNextDueDate(
          {
            validityPeriod: vaccine[0].validityPeriod,
            validityUnit: vaccine[0].validityUnit as "days" | "months",
            boosterRequired: vaccine[0].boosterRequired,
            boosterInterval: vaccine[0].boosterInterval ?? undefined,
          },
          data.vaccinationDate
        );
        updateData.nextDueDate = new Date(nextDueDateStr);
        const boosterDueDateStr = calculateBoosterDueDate(
          {
            boosterRequired: vaccine[0].boosterRequired,
            boosterInterval: vaccine[0].boosterInterval ?? undefined,
          },
          data.vaccinationDate
        );
        updateData.boosterDueDate = boosterDueDateStr ? new Date(boosterDueDateStr) : null;
      }
    }
  }

  const [result] = await db.update(vaccinationRecords).set({
    ...updateData,
    version: sql`${vaccinationRecords.version} + 1`,
  }).where(and(
    tenantScope(tenant, vaccinationRecords),
    eq(vaccinationRecords.id, id),
    eq(vaccinationRecords.version, expectedVersion),
    isNull(vaccinationRecords.deletedAt),
  ));
  return mutationAffectedOne(result);
}

export async function deleteVaccinationRecord(id: number, expectedVersion: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tenant = requireTenantUserContext();
  const [result] = await db.update(vaccinationRecords).set({
    deletedAt: new Date(),
    version: sql`${vaccinationRecords.version} + 1`,
  }).where(and(
    tenantScope(tenant, vaccinationRecords),
    eq(vaccinationRecords.id, id),
    eq(vaccinationRecords.version, expectedVersion),
    isNull(vaccinationRecords.deletedAt),
  ));
  return mutationAffectedOne(result);
}

export function calculateNextDueDate(vaccine: { validityPeriod: number; validityUnit: "days" | "months"; boosterRequired: boolean; boosterInterval?: number }, lastDate: string): string {
  const date = new Date(lastDate);
  const daysToAdd = vaccine.validityUnit === "months" ? vaccine.validityPeriod * 30 : vaccine.validityPeriod;
  date.setDate(date.getDate() + daysToAdd);
  return date.toISOString().split("T")[0];
}

export function calculateBoosterDueDate(vaccine: { boosterRequired: boolean; boosterInterval?: number }, lastDate: string): string | null {
  if (!vaccine.boosterRequired || !vaccine.boosterInterval) return null;
  const date = new Date(lastDate);
  date.setDate(date.getDate() + vaccine.boosterInterval);
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

export async function getUpcomingVaccinations(input?: { days?: number } | number) {
  const days = typeof input === 'number' ? input : (input?.days ?? 30);
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  return await db
    .select({
      id: vaccinationRecords.id,
      animalId: vaccinationRecords.animalId,
      animalIdStr: animals.animalId,
      vaccineName: vaccines.name,
      nextDueDate: vaccinationRecords.nextDueDate,
      boosterDueDate: vaccinationRecords.boosterDueDate,
      notifyBeforeNext: vaccinationRecords.notifyBeforeNext,
      notifyBeforeBooster: vaccinationRecords.notifyBeforeBooster,
      isCompleted: vaccinationRecords.isCompleted,
    })
    .from(vaccinationRecords)
    .innerJoin(vaccines, and(eq(vaccinationRecords.vaccineId, vaccines.id), eq(vaccines.companyId, tenant.companyId)))
    .innerJoin(animals, and(eq(vaccinationRecords.animalId, animals.id), eq(animals.companyId, tenant.companyId)))
    .where(
      and(
        tenantScope(tenant, vaccinationRecords),
        isNull(vaccinationRecords.deletedAt),
        eq(vaccinationRecords.isCompleted, false),
        or(
          sql`${vaccinationRecords.nextDueDate} <= ${cutoff.toISOString().split("T")[0]}`,
          sql`${vaccinationRecords.boosterDueDate} IS NOT NULL AND ${vaccinationRecords.boosterDueDate} <= ${cutoff.toISOString().split("T")[0]}`
        )
      )
    )
    .orderBy(sql`LEAST(
      COALESCE(${vaccinationRecords.nextDueDate}, '9999-12-31'),
      COALESCE(${vaccinationRecords.boosterDueDate}, '9999-12-31')
    )`);
}

export async function getUpcomingBoosterVaccinations(input?: { days?: number } | number) {
  const days = typeof input === 'number' ? input : (input?.days ?? 30);
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  return await db
    .select({
      id: vaccinationRecords.id,
      animalId: vaccinationRecords.animalId,
      animalIdStr: animals.animalId,
      vaccineName: vaccines.name,
      boosterDueDate: vaccinationRecords.boosterDueDate,
      notifyBeforeBooster: vaccinationRecords.notifyBeforeBooster,
      isCompleted: vaccinationRecords.isCompleted,
    })
    .from(vaccinationRecords)
    .innerJoin(vaccines, and(eq(vaccinationRecords.vaccineId, vaccines.id), eq(vaccines.companyId, tenant.companyId)))
    .innerJoin(animals, and(eq(vaccinationRecords.animalId, animals.id), eq(animals.companyId, tenant.companyId)))
    .where(
      and(
        tenantScope(tenant, vaccinationRecords),
        isNull(vaccinationRecords.deletedAt),
        eq(vaccinationRecords.isCompleted, false),
        sql`${vaccinationRecords.boosterDueDate} IS NOT NULL AND ${vaccinationRecords.boosterDueDate} <= ${cutoff.toISOString().split("T")[0]}`
      )
    )
    .orderBy(vaccinationRecords.boosterDueDate);
}

export async function getVaccinationCompliance() {
  const db = await getDb();
  if (!db) return [];
  const tenant = requireTenantUserContext();

  const today = new Date().toISOString().split("T")[0];

  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(vaccinationRecords)
    .where(and(tenantScope(tenant, vaccinationRecords), isNull(vaccinationRecords.deletedAt)));

  const overdue = await db
    .select({ count: sql<number>`count(*)` })
    .from(vaccinationRecords)
    .where(
      and(
        tenantScope(tenant, vaccinationRecords),
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
        tenantScope(tenant, vaccinationRecords),
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
  const tenant = requireTenantUserContext();

  const result = await db
    .select({
      nextDueDate: vaccinationRecords.nextDueDate,
      vaccineName: vaccines.name,
    })
    .from(vaccinationRecords)
    .innerJoin(vaccines, and(eq(vaccinationRecords.vaccineId, vaccines.id), eq(vaccines.companyId, tenant.companyId)))
    .where(
      and(
        tenantScope(tenant, vaccinationRecords),
        eq(vaccinationRecords.animalId, animalId),
        isNull(vaccinationRecords.deletedAt),
        eq(vaccinationRecords.isCompleted, false),
        isNotNull(vaccinationRecords.nextDueDate)
      )
    )
    .orderBy(vaccinationRecords.nextDueDate)
    .limit(1);

  if (result.length === 0) return null;
  const nextDueDate = result[0].nextDueDate;
  return {
    nextDueDate: nextDueDate instanceof Date ? nextDueDate.toISOString().split("T")[0] : nextDueDate,
    vaccineName: result[0].vaccineName
  };
}
