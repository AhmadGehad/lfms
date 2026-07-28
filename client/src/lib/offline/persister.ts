/**
 * IndexedDB persister for the React Query cache.
 *
 * IndexedDB rather than localStorage because the offline read scope is "every
 * screen for the active farm", which is far past localStorage's ~5 MB ceiling,
 * and because writes here are async and off the main thread.
 */
import { clear, createStore, del, get, keys, set } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { CACHE_PREFIX, cacheBucketFor, type OfflineIdentity } from "./identity";

const store = createStore("lfms-offline", "react-query");

/**
 * Builds a persister bound to one identity's bucket.
 *
 * `bucket` comes from the identity stored at boot; when it is null (first-ever
 * launch, or after logout) nothing is restored or written, so a fresh login
 * never reads a previous user's data.
 */
export function createOfflinePersister(bucket: string | null): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      if (!bucket) return;
      try {
        await set(bucket, client, store);
      } catch {
        // Quota exceeded or eviction: keep the app working, lose offline reads.
      }
    },
    restoreClient: async () => {
      if (!bucket) return undefined;
      try {
        return await get<PersistedClient>(bucket, store);
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      if (!bucket) return;
      try {
        await del(bucket, store);
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Deletes every cache bucket except the current one.
 *
 * Without this, switching farm or user forever accumulates buckets — on iOS
 * that hastens storage eviction of the bucket actually in use.
 */
export async function pruneOtherBuckets(currentBucket: string | null) {
  try {
    const existing = await keys(store);
    await Promise.all(
      existing
        .filter(
          key =>
            typeof key === "string" &&
            key.startsWith(CACHE_PREFIX) &&
            key !== currentBucket,
        )
        .map(key => del(key, store)),
    );
  } catch {
    /* ignore */
  }
}

/** Wipes all persisted tenant data. Used on logout. */
export async function clearAllOfflineData() {
  try {
    await clear(store);
  } catch {
    /* ignore */
  }
}

export function bucketForIdentity(identity: OfflineIdentity | null) {
  return identity ? cacheBucketFor(identity) : null;
}
