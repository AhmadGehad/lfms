import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { TenantContext } from "../../shared/tenancy";
import {
  animalCategories,
  animalStatuses,
  animals,
  birthTypes,
  expenseCategories,
  expenses,
  feedItems,
  feedStockLedger,
  groups,
  lambingLog,
  rationPlans,
  sales,
  species,
  weightLog,
} from "../../drizzle/schema";
import { createAuditEntry, getDb, type DbOrTx } from "../db";
import { permissionProcedure, router } from "../_core/trpc";
import { tenantScope } from "../tenancy/scope";

type ScopedTable = {
  id: any;
  companyId: any;
  farmId?: any;
  deletedAt: any;
  isActive?: any;
  version: any;
};

type MutationContext = {
  tenant?: TenantContext | null;
  user: { id: number };
};

function requireTenant(ctx: MutationContext): TenantContext {
  if (!ctx.tenant) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Company context required" });
  }
  return ctx.tenant;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  return db;
}

function scoped(tenant: TenantContext, table: ScopedTable, ...conditions: any[]) {
  return and(tenantScope(tenant, table), ...conditions)!;
}

async function logAudit(
  tx: DbOrTx,
  tenant: TenantContext,
  userId: number,
  action: "SOFT_DELETE" | "RESTORE",
  entityType: string,
  entityId: string | number,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>,
) {
  await createAuditEntry({
    companyId: tenant.companyId,
    farmId: tenant.selectedFarmId,
    userId,
    membershipId: tenant.membershipId,
    actorType: "tenant_user",
    action,
    actionCategory: "data_delete",
    entityType,
    entityId: String(entityId),
    oldValues,
    newValues,
    requestId: tenant.requestId,
  }, tx);
}

async function listDeleted(tenant: TenantContext, table: ScopedTable) {
  const db = await requireDb();
  return db.select().from(table as any).where(scoped(tenant, table, isNotNull(table.deletedAt)));
}

type SimpleOperation = "delete" | "restore";

const versionedIdInput = z.object({
  id: z.number(),
  expectedVersion: z.number().int().positive(),
});

async function mutateSimpleRecord(args: {
  ctx: MutationContext;
  table: ScopedTable;
  id: number;
  entityType: string;
  operation: SimpleOperation;
  activeToggle?: boolean;
  expectedVersion: number;
}) {
  const { ctx, table, id, entityType, operation, activeToggle = false, expectedVersion } = args;
  const tenant = requireTenant(ctx);
  const db = await requireDb();

  await db.transaction(async tx => {
    const [row] = await tx
      .select()
      .from(table as any)
      .where(scoped(tenant, table, eq(table.id, id)))
      .limit(1)
      .for("update");
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Record not found" });
    if ((row as any).version !== expectedVersion) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Record changed since it was loaded. Refresh and try again.",
      });
    }

    const deletedAt = (row as any).deletedAt as Date | null;
    if (operation === "delete" && deletedAt) {
      throw new TRPCError({ code: "CONFLICT", message: "Record is already deleted" });
    }
    if (operation === "restore" && !deletedAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Record must be soft-deleted first" });
    }

    const nextDeletedAt = operation === "delete" ? new Date() : null;
    const values: Record<string, unknown> = {
      deletedAt: nextDeletedAt,
      deletedBy: operation === "delete" ? ctx.user.id : null,
      version: sql`${table.version} + 1`,
    };
    if (activeToggle) values.isActive = operation !== "delete";
    const [result] = await tx.update(table as any)
      .set(values)
      .where(scoped(
        tenant,
        table,
        eq(table.id, id),
        eq(table.version, expectedVersion),
        operation === "delete" ? isNull(table.deletedAt) : isNotNull(table.deletedAt),
      ));
    if (Number((result as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Record changed since it was loaded. Refresh and try again.",
      });
    }
    await logAudit(
      tx,
      tenant,
      ctx.user.id,
      operation === "delete" ? "SOFT_DELETE" : "RESTORE",
      entityType,
      id,
      { deletedAt, version: (row as any).version, ...(activeToggle ? { isActive: (row as any).isActive } : {}) },
      { deletedAt: nextDeletedAt, version: (row as any).version + 1, ...(activeToggle ? { isActive: operation !== "delete" } : {}) },
    );
  });
}

export const recycleBinRouter = router({
  list: permissionProcedure("recycleBin", "view")
    .input(z.object({ entityType: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const tenant = requireTenant(ctx);
      const results: {
        entityType: string;
        id: number;
        version: number;
        label: string;
        deletedAt: Date | null;
        deletedBy: number | null;
        meta: Record<string, unknown>;
      }[] = [];
      const type = input?.entityType;

      if (!type || type === "animal") {
        for (const r of await listDeleted(tenant, animals) as any[]) results.push({
          entityType: "animal", id: r.id, version: r.version, label: `Animal ${r.animalId}`,
          deletedAt: r.deletedAt, deletedBy: r.deletedBy,
          meta: { animalId: r.animalId, isActive: r.isActive },
        });
      }
      if (!type || type === "expense") {
        for (const r of await listDeleted(tenant, expenses) as any[]) results.push({
          entityType: "expense", id: r.id, version: r.version, label: `Expense #${r.id} - ${r.expenseDate}`,
          deletedAt: r.deletedAt, deletedBy: r.deletedBy,
          meta: { amount: r.amount, expenseDate: r.expenseDate },
        });
      }
      if (!type || type === "weightLog") {
        for (const r of await listDeleted(tenant, weightLog) as any[]) results.push({
          entityType: "weightLog", id: r.id, version: r.version, label: `Weight Entry #${r.id} - ${r.weighDate}`,
          deletedAt: r.deletedAt, deletedBy: r.deletedBy,
          meta: { animalId: r.animalId, weightKg: r.weightKg, weighDate: r.weighDate },
        });
      }
      if (!type || type === "lambingLog") {
        for (const r of await listDeleted(tenant, lambingLog) as any[]) results.push({
          entityType: "lambingLog", id: r.id, version: r.version, label: `Lambing Record ${r.lambId}`,
          deletedAt: r.deletedAt, deletedBy: r.deletedBy,
          meta: { lambId: r.lambId, birthDate: r.birthDate },
        });
      }
      if (!type || type === "rationPlan") {
        for (const r of await listDeleted(tenant, rationPlans) as any[]) results.push({
          entityType: "rationPlan", id: r.id, version: r.version, label: `Ration Plan #${r.id}`,
          deletedAt: r.deletedAt, deletedBy: r.deletedBy,
          meta: { categoryId: r.categoryId, feedItemId: r.feedItemId },
        });
      }
      if (!type || type === "feedStock") {
        for (const r of await listDeleted(tenant, feedStockLedger) as any[]) results.push({
          entityType: "feedStock", id: r.id, version: r.version, label: `Feed Stock Entry #${r.id} - ${r.transactionDate}`,
          deletedAt: r.deletedAt, deletedBy: r.deletedBy,
          meta: { feedItemId: r.feedItemId, qty: r.qty, transactionType: r.transactionType },
        });
      }
      if (!type || type === "sale") {
        for (const r of await listDeleted(tenant, sales) as any[]) results.push({
          entityType: "sale", id: r.id, version: r.version, label: `Sale #${r.id} - ${r.saleDate}`,
          deletedAt: r.deletedAt, deletedBy: r.deletedBy,
          meta: { animalId: r.animalId, salePrice: r.salePrice },
        });
      }
      if (!type || type === "species") {
        for (const r of await listDeleted(tenant, species) as any[]) results.push({
          entityType: "species", id: r.id, version: r.version, label: `Species: ${r.name}`,
          deletedAt: r.deletedAt, deletedBy: r.deletedBy, meta: { name: r.name },
        });
      }
      if (!type || type === "category") {
        for (const r of await listDeleted(tenant, animalCategories) as any[]) results.push({
          entityType: "category", id: r.id, version: r.version, label: `Category: ${r.name}`,
          deletedAt: r.deletedAt, deletedBy: r.deletedBy, meta: { name: r.name, idPrefix: r.idPrefix },
        });
      }
      if (!type || type === "group") {
        for (const r of await listDeleted(tenant, groups) as any[]) results.push({
          entityType: "group", id: r.id, version: r.version, label: `Group: ${r.name} (${r.groupCode})`,
          deletedAt: r.deletedAt, deletedBy: r.deletedBy, meta: { name: r.name, groupCode: r.groupCode },
        });
      }
      if (!type || type === "status") {
        for (const r of await listDeleted(tenant, animalStatuses) as any[]) results.push({
          entityType: "status", id: r.id, version: r.version, label: `Status: ${r.name}`,
          deletedAt: r.deletedAt, deletedBy: r.deletedBy, meta: { name: r.name },
        });
      }
      if (!type || type === "birthType") {
        for (const r of await listDeleted(tenant, birthTypes) as any[]) results.push({
          entityType: "birthType", id: r.id, version: r.version, label: `Birth Type: ${r.name}`,
          deletedAt: r.deletedAt, deletedBy: r.deletedBy, meta: { name: r.name },
        });
      }
      if (!type || type === "feedItem") {
        for (const r of await listDeleted(tenant, feedItems) as any[]) results.push({
          entityType: "feedItem", id: r.id, version: r.version, label: `Feed Item: ${r.name}`,
          deletedAt: r.deletedAt, deletedBy: r.deletedBy, meta: { name: r.name, unit: r.unit },
        });
      }
      if (!type || type === "expenseCategory") {
        for (const r of await listDeleted(tenant, expenseCategories) as any[]) results.push({
          entityType: "expenseCategory", id: r.id, version: r.version, label: `Expense Category: ${r.name}`,
          deletedAt: r.deletedAt, deletedBy: r.deletedBy, meta: { name: r.name },
        });
      }

      return results.sort((a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0));
    }),

  deleteAnimal: permissionProcedure("animals", "delete")
    .input(z.object({
      id: z.number(),
      expectedVersion: z.number().int().positive(),
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenant = requireTenant(ctx);
      const db = await requireDb();
      await db.transaction(async tx => {
        const [animal] = await tx.select().from(animals)
          .where(scoped(tenant, animals, eq(animals.id, input.id), isNull(animals.deletedAt)))
          .limit(1).for("update");
        if (!animal) throw new TRPCError({ code: "NOT_FOUND", message: "Animal not found" });
        if (animal.version !== input.expectedVersion) throw new TRPCError({
          code: "CONFLICT", message: "Animal changed since it was loaded. Refresh and try again.",
        });

        const now = new Date();
        await tx.update(lambingLog).set({
          isPromoted: true,
          promotedAnimalCode: animal.animalId,
          deletedAt: null,
          deletedBy: null,
          version: sql`${lambingLog.version} + 1`,
        }).where(scoped(tenant, lambingLog, eq(lambingLog.promotedHeadId, input.id)));
        const [result] = await tx.update(animals)
          .set({
            deletedAt: now,
            deletedBy: ctx.user.id,
            isActive: false,
            version: sql`${animals.version} + 1`,
          })
          .where(scoped(
            tenant,
            animals,
            eq(animals.id, input.id),
            eq(animals.version, input.expectedVersion),
            isNull(animals.deletedAt),
          ));
        if (Number((result as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
          throw new TRPCError({
            code: "CONFLICT", message: "Animal changed since it was loaded. Refresh and try again.",
          });
        }
        await tx.update(weightLog).set({
          deletedAt: now,
          deletedBy: ctx.user.id,
          version: sql`${weightLog.version} + 1`,
        })
          .where(scoped(tenant, weightLog, eq(weightLog.animalId, input.id), isNull(weightLog.deletedAt)));
        await tx.update(expenses).set({
          deletedAt: now,
          deletedBy: ctx.user.id,
          version: sql`${expenses.version} + 1`,
        })
          .where(scoped(tenant, expenses, eq(expenses.headId, input.id), isNull(expenses.deletedAt)));
        await tx.update(sales).set({
          deletedAt: now,
          deletedBy: ctx.user.id,
          version: sql`${sales.version} + 1`,
        })
          .where(scoped(tenant, sales, eq(sales.animalId, input.id), isNull(sales.deletedAt)));
        await logAudit(tx, tenant, ctx.user.id, "SOFT_DELETE", "animal", input.id,
          { deletedAt: animal.deletedAt, isActive: animal.isActive, version: animal.version },
          { deletedAt: now, isActive: false, version: animal.version + 1, reason: input.reason });
      });
      return { success: true };
    }),

  restoreAnimal: permissionProcedure("recycleBin", "restore")
    .input(versionedIdInput)
    .mutation(async ({ ctx, input }) => {
      const tenant = requireTenant(ctx);
      const db = await requireDb();
      await db.transaction(async tx => {
        const [animal] = await tx.select().from(animals)
          .where(scoped(tenant, animals, eq(animals.id, input.id), isNotNull(animals.deletedAt)))
          .limit(1).for("update");
        if (!animal?.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Deleted animal not found" });
        if (animal.version !== input.expectedVersion) throw new TRPCError({
          code: "CONFLICT", message: "Animal changed since it was loaded. Refresh and try again.",
        });
        const cascadeDeletedAt = animal.deletedAt;
        const [result] = await tx.update(animals).set({
          deletedAt: null,
          deletedBy: null,
          isActive: true,
          version: sql`${animals.version} + 1`,
        }).where(scoped(
          tenant,
          animals,
          eq(animals.id, input.id),
          eq(animals.version, input.expectedVersion),
          eq(animals.deletedAt, cascadeDeletedAt),
        ));
        if (Number((result as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
          throw new TRPCError({
            code: "CONFLICT", message: "Animal changed since it was loaded. Refresh and try again.",
          });
        }
        await tx.update(weightLog).set({
          deletedAt: null,
          deletedBy: null,
          version: sql`${weightLog.version} + 1`,
        })
          .where(scoped(tenant, weightLog, eq(weightLog.animalId, input.id), eq(weightLog.deletedAt, cascadeDeletedAt)));
        await tx.update(expenses).set({
          deletedAt: null,
          deletedBy: null,
          version: sql`${expenses.version} + 1`,
        })
          .where(scoped(tenant, expenses, eq(expenses.headId, input.id), eq(expenses.deletedAt, cascadeDeletedAt)));
        await tx.update(sales).set({
          deletedAt: null,
          deletedBy: null,
          version: sql`${sales.version} + 1`,
        })
          .where(scoped(tenant, sales, eq(sales.animalId, input.id), eq(sales.deletedAt, cascadeDeletedAt)));
        await logAudit(tx, tenant, ctx.user.id, "RESTORE", "animal", input.id,
          { deletedAt: cascadeDeletedAt, isActive: false, version: animal.version },
          { deletedAt: null, isActive: true, version: animal.version + 1 });
      });
      return { success: true };
    }),

  deleteExpense: permissionProcedure("expenses", "delete").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: expenses, id: input.id, expectedVersion: input.expectedVersion, entityType: "expense", operation: "delete" }).then(() => ({ success: true }))),
  restoreExpense: permissionProcedure("recycleBin", "restore").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: expenses, id: input.id, expectedVersion: input.expectedVersion, entityType: "expense", operation: "restore" }).then(() => ({ success: true }))),

  deleteWeightLog: permissionProcedure("fattening", "delete").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: weightLog, id: input.id, expectedVersion: input.expectedVersion, entityType: "weightLog", operation: "delete" }).then(() => ({ success: true }))),
  restoreWeightLog: permissionProcedure("recycleBin", "restore").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: weightLog, id: input.id, expectedVersion: input.expectedVersion, entityType: "weightLog", operation: "restore" }).then(() => ({ success: true }))),

  deleteLambingLog: permissionProcedure("breeding", "delete")
    .input(z.object({ id: z.number(), expectedVersion: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const tenant = requireTenant(ctx);
      const db = await requireDb();
      await db.transaction(async tx => {
        const [record] = await tx.select().from(lambingLog)
          .where(scoped(tenant, lambingLog, eq(lambingLog.id, input.id)))
          .limit(1).for("update");
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Lambing record not found" });
        if (record.version !== input.expectedVersion) throw new TRPCError({
          code: "CONFLICT", message: "Lambing record changed since it was loaded. Refresh and try again.",
        });
        if (record.isPromoted) throw new TRPCError({
          code: "CONFLICT", message: "Promoted birth records are permanent history and cannot be deleted",
        });
        if (record.deletedAt) throw new TRPCError({ code: "CONFLICT", message: "Record is already deleted" });
        const now = new Date();
        const [result] = await tx.update(lambingLog).set({
          deletedAt: now,
          deletedBy: ctx.user.id,
          version: sql`${lambingLog.version} + 1`,
        }).where(scoped(
          tenant,
          lambingLog,
          eq(lambingLog.id, input.id),
          eq(lambingLog.version, input.expectedVersion),
          isNull(lambingLog.deletedAt),
        ));
        if (Number((result as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
          throw new TRPCError({
            code: "CONFLICT", message: "Lambing record changed since it was loaded. Refresh and try again.",
          });
        }
        await logAudit(tx, tenant, ctx.user.id, "SOFT_DELETE", "lambingLog", input.id,
          { deletedAt: null, version: input.expectedVersion },
          { deletedAt: now, version: input.expectedVersion + 1 });
      });
      return { success: true };
    }),
  restoreLambingLog: permissionProcedure("recycleBin", "restore").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: lambingLog, id: input.id, expectedVersion: input.expectedVersion, entityType: "lambingLog", operation: "restore" }).then(() => ({ success: true }))),

  deleteRationPlan: permissionProcedure("feed", "delete").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: rationPlans, id: input.id, expectedVersion: input.expectedVersion, entityType: "rationPlan", operation: "delete", activeToggle: true }).then(() => ({ success: true }))),
  restoreRationPlan: permissionProcedure("recycleBin", "restore").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: rationPlans, id: input.id, expectedVersion: input.expectedVersion, entityType: "rationPlan", operation: "restore", activeToggle: true }).then(() => ({ success: true }))),

  deleteFeedStock: permissionProcedure("feed", "delete").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: feedStockLedger, id: input.id, expectedVersion: input.expectedVersion, entityType: "feedStock", operation: "delete" }).then(() => ({ success: true }))),
  restoreFeedStock: permissionProcedure("recycleBin", "restore").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: feedStockLedger, id: input.id, expectedVersion: input.expectedVersion, entityType: "feedStock", operation: "restore" }).then(() => ({ success: true }))),

  deleteSale: permissionProcedure("sales", "delete").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: sales, id: input.id, expectedVersion: input.expectedVersion, entityType: "sale", operation: "delete" }).then(() => ({ success: true }))),
  restoreSale: permissionProcedure("recycleBin", "restore").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: sales, id: input.id, expectedVersion: input.expectedVersion, entityType: "sale", operation: "restore" }).then(() => ({ success: true }))),

  deleteSpecies: permissionProcedure("configuration", "delete").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: species, id: input.id, expectedVersion: input.expectedVersion, entityType: "species", operation: "delete", activeToggle: true }).then(() => ({ success: true }))),
  restoreSpecies: permissionProcedure("recycleBin", "restore").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: species, id: input.id, expectedVersion: input.expectedVersion, entityType: "species", operation: "restore", activeToggle: true }).then(() => ({ success: true }))),
  deleteCategory: permissionProcedure("configuration", "delete").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: animalCategories, id: input.id, expectedVersion: input.expectedVersion, entityType: "category", operation: "delete", activeToggle: true }).then(() => ({ success: true }))),
  restoreCategory: permissionProcedure("recycleBin", "restore").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: animalCategories, id: input.id, expectedVersion: input.expectedVersion, entityType: "category", operation: "restore", activeToggle: true }).then(() => ({ success: true }))),
  deleteGroup: permissionProcedure("configuration", "delete").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: groups, id: input.id, expectedVersion: input.expectedVersion, entityType: "group", operation: "delete", activeToggle: true }).then(() => ({ success: true }))),
  restoreGroup: permissionProcedure("recycleBin", "restore").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: groups, id: input.id, expectedVersion: input.expectedVersion, entityType: "group", operation: "restore", activeToggle: true }).then(() => ({ success: true }))),
  deleteStatus: permissionProcedure("configuration", "delete").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: animalStatuses, id: input.id, expectedVersion: input.expectedVersion, entityType: "status", operation: "delete", activeToggle: true }).then(() => ({ success: true }))),
  restoreStatus: permissionProcedure("recycleBin", "restore").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: animalStatuses, id: input.id, expectedVersion: input.expectedVersion, entityType: "status", operation: "restore", activeToggle: true }).then(() => ({ success: true }))),
  deleteBirthType: permissionProcedure("configuration", "delete").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: birthTypes, id: input.id, expectedVersion: input.expectedVersion, entityType: "birthType", operation: "delete", activeToggle: true }).then(() => ({ success: true }))),
  restoreBirthType: permissionProcedure("recycleBin", "restore").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: birthTypes, id: input.id, expectedVersion: input.expectedVersion, entityType: "birthType", operation: "restore", activeToggle: true }).then(() => ({ success: true }))),
  deleteFeedItem: permissionProcedure("configuration", "delete").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: feedItems, id: input.id, expectedVersion: input.expectedVersion, entityType: "feedItem", operation: "delete", activeToggle: true }).then(() => ({ success: true }))),
  restoreFeedItem: permissionProcedure("recycleBin", "restore").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: feedItems, id: input.id, expectedVersion: input.expectedVersion, entityType: "feedItem", operation: "restore", activeToggle: true }).then(() => ({ success: true }))),
  deleteExpenseCategory: permissionProcedure("configuration", "delete").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: expenseCategories, id: input.id, expectedVersion: input.expectedVersion, entityType: "expenseCategory", operation: "delete", activeToggle: true }).then(() => ({ success: true }))),
  restoreExpenseCategory: permissionProcedure("recycleBin", "restore").input(versionedIdInput)
    .mutation(({ ctx, input }) => mutateSimpleRecord({ ctx, table: expenseCategories, id: input.id, expectedVersion: input.expectedVersion, entityType: "expenseCategory", operation: "restore", activeToggle: true }).then(() => ({ success: true }))),
});
