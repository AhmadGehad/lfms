/**
 * Revert engine — undo a single audit-log action.
 *
 * Every state-changing mutation writes an `audit_log` row (entityType, action,
 * entityId, oldValues, newValues). `revertAuditEntry` looks up a reverse handler
 * for that (entityType, action) and applies the inverse inside a transaction,
 * guarded so it never silently clobbers newer changes. The undo is itself logged
 * as an `action:"revert"` audit row that links back to the original.
 *
 * Reverts are gated to Admin & Owner at the router layer.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull, ne, or } from "drizzle-orm";
import type { TenantContext } from "../shared/tenancy";
import { getDb, createAuditEntry, type DbOrTx } from "./db";
import { generatePublicId } from "./tenancy/publicIds";
import { requireTenantUserContext } from "./tenancy/runtime";
import { assertFarmAccess, companyScope, tenantScope } from "./tenancy/scope";
import {
  auditLog,
  animals,
  weightLog,
  expenses,
  sales,
  lambingLog,
  pregnancyRecords,
  vaccinationRecords,
  rationPlans,
  feedStockLedger,
  species,
  animalCategories,
  groups,
  animalStatuses,
  birthTypes,
  feedItems,
  expenseCategories,
  owners,
  feedItemPriceHistory,
  expenseSubCategories,
  vaccines,
  systemSettings,
  animalStatusHistory,
  type AuditLog,
} from "../drizzle/schema";

// ─── Registry ─────────────────────────────────────────────────────────────────

// Soft-deletable entities (have deletedAt). entityType (as written to the audit
// log) → drizzle table. Both naming variants used in the codebase are mapped.
const SOFT_TABLES: Record<string, any> = {
  animal: animals,
  weightLog: weightLog,
  expense: expenses,
  sale: sales,
  lambingLog: lambingLog,
  lambing_log: lambingLog,
  pregnancyRecord: pregnancyRecords,
  vaccinationRecord: vaccinationRecords,
  rationPlan: rationPlans,
  feedStock: feedStockLedger,
  species: species,
  category: animalCategories,
  group: groups,
  status: animalStatuses,
  birthType: birthTypes,
  feedItem: feedItems,
  expenseCategory: expenseCategories,
  owner: owners,
  vaccine: vaccines,
};

// Entities whose soft-delete also flips isActive (so revert must flip it back).
const ACTIVE_TOGGLE = new Set([
  "species", "category", "group", "status", "birthType", "feedItem",
  "expenseCategory", "rationPlan", "vaccine",
]);

// Entities whose soft-delete also flips isActive (so revert must flip it back).
// (vaccine added below joins the toggle set.)

// Hard-deleted entities (no deletedAt) — create-revert hard-deletes, delete-revert re-inserts.
const HARD_TABLES: Record<string, any> = {
  feedItemPrice: feedItemPriceHistory,
  expenseSubCategory: expenseSubCategories,
};

// entityTypes/actions that can never be reverted.
// Global users are identities, not tenant-owned authorization records. Tenant
// role changes belong to memberships and must never rewrite the global user row.
const NON_REVERTABLE_ENTITY = new Set(["backup", "bulk", "recycle_bin", "permission", "user"]);
const NON_REVERTABLE_ACTION = new Set([
  "import", "purge", "purge_all", "revert", "login", "logout", "restore_backup",
]);

const normalizeAction = (a: string): string => {
  const k = a.toLowerCase();
  if (k === "soft_delete") return "delete";
  if (k === "restore") return "restore";
  return k;
};

// ─── Revert plan (also used to show/hide the button) ────────────────────────────

export type RevertPlan =
  | { revertable: true; kind: string }
  | { revertable: false; reason: string };

export function getRevertFeatures(entry: AuditLog, plan: Extract<RevertPlan, { revertable: true }>) {
  if (plan.kind === "animal_exit") return ["animals", "sales"];
  if (plan.kind === "animal_promote" || plan.kind === "record_birth") return ["animals", "breeding"];
  if (entry.entityType === "animal") return ["animals"];
  if (["lambingLog", "lambing_log"].includes(entry.entityType)) return ["breeding"];
  if (entry.entityType === "pregnancyRecord") return ["pregnancy"];
  if (entry.entityType === "vaccinationRecord") return ["vaccinations"];
  if (entry.entityType === "weightLog") return ["fattening"];
  if (entry.entityType === "expense") return ["expenses"];
  if (entry.entityType === "sale") return ["sales"];
  if (["rationPlan", "feedStock", "feedItemPrice"].includes(entry.entityType)) return ["feed"];
  if (entry.entityType === "feedItem") return ["configuration", "feed"];
  if (entry.entityType === "vaccine") return ["configuration", "vaccinations"];
  if (entry.entityType === "setting" && String(entry.entityId ?? "").toLowerCase().includes("farmmap")) {
    return ["configuration", "farm_map"];
  }
  return ["configuration"];
}

export function getRevertPlan(entry: AuditLog): RevertPlan {
  if (entry.revertedAt) return { revertable: false, reason: "already_reverted" };

  const action = normalizeAction(entry.action);
  if (NON_REVERTABLE_ENTITY.has(entry.entityType) || NON_REVERTABLE_ACTION.has(action)) {
    return { revertable: false, reason: "not_revertable" };
  }

  const soft = SOFT_TABLES[entry.entityType];
  const hard = HARD_TABLES[entry.entityType];

  // Compound / special actions first.
  if (entry.entityType === "animal" && action === "exit") return { revertable: true, kind: "animal_exit" };
  if (entry.entityType === "animal" && action === "promote") return { revertable: true, kind: "animal_promote" };
  if ((entry.entityType === "lambing_log" || entry.entityType === "lambingLog") && action === "create") {
    return { revertable: true, kind: "record_birth" };
  }
  if (entry.entityType === "weightLog" && action === "create") return { revertable: true, kind: "weight_create" };
  if (entry.entityType === "setting" && action === "update") {
    return hasOldValues(entry) ? { revertable: true, kind: "setting_update" } : { revertable: false, reason: "no_old_values" };
  }

  if (soft) {
    if (action === "create") return { revertable: true, kind: "soft_create" };
    if (action === "update") return hasOldValues(entry) ? { revertable: true, kind: "update" } : { revertable: false, reason: "no_old_values" };
    if (action === "delete") return { revertable: true, kind: "soft_delete" };
    if (action === "restore") return { revertable: true, kind: "soft_restore" };
    if (action === "bulk_update") return hasOldValues(entry) ? { revertable: true, kind: "update" } : { revertable: false, reason: "no_old_values" };
  }
  if (hard) {
    if (action === "create") return { revertable: true, kind: "hard_create" };
    if (action === "update") return hasOldValues(entry) ? { revertable: true, kind: "update" } : { revertable: false, reason: "no_old_values" };
    if (action === "delete") return hasOldValues(entry) ? { revertable: true, kind: "hard_delete" } : { revertable: false, reason: "no_snapshot" };
  }
  return { revertable: false, reason: "not_revertable" };
}

const hasOldValues = (entry: AuditLog) =>
  entry.oldValues != null && typeof entry.oldValues === "object" && Object.keys(entry.oldValues as object).length > 0;

// ─── Helpers ────────────────────────────────────────────────────────────────────

// Resolve the numeric row id of the entity an audit entry refers to. Most
// creates store the numeric insertId in entityId; animals.create stores the
// animal CODE in entityId and the numeric id in newValues.animalDbId.
function resolveRowId(entry: AuditLog): number | null {
  const n = Number(entry.entityId);
  if (Number.isFinite(n) && String(n) === String(entry.entityId)) return n;
  const nv = (entry.newValues ?? {}) as any;
  const candidate = nv.animalDbId ?? nv.id ?? nv.dbId;
  return candidate != null && Number.isFinite(Number(candidate)) ? Number(candidate) : null;
}

// For an update, restore exactly the fields that were changed (the keys present
// in newValues) to their prior values. Prior values live in oldValues — either
// flat, or nested under `.animal` for the animals snapshot shape.
function priorValueFor(entry: AuditLog, key: string): unknown {
  const ov = (entry.oldValues ?? {}) as any;
  if (entry.entityType === "animal" && ov.animal && typeof ov.animal === "object") {
    return ov.animal[key];
  }
  return ov[key];
}

// Columns we never write back during a field-level restore.
const SKIP_KEYS = new Set([
  "id", "publicId", "companyId", "farmId", "version", "createdAt", "updatedAt",
  "createdBy", "deletedAt", "deletedBy", "animalDbId", "statusHistoryId", "saleId",
  "lambingIds", "closedPregnancyId", "autoStage", "createdAnimalId", "lambingLogId",
  "paymentDelta", "revertOfAuditId",
]);

const toDateCol = (v: unknown) => (v == null ? null : new Date(v as any));

// ─── Guard: only the newest action on an entity may be reverted ─────────────────

type ScopedTable = { id: any; companyId: any; farmId?: any };

function scoped(tenant: TenantContext, table: ScopedTable, ...conditions: any[]) {
  return and(tenantScope(tenant, table), ...conditions)!;
}

// Company-level audit entries use farmId NULL and remain visible from a farm.
// Farm-level entries additionally obey the user's selected/allowed farm scope.
function auditScoped(tenant: TenantContext, ...conditions: any[]) {
  return and(
    companyScope(tenant, auditLog.companyId),
    or(isNull(auditLog.farmId), tenantScope(tenant, auditLog)),
    ...conditions,
  )!;
}

async function assertNewest(tx: DbOrTx, tenant: TenantContext, entry: AuditLog) {
  if (entry.entityId == null) return;
  const [newer] = await tx
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(auditScoped(
      tenant,
      eq(auditLog.entityType, entry.entityType),
      eq(auditLog.entityId, entry.entityId),
      isNull(auditLog.revertedAt),
      ne(auditLog.action, "revert"),
      gt(auditLog.id, entry.id),
    ))
    .limit(1);
  if (newer) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A newer change exists for this record. Revert the most recent change first.",
    });
  }
}

// ─── Main entry point ───────────────────────────────────────────────────────────

export async function revertAuditEntry(
  auditId: number,
  userId: number,
  authorizeFeatures: (features: readonly string[]) => Promise<void>,
) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const tenant = requireTenantUserContext();
  if (tenant.userId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated actor mismatch" });
  }

  return db.transaction(async (tx) => {
    const [entry] = await tx.select().from(auditLog)
      .where(auditScoped(tenant, eq(auditLog.id, auditId)))
      .limit(1)
      .for("update");
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Audit entry not found" });

    const plan = getRevertPlan(entry);
    if (!plan.revertable) {
      throw new TRPCError({ code: "BAD_REQUEST", message: revertReasonMessage(plan.reason) });
    }
    await authorizeFeatures(getRevertFeatures(entry, plan));

    // Skip the newest-first guard for revert entries (they're terminal anyway).
    await assertNewest(tx, tenant, entry);

    await applyRevert(tx, tenant, entry, plan.kind, userId);

    // Mark the original reverted and log the revert itself.
    await tx.update(auditLog)
      .set({ revertedAt: new Date(), revertedByUserId: userId })
      .where(auditScoped(tenant, eq(auditLog.id, entry.id), isNull(auditLog.revertedAt)));

    await createAuditEntry({
      companyId: tenant.companyId,
      farmId: entry.farmId ?? tenant.selectedFarmId,
      userId,
      membershipId: tenant.membershipId,
      actorType: "tenant_user",
      action: "revert",
      actionCategory: "crud",
      entityType: entry.entityType,
      entityId: entry.entityId ?? undefined,
      newValues: { revertOfAuditId: entry.id, originalAction: entry.action } as any,
      revertOfAuditId: entry.id,
      requestId: tenant.requestId,
    }, tx);

    return { success: true, kind: plan.kind };
  });
}

function revertReasonMessage(reason: string): string {
  switch (reason) {
    case "already_reverted": return "This action has already been reverted.";
    case "no_old_values": return "This action can't be reverted — its previous values were not recorded.";
    case "no_snapshot": return "This delete can't be reverted — no snapshot of the record was kept.";
    default: return "This action can't be reverted.";
  }
}

// ─── Handlers ───────────────────────────────────────────────────────────────────

async function applyRevert(
  tx: DbOrTx,
  tenant: TenantContext,
  entry: AuditLog,
  kind: string,
  userId: number,
) {
  switch (kind) {
    case "soft_create": return softCreateRevert(tx, tenant, entry, userId);
    case "soft_delete": return softDeleteRevert(tx, tenant, entry);
    case "soft_restore": return softRestoreRevert(tx, tenant, entry, userId);
    case "update": return updateRevert(tx, tenant, entry);
    case "hard_create": return hardCreateRevert(tx, tenant, entry);
    case "hard_delete": return hardDeleteRevert(tx, tenant, entry);
    case "animal_exit": return animalExitRevert(tx, tenant, entry, userId);
    case "animal_promote": return animalPromoteRevert(tx, tenant, entry, userId);
    case "record_birth": return recordBirthRevert(tx, tenant, entry, userId);
    case "weight_create": return weightCreateRevert(tx, tenant, entry, userId);
    case "setting_update": return settingUpdateRevert(tx, tenant, entry);
    default: throw new TRPCError({ code: "BAD_REQUEST", message: "This action can't be reverted." });
  }
}

async function requireRow(tx: DbOrTx, tenant: TenantContext, table: any, id: number) {
  const [row] = await tx.select().from(table)
    .where(scoped(tenant, table, eq(table.id, id)))
    .limit(1)
    .for("update");
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "The record no longer exists." });
  return row;
}

// create → soft-delete the created row (animals cascade like deleteAnimal).
async function softCreateRevert(tx: DbOrTx, tenant: TenantContext, entry: AuditLog, userId: number) {
  const id = resolveRowId(entry);
  if (id == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resolve the created record." });
  if (entry.entityType === "animal") return cascadeAnimal(tx, tenant, id, true, userId);
  const table = SOFT_TABLES[entry.entityType];
  const row = await requireRow(tx, tenant, table, id);
  if ((row as any).deletedAt) throw new TRPCError({ code: "CONFLICT", message: "Record already deleted." });
  const set: any = { deletedAt: new Date(), deletedBy: userId };
  if (ACTIVE_TOGGLE.has(entry.entityType)) set.isActive = false;
  await tx.update(table).set(set).where(scoped(tenant, table, eq(table.id, id), isNull(table.deletedAt)));
}

// delete → restore (clear deletedAt). animals cascade like restoreAnimal.
async function softDeleteRevert(tx: DbOrTx, tenant: TenantContext, entry: AuditLog) {
  const id = resolveRowId(entry);
  if (id == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resolve the record." });
  if (entry.entityType === "animal") return cascadeAnimal(tx, tenant, id, false);
  const table = SOFT_TABLES[entry.entityType];
  const row = await requireRow(tx, tenant, table, id);
  if (!(row as any).deletedAt) {
    throw new TRPCError({ code: "CONFLICT", message: "Record is not deleted." });
  }
  const set: any = { deletedAt: null, deletedBy: null };
  if (ACTIVE_TOGGLE.has(entry.entityType)) set.isActive = true;
  await tx.update(table).set(set).where(scoped(tenant, table, eq(table.id, id)));
}

// restore → re-soft-delete.
async function softRestoreRevert(tx: DbOrTx, tenant: TenantContext, entry: AuditLog, userId: number) {
  const id = resolveRowId(entry);
  if (id == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resolve the record." });
  if (entry.entityType === "animal") return cascadeAnimal(tx, tenant, id, true, userId);
  const table = SOFT_TABLES[entry.entityType];
  const row = await requireRow(tx, tenant, table, id);
  if ((row as any).deletedAt) {
    throw new TRPCError({ code: "CONFLICT", message: "Record is already deleted." });
  }
  const set: any = { deletedAt: new Date(), deletedBy: userId };
  if (ACTIVE_TOGGLE.has(entry.entityType)) set.isActive = false;
  await tx.update(table).set(set).where(scoped(tenant, table, eq(table.id, id), isNull(table.deletedAt)));
}

// update → restore the changed fields to their prior values.
async function updateRevert(tx: DbOrTx, tenant: TenantContext, entry: AuditLog) {
  const id = resolveRowId(entry);
  if (id == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resolve the record." });
  const table = SOFT_TABLES[entry.entityType] ?? HARD_TABLES[entry.entityType];
  if (!table) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown entity." });
  await requireRow(tx, tenant, table, id);

  const changed = Object.keys((entry.newValues ?? {}) as object).filter(k => !SKIP_KEYS.has(k));
  const dateKeys = new Set(["acquisitionDate", "birthDate", "exitDate", "expenseDate", "saleDate", "confirmationDate", "expectedDueDate", "checkupDate", "completedDate", "vaccinationDate", "nextDueDate", "boosterDueDate", "weighDate", "effectiveDate", "endDate", "transactionDate"]);
  const set: any = {};
  for (const key of changed) {
    const prior = priorValueFor(entry, key);
    if (prior === undefined) continue; // field not captured → leave as-is
    set[key] = dateKeys.has(key) ? toDateCol(prior) : prior;
  }
  if (Object.keys(set).length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to revert — prior values were not recorded." });
  }
  set.updatedAt = new Date();
  await tx.update(table).set(set).where(scoped(tenant, table, eq(table.id, id)));
}

// create (hard table) → hard-delete the created row.
async function hardCreateRevert(tx: DbOrTx, tenant: TenantContext, entry: AuditLog) {
  const id = resolveRowId(entry);
  if (id == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resolve the created record." });
  const table = HARD_TABLES[entry.entityType];
  await requireRow(tx, tenant, table, id);
  await tx.delete(table).where(scoped(tenant, table, eq(table.id, id)));
}

// delete (hard table) → re-insert from the snapshot in oldValues.
async function hardDeleteRevert(tx: DbOrTx, tenant: TenantContext, entry: AuditLog) {
  const table = HARD_TABLES[entry.entityType];
  const snapshot = { ...(entry.oldValues as any) };
  if (snapshot.farmId != null) assertFarmAccess(tenant, Number(snapshot.farmId));
  snapshot.companyId = tenant.companyId;
  snapshot.publicId = snapshot.publicId || generatePublicId();
  // normalize date fields
  for (const k of ["effectiveDate", "createdAt"]) if (snapshot[k]) snapshot[k] = new Date(snapshot[k]);
  await tx.insert(table).values(snapshot);
}

// ─── Compound handlers ──────────────────────────────────────────────────────────

// Soft-delete (or restore) an animal and its child rows, mirroring softDelete.ts.
async function cascadeAnimal(
  tx: DbOrTx,
  tenant: TenantContext,
  id: number,
  deleting: boolean,
  userId?: number,
) {
  const [animal] = await tx.select().from(animals)
    .where(scoped(tenant, animals, eq(animals.id, id)))
    .limit(1)
    .for("update");
  if (!animal) throw new TRPCError({ code: "NOT_FOUND", message: "Animal no longer exists." });
  if (deleting) {
    if (animal.deletedAt) {
      throw new TRPCError({ code: "CONFLICT", message: "Animal is already deleted." });
    }
    const now = new Date();
    await tx.update(animals).set({ deletedAt: now, deletedBy: userId, isActive: false })
      .where(scoped(tenant, animals, eq(animals.id, id), isNull(animals.deletedAt)));
    await tx.update(weightLog).set({ deletedAt: now, deletedBy: userId })
      .where(scoped(tenant, weightLog, eq(weightLog.animalId, id), isNull(weightLog.deletedAt)));
    await tx.update(expenses).set({ deletedAt: now, deletedBy: userId })
      .where(scoped(tenant, expenses, eq(expenses.headId, id), isNull(expenses.deletedAt)));
    await tx.update(sales).set({ deletedAt: now, deletedBy: userId })
      .where(scoped(tenant, sales, eq(sales.animalId, id), isNull(sales.deletedAt)));
  } else {
    const cascadeDeletedAt = animal.deletedAt;
    if (!cascadeDeletedAt) throw new TRPCError({ code: "CONFLICT", message: "Animal is not deleted." });
    await tx.update(animals).set({ deletedAt: null, deletedBy: null, isActive: true })
      .where(scoped(tenant, animals, eq(animals.id, id), eq(animals.deletedAt, cascadeDeletedAt)));
    await tx.update(weightLog).set({ deletedAt: null, deletedBy: null })
      .where(scoped(tenant, weightLog, eq(weightLog.animalId, id), eq(weightLog.deletedAt, cascadeDeletedAt)));
    await tx.update(expenses).set({ deletedAt: null, deletedBy: null })
      .where(scoped(tenant, expenses, eq(expenses.headId, id), eq(expenses.deletedAt, cascadeDeletedAt)));
    await tx.update(sales).set({ deletedAt: null, deletedBy: null })
      .where(scoped(tenant, sales, eq(sales.animalId, id), eq(sales.deletedAt, cascadeDeletedAt)));
  }
}

// exit (sale) → reactivate the animal, restore status/exit fields, soft-delete the sale.
async function animalExitRevert(tx: DbOrTx, tenant: TenantContext, entry: AuditLog, userId: number) {
  const id = resolveRowId(entry);
  if (id == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resolve the animal." });
  const ov = (entry.oldValues ?? {}) as any;
  const nv = (entry.newValues ?? {}) as any;
  await requireRow(tx, tenant, animals, id);
  await tx.update(animals).set({
    isActive: true,
    exitDate: null,
    exitReason: null,
    ...(ov.statusId != null ? { statusId: Number(ov.statusId) } : {}),
    updatedAt: new Date(),
  }).where(scoped(tenant, animals, eq(animals.id, id)));
  if (nv.saleId != null) {
    await tx.update(sales).set({ deletedAt: new Date(), deletedBy: userId })
      .where(scoped(tenant, sales, eq(sales.id, Number(nv.saleId)), isNull(sales.deletedAt)));
  }
}

// promote → soft-delete the created animal and un-promote the lambing record.
async function animalPromoteRevert(tx: DbOrTx, tenant: TenantContext, entry: AuditLog, userId: number) {
  const nv = (entry.newValues ?? {}) as any;
  const createdAnimalId = nv.createdAnimalId != null ? Number(nv.createdAnimalId) : resolveRowId(entry);
  if (createdAnimalId == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resolve the promoted animal." });
  await cascadeAnimal(tx, tenant, createdAnimalId, true, userId);
  if (nv.lambingLogId != null) {
    await tx.update(lambingLog)
      .set({ isPromoted: false, promotedHeadId: null, promotedAnimalCode: null })
      .where(scoped(tenant, lambingLog, eq(lambingLog.id, Number(nv.lambingLogId))));
  }
}

// recordBirth → soft-delete the created lambing rows; reopen the dam's pregnancy.
async function recordBirthRevert(tx: DbOrTx, tenant: TenantContext, entry: AuditLog, userId: number) {
  const nv = (entry.newValues ?? {}) as any;
  const ids: number[] = Array.isArray(nv.lambingIds) ? nv.lambingIds.map((x: any) => Number(x)) : [];
  if (ids.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "This birth record can't be reverted — its lamb records weren't tracked." });
  for (const lid of ids) {
    const [row] = await tx.select().from(lambingLog)
      .where(scoped(tenant, lambingLog, eq(lambingLog.id, lid)))
      .limit(1)
      .for("update");
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Birth record no longer exists." });
    if (row.deletedAt) {
      throw new TRPCError({ code: "CONFLICT", message: "Birth record is already deleted." });
    }
    if (row?.isPromoted) {
      throw new TRPCError({ code: "CONFLICT", message: "A lamb from this birth was already promoted — revert that first." });
    }
    await tx.update(lambingLog).set({ deletedAt: new Date(), deletedBy: userId })
      .where(scoped(tenant, lambingLog, eq(lambingLog.id, lid), isNull(lambingLog.deletedAt)));
  }
  if (nv.closedPregnancyId != null) {
    await requireRow(tx, tenant, pregnancyRecords, Number(nv.closedPregnancyId));
    await tx.update(pregnancyRecords)
      .set({ status: "active", outcomeLambingLogId: null, completedDate: null })
      .where(scoped(tenant, pregnancyRecords, eq(pregnancyRecords.id, Number(nv.closedPregnancyId))));
  }
}

// weight create → soft-delete the entry; if it auto-staged the animal to a new
// category, restore the animal's previous category/status/code and drop the
// status-history row that the auto-stage added.
async function weightCreateRevert(tx: DbOrTx, tenant: TenantContext, entry: AuditLog, userId: number) {
  const id = resolveRowId(entry);
  if (id == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resolve the weight entry." });
  const row = await requireRow(tx, tenant, weightLog, id);
  if ((row as any).deletedAt) throw new TRPCError({ code: "CONFLICT", message: "Weight entry already deleted." });
  await tx.update(weightLog).set({ deletedAt: new Date(), deletedBy: userId })
    .where(scoped(tenant, weightLog, eq(weightLog.id, id), isNull(weightLog.deletedAt)));

  const auto = (entry.newValues as any)?.autoStage;
  if (auto && auto.animalId != null) {
    await requireRow(tx, tenant, animals, Number(auto.animalId));
    const set: any = { updatedAt: new Date() };
    if (auto.previousCategoryId != null) set.categoryId = Number(auto.previousCategoryId);
    if (auto.previousStatusId != null) set.statusId = Number(auto.previousStatusId);
    if (auto.previousAnimalCode != null) set.animalId = auto.previousAnimalCode;
    await tx.update(animals).set(set)
      .where(scoped(tenant, animals, eq(animals.id, Number(auto.animalId))));
    if (auto.statusHistoryId != null) {
      await tx.delete(animalStatusHistory)
        .where(scoped(tenant, animalStatusHistory, eq(animalStatusHistory.id, Number(auto.statusHistoryId))));
    }
  }
}

// setting update → restore the previous value, keyed by settingKey (entityId).
async function settingUpdateRevert(tx: DbOrTx, tenant: TenantContext, entry: AuditLog) {
  const key = entry.entityId;
  const ov = (entry.oldValues ?? {}) as any;
  const prior = ov.settingValue ?? ov.value;
  if (!key || prior === undefined) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot revert this setting — previous value not recorded." });
  }
  const [setting] = await tx.select({ id: systemSettings.id }).from(systemSettings)
    .where(and(tenantScope(tenant, systemSettings), eq(systemSettings.settingKey, key)))
    .limit(1)
    .for("update");
  if (!setting) throw new TRPCError({ code: "NOT_FOUND", message: "Setting no longer exists." });
  await tx.update(systemSettings).set({ settingValue: String(prior) })
    .where(and(tenantScope(tenant, systemSettings), eq(systemSettings.settingKey, key)));
}
