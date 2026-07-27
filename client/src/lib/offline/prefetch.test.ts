import { QueryClient, hashKey } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  OFFLINE_PREFETCH_PATHS,
  offlineQueryKey,
  prefetchOfflineReadSet,
} from "./prefetch";

/** Minimal stand-in for a tRPC procedure handle, which exposes `_def()`. */
function procedureStub(path: string) {
  return { _def: () => ({ path: path.split(".") }) } as never;
}

/** Stands in for the tRPC client: nested objects ending in a `query` function. */
function fakeTrpcClient(paths: readonly string[]) {
  const root: Record<string, any> = {};
  const calls: string[] = [];
  for (const path of paths) {
    const segments = path.split(".");
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      node[segment] ??= {};
      node = node[segment];
    }
    node[segments[segments.length - 1]] = {
      query: vi.fn(async () => {
        calls.push(path);
        return [];
      }),
    };
  }
  return { client: root as any, calls };
}

describe("offline prefetch key shape", () => {
  // If these drift from tRPC's own keys, the prefetch silently populates cache
  // entries no page ever reads: online everything looks fine, and offline the
  // screens are empty. That is the failure this test exists to prevent.
  it("matches tRPC's key for an input-less query", () => {
    const trpcKey = getQueryKey(procedureStub("config.getSpecies"), undefined, "query");
    expect(hashKey(offlineQueryKey("config.getSpecies", undefined))).toBe(hashKey(trpcKey));
  });

  it("matches tRPC's key for an object input", () => {
    const trpcKey = getQueryKey(procedureStub("animals.list"), {}, "query");
    expect(hashKey(offlineQueryKey("animals.list", {}))).toBe(hashKey(trpcKey));
  });

  it("matches a page's unfiltered list call, whose optional fields are undefined", () => {
    // Both designs call animals.list with every filter undefined but with
    // different property sets; JSON.stringify drops undefined, so one prefetch
    // of {} covers both.
    const newDesignInput = {
      speciesId: undefined,
      statusId: undefined,
      acquisitionType: undefined,
      ownerId: undefined,
    };
    const oldDesignInput = { isActive: undefined, speciesId: undefined, ownerId: undefined };
    const prefetched = hashKey(offlineQueryKey("animals.list", {}));
    expect(hashKey(offlineQueryKey("animals.list", newDesignInput))).toBe(prefetched);
    expect(hashKey(offlineQueryKey("animals.list", oldDesignInput))).toBe(prefetched);
  });

  it("distinguishes a no-argument call from an empty-object call", () => {
    // useQuery() and useQuery({}) are different cache entries in tRPC, so the
    // prefetch list has to keep them apart rather than guessing.
    expect(hashKey(offlineQueryKey("animals.lookup", undefined))).not.toBe(
      hashKey(offlineQueryKey("animals.lookup", {})),
    );
  });
});

describe("prefetchOfflineReadSet", () => {
  it("covers the reference data every offline form needs", () => {
    for (const path of [
      "config.getCategories",
      "config.getSpecies",
      "config.getStatuses",
      "config.getVaccines",
      "config.getFeedItems",
      "animals.lookup",
    ]) {
      expect(OFFLINE_PREFETCH_PATHS).toContain(path);
    }
  });

  it("warms every listed query", async () => {
    const queryClient = new QueryClient();
    const { client, calls } = fakeTrpcClient(OFFLINE_PREFETCH_PATHS);

    await prefetchOfflineReadSet(queryClient, client);

    expect(new Set(calls)).toEqual(new Set(OFFLINE_PREFETCH_PATHS));
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);
  });

  it("keeps going when one procedure is unavailable to this user", async () => {
    const queryClient = new QueryClient();
    const { client, calls } = fakeTrpcClient(OFFLINE_PREFETCH_PATHS);
    // A viewer without feed permission must still get their animal lists cached.
    client.feed.getStockStatus.query = vi.fn(async () => {
      throw new Error("FORBIDDEN");
    });

    await prefetchOfflineReadSet(queryClient, client);

    expect(calls).toContain("animals.list");
    expect(calls).not.toContain("feed.getStockStatus");
  });

  it("prefetches profile data for every cached animal, within the cap", async () => {
    const { ANIMAL_DETAIL_QUERIES, ANIMAL_DETAIL_PREFETCH_LIMIT } = await import("./prefetch");
    const queryClient = new QueryClient();
    const detailPaths = ANIMAL_DETAIL_QUERIES.map(query => query.path);
    const { client } = fakeTrpcClient([...OFFLINE_PREFETCH_PATHS, ...detailPaths]);

    // The list query is what supplies the ids for the detail pass.
    const detailCalls: unknown[] = [];
    client.animals.list.query = vi.fn(async () => [
      { animal: { id: 7 } },
      { animal: { id: 9 } },
    ]);
    client.animals.getById.query = vi.fn(async (input: unknown) => {
      detailCalls.push(["getById", input]);
      return {};
    });
    client.animals.getWeightLog.query = vi.fn(async (input: unknown) => {
      detailCalls.push(["getWeightLog", input]);
      return [];
    });

    await prefetchOfflineReadSet(queryClient, client);

    // A profile opened for the first time while offline needs these cached —
    // the field workflow is "walk to the animal, open it, record a weight".
    expect(detailCalls).toContainEqual(["getById", { id: 7 }]);
    expect(detailCalls).toContainEqual(["getById", { id: 9 }]);
    expect(detailCalls).toContainEqual(["getWeightLog", { animalId: 7 }]);
    expect(detailCalls).toContainEqual(["getWeightLog", { animalId: 9 }]);
    expect(ANIMAL_DETAIL_PREFETCH_LIMIT).toBeGreaterThan(0);
  });

  it("skips the detail pass entirely when the animal list could not be fetched", async () => {
    const queryClient = new QueryClient();
    const { client } = fakeTrpcClient(OFFLINE_PREFETCH_PATHS);
    client.animals.list.query = vi.fn(async () => {
      throw new Error("unreachable");
    });

    await expect(prefetchOfflineReadSet(queryClient, client)).resolves.toBeUndefined();
  });

  it("ignores a procedure that no longer exists rather than throwing at startup", async () => {
    const queryClient = new QueryClient();
    const { client } = fakeTrpcClient(
      OFFLINE_PREFETCH_PATHS.filter(path => path !== "animals.list"),
    );
    await expect(prefetchOfflineReadSet(queryClient, client)).resolves.toBeUndefined();
  });
});
