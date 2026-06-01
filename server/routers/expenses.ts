import { z } from "zod";
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
    .mutation(({ input: { id, ...data } }) => updateExpense(id, data)),

  delete: staffProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteExpense(input.id)),
});
