import { describe, expect, it } from "vitest";
import { resolveWorkerTiming } from "./index";

describe("worker runtime timing", () => {
  it("uses a shutdown deadline longer than the lease", () => {
    expect(resolveWorkerTiming({})).toEqual({
      idleMs: 1_000,
      leaseMs: 60_000,
      shutdownTimeoutMs: 90_000,
    });
  });

  it("rejects a shutdown deadline that can abandon a live lease", () => {
    expect(() =>
      resolveWorkerTiming({
        JOB_LEASE_MS: "60000",
        WORKER_SHUTDOWN_TIMEOUT_MS: "60000",
      }),
    ).toThrow("must exceed");
  });
});
