import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { fileURLToPath } from "node:url";
import { logger } from "../observability/logger";
import { LeasedWorker } from "./leasedWorker";
import {
  handleTenantNotificationJob,
  NOTIFICATION_JOB_TYPES,
  scheduleTenantNotificationJobs,
  type NotificationJobPayload,
} from "./notificationJobs";
import { SqlJobLeaseStore } from "./sqlJobLeaseStore";
import { SqlNotificationJobRepository } from "./sqlNotificationJobRepository";
import {
  handleSubscriptionExpirationJob,
  scheduleSubscriptionExpirationJob,
  SUBSCRIPTION_EXPIRATION_JOB_TYPE,
  type SubscriptionExpirationJobPayload,
} from "./subscriptionExpiration";
import { SqlSubscriptionExpirationRepository } from "./sqlSubscriptionExpirationRepository";
import {
  handleLifecycleJob,
  LIFECYCLE_JOB_TYPES,
  type LifecycleJobPayload,
} from "./lifecycleJobTypes";
import { SqlLifecycleJobRepository } from "./sqlLifecycleJobRepository";
import { SqlUsageSnapshotRepository } from "./sqlUsageSnapshotRepository";
import { closeDatabasePool } from "../db";
import { closeStorageBackend } from "../storageBackend";
import {
  handleUsageSnapshotJob,
  scheduleUsageSnapshotJob,
  USAGE_SNAPSHOT_JOB_TYPE,
  type UsageSnapshotJobPayload,
} from "./usageSnapshot";

type WorkerJobPayload = NotificationJobPayload | SubscriptionExpirationJobPayload | LifecycleJobPayload | UsageSnapshotJobPayload;

function integerSetting(
  name: string,
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export function resolveWorkerTiming(environment: NodeJS.ProcessEnv = process.env) {
  const leaseMs = integerSetting(
    "JOB_LEASE_MS",
    environment.JOB_LEASE_MS,
    60_000,
    10_000,
    3_600_000,
  );
  const idleMs = integerSetting(
    "JOB_IDLE_MS",
    environment.JOB_IDLE_MS,
    1_000,
    100,
    60_000,
  );
  const shutdownTimeoutMs = integerSetting(
    "WORKER_SHUTDOWN_TIMEOUT_MS",
    environment.WORKER_SHUTDOWN_TIMEOUT_MS,
    90_000,
    10_001,
    3_700_000,
  );
  if (shutdownTimeoutMs <= leaseMs) {
    throw new Error("WORKER_SHUTDOWN_TIMEOUT_MS must exceed JOB_LEASE_MS");
  }
  return { idleMs, leaseMs, shutdownTimeoutMs };
}

export async function startWorkerRuntime() {
  const timing = resolveWorkerTiming();
  const workerId = `${process.env.WORKER_ID ?? hostname()}:${process.pid}:${randomUUID()}`;
  const notificationRepository = new SqlNotificationJobRepository();
  const subscriptionRepository = new SqlSubscriptionExpirationRepository();
  const lifecycleRepository = new SqlLifecycleJobRepository();
  const usageRepository = new SqlUsageSnapshotRepository();
  const lifecycleJobTypes = new Set<string>(Object.values(LIFECYCLE_JOB_TYPES));
  const allowedJobTypes = [
    ...Object.values(NOTIFICATION_JOB_TYPES),
    SUBSCRIPTION_EXPIRATION_JOB_TYPE,
    USAGE_SNAPSHOT_JOB_TYPE,
    ...lifecycleJobTypes,
  ];
  const store = new SqlJobLeaseStore<WorkerJobPayload>(allowedJobTypes);
  const worker = new LeasedWorker<WorkerJobPayload>({
    workerId,
    leaseMs: timing.leaseMs,
    idleMs: timing.idleMs,
    store,
    handle: async (job, signal) => {
      if (job.type === SUBSCRIPTION_EXPIRATION_JOB_TYPE) {
        await handleSubscriptionExpirationJob(
          subscriptionRepository,
          job as typeof job & { payload: SubscriptionExpirationJobPayload },
          signal,
        );
        return;
      }
      if (job.type === USAGE_SNAPSHOT_JOB_TYPE) {
        await handleUsageSnapshotJob(
          usageRepository,
          job as typeof job & { payload: UsageSnapshotJobPayload },
          signal,
        );
        return;
      }
      if (lifecycleJobTypes.has(job.type)) {
        await handleLifecycleJob(
          lifecycleRepository,
          job as typeof job & { payload: LifecycleJobPayload },
          signal,
        );
        return;
      }
      await handleTenantNotificationJob(
        notificationRepository,
        job as typeof job & { payload: NotificationJobPayload },
        signal,
      );
    },
    logger: logger.child({ process: "worker", workerId }),
  });

  let schedulePromise: Promise<void> | null = null;
  const schedule = () => {
    if (schedulePromise) return schedulePromise;
    schedulePromise = (async () => {
      try {
        const notificationResult = await scheduleTenantNotificationJobs(notificationRepository);
        const subscriptionInserted = await scheduleSubscriptionExpirationJob(subscriptionRepository);
        const usageSnapshotInserted = await scheduleUsageSnapshotJob(usageRepository);
        logger.info("worker.jobs_scheduled", {
          notifications: notificationResult,
          subscriptionExpirationInserted: subscriptionInserted,
          usageSnapshotInserted,
        });
      } catch (error) {
        logger.error("worker.schedule_failed", {
          errorName: error instanceof Error ? error.name : "NonErrorThrown",
        });
      }
    })().finally(() => {
      schedulePromise = null;
    });
    return schedulePromise;
  };

  await schedule();
  const scheduleTimer = setInterval(() => { void schedule(); }, 60_000);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(scheduleTimer);
    const forceTimer = setTimeout(() => {
      logger.error("worker.shutdown_forced");
      process.exit(1);
    }, timing.shutdownTimeoutMs);
    forceTimer.unref();
    const failures: unknown[] = [];
    const drains = await Promise.allSettled([
      worker.stop(),
      schedulePromise ?? Promise.resolve(),
    ]);
    for (const result of drains) {
      if (result.status === "rejected") failures.push(result.reason);
    }
    try {
      closeStorageBackend();
    } catch (error) {
      failures.push(error);
    }
    try {
      await closeDatabasePool();
    } catch (error) {
      failures.push(error);
    }
    try {
      if (failures.length > 0) {
        throw new AggregateError(failures, "Worker shutdown failed");
      }
      logger.info("worker.shutdown_complete");
    } finally {
      clearTimeout(forceTimer);
    }
  };
  const requestStop = () => {
    void stop().catch(error => {
      logger.error("worker.shutdown_failed", {
        errorName: error instanceof Error ? error.name : "NonErrorThrown",
      });
      process.exit(1);
    });
  };
  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);

  await worker.start();
}

const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntryPoint) {
  startWorkerRuntime().catch(error => {
    logger.error("worker.fatal", {
      errorName: error instanceof Error ? error.name : "NonErrorThrown",
    });
    process.exitCode = 1;
  });
}
