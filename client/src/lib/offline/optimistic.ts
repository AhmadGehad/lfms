/**
 * Provisional cache rows for writes made offline.
 *
 * Without these, someone recording a weight with no signal sees the form clear
 * and the list unchanged — indistinguishable from the entry being lost. The row
 * is inserted into the cached list immediately and replaced by the real record
 * once the mutation reaches the server.
 *
 * Applies only to log-style appends. Notably it does **not** fabricate animals
 * for `animals.create` / `breeding.recordBirth`: those rows are identified by a
 * server-assigned numeric `id` and animal ID, and injecting a fake one would let
 * other screens navigate to an animal that does not exist. Those two show up in
 * the sync queue instead.
 */
import type { QueryClient } from "@tanstack/react-query";
import {
  isYesNoReport,
  nextTaskProgress,
  type BlockedReason,
  type PurchaseKind,
  type ReportType,
  type StockKind,
  type TaskAction,
  type TaskProgress,
} from "../../../../shared/tasks";
import { offlineQueryKey } from "./prefetch";
import type { OfflineMutationPath } from "./offlineMutations";

/** Marks a row as not yet confirmed by the server, for UI that wants to show it. */
export const PENDING_SYNC = "__pendingSync" as const;

export type PendingRow = { [PENDING_SYNC]: true };

/** Negative ids cannot collide with a real auto-increment primary key. */
let provisionalId = -1;
function nextProvisionalId() {
  provisionalId -= 1;
  return provisionalId;
}

/** Cache lists a provisional row should be prepended to, per procedure. */
type OptimisticPlan = {
  /** Query keys to patch, derived from the mutation's own input. */
  targets: (input: any) => Array<readonly unknown[]>;
  /** Builds the provisional row from the mutation input. */
  row: (input: any) => Record<string, unknown> & PendingRow;
};

const PLANS: Partial<Record<OfflineMutationPath, OptimisticPlan>> = {
  "animals.addWeight": {
    targets: input => [offlineQueryKey("animals.getWeightLog", { animalId: input.animalId })],
    row: input => ({
      id: nextProvisionalId(),
      animalId: input.animalId,
      weighDate: input.weighDate,
      weightKg: input.weightKg,
      notes: input.notes ?? null,
      createdAt: new Date(),
      [PENDING_SYNC]: true,
    }),
  },
  "vaccination.addVaccinationRecord": {
    targets: input => [
      // Both the per-animal view and the unfiltered list a page may be showing.
      offlineQueryKey("vaccination.getVaccinationRecords", { animalId: input.animalId }),
      offlineQueryKey("vaccination.getVaccinationRecords", {}),
    ],
    row: input => ({
      id: nextProvisionalId(),
      animalId: input.animalId,
      vaccineId: input.vaccineId,
      administeredDate: input.administeredDate ?? input.vaccinationDate,
      notes: input.notes ?? null,
      [PENDING_SYNC]: true,
    }),
  },
  "feed.addStockEntry": {
    targets: () => [offlineQueryKey("feed.getStockLedger", undefined)],
    row: input => ({
      id: nextProvisionalId(),
      feedItemId: input.feedItemId,
      transactionDate: input.transactionDate,
      transactionType: input.transactionType,
      qty: input.qty,
      unitCost: input.unitCost ?? null,
      totalCost: input.totalCost ?? null,
      [PENDING_SYNC]: true,
    }),
  },
};

/** Snapshot taken before an optimistic patch, so it can be rolled back. */
export type OptimisticSnapshot = Array<{ key: readonly unknown[]; previous: unknown }>;

type TabletDayCache = {
  tasks: Array<TaskProgress & { id: number; startedByName: string | null; finishedByName: string | null }>;
  workers: Array<{ id: number; name: string }>;
  reports?: Array<TabletReportCache>;
};

type TabletReportCache = {
  id: number;
  type: ReportType;
  answer: boolean | null;
  animalTag: string | null;
  stockKinds: StockKind[] | null;
  purchaseKind: PurchaseKind | null;
  itemName: string | null;
  workerName: string;
};

/**
 * A tablet tap changes an existing row rather than appending one, so it runs the
 * same rule the server will. The screen is right immediately, signal or not.
 */
function patchTabletDay(
  day: TabletDayCache,
  input: { taskId: number; action: TaskAction; workerId?: number | null; reason?: BlockedReason | null },
): TabletDayCache {
  const nameOf = (id: number | null) => day.workers.find(worker => worker.id === id)?.name ?? null;
  return {
    ...day,
    tasks: day.tasks.map(task => {
      if (task.id !== input.taskId) return task;
      const next = nextTaskProgress(task, { action: input.action, workerId: input.workerId ?? null, reason: input.reason });
      if (!next) return task;
      return {
        ...task,
        ...next,
        startedByName: next.startedByWorkerId === task.startedByWorkerId ? task.startedByName : nameOf(next.startedByWorkerId),
        finishedByName: next.finishedByWorkerId === null
          ? null
          : next.finishedByWorkerId === task.startedByWorkerId
            ? task.startedByName ?? nameOf(next.finishedByWorkerId)
            : nameOf(next.finishedByWorkerId),
      };
    }),
  };
}

/** A report shows straight away; a new yes/no answer replaces the day's old one. */
function addTabletReport(
  day: TabletDayCache,
  input: Partial<Omit<TabletReportCache, "id" | "workerName">> & { type: ReportType; workerId: number },
): TabletDayCache {
  const row: TabletReportCache = {
    id: -Date.now(),
    type: input.type,
    answer: input.answer ?? null,
    animalTag: input.animalTag ?? null,
    stockKinds: input.stockKinds ?? null,
    purchaseKind: input.purchaseKind ?? null,
    itemName: input.itemName ?? null,
    workerName: day.workers.find(worker => worker.id === input.workerId)?.name ?? "",
  };
  const kept = (day.reports ?? []).filter(report => !(isYesNoReport(input.type) && report.type === input.type));
  return { ...day, reports: [row, ...kept] };
}

export function applyOptimisticRow(
  queryClient: QueryClient,
  path: OfflineMutationPath,
  input: unknown,
): OptimisticSnapshot {
  if (path === "tasks.recordAction" || path === "tasks.submitReport") {
    const key = offlineQueryKey("tasks.today", undefined);
    const previous = queryClient.getQueryData<TabletDayCache>(key);
    if (!previous) return [];
    // A poll already in flight would otherwise overwrite the tap with older data.
    void queryClient.cancelQueries({ queryKey: key });
    queryClient.setQueryData(key, path === "tasks.recordAction"
      ? patchTabletDay(previous, input as Parameters<typeof patchTabletDay>[1])
      : addTabletReport(previous, input as Parameters<typeof addTabletReport>[1]));
    return [{ key, previous }];
  }

  const plan = PLANS[path];
  if (!plan) return [];

  const snapshot: OptimisticSnapshot = [];
  for (const key of plan.targets(input)) {
    const previous = queryClient.getQueryData(key as unknown[]);
    // Only patch lists already in cache. Seeding a list that was never fetched
    // would make a single provisional row look like the complete history.
    if (!Array.isArray(previous)) continue;
    snapshot.push({ key, previous });
    queryClient.setQueryData(key as unknown[], [...previous, plan.row(input)]);
  }
  return snapshot;
}

export function rollbackOptimisticRows(
  queryClient: QueryClient,
  snapshot: OptimisticSnapshot,
) {
  for (const entry of snapshot) {
    queryClient.setQueryData(entry.key as unknown[], entry.previous);
  }
}

/** True when a cached row is a provisional, not-yet-synced entry. */
export function isPendingSyncRow(row: unknown): boolean {
  return Boolean((row as PendingRow | null)?.[PENDING_SYNC]);
}
