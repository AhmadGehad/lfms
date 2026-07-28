import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FETCH_TIMEOUT_MS,
  instrumentFetch,
  isForcedOffline,
  isNetworkLevelError,
  reportNetworkFailure,
  reportNetworkSuccess,
  resetConnectivityForTests,
} from "./connectivity";

beforeEach(() => {
  resetConnectivityForTests();
  onlineManager.setOnline(true);
});

afterEach(() => {
  resetConnectivityForTests();
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

describe("isNetworkLevelError", () => {
  it("recognises fetch transport failures and timeouts", () => {
    // fetch rejects with TypeError on DNS failure / connection reset.
    expect(isNetworkLevelError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkLevelError(new DOMException("timed out", "TimeoutError"))).toBe(true);
    expect(isNetworkLevelError(new DOMException("aborted", "AbortError"))).toBe(true);
  });

  it("does not treat server-sent errors as connectivity problems", () => {
    // An HTTP 500 means the network works; forcing offline for it would wrongly
    // pause the queue while the server is reachable.
    expect(isNetworkLevelError(new Error("Internal Server Error"))).toBe(false);
    expect(isNetworkLevelError(null)).toBe(false);
  });
});

describe("forced offline", () => {
  it("flips onlineManager off on failure and back on on success", () => {
    // This is the fix for the lying navigator.onLine: the phone claims online
    // on dead wifi, so the API itself has to be the source of truth.
    reportNetworkFailure();
    expect(onlineManager.isOnline()).toBe(false);
    expect(isForcedOffline()).toBe(true);

    reportNetworkSuccess();
    expect(onlineManager.isOnline()).toBe(true);
    expect(isForcedOffline()).toBe(false);
  });

  it("does not touch onlineManager on success unless it forced the offline", () => {
    onlineManager.setOnline(false); // e.g. the browser genuinely went offline
    reportNetworkSuccess();
    expect(onlineManager.isOnline()).toBe(false);
  });
});

describe("instrumentFetch", () => {
  it("reports success on any completed response, even an HTTP error", async () => {
    reportNetworkFailure();
    const wrapped = instrumentFetch(async () => new Response("nope", { status: 500 }));

    await wrapped("/api/trpc/x");

    expect(onlineManager.isOnline()).toBe(true);
  });

  it("forces offline on a transport failure", async () => {
    const wrapped = instrumentFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(wrapped("/api/trpc/x")).rejects.toThrow();
    expect(onlineManager.isOnline()).toBe(false);
  });

  it("does not force offline when the caller cancelled its own request", async () => {
    const controller = new AbortController();
    controller.abort();
    const wrapped = instrumentFetch(async () => {
      throw new DOMException("aborted", "AbortError");
    });

    await expect(wrapped("/api/trpc/x", { signal: controller.signal })).rejects.toThrow();
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("attaches a timeout so a hung request cannot block a form for minutes", async () => {
    let receivedSignal: AbortSignal | undefined;
    const wrapped = instrumentFetch(async (_input, init) => {
      receivedSignal = init?.signal ?? undefined;
      return new Response("ok");
    });

    await wrapped("/api/trpc/x");

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(FETCH_TIMEOUT_MS).toBeLessThanOrEqual(20_000);
  });
});
