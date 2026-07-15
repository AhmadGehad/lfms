import { z } from "zod";
import { permissionProcedure, router } from "../_core/trpc";
import { getClientIp } from "../_core/audit";
import { createAuditEntry } from "../db";
import {
  addDirectContribution,
  addProRataFunding,
  createCapitalInvestor,
  finalizeMonthlyAllocation,
  getCapitalSummary,
  getMonthlyAllocationPreview,
  postProfitAdjustment,
  reverseFundingBatch,
  reverseDirectContribution,
} from "../capital";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a valid calendar date");
const money = z.number().finite().positive().max(999999999999);
const signedMoney = z.number().finite().min(-999999999999).max(999999999999).refine(value => value !== 0, "Amount cannot be zero");

export const capitalRouter = router({
  getSummary: permissionProcedure("capital", "view")
    .input(z.object({ ownerId: z.number().int().positive().optional() }).optional())
    .query(({ input }) => getCapitalSummary(input?.ownerId)),

  createInvestor: permissionProcedure("capital", "create")
    .input(z.object({ ownerId: z.number().int().positive(), name: z.string().trim().min(1).max(120), phone: z.string().max(30).optional(), email: z.string().email().max(100).optional(), notes: z.string().max(5000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await createCapitalInvestor(input, ctx.user.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "capital_investor", entityId: String(result.id), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  addDirectContribution: permissionProcedure("capital", "create")
    .input(z.object({ ownerId: z.number().int().positive(), investorId: z.number().int().positive(), amount: money, effectiveDate: date, notes: z.string().max(5000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await addDirectContribution(input, ctx.user.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "capital_contribution", entityId: String(result.id), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  addProRataFunding: permissionProcedure("capital", "create")
    .input(z.object({ ownerId: z.number().int().positive(), amount: money, effectiveDate: date, notes: z.string().max(5000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await addProRataFunding(input, ctx.user.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "capital_funding_batch", entityId: String(result.id), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  reverseFundingBatch: permissionProcedure("capital", "update")
    .input(z.object({ batchId: z.number().int().positive(), effectiveDate: date, notes: z.string().max(5000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await reverseFundingBatch(input, ctx.user.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "capital_funding_batch", entityId: String(result.id), action: "update", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  reverseDirectContribution: permissionProcedure("capital", "update")
    .input(z.object({ contributionId: z.number().int().positive(), effectiveDate: date, notes: z.string().max(5000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await reverseDirectContribution(input, ctx.user.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "capital_contribution", entityId: String(result.id), action: "update", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  previewMonthlyAllocation: permissionProcedure("capital", "view")
    .input(z.object({ ownerId: z.number().int().positive(), periodStart: date, periodEnd: date }))
    .query(({ input }) => getMonthlyAllocationPreview(input.ownerId, input.periodStart, input.periodEnd)),

  finalizeMonthlyAllocation: permissionProcedure("capital", "update")
    .input(z.object({ ownerId: z.number().int().positive(), periodStart: date, periodEnd: date, notes: z.string().max(5000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await finalizeMonthlyAllocation(input, ctx.user.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "capital_profit_allocation", entityId: String(result.id), action: "update", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  postProfitAdjustment: permissionProcedure("capital", "update")
    .input(z.object({ allocationId: z.number().int().positive(), effectiveDate: date, amount: signedMoney, notes: z.string().max(5000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await postProfitAdjustment(input, ctx.user.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "capital_profit_adjustment", entityId: String(result.id), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),
});
