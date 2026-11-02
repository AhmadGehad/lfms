/**
 * Registry of the mutations that may be queued while offline.
 *
 * Why a registry rather than per-component config: a mutation that was paused
 * offline and then persisted has **no function attached** after the app
 * restarts. React Query can only resume it by looking up
 * `queryClient.getMutationDefaults(mutationKey)`. If a procedure is queued but
 * has no registered default, its record is silently unresumable — it sits in
 * IndexedDB forever and the user's work is lost. This file is therefore the
 * load-bearing part of offline support, and `offlineMutations.test.ts` fails if
 * a path is listed here without a resolver.
 *
 * Only **creates** are offline-capable. Updates and deletes carry
 * `expectedVersion` for optimistic concurrency, so replaying one after someone
 * else has touched the row is a genuine conflict, not something to retry.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { TRPCClient } from "@trpc/client";
import type { AppRouter } from "../../../../server/routers";
import {
  applyOptimisticRow,
  installInstantDeletes,
  keepUnsyncedWritesOnScreen,
  undoOptimisticWrite,
  type OptimisticSnapshot,
} from "./optimistic";
import { isTerminalSyncError } from "./syncQueue";

/** Dot-paths of the procedures that may be queued offline. */
export const OFFLINE_MUTATION_PATHS = [
  "animals.create",
  "animals.addWeight",
  "vaccination.addVaccinationRecord",
  "feed.addStockEntry",
  "breeding.recordBirth",
  // Not a create, but safe to replay: it carries no expectedVersion, and task
  // state only moves forward, so a late tap can't overwrite newer work.
  "tasks.recordAction",
  // Replayed once by its idempotency key, onto the day it was written.
  "tasks.submitReport",
  // Replayed once by its idempotency key, with the photo taken at the time.
  "tasks.checkIn",
] as const;

export type OfflineMutationPath = (typeof OFFLINE_MUTATION_PATHS)[number];

/**
 * Resolves a dot-path to the vanilla client's `mutate` function.
 *
 * Kept as a lookup on the typed client rather than a hand-written map so a
 * renamed procedure fails at the registration step instead of at replay time,
 * hours later, on a phone in a field.
 */
function resolveMutate(
  client: TRPCClient<AppRouter>,
  path: OfflineMutationPath
): (input: unknown) => Promise<unknown> {
  const procedure = path
    .split(".")
    .reduce<
      Record<string, unknown> | undefined
    >((node, segment) => node?.[segment] as Record<string, unknown> | undefined, client as unknown as Record<string, unknown>);

  const mutate = procedure?.["mutate"];
  if (typeof mutate !== "function") {
    throw new Error(
      `Offline mutation "${path}" does not exist on the tRPC client. ` +
        "Update OFFLINE_MUTATION_PATHS when a procedure is renamed or removed."
    );
  }
  return input =>
    (mutate as (value: unknown) => Promise<unknown>).call(procedure, input);
}

/** The React Query mutation key tRPC uses for a dot-path. */
export function mutationKeyForPath(path: OfflineMutationPath) {
  return [path.split(".")] as const;
}

/**
 * Registers a resumable `mutationFn` for every offline-capable procedure.
 *
 * Must run before `PersistQueryClientProvider` restores the cache, otherwise a
 * rehydrated paused mutation finds no default and cannot be resumed.
 */
export function registerOfflineMutationDefaults(
  queryClient: QueryClient,
  client: TRPCClient<AppRouter>
) {
  keepUnsyncedWritesOnScreen(queryClient);
  installInstantDeletes(queryClient);
  for (const path of OFFLINE_MUTATION_PATHS) {
    const mutate = resolveMutate(client, path);
    queryClient.setMutationDefaults(
      mutationKeyForPath(path) as unknown as unknown[],
      {
        mutationFn: input => mutate(input),
        // Replays run in parallel otherwise, and an Undo or a corrected answer
        // means nothing if it lands before what it corrects. A task's photo
        // follows its tap, as the server checks the tap happened.
        ...(path === "tasks.recordAction" || path === "tasks.checkIn"
          ? { scope: { id: "tasks.tablet" } }
          : path === "tasks.submitReport" ? { scope: { id: path } } : {}),
        // "online" rather than "offlineFirst": with no network the write pauses
        // immediately instead of firing a request that is certain to fail, so the
        // form is never left spinning on a doomed attempt. Paused writes resume
        // automatically on reconnect.
        networkMode: "online",
        // Failed queued records need explicit retry/discard, never timed eviction.
        gcTime: Infinity,
        // Kept short. A paused write resumes on reconnect anyway, so long backoff
        // only prolongs how long a form looks busy when the network is flaky.
        // A refusal won't change on a second try, so it comes off the screen at once.
        retry: (failures, error) => failures < 2 && !isTerminalSyncError(error),
        retryDelay: attempt => Math.min(1_000 * 2 ** attempt, 5_000),
        // Show the record straight away, so an offline entry is visibly saved
        // rather than appearing to vanish.
        onMutate: input => applyOptimisticRow(queryClient, path, input),
        onError: (_error, input, snapshot) => {
          undoOptimisticWrite(queryClient, path, input, snapshot as OptimisticSnapshot);
        },
        onSuccess: () => {
          // Replace the provisional row with the server's record. Components that
          // define their own onSuccess override this and invalidate themselves.
          void queryClient.invalidateQueries({
            queryKey: [[path.split(".")[0]]],
          });
        },
      }
    );
  }
}

/** True when `path` is queueable offline. */
export function isOfflineMutationPath(
  path: string
): path is OfflineMutationPath {
  return (OFFLINE_MUTATION_PATHS as readonly string[]).includes(path);
}
