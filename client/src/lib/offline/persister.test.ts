import { dehydrate, QueryClient } from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  type PersistedClient,
} from "@tanstack/react-query-persist-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const records = vi.hoisted(() => new Map<string, unknown>());
vi.mock("idb-keyval", () => ({
  createStore: () => ({}),
  get: async (key: string) => records.get(key),
  set: async (key: string, value: unknown) => {
    records.set(key, value);
  },
  del: async (key: string) => {
    records.delete(key);
  },
  keys: async () => [...records.keys()],
  clear: async () => {
    records.clear();
  },
}));

import { createOfflinePersister } from "./persister";

const cache = { buster: "new-build", maxAge: 1_000 };
function savedClient(buster: string, timestamp: number): PersistedClient {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["animals"], [{ id: 1 }]);
  for (const [status, weight] of [
    ["pending", 123],
    ["error", 456],
  ] as const) {
    queryClient.getMutationCache().build(
      queryClient,
      {
        mutationKey: [["animals", "addWeight"]],
      },
      {
        context: undefined,
        data: undefined,
        error: null,
        failureCount: 0,
        failureReason: null,
        status,
        isPaused: status === "pending",
        variables: { weight },
        submittedAt: timestamp,
      }
    );
  }
  const clientState = dehydrate(queryClient, {
    shouldDehydrateMutation: () => true,
  });
  queryClient.clear();
  return {
    buster,
    timestamp,
    clientState,
  };
}

describe("offline persistence across releases", () => {
  beforeEach(() => records.clear());

  it.each(["build", "expiry"])(
    "keeps queued writes through %s invalidation, discarding cached reads",
    async reason => {
      records.set(
        "user-a",
        savedClient(
          reason === "build" ? "old-build" : cache.buster,
          reason === "expiry" ? 1 : Date.now()
        )
      );
      const queryClient = new QueryClient();
      await persistQueryClientRestore({
        queryClient,
        persister: createOfflinePersister("user-a", cache),
        ...cache,
      });
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
      expect(
        queryClient
          .getMutationCache()
          .getAll()
          .map(m => m.state.variables)
      ).toEqual([{ weight: 123 }, { weight: 456 }]);
      expect(records.has("user-a")).toBe(true);
      queryClient.clear();
    }
  );

  it("never restores another identity's pending records or anonymous data", async () => {
    records.set("user-a", savedClient("old-build", Date.now()));
    expect(
      await createOfflinePersister("user-b", cache).restoreClient()
    ).toBeUndefined();
    expect(
      await createOfflinePersister(null, cache).restoreClient()
    ).toBeUndefined();
    await createOfflinePersister("user-b", cache).removeClient();
    expect(records.has("user-a")).toBe(true);
  });

  it("keeps current reads and permits explicit removal of the current identity", async () => {
    const client = savedClient(cache.buster, Date.now());
    records.set("user-a", client);
    const persister = createOfflinePersister("user-a", cache);
    expect(await persister.restoreClient()).toBe(client);
    await persister.removeClient();
    expect(records.has("user-a")).toBe(false);
  });
});
