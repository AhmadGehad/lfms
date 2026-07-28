/**
 * Real connectivity detection.
 *
 * React Query's onlineManager trusts `navigator.onLine`, which only reports
 * whether a network interface is up — a phone attached to a dead wifi or with
 * one bar of signal claims "online" while every request hangs or fails. In that
 * state nothing ever pauses: mutations fire doomed requests and forms wait on
 * them, which is exactly the freeze reported from the field.
 *
 * This module makes the API itself the source of truth:
 *  - every API fetch is timed out, so a request can hang for seconds, not
 *    minutes;
 *  - a network-level failure while the browser claims online forces
 *    onlineManager offline, which pauses queued work and flips the offline UI;
 *  - while forced offline, a small probe (`/health`, never cached by the
 *    service worker) runs on an interval and restores online the moment the
 *    server is genuinely reachable again. The browser's own `online` event
 *    cannot be relied on for this — it never fires when the interface was
 *    "up" the whole time.
 */
import { onlineManager } from "@tanstack/react-query";

/** Abort an API call after this long; a dead link hangs far past any real response. */
export const FETCH_TIMEOUT_MS = 15_000;

export const PROBE_INTERVAL_MS = 15_000;
const PROBE_TIMEOUT_MS = 5_000;
const PROBE_URL = "/health";

let forcedOffline = false;
let probeTimer: ReturnType<typeof setTimeout> | null = null;

function stopProbe() {
  if (probeTimer !== null) clearTimeout(probeTimer);
  probeTimer = null;
}

function scheduleProbe() {
  if (probeTimer !== null) return;
  probeTimer = setTimeout(() => {
    probeTimer = null;
    void probeOnce();
  }, PROBE_INTERVAL_MS);
}

async function probeOnce() {
  if (!forcedOffline) return;
  try {
    const response = await fetch(PROBE_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (response.ok) {
      reportNetworkSuccess();
      return;
    }
  } catch {
    /* still unreachable */
  }
  scheduleProbe();
}

/** Call when an API request failed at the network level (abort, DNS, reset). */
export function reportNetworkFailure() {
  if (forcedOffline) {
    scheduleProbe();
    return;
  }
  forcedOffline = true;
  // Pausing further work is the point: better one queued record than a form
  // hanging on a request that will never complete.
  onlineManager.setOnline(false);
  scheduleProbe();
}

/** Call when any API request completed (any HTTP status — the network works). */
export function reportNetworkSuccess() {
  if (!forcedOffline) return;
  forcedOffline = false;
  stopProbe();
  onlineManager.setOnline(true);
}

/** True when offline was inferred from failures rather than navigator.onLine. */
export function isForcedOffline() {
  return forcedOffline;
}

/** Distinguishes network-level failures from HTTP errors the server sent. */
export function isNetworkLevelError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }
  // fetch rejects with TypeError on DNS failure, connection reset, CORS, etc.
  return error instanceof TypeError;
}

/**
 * Wraps a fetch implementation with the timeout and the failure/success
 * reporting above. The caller's own AbortSignal still works — whichever fires
 * first wins.
 */
export function instrumentFetch(
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
      const response = await fetchImpl(input, { ...(init ?? {}), signal });
      reportNetworkSuccess();
      return response;
    } catch (error) {
      // Only infer "offline" from the network layer; a caller cancelling its
      // own request says nothing about connectivity.
      if (isNetworkLevelError(error) && !init?.signal?.aborted) {
        reportNetworkFailure();
      }
      throw error;
    }
  };
}

/** Test seam. */
export function resetConnectivityForTests() {
  forcedOffline = false;
  stopProbe();
}
