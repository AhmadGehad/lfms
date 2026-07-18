import { sql } from "drizzle-orm";
import {
  animals,
  backgroundJobs,
  companies,
  companyMemberships,
  farms,
  featureCatalog,
  tenantFiles,
  usageCounters,
} from "../../drizzle/schema";
import { isDuplicateEntryError } from "../_core/databaseErrors";
import { getDb } from "../db";
import { generatePublicId } from "../tenancy/publicIds";
import type { LeasedJob } from "./leasedWorker";
import {
  USAGE_SNAPSHOT_JOB_TYPE,
  type UsageSnapshotJobPayload,
  type UsageSnapshotRepository,
} from "./usageSnapshot";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

function affectedRows(result: unknown) {
  return Number((result as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
}

// MySQL TIMESTAMP is bounded in UTC. Keep the logical lifetime window well
// inside that range so a non-UTC database session cannot underflow it.
const PERIOD_START = new Date("2000-01-01T00:00:00.000Z");
const PERIOD_END = new Date("2037-12-31T23:59:59.000Z");

export class SqlUsageSnapshotRepository implements UsageSnapshotRepository {
  async enqueue(input: Parameters<UsageSnapshotRepository["enqueue"]>[0]) {
    const db = await requireDb();
    try {
      const [result] = await db.insert(backgroundJobs).values({
        publicId: generatePublicId(),
        companyId: null,
        jobType: USAGE_SNAPSHOT_JOB_TYPE,
        payload: input.payload,
        priority: 20,
        runAt: input.runAt,
        deduplicationKey: input.deduplicationKey,
        requestId: `usage-snapshot:${input.deduplicationKey}`.slice(0, 64),
        maxAttempts: 5,
      });
      return affectedRows(result) === 1;
    } catch (error) {
      if (isDuplicateEntryError(error)) return false;
      throw error;
    }
  }

  async refresh(_now: Date, _job: LeasedJob<UsageSnapshotJobPayload>) {
    const db = await requireDb();
    await db.transaction(async tx => {
      const metrics = [
        {
          code: "users_limit",
          value: sql`(SELECT COUNT(*) FROM ${companyMemberships} m WHERE m.companyId = ${companies.id} AND m.status != 'removed')`,
        },
        {
          code: "farms_limit",
          value: sql`(SELECT COUNT(*) FROM ${farms} f WHERE f.companyId = ${companies.id} AND f.deletedAt IS NULL)`,
        },
        {
          code: "animals_limit",
          value: sql`(SELECT COUNT(*) FROM ${animals} a WHERE a.companyId = ${companies.id} AND a.deletedAt IS NULL)`,
        },
        {
          code: "storage_limit",
          value: sql`(SELECT COALESCE(SUM(tf.sizeBytes), 0) FROM ${tenantFiles} tf WHERE tf.companyId = ${companies.id} AND tf.status IN ('reserved','uploading','quarantine','clean'))`,
        },
      ];
      for (const metric of metrics) {
        await tx.execute(sql`
          INSERT INTO ${usageCounters}
            (companyId, featureId, metricCode, periodType, periodStart, periodEnd, usedValue, reservedValue, version)
          SELECT ${companies.id}, ${featureCatalog.id}, ${metric.code}, 'lifetime', ${PERIOD_START}, ${PERIOD_END}, ${metric.value}, 0, 1
          FROM ${companies}
          LEFT JOIN ${featureCatalog} ON ${featureCatalog.code} = ${metric.code}
          WHERE ${companies.deletedAt} IS NULL
          ON DUPLICATE KEY UPDATE
            featureId = VALUES(featureId),
            usedValue = VALUES(usedValue),
            reservedValue = 0,
            version = ${usageCounters.version} + 1,
            updatedAt = CURRENT_TIMESTAMP
        `);
      }
    });
  }
}
