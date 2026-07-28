/**
 * React bindings for the offline write queue.
 *
 * Two responsibilities, both of which have to happen at the app shell level:
 *  1. keep the persisted-cache identity in step with who is signed in and which
 *     farm they picked, so a shared phone never restores the wrong bucket;
 *  2. expose the queue so the UI can show what has not reached the server yet.
 */
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  identityChanged,
  readOfflineIdentity,
  writeOfflineIdentity,
  type OfflineIdentity,
} from "./identity";
import { bucketForIdentity, pruneOtherBuckets } from "./persister";
import { prefetchOfflineReadSet } from "./prefetch";
import {
  countBlocked,
  countUnsynced,
  sortQueue,
  staleItems,
  toQueueItem,
  type QueueItem,
} from "./syncQueue";

/** Live online/offline flag, taken from the same manager React Query pauses on. */
export function useIsOnline() {
  const [isOnline, setIsOnline] = useState(() => onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setIsOnline), []);
  return isOnline;
}

/**
 * Records the active identity so the next launch restores the right cache, and
 * warms the offline read set for the selected farm.
 *
 * Only runs when both queries have resolved — writing a partial identity would
 * name a bucket that never matches again, silently disabling offline reads.
 */
export function useOfflineIdentity() {
  const queryClient = useQueryClient();
  const trpcClient = trpc.useUtils().client;
  const isOnline = useIsOnline();
  const me = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const tenant = trpc.auth.tenantContext.useQuery(undefined, { retry: false });

  const userId = me.data?.id;
  const companyId = tenant.data?.company.publicId;
  const farmPublicId = tenant.data?.selectedFarmPublicId ?? null;
  const ready = typeof userId === "number" && Boolean(companyId);

  useEffect(() => {
    if (!ready || !companyId || typeof userId !== "number") return;
    const identity: OfflineIdentity = { userId, companyId, farmPublicId };
    if (!identityChanged(readOfflineIdentity(), identity)) return;
    writeOfflineIdentity(identity);
    // Switching farm or user leaves the previous bucket behind; on iOS those
    // orphans bring forward eviction of the bucket actually in use.
    void pruneOtherBuckets(bucketForIdentity(identity));
  }, [ready, userId, companyId, farmPublicId]);

  // Warm the read set once signed in, and again after reconnecting or switching
  // farm, so screens not yet opened still work when the signal drops.
  useEffect(() => {
    if (!ready || !isOnline) return;
    void prefetchOfflineReadSet(queryClient, trpcClient);
  }, [ready, isOnline, farmPublicId, queryClient, trpcClient]);
}

export type OfflineSyncState = {
  isOnline: boolean;
  items: QueueItem[];
  /** Records still expected to sync. Excludes ones needing manual attention. */
  pendingCount: number;
  /** Records that cannot sync without the user fixing something. */
  blockedCount: number;
  /** Queued so long the platform may evict them before they sync. */
  staleCount: number;
  retryAll: () => void;
  discard: (id: number) => void;
};

/** Subscribes to the mutation cache and exposes the queue for display. */
export function useOfflineSync(): OfflineSyncState {
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const [items, setItems] = useState<QueueItem[]>([]);

  useEffect(() => {
    const cache = queryClient.getMutationCache();
    const read = () =>
      setItems(
        sortQueue(
          cache
            .getAll()
            // A settled success is no longer queued; failures and paused writes are.
            .filter(mutation => mutation.state.status !== "success")
            .map(toQueueItem),
        ),
      );
    read();
    return cache.subscribe(read);
  }, [queryClient]);

  const retryAll = useCallback(() => {
    void queryClient.resumePausedMutations();
    for (const mutation of queryClient.getMutationCache().getAll()) {
      if (mutation.state.status === "error") void mutation.execute(mutation.state.variables);
    }
  }, [queryClient]);

  const discard = useCallback(
    (id: number) => {
      const cache = queryClient.getMutationCache();
      const target = cache.getAll().find(mutation => mutation.mutationId === id);
      if (target) cache.remove(target);
    },
    [queryClient],
  );

  return {
    isOnline,
    items,
    pendingCount: countUnsynced(items),
    blockedCount: countBlocked(items),
    staleCount: staleItems(items).length,
    retryAll,
    discard,
  };
}
