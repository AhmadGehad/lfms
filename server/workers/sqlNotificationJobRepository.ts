import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  animals,
  backgroundJobs,
  companies,
  farms,
  pregnancyRecords,
  vaccinationRecords,
  vaccines,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { isDuplicateEntryError } from "../_core/databaseErrors";
import type {
  BoosterDueRow,
  LowStockRow,
  NotificationCandidate,
  PregnancyCheckupRow,
  PregnancyDueRow,
  VaccinationDueRow,
} from "../notifications/decisions";
import { insertNotificationOnce } from "../notifications/repository";
import { generatePublicId } from "../tenancy/publicIds";
import type { NotificationJobRepository } from "./notificationJobs";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

function affectedRows(result: unknown) {
  return Number((result as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
}

function cutoffDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export class SqlNotificationJobRepository implements NotificationJobRepository {
  async listActiveTenantFarms() {
    const db = await requireDb();
    return db
      .select({ companyId: farms.companyId, farmId: farms.id })
      .from(farms)
      .innerJoin(companies, eq(companies.id, farms.companyId))
      .where(and(
        eq(companies.lifecycleStatus, "active"),
        isNull(companies.deletedAt),
        eq(farms.status, "active"),
        isNull(farms.deletedAt),
      ));
  }

  async isActiveTenantFarm(companyId: number, farmId: number) {
    const db = await requireDb();
    const [row] = await db
      .select({ id: farms.id })
      .from(farms)
      .innerJoin(companies, eq(companies.id, farms.companyId))
      .where(and(
        eq(companies.id, companyId),
        eq(companies.lifecycleStatus, "active"),
        isNull(companies.deletedAt),
        eq(farms.id, farmId),
        eq(farms.companyId, companyId),
        eq(farms.status, "active"),
        isNull(farms.deletedAt),
      ))
      .limit(1);
    return Boolean(row);
  }

  async enqueue(input: Parameters<NotificationJobRepository["enqueue"]>[0]) {
    const db = await requireDb();
    try {
      const [result] = await db.insert(backgroundJobs).values({
        publicId: generatePublicId(),
        companyId: input.companyId,
        jobType: input.type,
        payload: input.payload,
        runAt: input.runAt,
        deduplicationKey: input.deduplicationKey,
        maxAttempts: 5,
      });
      return affectedRows(result) === 1;
    } catch (error) {
      if (isDuplicateEntryError(error)) return false;
      throw error;
    }
  }

  async listLowStock(companyId: number, farmId: number): Promise<readonly LowStockRow[]> {
    const db = await requireDb();
    type Row = {
      feedItemId: number;
      feedItemName: string;
      unit: string;
      lastCountQty: string | number | null;
      lastCountDate: string | Date | null;
      purchasedQty: string | number | null;
      adjustmentQty: string | number | null;
      categoryId: number | null;
      planQty: string | number | null;
      heads: string | number | null;
    };
    const [rows] = await db.execute(sql`
      WITH latest_counts AS (
        SELECT feedItemId, qty, transactionDate
        FROM (
          SELECT feedItemId, qty, transactionDate,
            ROW_NUMBER() OVER (PARTITION BY feedItemId ORDER BY transactionDate DESC, id DESC) AS rn
          FROM saas_azal_feed_stock_ledger
          WHERE companyId = ${companyId}
            AND farmId = ${farmId}
            AND transactionType = 'stock_count'
            AND deletedAt IS NULL
        ) ranked_counts
        WHERE rn = 1
      ),
      tx_sums AS (
        SELECT l.feedItemId,
          SUM(CASE WHEN l.transactionType = 'purchase' THEN l.qty ELSE 0 END) AS purchasedQty,
          SUM(CASE WHEN l.transactionType = 'adjustment' THEN l.qty ELSE 0 END) AS adjustmentQty
        FROM saas_azal_feed_stock_ledger l
        LEFT JOIN latest_counts lc ON lc.feedItemId = l.feedItemId
        WHERE l.companyId = ${companyId}
          AND l.farmId = ${farmId}
          AND l.transactionType IN ('purchase', 'adjustment')
          AND l.deletedAt IS NULL
          AND l.transactionDate >= COALESCE(lc.transactionDate, '2020-01-01')
        GROUP BY l.feedItemId
      ),
      head_counts AS (
        SELECT categoryId, COUNT(*) AS heads
        FROM saas_azal_animals
        WHERE companyId = ${companyId}
          AND farmId = ${farmId}
          AND isActive = TRUE
          AND deletedAt IS NULL
        GROUP BY categoryId
      )
      SELECT fi.id AS feedItemId, fi.name AS feedItemName, fi.unit,
        lc.qty AS lastCountQty, lc.transactionDate AS lastCountDate,
        COALESCE(tx.purchasedQty, 0) AS purchasedQty,
        COALESCE(tx.adjustmentQty, 0) AS adjustmentQty,
        rp.categoryId, rp.qtyPerHeadPerDay AS planQty,
        COALESCE(hc.heads, 0) AS heads
      FROM saas_azal_feed_items fi
      LEFT JOIN latest_counts lc ON lc.feedItemId = fi.id
      LEFT JOIN tx_sums tx ON tx.feedItemId = fi.id
      LEFT JOIN saas_azal_ration_plans rp
        ON rp.feedItemId = fi.id
        AND rp.companyId = ${companyId}
        AND rp.farmId = ${farmId}
        AND rp.isActive = TRUE
        AND rp.deletedAt IS NULL
      LEFT JOIN head_counts hc ON hc.categoryId = rp.categoryId
      WHERE fi.companyId = ${companyId}
        AND fi.deletedAt IS NULL
      ORDER BY fi.id
    `) as unknown as [Row[], unknown];

    const byItem = new Map<number, {
      feedItemId: number;
      feedItemName: string;
      unit: string;
      lastCountDate: string;
      lastCountQty: number;
      purchasedQty: number;
      adjustmentQty: number;
      dailyConsumption: number;
    }>();
    for (const row of rows) {
      let item = byItem.get(row.feedItemId);
      if (!item) {
        item = {
          feedItemId: row.feedItemId,
          feedItemName: row.feedItemName,
          unit: row.unit,
          lastCountDate: row.lastCountDate instanceof Date
            ? row.lastCountDate.toISOString().slice(0, 10)
            : String(row.lastCountDate ?? "2020-01-01").slice(0, 10),
          lastCountQty: Number(row.lastCountQty ?? 0),
          purchasedQty: Number(row.purchasedQty ?? 0),
          adjustmentQty: Number(row.adjustmentQty ?? 0),
          dailyConsumption: 0,
        };
        byItem.set(row.feedItemId, item);
      }
      if (row.categoryId !== null) {
        item.dailyConsumption += Number(row.planQty ?? 0) * Number(row.heads ?? 0);
      }
    }

    const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
    return Array.from(byItem.values()).map(item => {
      const daysSinceCount = Math.max(
        0,
        Math.floor((today - new Date(item.lastCountDate).getTime()) / 86_400_000),
      );
      const stockOnHand = Math.max(
        0,
        item.lastCountQty + item.purchasedQty + item.adjustmentQty - item.dailyConsumption * daysSinceCount,
      );
      const daysRemaining = item.dailyConsumption > 0
        ? Math.floor(stockOnHand / item.dailyConsumption)
        : 999;
      return {
        feedItemId: item.feedItemId,
        feedItemName: item.feedItemName,
        unit: item.unit,
        stockOnHand,
        daysRemaining,
        status: daysRemaining <= 3 ? "critical" : daysRemaining <= 7 ? "low" : "ok",
      };
    });
  }

  async listVaccinations(companyId: number, farmId: number) {
    const db = await requireDb();
    const cutoff = cutoffDate(365);
    const base = and(
      eq(vaccinationRecords.companyId, companyId),
      eq(vaccinationRecords.farmId, farmId),
      eq(vaccinationRecords.isCompleted, false),
      isNull(vaccinationRecords.deletedAt),
    );
    const next = await db
      .select({
        id: vaccinationRecords.id,
        animalIdStr: animals.animalId,
        vaccineName: vaccines.name,
        nextDueDate: vaccinationRecords.nextDueDate,
        notifyBeforeNext: vaccinationRecords.notifyBeforeNext,
      })
      .from(vaccinationRecords)
      .innerJoin(animals, and(
        eq(animals.companyId, companyId),
        eq(animals.farmId, farmId),
        eq(animals.id, vaccinationRecords.animalId),
      ))
      .innerJoin(vaccines, and(
        eq(vaccines.companyId, companyId),
        eq(vaccines.id, vaccinationRecords.vaccineId),
      ))
      .where(and(base, sql`${vaccinationRecords.nextDueDate} <= ${cutoff}`));
    const boosters = await db
      .select({
        id: vaccinationRecords.id,
        animalIdStr: animals.animalId,
        vaccineName: vaccines.name,
        boosterDueDate: vaccinationRecords.boosterDueDate,
        notifyBeforeBooster: vaccinationRecords.notifyBeforeBooster,
      })
      .from(vaccinationRecords)
      .innerJoin(animals, and(
        eq(animals.companyId, companyId),
        eq(animals.farmId, farmId),
        eq(animals.id, vaccinationRecords.animalId),
      ))
      .innerJoin(vaccines, and(
        eq(vaccines.companyId, companyId),
        eq(vaccines.id, vaccinationRecords.vaccineId),
      ))
      .where(and(
        base,
        isNotNull(vaccinationRecords.boosterDueDate),
        sql`${vaccinationRecords.boosterDueDate} <= ${cutoff}`,
      ));
    return {
      next: next as VaccinationDueRow[],
      boosters: boosters as BoosterDueRow[],
    };
  }

  async listPregnancies(companyId: number, farmId: number) {
    const db = await requireDb();
    const cutoff = cutoffDate(365);
    const base = and(
      eq(pregnancyRecords.companyId, companyId),
      eq(pregnancyRecords.farmId, farmId),
      eq(pregnancyRecords.status, "active"),
      isNull(pregnancyRecords.deletedAt),
    );
    const due = await db
      .select({
        id: pregnancyRecords.id,
        animalIdStr: animals.animalId,
        expectedDueDate: pregnancyRecords.expectedDueDate,
        notifyBeforeDue: pregnancyRecords.notifyBeforeDue,
      })
      .from(pregnancyRecords)
      .innerJoin(animals, and(
        eq(animals.companyId, companyId),
        eq(animals.farmId, farmId),
        eq(animals.id, pregnancyRecords.animalId),
      ))
      .where(and(base, sql`${pregnancyRecords.expectedDueDate} <= ${cutoff}`));
    const checkups = await db
      .select({
        id: pregnancyRecords.id,
        animalIdStr: animals.animalId,
        checkupDate: pregnancyRecords.checkupDate,
        notifyBeforeCheckup: pregnancyRecords.notifyBeforeCheckup,
      })
      .from(pregnancyRecords)
      .innerJoin(animals, and(
        eq(animals.companyId, companyId),
        eq(animals.farmId, farmId),
        eq(animals.id, pregnancyRecords.animalId),
      ))
      .where(and(
        base,
        isNotNull(pregnancyRecords.checkupDate),
        sql`${pregnancyRecords.checkupDate} <= ${cutoff}`,
      ));
    return {
      due: due as PregnancyDueRow[],
      checkups: checkups as PregnancyCheckupRow[],
    };
  }

  async insertNotification(
    companyId: number,
    farmId: number,
    candidate: NotificationCandidate,
    bucket: string,
  ) {
    if (!await this.isActiveTenantFarm(companyId, farmId)) return false;
    const db = await requireDb();
    return insertNotificationOnce(db, { companyId, farmId }, candidate, bucket);
  }
}
