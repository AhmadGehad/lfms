/**
 * Classification and inspection helpers for the offline write queue.
 *
 * Kept free of React and of the query client so the rules can be unit-tested:
 * getting "retry forever" vs "stop and ask the user" wrong is the difference
 * between a queue that drains and one that spins on a doomed record.
 */
import type { Mutation, MutationState } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import type { AppRouter } from "../../../../server/routers";

export type QueueItemStatus =
  /** Waiting for the network. */
  | "pending"
  /** In flight right now. */
  | "syncing"
  /** Failed for a reason retrying cannot fix; needs the user. */
  | "blocked"
  /** Failed transiently; will be retried. */
  | "retrying";

/**
 * tRPC codes that will never succeed on replay:
 * - CONFLICT — e.g. the animal ID was taken while offline
 * - PRECONDITION_FAILED — version CAS lost, the row moved on
 * - BAD_REQUEST / PARSE_ERROR — the payload itself is invalid
 * - FORBIDDEN / NOT_FOUND — permission or target gone
 *
 * UNAUTHORIZED is deliberately absent: the session simply expired while the
 * device was offline, and the record must survive re-login and then replay.
 */
const TERMINAL_CODES = new Set([
  "CONFLICT",
  "PRECONDITION_FAILED",
  "BAD_REQUEST",
  "PARSE_ERROR",
  "FORBIDDEN",
  "NOT_FOUND",
  "UNPROCESSABLE_CONTENT",
]);

export function isTerminalSyncError(error: unknown): boolean {
  if (!(error instanceof TRPCClientError)) return false;
  const code = (error as TRPCClientError<AppRouter>).data?.code;
  return typeof code === "string" && TERMINAL_CODES.has(code);
}

/** True when replay is blocked only because the session lapsed while offline. */
export function isAuthExpiredError(error: unknown): boolean {
  if (!(error instanceof TRPCClientError)) return false;
  return (error as TRPCClientError<AppRouter>).data?.code === "UNAUTHORIZED";
}

export function queueItemStatus(state: {
  isPaused: boolean;
  status: MutationState["status"];
  failureCount: number;
  error: unknown;
}): QueueItemStatus {
  if (state.status === "pending" && !state.isPaused) return "syncing";
  if (state.error && isTerminalSyncError(state.error)) return "blocked";
  if (state.failureCount > 0) return "retrying";
  return "pending";
}

/** A queued write, flattened for display. */
export type QueueItem = {
  id: number;
  path: string;
  status: QueueItemStatus;
  failureCount: number;
  errorMessage: string | null;
  submittedAt: number | null;
};

function pathFromMutationKey(key: readonly unknown[] | undefined): string {
  const first = key?.[0];
  return Array.isArray(first) ? first.join(".") : "unknown";
}

export function toQueueItem(mutation: Mutation<unknown, Error, unknown>): QueueItem {
  const state = mutation.state;
  const status = queueItemStatus({
    isPaused: state.isPaused,
    status: state.status,
    failureCount: state.failureCount,
    error: state.error,
  });
  return {
    id: mutation.mutationId,
    path: pathFromMutationKey(mutation.options.mutationKey),
    status,
    failureCount: state.failureCount,
    errorMessage: state.error instanceof Error ? state.error.message : null,
    submittedAt: state.submittedAt ?? null,
  };
}

/** Queue items in submission order, so dependent records replay after their parents. */
export function sortQueue(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0) || a.id - b.id);
}

export function countUnsynced(items: QueueItem[]) {
  return items.filter(item => item.status !== "blocked").length;
}

export function countBlocked(items: QueueItem[]) {
  return items.filter(item => item.status === "blocked").length;
}

/** Age threshold past which a queued record is worth warning about. */
export const STALE_QUEUE_ITEM_MS = 3 * 24 * 60 * 60 * 1_000;

/**
 * Items old enough that the platform may evict them before they ever sync.
 * iOS clears PWA storage after roughly a week of disuse.
 */
export function staleItems(items: QueueItem[], now = Date.now()) {
  return items.filter(
    item => item.submittedAt !== null && now - item.submittedAt > STALE_QUEUE_ITEM_MS,
  );
}
