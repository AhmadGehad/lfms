import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import type { TenantActorContext, TenantContext } from "../../shared/tenancy";
import { canAccessFarm, TENANCY_ERROR_CODES } from "../../shared/tenancy";

type CompanyScopedColumns = {
  companyId: AnyMySqlColumn;
  farmId?: AnyMySqlColumn;
};

export function assertFarmAccess(context: TenantContext, farmId: number) {
  if (!canAccessFarm(context, farmId)) {
    throw new Error(TENANCY_ERROR_CODES.farmAccessDenied);
  }
}

export function companyScope(
  context: Pick<TenantActorContext, "companyId">,
  companyId: AnyMySqlColumn,
) {
  return eq(companyId, context.companyId);
}

export function tenantScope(
  context: TenantContext,
  columns: CompanyScopedColumns,
): SQL {
  const company = companyScope(context, columns.companyId);
  if (!columns.farmId) {
    return company;
  }
  const includeCompanyRows = columns.farmId.notNull === false;
  if (context.selectedFarmId != null) {
    assertFarmAccess(context, context.selectedFarmId);
    const selected = eq(columns.farmId, context.selectedFarmId);
    return and(
      company,
      includeCompanyRows ? or(isNull(columns.farmId), selected)! : selected,
    )!;
  }
  if (context.farmAccessMode === "all" || context.accessibleFarmIds === "all") return company;
  if (context.accessibleFarmIds.length === 0) {
    return and(company, includeCompanyRows ? isNull(columns.farmId) : sql`FALSE`)!;
  }
  const assigned = inArray(columns.farmId, [...context.accessibleFarmIds]);
  return and(
    company,
    includeCompanyRows ? or(isNull(columns.farmId), assigned)! : assigned,
  )!;
}

export function tenantValues<T extends object>(
  context: Pick<TenantActorContext, "companyId">,
  values: T,
  farmId?: number | null,
): T & { companyId: number; farmId?: number | null } {
  return {
    ...values,
    companyId: context.companyId,
    ...(farmId === undefined ? {} : { farmId }),
  };
}
