import { z } from "zod";
import { getClientIp } from "../_core/audit";
import { protectedProcedure, staffProcedure, router } from "../_core/trpc";
import { moneyString, optionalMoneyString, pastOrTodayDate } from "../_core/validators";
import { createExpense, deleteExpense, getExpenseById, getExpenses, updateExpense, createAuditEntry } from "../db";

export const expensesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        categoryId: z.number().optional(),
        targetType: z.enum(["general", "category", "head", "herd"]).optional(),
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
        targetType: z.enum(["general", "category", "head", "herd"]),
        categoryTarget: z.number().int().positive().optional(),
        headId: z.number().int().positive().optional(),
        vendorName: z.string().max(100).optional(),
        notes: z.string().max(2000).optional(),
      }).superRefine((data, ctx) => {
        // B4: cross-field consistency — a head expense needs a head, a
        // category expense needs a category; general must have neither.
        if (data.targetType === "head" && !data.headId) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["headId"], message: "headId is required when targetType is 'head'" });
        }
        if (data.targetType === "category" && !data.categoryTarget) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["categoryTarget"], message: "categoryTarget is required when targetType is 'category'" });
        }
        if (data.targetType === "general" && (data.headId || data.categoryTarget)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetType"], message: "General expenses must not specify headId or categoryTarget" });
        }
        if (data.targetType === "herd" && (data.headId || data.categoryTarget)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetType"], message: "Herd (animal-wide) expenses must not specify headId or categoryTarget" });
        }
        if (data.targetType === "head" && data.categoryTarget) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["categoryTarget"], message: "Head expenses must not also specify a categoryTarget" });
        }
        if (data.targetType === "category" && data.headId) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["headId"], message: "Category expenses must not also specify a headId" });
        }
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
        expenseDate: pastOrTodayDate.optional(),
        amount: optionalMoneyString,
        vendorName: z.string().max(100).optional(),
        notes: z.string().max(2000).optional(),
        categoryId: z.number().int().positive().optional(),
        subCategoryId: z.number().int().positive().optional(),
        targetType: z.enum(["general", "category", "head", "herd"]).optional(),
        categoryTarget: z.number().int().positive().optional(),
        headId: z.number().int().positive().optional(),
      }).superRefine((data, ctx) => {
        if (data.targetType === "head" && !data.headId) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["headId"], message: "headId is required when targetType is 'head'" });
        }
        if (data.targetType === "category" && !data.categoryTarget) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["categoryTarget"], message: "categoryTarget is required when targetType is 'category'" });
        }
        if (data.targetType === "general" && (data.headId || data.categoryTarget)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetType"], message: "General expenses must not specify headId or categoryTarget" });
        }
        if (data.targetType === "herd" && (data.headId || data.categoryTarget)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetType"], message: "Herd (animal-wide) expenses must not specify headId or categoryTarget" });
        }
      })
    )
    .mutation(async ({ input: { id, expenseDate, ...data }, ctx }) => {
      const before = await getExpenseById(id);
      const updateData: Record<string, any> = { ...data };
      if (expenseDate) updateData.expenseDate = new Date(expenseDate);
      const result = await updateExpense(id, updateData);
      await createAuditEntry({
        userId: ctx.user?.id,
        action: "update",
        entityType: "expense",
        entityId: String(id),
        oldValues: before ? { amount: before.amount, vendorName: before.vendorName, categoryId: before.categoryId, targetType: before.targetType, expenseDate: before.expenseDate } as any : undefined,
        newValues: data as any,
        ipAddress: getClientIp(ctx),
      });
      return result;
    }),

  delete: staffProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const before = await getExpenseById(input.id);
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
