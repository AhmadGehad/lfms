import { describe, expect, it, vi } from "vitest";
import { isMutationWorking } from "./queuedSubmit";

describe("isMutationWorking", () => {
  // The reported bug: a queued write keeps React Query's status at "pending", so
  // a button gated on isPending stayed disabled and labelled "Saving…" forever
  // while offline, and the dialog never closed.
  it("does not treat a paused (queued) mutation as working", () => {
    expect(isMutationWorking({ isPending: true, isPaused: true })).toBe(false);
  });

  it("still reports a genuine in-flight request as working", () => {
    expect(isMutationWorking({ isPending: true, isPaused: false })).toBe(true);
  });

  it("reports an idle or settled mutation as not working", () => {
    expect(isMutationWorking({ isPending: false, isPaused: false })).toBe(false);
    expect(isMutationWorking({ isPending: false, isPaused: true })).toBe(false);
  });
});

describe("offline mutation defaults", () => {
  it("pauses instead of firing a request that cannot succeed", async () => {
    // networkMode "online" is what makes a write pause immediately when there is
    // no network. "offlineFirst" would attempt the doomed request first, leaving
    // the form spinning on it.
    const { QueryClient } = await import("@tanstack/react-query");
    const { registerOfflineMutationDefaults, OFFLINE_MUTATION_PATHS, mutationKeyForPath } =
      await import("./offlineMutations");

    const queryClient = new QueryClient();
    const client: any = {};
    for (const path of OFFLINE_MUTATION_PATHS) {
      const [router, procedure] = path.split(".");
      client[router] ??= {};
      client[router][procedure] = { mutate: vi.fn(async () => ({})) };
    }

    registerOfflineMutationDefaults(queryClient, client);

    for (const path of OFFLINE_MUTATION_PATHS) {
      const defaults = queryClient.getMutationDefaults(
        mutationKeyForPath(path) as unknown as unknown[],
      );
      expect(defaults?.networkMode, path).toBe("online");
    }
  });
});
