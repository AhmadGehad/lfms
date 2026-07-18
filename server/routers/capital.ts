import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { permissionProcedure, router } from "../_core/trpc";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const money = z.number().finite().positive().max(999999999999);
const signedMoney = z.number().finite().min(-999999999999).max(999999999999).refine(value => value !== 0, "Amount cannot be zero");

/**
 * The old capital ledger is a legacy, global data set without a company key.
 * It must never be reachable from a tenant request. Keep this router's public
 * contract while a company-scoped capital ledger is introduced in saas_*.
 */
export function legacyCapitalUnavailable(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Capital is temporarily unavailable while tenant-isolated capital records are completed.",
  });
}

export const capitalRouter = router({
  getSummary: permissionProcedure("capital", "view")
    .input(z.object({ ownerId: z.number().int().positive().optional() }).optional())
    .query((): any => legacyCapitalUnavailable()),

  createInvestor: permissionProcedure("capital", "create")
    .input(z.object({ ownerId: z.number().int().positive(), name: z.string().trim().min(1).max(120), phone: z.string().max(30).optional(), email: z.string().email().max(100).optional(), notes: z.string().max(5000).optional() }))
    .mutation(() => legacyCapitalUnavailable()),

  addDirectContribution: permissionProcedure("capital", "create")
    .input(z.object({ ownerId: z.number().int().positive(), investorId: z.number().int().positive(), amount: money, effectiveDate: date, notes: z.string().max(5000).optional() }))
    .mutation(() => legacyCapitalUnavailable()),

  addProRataFunding: permissionProcedure("capital", "create")
    .input(z.object({ ownerId: z.number().int().positive(), amount: money, effectiveDate: date, notes: z.string().max(5000).optional() }))
    .mutation(() => legacyCapitalUnavailable()),

  reverseFundingBatch: permissionProcedure("capital", "update")
    .input(z.object({ batchId: z.number().int().positive(), effectiveDate: date, notes: z.string().max(5000).optional() }))
    .mutation(() => legacyCapitalUnavailable()),

  reverseDirectContribution: permissionProcedure("capital", "update")
    .input(z.object({ contributionId: z.number().int().positive(), effectiveDate: date, notes: z.string().max(5000).optional() }))
    .mutation(() => legacyCapitalUnavailable()),

  previewMonthlyAllocation: permissionProcedure("capital", "view")
    .input(z.object({ ownerId: z.number().int().positive(), periodStart: date, periodEnd: date }))
    .query((): any => legacyCapitalUnavailable()),

  finalizeMonthlyAllocation: permissionProcedure("capital", "update")
    .input(z.object({ ownerId: z.number().int().positive(), periodStart: date, periodEnd: date, notes: z.string().max(5000).optional() }))
    .mutation(() => legacyCapitalUnavailable()),

  postProfitAdjustment: permissionProcedure("capital", "update")
    .input(z.object({ allocationId: z.number().int().positive(), effectiveDate: date, amount: signedMoney, notes: z.string().max(5000).optional() }))
    .mutation(() => legacyCapitalUnavailable()),
});
