import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  OFFLINE_MUTATION_PATHS,
  isOfflineMutationPath,
  mutationKeyForPath,
  registerOfflineMutationDefaults,
} from "./offlineMutations";
import {
  applyOptimisticRow,
  isPendingSyncRow,
  keepUnsyncedWritesOnScreen,
  rollbackOptimisticRows,
  undoOptimisticWrite,
} from "./optimistic";
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

  describe("while a write waits to sync", () => {
    const queued = (queryClient: QueryClient, path: string, input: Record<string, unknown>, status: "pending" | "success" = "pending") => {
      const cache = queryClient.getMutationCache();
      return cache.build(queryClient, { mutationKey: [path.split(".")] }, {
        context: undefined, data: undefined, error: null, failureCount: 0, failureReason: null,
        isPaused: true, status, variables: input, submittedAt: cache.getAll().length + 1,
      });
    };
    const fromServer = (queryClient: QueryClient) => queryClient.fetchQuery({
      queryKey: key,
      staleTime: 0,
      queryFn: () => ({
        date: "2026-11-02",
        workers: [{ id: 1, name: "Ali" }, { id: 2, name: "Omar" }],
        reports: [],
        tasks: [{
          id: 7, status: "todo", startedByWorkerId: null, startedByName: null, startedAt: null,
          finishedByWorkerId: null, finishedByName: null, finishedAt: null, blockedReason: null,
        }],
      }),
    });

    it("keeps the tap on screen when the server answers without it", async () => {
      const queryClient = seeded();
      keepUnsyncedWritesOnScreen(queryClient);
      queued(queryClient, "tasks.recordAction", { taskId: 7, action: "start", workerId: 1 });
      await fromServer(queryClient);
      expect(task(queryClient, 7)).toMatchObject({ status: "started", startedByName: "Ali" });
    });

    it("replays waiting taps in the order they were made", async () => {
      const queryClient = seeded();
      keepUnsyncedWritesOnScreen(queryClient);
      queued(queryClient, "tasks.recordAction", { taskId: 7, action: "start", workerId: 2 });
      queued(queryClient, "tasks.recordAction", { taskId: 7, action: "done", workerId: 2 });
      await fromServer(queryClient);
      expect(task(queryClient, 7)).toMatchObject({ status: "done", finishedByName: "Omar" });
    });

    it("keeps a waiting report, once, and not one written for another day", async () => {
      const queryClient = seeded();
      keepUnsyncedWritesOnScreen(queryClient);
      queued(queryClient, "tasks.submitReport", { type: "animal_dead", animalTag: "EW-1", workerId: 1, idempotencyKey: "key-0001" });
      queued(queryClient, "tasks.submitReport", { type: "animal_dead", animalTag: "EW-2", workerId: 1, reportDate: "2026-11-01" });
      await fromServer(queryClient);
      await fromServer(queryClient);
      expect(reports(queryClient).map(row => row.animalTag)).toEqual(["EW-1"]);
    });

    it("lets the server's answer through once nothing is waiting", async () => {
      const queryClient = seeded();
      keepUnsyncedWritesOnScreen(queryClient);
      queued(queryClient, "tasks.recordAction", { taskId: 7, action: "start", workerId: 1 }, "success");
      await fromServer(queryClient);
      expect(task(queryClient, 7)).toMatchObject({ status: "todo" });
    });

    it("keeps a waiting weight on its list too", async () => {
      const queryClient = new QueryClient();
      keepUnsyncedWritesOnScreen(queryClient);
      queued(queryClient, "animals.addWeight", { animalId: 3, weighDate: "2026-11-02", weightKg: 40 });
      const rows = await queryClient.fetchQuery({
        queryKey: offlineQueryKey("animals.getWeightLog", { animalId: 3 }),
        queryFn: () => [{ id: 1, weightKg: 35 }],
      }).then(() => queryClient.getQueryData<Array<Record<string, unknown>>>(offlineQueryKey("animals.getWeightLog", { animalId: 3 }))!);
      expect(rows.map(row => row.weightKg)).toEqual([35, 40]);
      expect(isPendingSyncRow(rows[1])).toBe(true);
    });

    it("a refused tap comes off without taking newer taps with it", () => {
      const queryClient = seeded();
      const input = { taskId: 7, action: "start", workerId: 1 };
      const snapshot = applyOptimisticRow(queryClient, "tasks.recordAction", input);
      queued(queryClient, "tasks.recordAction", { taskId: 8, action: "start", workerId: 2 });
      undoOptimisticWrite(queryClient, "tasks.recordAction", input, snapshot);
      expect(task(queryClient, 7)).toMatchObject({ status: "todo" });
      expect(task(queryClient, 8)).toMatchObject({ status: "started", startedByName: "Omar" });
    });

    it("taking a write off doesn't repeat older ones already on the list", () => {
      const queryClient = new QueryClient();
      const list = offlineQueryKey("animals.getWeightLog", { animalId: 3 });
      queryClient.setQueryData(list, []);
      const add = (weightKg: number) => {
        const input = { animalId: 3, weighDate: "2026-11-02", weightKg };
        const snapshot = applyOptimisticRow(queryClient, "animals.addWeight", input);
        queued(queryClient, "animals.addWeight", input);
        return { input, snapshot };
      };
      add(40);
      const second = add(41);
      undoOptimisticWrite(queryClient, "animals.addWeight", second.input, second.snapshot);
      expect(queryClient.getQueryData<Array<{ weightKg: number }>>(list)!.map(row => row.weightKg)).toEqual([40]);
    });

    it("refreshes every list of the same area after a write", () => {
      const queryClient = seeded();
      const write = queued(queryClient, "tasks.recordAction", { taskId: 7, action: "start", workerId: 1 });
      undoOptimisticWrite(queryClient, "tasks.recordAction", write.state.variables, []);
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    });
  });

  it("queues reports for replay", () => {
    expect(isOfflineMutationPath("tasks.submitReport")).toBe(true);
  });
});
