import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";
import { cacheBucketFor, identityChanged } from "./identity";
import {
  STALE_QUEUE_ITEM_MS,
  countBlocked,
  countUnsynced,
  isAuthExpiredError,
  isTerminalSyncError,
  queueItemStatus,
  sortQueue,
  staleItems,
  type QueueItem,
} from "./syncQueue";

function trpcError(code: string) {
  const error = new TRPCClientError("failed");
  (error as { data?: unknown }).data = { code };
  return error;
}

describe("sync error classification", () => {
  it("treats conflicts and validation failures as terminal", () => {
    // Retrying these forever would spin the queue on a record that can never land.
    expect(isTerminalSyncError(trpcError("CONFLICT"))).toBe(true);
    expect(isTerminalSyncError(trpcError("PRECONDITION_FAILED"))).toBe(true);
    expect(isTerminalSyncError(trpcError("BAD_REQUEST"))).toBe(true);
    expect(isTerminalSyncError(trpcError("FORBIDDEN"))).toBe(true);
  });

  it("keeps an expired session retryable so queued work survives re-login", () => {
    // Tenant sessions idle out after 8h; being offline overnight must not
    // discard the day's records.
    expect(isTerminalSyncError(trpcError("UNAUTHORIZED"))).toBe(false);
    expect(isAuthExpiredError(trpcError("UNAUTHORIZED"))).toBe(true);
  });

  it("treats server and transport failures as retryable", () => {
    expect(isTerminalSyncError(trpcError("INTERNAL_SERVER_ERROR"))).toBe(false);
    expect(isTerminalSyncError(trpcError("TIMEOUT"))).toBe(false);
    expect(isTerminalSyncError(new Error("Failed to fetch"))).toBe(false);
    expect(isTerminalSyncError(null)).toBe(false);
  });
});

describe("queueItemStatus", () => {
  const base = { isPaused: false, status: "idle" as const, failureCount: 0, error: null };

  it("reports a paused mutation as pending, not failed", () => {
    expect(queueItemStatus({ ...base, isPaused: true, status: "pending" })).toBe("pending");
  });

  it("reports an in-flight mutation as syncing", () => {
    expect(queueItemStatus({ ...base, status: "pending" })).toBe("syncing");
  });

  it("reports a terminal failure as blocked", () => {
    expect(
      queueItemStatus({ ...base, status: "error", failureCount: 1, error: trpcError("CONFLICT") }),
    ).toBe("blocked");
  });

  it("reports a transient failure as retrying", () => {
    expect(
      queueItemStatus({
        ...base,
        status: "error",
        failureCount: 2,
        error: trpcError("INTERNAL_SERVER_ERROR"),
      }),
    ).toBe("retrying");
  });
});

describe("queue ordering and counts", () => {
  const item = (overrides: Partial<QueueItem>): QueueItem => ({
    id: 1,
    path: "animals.addWeight",
    status: "pending",
    failureCount: 0,
    errorMessage: null,
    submittedAt: 0,
    ...overrides,
  });

  it("replays in submission order so a birth follows its parent animal", () => {
    const ordered = sortQueue([
      item({ id: 2, path: "breeding.recordBirth", submittedAt: 200 }),
      item({ id: 1, path: "animals.create", submittedAt: 100 }),
    ]);
    expect(ordered.map(entry => entry.path)).toEqual([
      "animals.create",
      "breeding.recordBirth",
    ]);
  });

  it("falls back to insertion id when timestamps tie", () => {
    const ordered = sortQueue([
      item({ id: 9, submittedAt: 100 }),
      item({ id: 4, submittedAt: 100 }),
    ]);
    expect(ordered.map(entry => entry.id)).toEqual([4, 9]);
  });

  it("excludes blocked items from the unsynced count so the badge can reach zero", () => {
    const items = [
      item({ id: 1, status: "pending" }),
      item({ id: 2, status: "blocked" }),
      item({ id: 3, status: "retrying" }),
    ];
    expect(countUnsynced(items)).toBe(2);
    expect(countBlocked(items)).toBe(1);
  });

  it("flags items old enough that the platform may evict them first", () => {
    const now = 10 * STALE_QUEUE_ITEM_MS;
    const items = [
      item({ id: 1, submittedAt: now - STALE_QUEUE_ITEM_MS - 1 }),
      item({ id: 2, submittedAt: now - 1_000 }),
      item({ id: 3, submittedAt: null }),
    ];
    expect(staleItems(items, now).map(entry => entry.id)).toEqual([1]);
  });
});

describe("offline cache bucket scoping", () => {
  const identity = { userId: 7, companyId: "01JCOMPANY", farmPublicId: "01JFARM" };

  it("separates buckets per user, company, and farm", () => {
    const bucket = cacheBucketFor(identity);
    expect(bucket).not.toBe(cacheBucketFor({ ...identity, userId: 8 }));
    expect(bucket).not.toBe(cacheBucketFor({ ...identity, companyId: "01JOTHER" }));
    // Farm scoping is what keeps farm B's animals out of a farm A session.
    expect(bucket).not.toBe(cacheBucketFor({ ...identity, farmPublicId: "01JFARM2" }));
  });

  it("gives a farmless identity a stable bucket rather than colliding with a farm", () => {
    expect(cacheBucketFor({ ...identity, farmPublicId: null })).toContain("no-farm");
  });

  it("treats a missing stored identity as changed, so nothing is restored blindly", () => {
    expect(identityChanged(null, identity)).toBe(true);
    expect(identityChanged(identity, identity)).toBe(false);
    expect(identityChanged({ ...identity, farmPublicId: "01JFARM2" }, identity)).toBe(true);
  });
});
