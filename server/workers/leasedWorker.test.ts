import { describe, expect, it } from "vitest";
import {
  LeasedWorker,
  type JobLeaseStore,
  type LeasedJob,
} from "./leasedWorker";

type Payload = { value: number };

class InMemoryLeaseStore implements JobLeaseStore<Payload> {
  state: "pending" | "processing" | "completed" | "failed" = "pending";
  lockedBy: string | null = null;
  job: LeasedJob<Payload> = {
    id: 1,
    publicId: "job-1",
    companyId: 7,
    type: "test",
    payload: { value: 1 },
    attempts: 0,
    maxAttempts: 3,
  };

  async claim(workerId: string) {
    if (this.state !== "pending") return null;
    this.state = "processing";
    this.lockedBy = workerId;
    this.job = { ...this.job, attempts: this.job.attempts + 1 };
    return this.job;
  }
  async complete(_job: LeasedJob<Payload>, workerId: string) {
    if (this.state !== "processing" || this.lockedBy !== workerId)
      throw new Error("JOB_LEASE_LOST");
    this.state = "completed";
    this.lockedBy = null;
  }
  async fail(_job: LeasedJob<Payload>, workerId: string) {
    if (this.state !== "processing" || this.lockedBy !== workerId)
      throw new Error("JOB_LEASE_LOST");
    this.state = "failed";
    this.lockedBy = null;
  }
  async extend(_job: LeasedJob<Payload>, workerId: string) {
    return this.state === "processing" && this.lockedBy === workerId;
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for worker");
}

describe("leased worker concurrency", () => {
  it("allows only one worker to process a shared job", async () => {
    const store = new InMemoryLeaseStore();
    const handled: string[] = [];
    const first = new LeasedWorker({
      workerId: "w1",
      idleMs: 1,
      store,
      handle: async () => {
        handled.push("w1");
        await new Promise(resolve => setTimeout(resolve, 5));
      },
    });
    const second = new LeasedWorker({
      workerId: "w2",
      idleMs: 1,
      store,
      handle: async () => {
        handled.push("w2");
        await new Promise(resolve => setTimeout(resolve, 5));
      },
    });
    void first.start();
    void second.start();
    await waitFor(() => store.state === "completed");
    await Promise.all([first.stop(), second.stop()]);
    expect(handled).toHaveLength(1);
    expect(store.job.attempts).toBe(1);
  });

  it("aborts work and never completes a job after its lease is lost", async () => {
    const store = new InMemoryLeaseStore();
    store.extend = async () => false;
    let aborted = false;
    const worker = new LeasedWorker({
      workerId: "w1",
      leaseMs: 1_000,
      idleMs: 1,
      store,
      handle: async (_job, signal) => {
        await new Promise<void>(resolve =>
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              resolve();
            },
            { once: true }
          )
        );
      },
    });
    void worker.start();
    await waitFor(() => aborted);
    await worker.stop();
    expect(store.state).toBe("processing");
  });

  it("drains an active job during graceful shutdown", async () => {
    const store = new InMemoryLeaseStore();
    let started = false;
    let release: (() => void) | undefined;
    const worker = new LeasedWorker({
      workerId: "w1",
      idleMs: 1,
      store,
      handle: async (_job, signal) => {
        started = true;
        await new Promise<void>(resolve => {
          release = resolve;
        });
        expect(signal.aborted).toBe(false);
      },
    });
    void worker.start();
    await waitFor(() => started);
    const stopped = worker.stop();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(store.state).toBe("processing");
    release?.();
    await stopped;
    expect(store.state).toBe("completed");
    expect(store.job.attempts).toBe(1);
  });
});
