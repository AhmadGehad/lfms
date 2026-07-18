import {
  TENANCY_ERROR_CODES,
  type FeatureAccessMode,
  type TenantContext,
  type TenancyErrorCode,
} from "../../shared/tenancy";

export type FeatureEntitlement = Readonly<{
  key: string;
  mode: FeatureAccessMode;
  expiresAt: Date | null;
}>;

export type EntitlementSnapshot = Readonly<{
  companyId: number;
  version: number;
  features: ReadonlyMap<string, FeatureEntitlement>;
  limits: ReadonlyMap<string, number | null>;
}>;

export interface EntitlementStore {
  load(companyId: number): Promise<EntitlementSnapshot>;
}

export interface AtomicUsageStore<TTransaction = unknown> {
  consume(input: {
    companyId: number;
    metric: string;
    amount: number;
    limit: number | null;
    transaction: TTransaction;
  }): Promise<{ consumed: boolean; current: number }>;
  release(input: {
    companyId: number;
    metric: string;
    amount: number;
    transaction: TTransaction;
  }): Promise<number>;
}

export class EntitlementError extends Error {
  constructor(
    public readonly code: TenancyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EntitlementError";
  }
}

export class EntitlementService {
  constructor(
    private readonly store: EntitlementStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getSnapshot(ctx: Pick<TenantContext, "companyId">) {
    return this.store.load(ctx.companyId);
  }

  async assertAccess(
    ctx: TenantContext,
    featureKey: string,
    operation: "read" | "write",
  ) {
    if (ctx.companyLifecycleStatus === "purging" || ctx.companyLifecycleStatus === "deleted") {
      throw new EntitlementError(
        TENANCY_ERROR_CODES.companyUnavailable,
        "Company is unavailable",
      );
    }
    if (operation === "write" && ctx.companyLifecycleStatus !== "active") {
      throw new EntitlementError(
        TENANCY_ERROR_CODES.companySuspended,
        "Company is read-only",
      );
    }

    const snapshot = await this.store.load(ctx.companyId);
    const feature = snapshot.features.get(featureKey);
    const expired = feature?.expiresAt && feature.expiresAt.getTime() <= this.now().getTime();
    const configuredMode = feature?.mode ?? "disabled";
    const mode = expired && configuredMode === "enabled" ? "read_only" : configuredMode;

    if (mode === "disabled") {
      throw new EntitlementError(
        TENANCY_ERROR_CODES.featureDisabled,
        `Feature disabled: ${featureKey}`,
      );
    }
    if (operation === "write" && mode === "read_only") {
      throw new EntitlementError(
        TENANCY_ERROR_CODES.featureReadOnly,
        `Feature is read-only: ${featureKey}`,
      );
    }
    return { snapshot, feature: feature ?? null, effectiveMode: mode } as const;
  }
}

export class QuotaService<TTransaction = unknown> {
  constructor(
    private readonly entitlements: EntitlementStore,
    private readonly usage: AtomicUsageStore<TTransaction>,
  ) {}

  async consume(
    ctx: Pick<TenantContext, "companyId">,
    metric: string,
    amount: number,
    transaction: TTransaction,
  ) {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error("Quota amount must be a positive integer");
    }
    const snapshot = await this.entitlements.load(ctx.companyId);
    const limit = snapshot.limits.get(metric) ?? null;
    const result = await this.usage.consume({
      companyId: ctx.companyId,
      metric,
      amount,
      limit,
      transaction,
    });
    if (!result.consumed) {
      throw new EntitlementError(
        TENANCY_ERROR_CODES.quotaExceeded,
        `Quota exceeded: ${metric}`,
      );
    }
    return result.current;
  }

  release(
    ctx: Pick<TenantContext, "companyId">,
    metric: string,
    amount: number,
    transaction: TTransaction,
  ) {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error("Quota amount must be a positive integer");
    }
    return this.usage.release({
      companyId: ctx.companyId,
      metric,
      amount,
      transaction,
    });
  }
}
