import { StructuredLogger } from "../observability/logger";

export type LeasedJob<TPayload> = {
  id: number;
  publicId: string;
  companyId: number | null;
  type: string;
  payload: TPayload;
  attempts: number;
  maxAttempts: number;
};

export interface JobLeaseStore<TPayload> {
  claim(workerId: string, leaseMs: number): Promise<LeasedJob<TPayload> | null>;
  complete(job: LeasedJob<TPayload>, workerId: string): Promise<void>;
  fail(job: LeasedJob<TPayload>, workerId: string, error: Error): Promise<void>;
  extend(
    job: LeasedJob<TPayload>,
    workerId: string,
    leaseMs: number
  ): Promise<boolean>;
}

type WorkerOptions<TPayload> = {
  workerId: string;
  leaseMs?: number;
  idleMs?: number;
  store: JobLeaseStore<TPayload>;
  handle: (job: LeasedJob<TPayload>, signal: AbortSignal) => Promise<void>;
  logger?: StructuredLogger;
};

const sleep = (delayMs: number, signal: AbortSignal) =>
  new Promise<void>(resolve => {
    const timeout = setTimeout(resolve, delayMs);
    timeout.unref?.();
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "NonErrorThrown";
}

function abortedJobError(signal: AbortSignal) {
  if (
    signal.reason instanceof Error &&
    signal.reason.message === "JOB_LEASE_LOST"
  ) {
    return signal.reason;
  }
  return new Error("JOB_ABORTED", { cause: signal.reason });
}

export class LeasedWorker<TPayload = unknown> {
  private readonly abortController = new AbortController();
  private running: Promise<void> | null = null;
  private readonly leaseMs: number;
  private readonly idleMs: number;
  private readonly logger: StructuredLogger;

  constructor(private readonly options: WorkerOptions<TPayload>) {
    this.leaseMs = options.leaseMs ?? 30_000;
    this.idleMs = options.idleMs ?? 1_000;
    this.logger =
      options.logger ??
      new StructuredLogger("lfms-worker", { workerId: options.workerId });
  }

  start(): Promise<void> {
    if (!this.running) this.running = this.run();
    return this.running;
  }

  async stop(): Promise<void> {
    this.abortController.abort();
    await this.running;
  }

  private async run() {
    const { signal } = this.abortController;
    this.logger.info("worker.started");
    while (!signal.aborted) {
      let job: LeasedJob<TPayload> | null;
      try {
        job = await this.options.store.claim(
          this.options.workerId,
          this.leaseMs
        );
      } catch (error) {
        this.logger.error("worker.claim_failed", {
          errorName: errorName(error),
        });
        await sleep(this.idleMs, signal);
        continue;
      }
      if (!job) {
        await sleep(this.idleMs, signal);
        continue;
      }

      const jobAbortController = new AbortController();
      const abortForWorkerStop = () => jobAbortController.abort(signal.reason);
      signal.addEventListener("abort", abortForWorkerStop, { once: true });
      let leaseLost = false;
      let extending = false;
      const abandonJob = (
        event: "worker.lease_lost" | "worker.lease_extend_failed",
        error?: unknown
      ) => {
        if (jobAbortController.signal.aborted) return;
        leaseLost = true;
        if (event === "worker.lease_lost") {
          this.logger.warn(event, { jobId: job.publicId });
        } else {
          this.logger.error(event, {
            jobId: job.publicId,
            errorName: errorName(error),
          });
        }
        jobAbortController.abort(new Error("JOB_LEASE_LOST"));
      };
      const extendLease = async () => {
        if (extending || jobAbortController.signal.aborted) return;
        extending = true;
        try {
          if (
            !(await this.options.store.extend(
              job,
              this.options.workerId,
              this.leaseMs
            ))
          ) {
            abandonJob("worker.lease_lost");
          }
        } catch (error) {
          abandonJob("worker.lease_extend_failed", error);
        } finally {
          extending = false;
        }
      };
      const heartbeat = setInterval(
        () => {
          void extendLease();
        },
        Math.max(1_000, Math.floor(this.leaseMs / 3))
      );
      heartbeat.unref?.();

      try {
        await this.options.handle(job, jobAbortController.signal);
        if (jobAbortController.signal.aborted)
          throw abortedJobError(jobAbortController.signal);
        await this.options.store.complete(job, this.options.workerId);
        this.logger.info("worker.job_completed", {
          jobId: job.publicId,
          jobType: job.type,
        });
      } catch (error) {
        const failure =
          error instanceof Error ? error : new Error(String(error));
        if (leaseLost) {
          this.logger.warn("worker.job_abandoned", {
            jobId: job.publicId,
            jobType: job.type,
          });
          continue;
        }
        try {
          await this.options.store.fail(job, this.options.workerId, failure);
        } catch (failError) {
          this.logger.error("worker.job_fail_record_failed", {
            jobId: job.publicId,
            jobType: job.type,
            errorName: errorName(failError),
          });
        }
        this.logger.error("worker.job_failed", {
          jobId: job.publicId,
          jobType: job.type,
          errorName: failure.name,
        });
      } finally {
        clearInterval(heartbeat);
        signal.removeEventListener("abort", abortForWorkerStop);
      }
    }
    this.logger.info("worker.stopped");
  }
}
