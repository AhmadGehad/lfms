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
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { getDb, createAuditEntry, type DbOrTx } from "./db";
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
  users,
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
};

// Entities whose soft-delete also flips isActive (so revert must flip it back).
const ACTIVE_TOGGLE = new Set([
  "species", "category", "group", "status", "birthType", "feedItem",
  "expenseCategory", "rationPlan",
]);

// Hard-deleted entities (no deletedAt) — create-revert hard-deletes, delete-revert re-inserts.
const HARD_TABLES: Record<string, any> = {
  feedItemPrice: feedItemPriceHistory,
};

// Update-only entities (no delete path) — only their update is revertable.
const UPDATE_ONLY: Record<string, any> = {
  user: users,
};

// entityTypes/actions that can never be reverted.
const NON_REVERTABLE_ENTITY = new Set(["backup", "bulk", "recycle_bin", "permission"]);
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

export function getRevertPlan(entry: AuditLog): RevertPlan {
  if (entry.revertedAt) return { revertable: false, reason: "already_reverted" };

  const action = normalizeAction(entry.action);
  if (NON_REVERTABLE_ENTITY.has(entry.entityType) || NON_REVERTABLE_ACTION.has(action)) {
    return { revertable: false, reason: "not_revertable" };
  }

  const soft = SOFT_TABLES[entry.entityType];
  const hard = HARD_TABLES[entry.entityType];
  const updateOnly = UPDATE_ONLY[entry.entityType];

  // Compound actions first.
  if (entry.entityType === "animal" && action === "exit") return { revertable: true, kind: "animal_exit" };
  if (entry.entityType === "animal" && action === "promote") return { revertable: true, kind: "animal_promote" };
  if ((entry.entityType === "lambing_log" || entry.entityType === "lambingLog") && action === "create") {
    return { revertable: true, kind: "record_birth" };
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
  if (updateOnly) {
    if (action === "update") return hasOldValues(entry) ? { revertable: true, kind: "update" } : { revertable: false, reason: "no_old_values" };
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
const SKIP_KEYS = new Set(["id", "createdAt", "updatedAt", "createdBy", "deletedAt", "deletedBy", "animalDbId", "statusHistoryId", "saleId", "lambingIds", "closedPregnancyId", "autoStage", "createdAnimalId", "lambingLogId", "paymentDelta", "revertOfAuditId"]);

const toDateCol = (v: unknown) => (v == null ? null : new Date(v as any));

// ─── Guard: only the newest action on an entity may be reverted ─────────────────

async function assertNewest(tx: DbOrTx, entry: AuditLog) {
  if (entry.entityId == null) return;
  const [newer] = await tx
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(and(
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

export async function revertAuditEntry(auditId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  return db.transaction(async (tx) => {
    const [entry] = await tx.select().from(auditLog).where(eq(auditLog.id, auditId)).limit(1).for("update");
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Audit entry not found" });

    const plan = getRevertPlan(entry);
    if (!plan.revertable) {
      throw new TRPCError({ code: "BAD_REQUEST", message: revertReasonMessage(plan.reason) });
    }

    // Skip the newest-first guard for revert entries (they're terminal anyway).
    await assertNewest(tx, entry);

    await applyRevert(tx, entry, plan.kind, userId);

    // Mark the original reverted and log the revert itself.
    await tx.update(auditLog)
      .set({ revertedAt: new Date(), revertedByUserId: userId })
      .where(eq(auditLog.id, entry.id));

    await createAuditEntry({
      userId,
      action: "revert",
      entityType: entry.entityType,
      entityId: entry.entityId ?? undefined,
      newValues: { revertOfAuditId: entry.id, originalAction: entry.action } as any,
      revertOfAuditId: entry.id,
    } as any, tx);

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

async function applyRevert(tx: DbOrTx, entry: AuditLog, kind: string, userId: number) {
  switch (kind) {
    case "soft_create": return softCreateRevert(tx, entry);
    case "soft_delete": return softDeleteRevert(tx, entry);     // undo a delete → restore
    case "soft_restore": return softRestoreRevert(tx, entry);   // undo a restore → re-delete
    case "update": return updateRevert(tx, entry);
    case "hard_create": return hardCreateRevert(tx, entry);
    case "hard_delete": return hardDeleteRevert(tx, entry);
    case "animal_exit": return animalExitRevert(tx, entry);
    case "animal_promote": return animalPromoteRevert(tx, entry);
    case "record_birth": return recordBirthRevert(tx, entry);
    default: throw new TRPCError({ code: "BAD_REQUEST", message: "This action can't be reverted." });
  }
}

async function requireRow(tx: DbOrTx, table: any, id: number) {
  const [row] = await tx.select().from(table).where(eq(table.id, id)).limit(1).for("update");
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "The record no longer exists." });
  return row;
}

// create → soft-delete the created row (animals cascade like deleteAnimal).
async function softCreateRevert(tx: DbOrTx, entry: AuditLog) {
  const id = resolveRowId(entry);
  if (id == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resolve the created record." });
  if (entry.entityType === "animal") return cascadeAnimal(tx, id, true);
  const table = SOFT_TABLES[entry.entityType];
  const row = await requireRow(tx, table, id);
  if ((row as any).deletedAt) throw new TRPCError({ code: "CONFLICT", message: "Record already deleted." });
  const set: any = { deletedAt: new Date() };
  if (ACTIVE_TOGGLE.has(entry.entityType)) set.isActive = false;
  await tx.update(table).set(set).where(eq(table.id, id));
}

// delete → restore (clear deletedAt). animals cascade like restoreAnimal.
async function softDeleteRevert(tx: DbOrTx, entry: AuditLog) {
  const id = resolveRowId(entry);
  if (id == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resolve the record." });
  if (entry.entityType === "animal") return cascadeAnimal(tx, id, false);
  const table = SOFT_TABLES[entry.entityType];
  await requireRow(tx, table, id);
  const set: any = { deletedAt: null, deletedBy: null };
  if (ACTIVE_TOGGLE.has(entry.entityType)) set.isActive = true;
  await tx.update(table).set(set).where(eq(table.id, id));
}

// restore → re-soft-delete.
async function softRestoreRevert(tx: DbOrTx, entry: AuditLog) {
  const id = resolveRowId(entry);
  if (id == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resolve the record." });
  if (entry.entityType === "animal") return cascadeAnimal(tx, id, true);
  const table = SOFT_TABLES[entry.entityType];
  await requireRow(tx, table, id);
  const set: any = { deletedAt: new Date() };
  if (ACTIVE_TOGGLE.has(entry.entityType)) set.isActive = false;
  await tx.update(table).set(set).where(eq(table.id, id));
}

// update → restore the changed fields to their prior values.
async function updateRevert(tx: DbOrTx, entry: AuditLog) {
  const id = resolveRowId(entry);
  if (id == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resolve the record." });
  const table = SOFT_TABLES[entry.entityType] ?? HARD_TABLES[entry.entityType] ?? UPDATE_ONLY[entry.entityType];
  if (!table) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown entity." });
  await requireRow(tx, table, id);

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
  await tx.update(table).set(set).where(eq(table.id, id));
}

// create (hard table) → hard-delete the created row.
async function hardCreateRevert(tx: DbOrTx, entry: AuditLog) {
  const id = resolveRowId(entry);
  if (id == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resolve the created record." });
  const table = HARD_TABLES[entry.entityType];
  await tx.delete(table).where(eq(table.id, id));
}

// delete (hard table) → re-insert from the snapshot in oldValues.
async function hardDeleteRevert(tx: DbOrTx, entry: AuditLog) {
  const table = HARD_TABLES[entry.entityType];
  const snapshot = { ...(entry.oldValues as any) };
  // normalize date fields
  for (const k of ["effectiveDate", "createdAt"]) if (snapshot[k]) snapshot[k] = new Date(snapshot[k]);
  await tx.insert(table).values(snapshot);
}

// ─── Compound handlers ──────────────────────────────────────────────────────────

// Soft-delete (or restore) an animal and its child rows, mirroring softDelete.ts.
async function cascadeAnimal(tx: DbOrTx, id: number, deleting: boolean) {
  const [animal] = await tx.select().from(animals).where(eq(animals.id, id)).limit(1).for("update");
  if (!animal) throw new TRPCError({ code: "NOT_FOUND", message: "Animal no longer exists." });
  if (deleting) {
    const now = new Date();
    await tx.update(animals).set({ deletedAt: now, isActive: false }).where(eq(animals.id, id));
    await tx.update(weightLog).set({ deletedAt: now }).where(and(eq(weightLog.animalId, id), isNull(weightLog.deletedAt)));
    await tx.update(expenses).set({ deletedAt: now }).where(and(eq(expenses.headId, id), isNull(expenses.deletedAt)));
    await tx.update(sales).set({ deletedAt: now }).where(and(eq(sales.animalId, id), isNull(sales.deletedAt)));
  } else {
    await tx.update(animals).set({ deletedAt: null, deletedBy: null, isActive: true }).where(eq(animals.id, id));
    await tx.update(weightLog).set({ deletedAt: null, deletedBy: null }).where(eq(weightLog.animalId, id));
    await tx.update(expenses).set({ deletedAt: null, deletedBy: null }).where(eq(expenses.headId, id));
    await tx.update(sales).set({ deletedAt: null, deletedBy: null }).where(eq(sales.animalId, id));
  }
}

// exit (sale) → reactivate the animal, restore status/exit fields, soft-delete the sale.
async function animalExitRevert(tx: DbOrTx, entry: AuditLog) {
  const id = resolveRowId(entry);
  if (id == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resolve the animal." });
  const ov = (entry.oldValues ?? {}) as any;
  const nv = (entry.newValues ?? {}) as any;
  await requireRow(tx, animals, id);
  await tx.update(animals).set({
    isActive: true,
    exitDate: null,
    exitReason: null,
    ...(ov.statusId != null ? { statusId: Number(ov.statusId) } : {}),
    updatedAt: new Date(),
  }).where(eq(animals.id, id));
  if (nv.saleId != null) {
    await tx.update(sales).set({ deletedAt: new Date() }).where(eq(sales.id, Number(nv.saleId)));
  }
}

// promote → soft-delete the created animal and un-promote the lambing record.
async function animalPromoteRevert(tx: DbOrTx, entry: AuditLog) {
  const nv = (entry.newValues ?? {}) as any;
  const createdAnimalId = nv.createdAnimalId != null ? Number(nv.createdAnimalId) : resolveRowId(entry);
  if (createdAnimalId == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resolve the promoted animal." });
  await cascadeAnimal(tx, createdAnimalId, true);
  if (nv.lambingLogId != null) {
    await tx.update(lambingLog)
      .set({ isPromoted: false, promotedHeadId: null, promotedAnimalCode: null })
      .where(eq(lambingLog.id, Number(nv.lambingLogId)));
  }
}

// recordBirth → soft-delete the created lambing rows; reopen the dam's pregnancy.
async function recordBirthRevert(tx: DbOrTx, entry: AuditLog) {
  const nv = (entry.newValues ?? {}) as any;
  const ids: number[] = Array.isArray(nv.lambingIds) ? nv.lambingIds.map((x: any) => Number(x)) : [];
  if (ids.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "This birth record can't be reverted — its lamb records weren't tracked." });
  for (const lid of ids) {
    const [row] = await tx.select().from(lambingLog).where(eq(lambingLog.id, lid)).limit(1).for("update");
    if (row?.isPromoted) {
      throw new TRPCError({ code: "CONFLICT", message: "A lamb from this birth was already promoted — revert that first." });
    }
    await tx.update(lambingLog).set({ deletedAt: new Date() }).where(and(eq(lambingLog.id, lid), isNull(lambingLog.deletedAt)));
  }
  if (nv.closedPregnancyId != null) {
    await tx.update(pregnancyRecords)
      .set({ status: "active", outcomeLambingLogId: null, completedDate: null })
      .where(eq(pregnancyRecords.id, Number(nv.closedPregnancyId)));
  }
}
