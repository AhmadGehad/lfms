import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  OFFLINE_MUTATION_PATHS,
  isOfflineMutationPath,
  mutationKeyForPath,
  registerOfflineMutationDefaults,
} from "./offlineMutations";
import { applyOptimisticRow, rollbackOptimisticRows } from "./optimistic";
import { offlineQueryKey } from "./prefetch";

/** Stands in for the tRPC client: nested objects ending in a `mutate` function. */
function fakeTrpcClient(paths: readonly string[]) {
  const root: Record<string, any> = {};
  const calls: Array<{ path: string; input: unknown }> = [];
  for (const path of paths) {
    const segments = path.split(".");
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      node[segment] ??= {};
      node = node[segment];
    }
    const leaf = segments[segments.length - 1];
    node[leaf] = {
      mutate: vi.fn(async (input: unknown) => {
        calls.push({ path, input });
        return { ok: true };
      }),
    };
  }
  return { client: root as any, calls };
}

describe("offline mutation registry", () => {
  it("lists only create-style procedures", () => {
    // Updates and deletes carry expectedVersion; replaying a stale one is a real
    // conflict, so they must never be queued offline.
    for (const path of OFFLINE_MUTATION_PATHS) {
      expect(path).not.toMatch(/\.(update|delete|remove)/i);
    }
  });

  it("uses the same mutation key shape tRPC's useMutation registers", () => {
    // tRPC calls getMutationKeyInternal(path) -> [pathSegments]; a mismatch here
    // means a rehydrated mutation finds no default and can never resume.
    expect(mutationKeyForPath("animals.addWeight")).toEqual([
      ["animals", "addWeight"],
    ]);
    expect(mutationKeyForPath("feed.addStockEntry")).toEqual([
      ["feed", "addStockEntry"],
    ]);
  });

  it("registers a resumable mutationFn for every offline path", async () => {
    const queryClient = new QueryClient();
    const { client, calls } = fakeTrpcClient(OFFLINE_MUTATION_PATHS);

    registerOfflineMutationDefaults(queryClient, client);

    for (const path of OFFLINE_MUTATION_PATHS) {
      const defaults = queryClient.getMutationDefaults(
        mutationKeyForPath(path) as unknown as unknown[]
      );
      expect(
        defaults?.mutationFn,
        `no mutationFn registered for ${path}`
      ).toBeTypeOf("function");
      expect(defaults?.gcTime).toBe(Infinity);
      // networkMode is asserted in queuedSubmit.test.ts, next to the reason it
      // has to be "online".
    }

    // The registered function must actually reach the procedure it names.
    const addWeightDefaults = queryClient.getMutationDefaults(
      mutationKeyForPath("animals.addWeight") as unknown as unknown[]
    );
    await addWeightDefaults!.mutationFn!({ animalId: 7 } as never);
    expect(calls).toEqual([
      { path: "animals.addWeight", input: { animalId: 7 } },
    ]);
  });

  it("fails loudly when a listed procedure no longer exists", () => {
    const queryClient = new QueryClient();
    // Client missing every path but the first — simulates a renamed procedure.
    const { client } = fakeTrpcClient([OFFLINE_MUTATION_PATHS[0]]);

    expect(() => registerOfflineMutationDefaults(queryClient, client)).toThrow(
      /does not exist on the tRPC client/
    );
  });

  it("recognises only registered paths as offline-capable", () => {
    expect(isOfflineMutationPath("animals.addWeight")).toBe(true);
    expect(isOfflineMutationPath("animals.update")).toBe(false);
    expect(isOfflineMutationPath("pregnancy.create")).toBe(false);
  });
});

describe("tablet taps", () => {
  const key = offlineQueryKey("tasks.today", undefined);
  const seeded = () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(key, {
      date: "2026-11-02",
      workers: [{ id: 1, name: "Ali" }, { id: 2, name: "Omar" }],
      tasks: [
        {
          id: 7, status: "todo", startedByWorkerId: null, startedByName: null, startedAt: null,
          finishedByWorkerId: null, finishedByName: null, finishedAt: null, blockedReason: null,
        },
        {
          id: 8, status: "todo", startedByWorkerId: null, startedByName: null, startedAt: null,
          finishedByWorkerId: null, finishedByName: null, finishedAt: null, blockedReason: null,
        },
      ],
    });
    return queryClient;
  };
  const task = (queryClient: QueryClient, id: number) =>
    queryClient.getQueryData<{ tasks: Array<Record<string, unknown>> }>(key)!.tasks.find(row => row.id === id)!;

  it("shows the tap on the list straight away, with the worker's name", () => {
    const queryClient = seeded();
    applyOptimisticRow(queryClient, "tasks.recordAction", { taskId: 7, action: "start", workerId: 1 });
    expect(task(queryClient, 7)).toMatchObject({ status: "started", startedByName: "Ali" });
    expect(task(queryClient, 8)).toMatchObject({ status: "todo" });

    applyOptimisticRow(queryClient, "tasks.recordAction", { taskId: 7, action: "done", workerId: 1 });
    expect(task(queryClient, 7)).toMatchObject({ status: "done", startedByName: "Ali", finishedByName: "Ali" });
  });

  it("rolls the tap back when the server refuses it", () => {
    const queryClient = seeded();
    const snapshot = applyOptimisticRow(queryClient, "tasks.recordAction", { taskId: 7, action: "done", workerId: 2 });
    rollbackOptimisticRows(queryClient, snapshot);
    expect(task(queryClient, 7)).toMatchObject({ status: "todo", finishedByName: null });
  });

  it("leaves the cache alone when nothing is cached yet", () => {
    const queryClient = new QueryClient();
    expect(applyOptimisticRow(queryClient, "tasks.recordAction", { taskId: 7, action: "start", workerId: 1 })).toEqual([]);
  });

  const reports = (queryClient: QueryClient) =>
    queryClient.getQueryData<{ reports: Array<Record<string, unknown>> }>(key)!.reports;

  it("shows a report straight away, and a new answer replaces the day's old one", () => {
    const queryClient = seeded();
    applyOptimisticRow(queryClient, "tasks.submitReport", { type: "doctor_visit", answer: true, workerId: 1 });
    applyOptimisticRow(queryClient, "tasks.submitReport", { type: "animal_dead", animalTag: "EW-1", workerId: 2 });
    applyOptimisticRow(queryClient, "tasks.submitReport", { type: "doctor_visit", answer: false, workerId: 1 });
    expect(reports(queryClient).map(row => [row.type, row.answer])).toEqual([["doctor_visit", false], ["animal_dead", null]]);
    expect(reports(queryClient)[0]).toMatchObject({ workerName: "Ali" });
  });

  it("queues reports for replay", () => {
    expect(isOfflineMutationPath("tasks.submitReport")).toBe(true);
  });
});
