import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  applyOptimisticRow,
  isPendingSyncRow,
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
