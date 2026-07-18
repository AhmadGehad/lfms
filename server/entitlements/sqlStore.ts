import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import {
  companies,
  companyFeatureOverrides,
  companySubscriptions,
  featureCatalog,
  planEntitlements,
} from "../../drizzle/schema";
import type { FeatureAccessMode } from "../../shared/tenancy";
import { getDb } from "../db";
import {
  EntitlementService,
  type EntitlementSnapshot,
  type EntitlementStore,
  type FeatureEntitlement,
} from "./service";
import { subscriptionEffectiveEnd } from "./subscriptionLifecycle";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

function earlier(left: Date | null, right: Date | null) {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() <= right.getTime() ? left : right;
}

export class SqlEntitlementStore implements EntitlementStore {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async load(companyId: number): Promise<EntitlementSnapshot> {
    const db = await requireDb();
    const now = this.now();
    const [[company], [subscription], overrides] = await Promise.all([
      db.select({ version: companies.entitlementVersion })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1),
      db.select({
        planId: companySubscriptions.subscriptionPlanId,
        status: companySubscriptions.status,
        periodStart: companySubscriptions.periodStart,
        periodEnd: companySubscriptions.periodEnd,
        trialEndsAt: companySubscriptions.trialEndsAt,
        graceEndsAt: companySubscriptions.graceEndsAt,
      })
        .from(companySubscriptions)
        .where(and(
          eq(companySubscriptions.companyId, companyId),
          eq(companySubscriptions.isCurrent, true),
        ))
        .limit(1),
      db.select({
        code: featureCatalog.code,
        accessMode: companyFeatureOverrides.accessMode,
        limitValue: companyFeatureOverrides.limitValue,
        expiresAt: companyFeatureOverrides.expiresAt,
      })
        .from(companyFeatureOverrides)
        .innerJoin(featureCatalog, eq(companyFeatureOverrides.featureId, featureCatalog.id))
        .where(and(
          eq(companyFeatureOverrides.companyId, companyId),
          eq(companyFeatureOverrides.isCurrent, true),
          lte(companyFeatureOverrides.startsAt, now),
          or(isNull(companyFeatureOverrides.expiresAt), gt(companyFeatureOverrides.expiresAt, now)),
        )),
    ]);

    if (!company) throw new Error("Company unavailable");
    const features = new Map<string, FeatureEntitlement>();
    const limits = new Map<string, number | null>();
    const subscriptionStarted = subscription && subscription.periodStart.getTime() <= now.getTime();
    const subscriptionExpiry = subscriptionStarted
      ? (subscriptionEffectiveEnd(subscription) ?? new Date(0))
      : new Date(0);

    if (subscriptionStarted) {
      const rows = await db.select({
        code: featureCatalog.code,
        mode: planEntitlements.accessMode,
        limitValue: planEntitlements.limitValue,
      })
        .from(planEntitlements)
        .innerJoin(featureCatalog, eq(planEntitlements.featureId, featureCatalog.id))
        .where(eq(planEntitlements.subscriptionPlanId, subscription.planId));
      for (const row of rows) {
        features.set(row.code, {
          key: row.code,
          mode: row.mode,
          expiresAt: subscriptionExpiry,
        });
        const limitKey = row.code.endsWith("_limit") ? row.code.slice(0, -6) : row.code;
        limits.set(limitKey, row.limitValue ?? null);
      }
    }

    for (const override of overrides) {
      const base = features.get(override.code);
      features.set(override.code, {
        key: override.code,
        mode: override.accessMode ?? base?.mode ?? "disabled",
        expiresAt: earlier(subscriptionExpiry, override.expiresAt),
      });
      if (override.limitValue !== null) {
        const limitKey = override.code.endsWith("_limit")
          ? override.code.slice(0, -6)
          : override.code;
        limits.set(limitKey, override.limitValue);
      }
    }

    return {
      companyId,
      version: company.version,
      features,
      limits,
    };
  }
}

let service: EntitlementService | null = null;

export function getEntitlementService() {
  service ??= new EntitlementService(new SqlEntitlementStore());
  return service;
}

export const PAGE_FEATURES = {
  dashboard: "core",
  animals: "animals",
  breeding: "breeding",
  pregnancy: "pregnancy",
  fattening: "fattening",
  feed: "feed",
  vaccinations: "vaccinations",
  expenses: "expenses",
  pnl: "reporting",
  incomeStatement: "reporting",
  sales: "sales",
  notifications: "notifications",
  audit: "audit",
  users: "user_management",
  configuration: "configuration",
  capital: "configuration",
  farmMap: "farm_map",
  data: "data_transfer",
  recycleBin: "data_recovery",
} as const;
