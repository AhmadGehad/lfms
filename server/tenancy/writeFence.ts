import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { companies } from "../../drizzle/schema";
import type { TenantContext } from "../../shared/tenancy";
import { getDb, runWithDbTransaction, type DbOrTx } from "../db";

/**
 * Hold the company row lock until a tenant mutation commits. Lifecycle changes
 * use the same lock, so suspension cannot race a write. TiDB lacks FOR SHARE.
 */
export async function runWithTenantWriteFence<T>(
  tenant: TenantContext,
  operation: () => Promise<T>,
  database?: DbOrTx,
): Promise<T> {
  const db = database ?? await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }

  return db.transaction(async tx => {
    const [company] = await tx.select({
      lifecycleStatus: companies.lifecycleStatus,
    }).from(companies)
      .where(eq(companies.id, tenant.companyId))
      .limit(1)
      .for("update");

    if (!company || company.lifecycleStatus !== "active") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Company is not active",
      });
    }

    return runWithDbTransaction(tx, operation);
  });
}
