import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  applyOptimisticRow,
  installInstantDeletes,
  isPendingSyncRow,
  keepUnsyncedWritesOnScreen,
  rollbackOptimisticRows,
} from "./optimistic";
import { offlineQueryKey } from "./prefetch";

const weightLogKey = offlineQueryKey("animals.getWeightLog", { animalId: 7 }) as unknown[];

function clientWithWeightLog(rows: unknown[]) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(weightLogKey, rows);
  return queryClient;
}

describe("optimistic offline rows", () => {
  const input = { animalId: 7, weighDate: "2026-07-26", weightKg: "42.50", notes: null };

  it("appends a pending row so an offline entry is visibly saved", () => {
    const queryClient = clientWithWeightLog([{ id: 1, weightKg: "40.00" }]);

    applyOptimisticRow(queryClient, "animals.addWeight", input);

    const rows = queryClient.getQueryData<unknown[]>(weightLogKey)!;
    expect(rows).toHaveLength(2);
    expect(isPendingSyncRow(rows[1])).toBe(true);
    expect(rows[1]).toMatchObject({ animalId: 7, weightKg: "42.50" });
    // The existing row must be untouched.
    expect(isPendingSyncRow(rows[0])).toBe(false);
  });

  it("gives provisional rows negative ids that cannot collide with real records", () => {
    const queryClient = clientWithWeightLog([]);

    applyOptimisticRow(queryClient, "animals.addWeight", input);
    applyOptimisticRow(queryClient, "animals.addWeight", input);

    const rows = queryClient.getQueryData<Array<{ id: number }>>(weightLogKey)!;
    expect(rows.every(row => row.id < 0)).toBe(true);
    // Distinct, so React keys do not clash when two entries are queued.
    expect(new Set(rows.map(row => row.id)).size).toBe(2);
  });

  it("does not seed a list that was never fetched", () => {
    // Otherwise a single provisional entry would look like the animal's whole
    // weight history, which is worse than showing nothing.
    const queryClient = new QueryClient();

    const snapshot = applyOptimisticRow(queryClient, "animals.addWeight", input);

    expect(snapshot).toEqual([]);
    expect(queryClient.getQueryData(weightLogKey)).toBeUndefined();
  });

  it("restores the previous list when the write fails for good", () => {
    const original = [{ id: 1, weightKg: "40.00" }];
    const queryClient = clientWithWeightLog(original);

    const snapshot = applyOptimisticRow(queryClient, "animals.addWeight", input);
    rollbackOptimisticRows(queryClient, snapshot);

    expect(queryClient.getQueryData(weightLogKey)).toEqual(original);
  });

  it("does not fabricate animals, whose ids only the server can assign", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(offlineQueryKey("animals.list", {}) as unknown[], []);

    expect(applyOptimisticRow(queryClient, "animals.create", { speciesId: 1 })).toEqual([]);
    expect(applyOptimisticRow(queryClient, "breeding.recordBirth", { damId: 2 })).toEqual([]);
    expect(queryClient.getQueryData(offlineQueryKey("animals.list", {}) as unknown[])).toEqual([]);
  });

  it("patches the feed ledger for an offline stock entry", () => {
    const queryClient = new QueryClient();
    const ledgerKey = offlineQueryKey("feed.getStockLedger", undefined) as unknown[];
    queryClient.setQueryData(ledgerKey, []);

    applyOptimisticRow(queryClient, "feed.addStockEntry", {
      feedItemId: 3,
      transactionDate: "2026-07-26",
      transactionType: "purchase",
      qty: "100.00",
    });

    const rows = queryClient.getQueryData<unknown[]>(ledgerKey)!;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feedItemId: 3, transactionType: "purchase" });
  });
});

describe("installInstantDeletes", () => {
  const LIST = [["sales", "list"], { type: "query" }] as const;
  const rows = () => [{ sale: { id: 1 } }, { sale: { id: 2 } }];
  const setup = () => {
    const queryClient = new QueryClient();
    const stop = installInstantDeletes(queryClient);
    queryClient.setQueryData(LIST, rows());
    return { queryClient, stop };
  };
  const send = (queryClient: QueryClient, path: string[], input: unknown, mutationFn: () => Promise<unknown>) =>
    new MutationObserver(queryClient, { mutationKey: [path], mutationFn, retry: false }).mutate(input as void);

  it("takes the row off before the server answers", async () => {
    const { queryClient, stop } = setup();
    let answer!: (value: unknown) => void;
    const answered = new Promise(resolve => { answer = resolve; });
    const sent = send(queryClient, ["recycleBin", "deleteSale"], { id: 1 }, () => answered);
    expect(queryClient.getQueryData(LIST)).toEqual([{ sale: { id: 2 } }]);
    answer({});
    await sent;
    stop();
  });

  it("puts the row back when the server refuses", async () => {
    const { queryClient, stop } = setup();
    await send(queryClient, ["recycleBin", "deleteSale"], { id: 1 }, () => Promise.reject(new Error("no"))).catch(() => undefined);
    expect(queryClient.getQueryData(LIST)).toEqual(rows());
    stop();
  });

  it("keeps the row off when a poll answers while the delete is on its way", async () => {
    const { queryClient, stop } = setup();
    const stopKeeping = keepUnsyncedWritesOnScreen(queryClient);
    let answer!: (value: unknown) => void;
    const answered = new Promise(resolve => { answer = resolve; });
    const sent = send(queryClient, ["recycleBin", "deleteSale"], { id: 1 }, () => answered);
    await queryClient.fetchQuery({ queryKey: LIST, queryFn: () => rows() });
    expect(queryClient.getQueryData(LIST)).toEqual([{ sale: { id: 2 } }]);
    answer({});
    await sent;
    stopKeeping();
    stop();
  });

  it("matches the id where each list keeps it, not any nested id", () => {
    const { queryClient, stop } = setup();
    // Same id, but a different table's: a sale with id 2 isn't animal 2.
    void send(queryClient, ["recycleBin", "deleteAnimal"], { id: 2 }, () => new Promise(() => undefined));
    expect(queryClient.getQueryData(LIST)).toEqual(rows());
    stop();
  });

  it("removes from the lists on a response object, and only from those", () => {
    const { queryClient, stop } = setup();
    const OVERVIEW = [["tasks", "overview"], { type: "query" }] as const;
    queryClient.setQueryData(OVERVIEW, { date: "2026-11-02", tasks: [{ id: 1 }, { id: 2 }] });
    void send(queryClient, ["tasks", "delete"], { id: 1 }, () => new Promise(() => undefined));
    expect(queryClient.getQueryData(OVERVIEW)).toEqual({ date: "2026-11-02", tasks: [{ id: 2 }] });
    stop();
  });

  it("starts a deleted day over: today stays listed and its tasks reopen", () => {
    const queryClient = new QueryClient();
    const stop = installInstantDeletes(queryClient);
    const DAYS = [["tasks", "dayReports"], { type: "query" }] as const;
    const OVERVIEW = [["tasks", "overview"], { type: "query" }] as const;
    queryClient.setQueryData(DAYS, [
      { date: "2026-11-02", isToday: true, tasksDone: 3, answerCount: 2, photoCount: 1, needsAttention: true, workerNames: ["Ali"] },
      { date: "2026-11-01", isToday: false, tasksDone: 1, answerCount: 1, photoCount: 0, needsAttention: false, workerNames: [] },
    ]);
    queryClient.setQueryData(OVERVIEW, { date: "2026-11-02", tasks: [{ id: 1, status: "done", finishedByName: "Ali" }] });

    void send(queryClient, ["tasks", "deleteDayReport"], { date: "2026-11-01" }, () => new Promise(() => undefined));
    expect(queryClient.getQueryData<unknown[]>(DAYS)).toHaveLength(1);

    void send(queryClient, ["tasks", "deleteDayReport"], { date: "2026-11-02" }, () => new Promise(() => undefined));
    expect(queryClient.getQueryData(DAYS)).toEqual([
      { date: "2026-11-02", isToday: true, tasksDone: 0, answerCount: 0, photoCount: 0, needsAttention: false, workerNames: [] },
    ]);
    expect(queryClient.getQueryData<{ tasks: Array<{ status: string; finishedByName: null }> }>(OVERVIEW)!.tasks[0]).toMatchObject({ status: "todo", finishedByName: null });
    stop();
  });
});
