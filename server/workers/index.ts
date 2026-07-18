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
import {
  handleUsageSnapshotJob,
  scheduleUsageSnapshotJob,
  USAGE_SNAPSHOT_JOB_TYPE,
  type UsageSnapshotJobPayload,
} from "./usageSnapshot";

type WorkerJobPayload = NotificationJobPayload | SubscriptionExpirationJobPayload | LifecycleJobPayload | UsageSnapshotJobPayload;

export async function startWorkerRuntime() {
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
    leaseMs: Number(process.env.JOB_LEASE_MS ?? 60_000),
    idleMs: Number(process.env.JOB_IDLE_MS ?? 1_000),
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

  let scheduling = false;
  const schedule = async () => {
    if (scheduling) return;
    scheduling = true;
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
    } finally {
      scheduling = false;
    }
  };

  await schedule();
  const scheduleTimer = setInterval(() => { void schedule(); }, 60_000);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(scheduleTimer);
    await worker.stop();
  };
  process.once("SIGINT", () => { void stop(); });
  process.once("SIGTERM", () => { void stop(); });

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
