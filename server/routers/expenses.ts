import { z } from "zod";
import { protectedProcedure, staffProcedure, router } from "../_core/trpc";
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
        expenseDate: z.string(),
        categoryId: z.number(),
        subCategoryId: z.number().optional(),
        amount: z.string(),
        targetType: z.enum(["general", "category", "head"]),
        categoryTarget: z.number().optional(),
        headId: z.number().optional(),
        vendorName: z.string().optional(),
        notes: z.string().optional(),
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
        id: z.number(),
        amount: z.string().optional(),
        vendorName: z.string().optional(),
        notes: z.string().optional(),
        categoryId: z.number().optional(),
        subCategoryId: z.number().optional(),
      })
    )
    .mutation(({ input: { id, ...data } }) => updateExpense(id, data)),

  delete: staffProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteExpense(input.id)),
});
