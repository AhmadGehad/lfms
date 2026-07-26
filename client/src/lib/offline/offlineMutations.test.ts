import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  OFFLINE_MUTATION_PATHS,
  isOfflineMutationPath,
  mutationKeyForPath,
  registerOfflineMutationDefaults,
} from "./offlineMutations";

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
    expect(mutationKeyForPath("animals.addWeight")).toEqual([["animals", "addWeight"]]);
    expect(mutationKeyForPath("feed.addStockEntry")).toEqual([["feed", "addStockEntry"]]);
  });

  it("registers a resumable mutationFn for every offline path", async () => {
    const queryClient = new QueryClient();
    const { client, calls } = fakeTrpcClient(OFFLINE_MUTATION_PATHS);

    registerOfflineMutationDefaults(queryClient, client);

    for (const path of OFFLINE_MUTATION_PATHS) {
      const defaults = queryClient.getMutationDefaults(
        mutationKeyForPath(path) as unknown as unknown[],
      );
      expect(defaults?.mutationFn, `no mutationFn registered for ${path}`).toBeTypeOf(
        "function",
      );
      // networkMode is asserted in queuedSubmit.test.ts, next to the reason it
      // has to be "online".
    }

    // The registered function must actually reach the procedure it names.
    const addWeightDefaults = queryClient.getMutationDefaults(
      mutationKeyForPath("animals.addWeight") as unknown as unknown[],
    );
    await addWeightDefaults!.mutationFn!({ animalId: 7 } as never);
    expect(calls).toEqual([{ path: "animals.addWeight", input: { animalId: 7 } }]);
  });

  it("fails loudly when a listed procedure no longer exists", () => {
    const queryClient = new QueryClient();
    // Client missing every path but the first — simulates a renamed procedure.
    const { client } = fakeTrpcClient([OFFLINE_MUTATION_PATHS[0]]);

    expect(() => registerOfflineMutationDefaults(queryClient, client)).toThrow(
      /does not exist on the tRPC client/,
    );
  });

  it("recognises only registered paths as offline-capable", () => {
    expect(isOfflineMutationPath("animals.addWeight")).toBe(true);
    expect(isOfflineMutationPath("animals.update")).toBe(false);
    expect(isOfflineMutationPath("pregnancy.create")).toBe(false);
  });
});
