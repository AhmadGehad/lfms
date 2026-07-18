import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { expenses } from "../../drizzle/schema";
import { getClientIp } from "../_core/audit";
import { toMajor, toMinor } from "../_core/money";
import { permissionProcedure, router } from "../_core/trpc";
import { moneyString, optionalMoneyString, pastOrTodayDate } from "../_core/validators";
import { computeExpenseSplits } from "../expenseSplit";
import { createExpense, deleteExpense, getCategoryHeadCountsOnDate, getDb, getExpenses, updateExpense, createAuditEntry } from "../db";
import { rethrowVersionedWriteError } from "../concurrency/trpcVersioning";
import { executeIdempotent } from "../platform/idempotency";

export const expensesRouter = router({
  list: permissionProcedure("expenses", "view")
    .input(
      z.object({
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        categoryId: z.number().optional(),
        targetType: z.enum(["general", "herd", "category", "head"]).optional(),
        headId: z.number().optional(),
        ownerId: z.number().optional(),
        vendor: z.string().optional(),
      }).optional()
    )
    .query(({ input }) => getExpenses(input ?? {})),

  create: permissionProcedure("expenses", "create")
    .input(
      z.object({
        expenseDate: pastOrTodayDate,
        categoryId: z.number().int().positive(),
        subCategoryId: z.number().int().positive().optional(),
        amount: moneyString,
        targetType: z.enum(["general", "herd", "category", "head"]),
        categoryTarget: z.number().int().positive().optional(),
        // Multi-category allocation: the expense is split into one row per
        // target category. Mutually exclusive with the single categoryTarget
        // (kept for the old design's payloads).
        categoryTargets: z.array(z.number().int().positive()).min(1).max(50).optional(),
        splitMode: z.enum(["headcount", "equal"]).optional().default("headcount"),
        headId: z.number().int().positive().optional(),
        vendorName: z.string().max(100).optional(),
        notes: z.string().max(2000).optional(),
        idempotencyKey: z.string().min(8).max(200),
      }).superRefine((data, ctx) => {
        // B4: cross-field consistency — a head expense needs a head, a
        // category expense needs its target categories; general/herd have neither.
        const targets = data.categoryTargets ?? (data.categoryTarget ? [data.categoryTarget] : []);
        if (data.categoryTargets && data.categoryTarget) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["categoryTargets"], message: "Provide either categoryTarget or categoryTargets, not both" });
        }
        if (data.categoryTargets && new Set(data.categoryTargets).size !== data.categoryTargets.length) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["categoryTargets"], message: "categoryTargets must not contain duplicates" });
        }
        if (data.targetType === "head" && !data.headId) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["headId"], message: "headId is required when targetType is 'head'" });
        }
        if (data.targetType === "category" && targets.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["categoryTargets"], message: "At least one target category is required when targetType is 'category'" });
        }
        if ((data.targetType === "general" || data.targetType === "herd") && (data.headId || targets.length > 0)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetType"], message: `${data.targetType === "herd" ? "Herd" : "General"} expenses must not specify headId or target categories` });
        }

        if (data.targetType === "head" && targets.length > 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["categoryTargets"], message: "Head expenses must not also specify target categories" });
        }
        if (data.targetType === "category" && data.headId) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["headId"], message: "Category expenses must not also specify a headId" });
        }
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { categoryTargets, categoryTarget, splitMode, idempotencyKey, ...shared } = input;
      const targetIds = input.targetType === "category"
        ? Array.from(new Set(categoryTargets ?? (categoryTarget ? [categoryTarget] : [])))
        : [];
      const headCounts = targetIds.length > 1 && splitMode === "headcount"
        ? await getCategoryHeadCountsOnDate(targetIds, input.expenseDate)
        : new Map<number, number>();
      const rows = computeExpenseSplits(
        toMinor(input.amount),
        targetIds.map(id => ({ categoryId: id, headCount: headCounts.get(id) ?? 1 })),
        splitMode,
      );
      if (rows.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Expense amount must be greater than zero" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
      return db.transaction(async (tx) => executeIdempotent(tx, {
        companyId: ctx.tenant!.companyId,
        userId: ctx.user.id,
        key: idempotencyKey,
        operation: "expenses.create",
        body: { ...shared, categoryTargets, categoryTarget, splitMode },
      }, async () => {
        const insertIds: number[] = [];
        for (const row of rows) {
          const amount = toMajor(row.amountMinor).toFixed(2);
          const result = await createExpense({
            ...shared,
            amount,
            categoryTarget: row.categoryTarget ?? undefined,
            expenseDate: new Date(input.expenseDate),
            createdBy: ctx.user.id,
          }, tx);
          const insertId = Number((result as any).insertId);
          insertIds.push(insertId);
          await createAuditEntry({
            userId: ctx.user.id,
            action: "create",
            ipAddress: getClientIp(ctx),
            entityType: "expense",
            entityId: String(insertId),
            newValues: { ...shared, amount, categoryTarget: row.categoryTarget ?? undefined, splitMode: rows.length > 1 ? splitMode : undefined } as any,
          }, tx);
        }
        return { insertId: insertIds[0], insertIds, count: rows.length };
      }));
    }),

  update: permissionProcedure("expenses", "update")
    .input(
      z.object({
        id: z.number().int().positive(),
        expectedVersion: z.number().int().positive(),
        expenseDate: pastOrTodayDate.optional(),
        amount: optionalMoneyString,
        vendorName: z.string().max(100).optional(),
        notes: z.string().max(2000).optional(),
        categoryId: z.number().int().positive().optional(),
        subCategoryId: z.number().int().positive().optional(),
        targetType: z.enum(["general", "herd", "category", "head"]).optional(),
        categoryTarget: z.number().int().positive().optional(),
        headId: z.number().int().positive().optional(),
      }).superRefine((data, ctx) => {
        if (data.targetType === "head" && !data.headId) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["headId"], message: "headId is required when targetType is 'head'" });
        }
        if (data.targetType === "category" && !data.categoryTarget) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["categoryTarget"], message: "categoryTarget is required when targetType is 'category'" });
        }
        if ((data.targetType === "general" || data.targetType === "herd") && (data.headId || data.categoryTarget)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetType"], message: `${data.targetType === "herd" ? "Herd" : "General"} expenses must not specify headId or categoryTarget` });
        }

      })
    )
    .mutation(async ({ input: { id, expectedVersion, expenseDate, ...data }, ctx }) => {
      const updateData: Record<string, any> = { ...data };
      if (expenseDate) updateData.expenseDate = new Date(expenseDate);
      try {
        return await updateExpense(id, expectedVersion, updateData, {
          userId: ctx.user?.id,
          ipAddress: getClientIp(ctx),
        });
      } catch (error) {
        rethrowVersionedWriteError(error, "Expense");
      }
    }),

  delete: permissionProcedure("expenses", "delete")
    .input(z.object({
      id: z.number(),
      expectedVersion: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await deleteExpense(input.id, input.expectedVersion, {
          userId: ctx.user?.id,
          ipAddress: getClientIp(ctx),
        });
      } catch (error) {
        rethrowVersionedWriteError(error, "Expense");
      }
    }),
});
