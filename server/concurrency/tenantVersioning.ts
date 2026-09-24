import { and, eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { TenantContext } from "../../shared/tenancy";
import { tenantScope } from "../tenancy/scope";
import { assertExpectedVersion } from "./versioning";

type VersionedTenantColumns = {
  companyId: AnyPgColumn;
  farmId?: AnyPgColumn;
  id: AnyPgColumn;
  version: AnyPgColumn;
};

export function versionedTenantUpdateScope(
  context: TenantContext,
  columns: VersionedTenantColumns,
  id: number,
  expectedVersion: number,
): SQL {
  assertExpectedVersion(expectedVersion);
  return and(
    tenantScope(context, columns),
    eq(columns.id, id),
    eq(columns.version, expectedVersion),
  )!;
}
