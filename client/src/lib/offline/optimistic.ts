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
import { hashKey, type QueryClient } from "@tanstack/react-query";
import {
  isYesNoReport,
  nextTaskProgress,
  tapTime,
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
  date?: string;
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
  /** The write this row stands in for, so retrying it doesn't show it twice. */
  clientKey?: string;
};

/**
 * A tablet tap changes an existing row rather than appending one, so it runs the
 * same rule the server will. The screen is right immediately, signal or not.
 */
function patchTabletDay(
  day: TabletDayCache,
  input: { taskId: number; action: TaskAction; workerId?: number | null; reason?: BlockedReason | null; tappedAt?: string | null },
): TabletDayCache {
  const nameOf = (id: number | null) => day.workers.find(worker => worker.id === id)?.name ?? null;
  return {
    ...day,
    tasks: day.tasks.map(task => {
      if (task.id !== input.taskId) return task;
      const next = nextTaskProgress(task, { action: input.action, workerId: input.workerId ?? null, reason: input.reason }, tapTime(input.tappedAt));
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
  input: Partial<Omit<TabletReportCache, "id" | "workerName">> & {
    type: ReportType;
    workerId: number;
    reportDate?: string | null;
    idempotencyKey?: string;
  },
): TabletDayCache {
  // Written for a day this screen isn't showing, such as yesterday's after midnight.
  if (input.reportDate && day.date && input.reportDate !== day.date) return day;
  const row: TabletReportCache = {
    id: nextProvisionalId(),
    type: input.type,
    answer: input.answer ?? null,
    animalTag: input.animalTag ?? null,
    stockKinds: input.stockKinds ?? null,
    purchaseKind: input.purchaseKind ?? null,
    itemName: input.itemName ?? null,
    workerName: day.workers.find(worker => worker.id === input.workerId)?.name ?? "",
    clientKey: input.idempotencyKey,
  };
  const kept = (day.reports ?? []).filter(report =>
    !(isYesNoReport(input.type) && report.type === input.type)
    && !(input.idempotencyKey && report.clientKey === input.idempotencyKey));
  return { ...day, reports: [row, ...kept] };
}

const TABLET_DAY_KEY = offlineQueryKey("tasks.today", undefined);

/** `data` as the screen should show it with this write included. Same object if unaffected. */
function withWrite(data: unknown, key: readonly unknown[], path: string, input: any): unknown {
  if (path === "tasks.recordAction" || path === "tasks.submitReport") {
    if (!data || hashKey(key) !== hashKey(TABLET_DAY_KEY)) return data;
    return path === "tasks.recordAction"
      ? patchTabletDay(data as TabletDayCache, input)
      : addTabletReport(data as TabletDayCache, input);
  }
  const plan = PLANS[path as OfflineMutationPath];
  if (!plan || !Array.isArray(data)) return data;
  // Only lists already in cache. Seeding a list that was never fetched would make
  // a single provisional row look like the complete history.
  return plan.targets(input).some(target => hashKey(target) === hashKey(key)) ? [...data, plan.row(input)] : data;
}

export function applyOptimisticRow(
  queryClient: QueryClient,
  path: OfflineMutationPath,
  input: unknown,
): OptimisticSnapshot {
  const keys = path === "tasks.recordAction" || path === "tasks.submitReport"
    ? [TABLET_DAY_KEY]
    : PLANS[path]?.targets(input) ?? [];
  const snapshot: OptimisticSnapshot = [];
  for (const key of keys) {
    const previous = queryClient.getQueryData(key as unknown[]);
    const next = withWrite(previous, key, path, input);
    if (next === previous) continue;
    // A poll already in flight would otherwise overwrite this with older data.
    void queryClient.cancelQueries({ queryKey: key as unknown[] });
    snapshot.push({ key, previous });
    queryClient.setQueryData(key as unknown[], next);
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

/** Writes still on their way to the server, oldest first, which is how they'll land. */
function unsyncedWrites(queryClient: QueryClient) {
  return queryClient.getMutationCache().getAll()
    .filter(mutation => mutation.state.status === "pending")
    .sort((a, b) => a.state.submittedAt - b.state.submittedAt || a.mutationId - b.mutationId)
    .map(mutation => ({
      path: ((mutation.options.mutationKey?.[0] ?? []) as string[]).join("."),
      input: mutation.state.variables,
    }));
}

function withWrites(data: unknown, key: readonly unknown[], writes: ReturnType<typeof unsyncedWrites>) {
  return writes.reduce((current, write) => withWrite(current, key, write.path, write.input), data);
}

/**
 * The server hasn't seen a queued write yet, so whatever it sends back doesn't have
 * it. Every response is put back on top of the writes still waiting, so a poll, a
 * reload or another write finishing can't make the screen jump back while they sync.
 */
export function keepUnsyncedWritesOnScreen(queryClient: QueryClient): () => void {
  return queryClient.getQueryCache().subscribe(event => {
    if (event.type !== "updated" || event.action.type !== "success" || event.action.manual) return;
    const { query } = event;
    const next = withWrites(query.state.data, query.queryKey, unsyncedWrites(queryClient));
    if (next !== query.state.data) query.setData(next, { manual: true });
  });
}

/**
 * Takes a refused or discarded write off the screen. Call it while the write is still
 * in the queue. The snapshot already has older writes but not newer ones, so those go
 * back on top, and the server settles the rest.
 */
export function undoOptimisticWrite(
  queryClient: QueryClient,
  path: string,
  input: unknown,
  snapshot: OptimisticSnapshot | null | undefined,
) {
  const writes = unsyncedWrites(queryClient);
  const newer = writes.slice(writes.findIndex(write => write.input === input) + 1);
  for (const { key, previous } of snapshot ?? []) {
    queryClient.setQueryData(key as unknown[], withWrites(previous, key, newer));
  }
  void queryClient.invalidateQueries({ queryKey: [[path.split(".")[0]]] });
}

/** True when a cached row is a provisional, not-yet-synced entry. */
export function isPendingSyncRow(row: unknown): boolean {
  return Boolean((row as PendingRow | null)?.[PENDING_SYNC]);
}
