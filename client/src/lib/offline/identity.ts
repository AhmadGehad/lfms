/**
 * Identifies which cache bucket the persisted offline data belongs to.
 *
 * The persisted cache holds tenant data, so it must never be restored for a
 * different user, company, or farm — field phones get shared, and a stale
 * bucket would leak one user's animals to the next. The bucket name has to be
 * readable *synchronously at boot*, before any query resolves, otherwise the
 * app would briefly render the previous identity's data. Hence localStorage:
 * the tRPC session itself lives in an httpOnly cookie and cannot be inspected.
 *
 * Nothing sensitive is stored here — only the ids needed to name a bucket.
 */

const IDENTITY_PREFIX = "lfms-offline-identity";
export const CACHE_PREFIX = "lfms-offline-cache";

export type OfflineIdentity = {
  userId: number;
  companyId: string;
  farmPublicId: string | null;
};

function identityStorageKey() {
  return `${IDENTITY_PREFIX}:${window.location.hostname.toLowerCase()}`;
}

/** Stable, filename-safe bucket name for an identity. */
export function cacheBucketFor(identity: OfflineIdentity) {
  const farm = identity.farmPublicId ?? "no-farm";
  return `${CACHE_PREFIX}:${identity.companyId}:${identity.userId}:${farm}`;
}

export function readOfflineIdentity(): OfflineIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(identityStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OfflineIdentity>;
    if (typeof parsed?.userId !== "number" || typeof parsed?.companyId !== "string") {
      return null;
    }
    return {
      userId: parsed.userId,
      companyId: parsed.companyId,
      farmPublicId: typeof parsed.farmPublicId === "string" ? parsed.farmPublicId : null,
    };
  } catch {
    // Corrupt entry: treat as "no cached identity" rather than crashing at boot.
    return null;
  }
}

export function writeOfflineIdentity(identity: OfflineIdentity) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(identityStorageKey(), JSON.stringify(identity));
  } catch {
    /* storage full or blocked — offline support degrades, app still works */
  }
}

export function clearOfflineIdentity() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(identityStorageKey());
  } catch {
    /* ignore */
  }
}

/** True when the stored identity differs from the one just resolved. */
export function identityChanged(
  stored: OfflineIdentity | null,
  current: OfflineIdentity,
) {
  if (!stored) return true;
  return (
    stored.userId !== current.userId ||
    stored.companyId !== current.companyId ||
    stored.farmPublicId !== current.farmPublicId
  );
}
