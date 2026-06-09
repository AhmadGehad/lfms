import { z } from "zod";
import { getClientIp } from "../_core/audit";
import { protectedProcedure, staffProcedure, router } from "../_core/trpc";
import { moneyString, optionalMoneyString, pastOrTodayDate } from "../_core/validators";
import { createExpense, deleteExpense, getExpenses, updateExpense, createAuditEntry } from "../db";

export const expensesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        categoryId: z.number().optional(),
        targetType: z.enum(["general", "category", "head"]).optional(),
        headId: z.number().optional(),
        ownerId: z.number().optional(),
        vendor: z.string().optional(),
      }).optional()
    )
    .query(({ input }) => getExpenses(input ?? {})),

  create: staffProcedure
    .input(
      z.object({
        expenseDate: pastOrTodayDate,
        categoryId: z.number().int().positive(),
        subCategoryId: z.number().int().positive().optional(),
        amount: moneyString,
        targetType: z.enum(["general", "category", "head"]),
        categoryTarget: z.number().int().positive().optional(),
        headId: z.number().int().positive().optional(),
        vendorName: z.string().max(100).optional(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createExpense({
        ...input,
        expenseDate: input.expenseDate as any,
        createdBy: ctx.user?.id,
      });

      await createAuditEntry({
        userId: ctx.user?.id,
        action: "create",
        ipAddress: getClientIp(ctx),
        entityType: "expense",
        entityId: String((result as any).insertId),
        newValues: input as any,
      });

      return result;
    }),

  update: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        amount: optionalMoneyString,
        vendorName: z.string().max(100).optional(),
        notes: z.string().max(2000).optional(),
        categoryId: z.number().int().positive().optional(),
        subCategoryId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const before = (await getExpenses({})).find((e: any) => e.expense?.id === id)?.expense;
      const result = await updateExpense(id, data);
      await createAuditEntry({
        userId: ctx.user?.id,
        action: "update",
        entityType: "expense",
        entityId: String(id),
        oldValues: before ? { amount: before.amount, vendorName: before.vendorName, categoryId: before.categoryId } as any : undefined,
        newValues: data as any,
        ipAddress: getClientIp(ctx),
      });
      return result;
    }),

  delete: staffProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const before = (await getExpenses({})).find((e: any) => e.expense?.id === input.id)?.expense;
      const result = await deleteExpense(input.id, ctx.user?.id);
      await createAuditEntry({
        userId: ctx.user?.id,
        action: "delete",
        entityType: "expense",
        entityId: String(input.id),
        oldValues: before ? { amount: before.amount, vendorName: before.vendorName } as any : undefined,
        ipAddress: getClientIp(ctx),
      });
      return result;
    }),
});
