import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  animals,
  capitalContributions,
  capitalFundingBatches,
  capitalInvestors,
  capitalProfitAllocationLines,
  capitalProfitAllocations,
  expenses,
  owners,
} from "../drizzle/schema";
import { getDb, getIncomeStatement, type DbOrTx } from "./db";
import { toMajor, toMinor } from "./_core/money";

type LedgerContribution = { investorId: number; kind: "initial" | "direct" | "pro_rata" | "reversal"; amount: string | number; effectiveDate: Date | string };
type Investor = { id: number; name: string; isActive?: boolean };

const dateKey = (value: Date | string) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const dbDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const signedMinor = (row: Pick<LedgerContribution, "kind" | "amount">) => (row.kind === "reversal" ? -1 : 1) * toMinor(row.amount);
const eachDate = (start: string, end: string, fn: (date: string) => void) => {
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    fn(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
};

/** Exact largest-remainder split. The child rows always add up to the batch. */
export function allocateByWeightsMinor(totalMinor: number, weights: Array<{ investorId: number; weight: number }>) {
  const sign = totalMinor < 0 ? -1 : 1;
  const amount = Math.abs(totalMinor);
  const eligible = weights.filter(item => item.weight > 0).sort((a, b) => a.investorId - b.investorId);
  const totalWeight = eligible.reduce((sum, item) => sum + item.weight, 0);
  if (amount === 0 || totalWeight <= 0) return eligible.map(item => ({ investorId: item.investorId, amountMinor: 0 }));
  const splits = eligible.map(item => {
    const exact = amount * item.weight / totalWeight;
    return { investorId: item.investorId, amountMinor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let left = amount - splits.reduce((sum, item) => sum + item.amountMinor, 0);
  for (const item of [...splits].sort((a, b) => b.remainder - a.remainder || a.investorId - b.investorId)) {
    if (!left) break;
    item.amountMinor += 1;
    left--;
  }
  return splits.map(item => ({ investorId: item.investorId, amountMinor: item.amountMinor * sign }));
}

export function ownershipAtDate(investors: Investor[], contributions: LedgerContribution[], asOf: string) {
  const balances = new Map(investors.map(investor => [investor.id, 0]));
  for (const row of contributions) {
    if (dateKey(row.effectiveDate) <= asOf) balances.set(row.investorId, (balances.get(row.investorId) ?? 0) + signedMinor(row));
  }
  const totalMinor = Array.from(balances.values()).reduce((sum, value) => sum + value, 0);
  return investors.map(investor => {
    const contributedMinor = balances.get(investor.id) ?? 0;
    return { investorId: investor.id, contributedMinor, ownershipPct: totalMinor > 0 ? contributedMinor * 100 / totalMinor : 0 };
  });
}

/** Ownership for P&L is the average of the effective daily ownership shares. */
export function dayWeightedOwnership(investors: Investor[], contributions: LedgerContribution[], start: string, end: string) {
  const totalByInvestor = new Map(investors.map(investor => [investor.id, 0]));
  let days = 0;
  eachDate(start, end, day => {
    for (const share of ownershipAtDate(investors, contributions, day)) {
      totalByInvestor.set(share.investorId, (totalByInvestor.get(share.investorId) ?? 0) + share.ownershipPct);
    }
    days++;
  });
  return investors.map(investor => ({ investorId: investor.id, ownershipPct: days ? (totalByInvestor.get(investor.id) ?? 0) / days : 0 }));
}

function assertAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Amount must be greater than zero" });
}

async function assertOpenDate(ownerId: number, effectiveDate: string, db: DbOrTx) {
  const closed = await db.select({ id: capitalProfitAllocations.id })
    .from(capitalProfitAllocations)
    .where(and(eq(capitalProfitAllocations.ownerId, ownerId), eq(capitalProfitAllocations.status, "finalized"), sql`${capitalProfitAllocations.periodEnd} >= ${effectiveDate}`))
    .limit(1);
  if (closed.length) throw new TRPCError({ code: "CONFLICT", message: "This date is in a finalized period. Post a later adjustment instead." });
}

async function getOwnerInvestors(ownerId: number, db?: DbOrTx) {
  const conn = db ?? await getDb();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return conn.select().from(capitalInvestors).where(and(eq(capitalInvestors.ownerId, ownerId), isNull(capitalInvestors.deletedAt))).orderBy(asc(capitalInvestors.name));
}

async function assertOwnerExists(ownerId: number, db: DbOrTx) {
  const owner = await db.select({ id: owners.id }).from(owners).where(and(eq(owners.id, ownerId), isNull(owners.deletedAt))).limit(1);
  if (!owner.length) throw new TRPCError({ code: "NOT_FOUND", message: "Owner pool not found" });
}

/** Every financial mutation locks its owner pool, serializing ledger changes. */
async function lockOwnerPool(ownerId: number, db: DbOrTx) {
  await db.execute(sql`SELECT id FROM owners WHERE id = ${ownerId} FOR UPDATE`);
  await assertOwnerExists(ownerId, db);
}

async function getContributions(ownerId: number, db?: DbOrTx) {
  const conn = db ?? await getDb();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return conn.select().from(capitalContributions).where(eq(capitalContributions.ownerId, ownerId)).orderBy(asc(capitalContributions.effectiveDate), asc(capitalContributions.id));
}

export async function createCapitalInvestor(input: { ownerId: number; name: string; phone?: string; email?: string; notes?: string }, userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  await assertOwnerExists(input.ownerId, db);
  const [result] = await db.insert(capitalInvestors).values({ ...input, createdBy: userId });
  return { id: Number(result.insertId) };
}

export async function addDirectContribution(input: { ownerId: number; investorId: number; amount: number; effectiveDate: string; notes?: string }, userId: number) {
  assertAmount(input.amount);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db.transaction(async tx => {
    await lockOwnerPool(input.ownerId, tx);
    await assertOpenDate(input.ownerId, input.effectiveDate, tx);
    const investor = await tx.select({ id: capitalInvestors.id }).from(capitalInvestors).where(and(eq(capitalInvestors.id, input.investorId), eq(capitalInvestors.ownerId, input.ownerId), isNull(capitalInvestors.deletedAt))).limit(1);
    if (!investor.length) throw new TRPCError({ code: "NOT_FOUND", message: "Investor not found in this owner pool" });
    const [result] = await tx.insert(capitalContributions).values({ ownerId: input.ownerId, investorId: input.investorId, kind: "direct", amount: toMajor(toMinor(input.amount)).toFixed(2), effectiveDate: dbDate(input.effectiveDate), notes: input.notes, createdBy: userId });
    return { id: Number(result.insertId) };
  });
}

export async function addProRataFunding(input: { ownerId: number; amount: number; effectiveDate: string; notes?: string }, userId: number) {
  assertAmount(input.amount);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db.transaction(async tx => {
    await lockOwnerPool(input.ownerId, tx);
    await assertOpenDate(input.ownerId, input.effectiveDate, tx);
    const investors = await getOwnerInvestors(input.ownerId, tx);
    const contributions = await getContributions(input.ownerId, tx);
    const shares = ownershipAtDate(investors, contributions, input.effectiveDate);
    const splits = allocateByWeightsMinor(toMinor(input.amount), shares.map(share => ({ investorId: share.investorId, weight: share.ownershipPct })));
    if (!splits.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Add funded investors before using pro-rata funding" });
    const [batch] = await tx.insert(capitalFundingBatches).values({ ownerId: input.ownerId, kind: "pro_rata", amount: toMajor(toMinor(input.amount)).toFixed(2), effectiveDate: dbDate(input.effectiveDate), notes: input.notes, createdBy: userId });
    await tx.insert(capitalContributions).values(splits.map(split => ({ ownerId: input.ownerId, investorId: split.investorId, batchId: Number(batch.insertId), kind: "pro_rata" as const, amount: toMajor(split.amountMinor).toFixed(2), effectiveDate: dbDate(input.effectiveDate), notes: input.notes, createdBy: userId })));
    return { id: Number(batch.insertId), splits: splits.map(split => ({ ...split, amount: toMajor(split.amountMinor) })) };
  });
}

export async function reverseDirectContribution(input: { contributionId: number; effectiveDate: string; notes?: string }, userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db.transaction(async tx => {
    const original = await tx.select().from(capitalContributions).where(eq(capitalContributions.id, input.contributionId)).limit(1);
    if (!original.length || original[0].kind === "reversal" || original[0].batchId != null) throw new TRPCError({ code: "NOT_FOUND", message: "Direct contribution not found" });
    await lockOwnerPool(original[0].ownerId, tx);
    if (input.effectiveDate < dateKey(original[0].effectiveDate)) throw new TRPCError({ code: "BAD_REQUEST", message: "A reversal cannot predate its original contribution" });
    await assertOpenDate(original[0].ownerId, input.effectiveDate, tx);
    const existing = await tx.select({ id: capitalContributions.id }).from(capitalContributions).where(eq(capitalContributions.reversalOfContributionId, input.contributionId)).limit(1);
    if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "This contribution has already been reversed" });
    const investors = await getOwnerInvestors(original[0].ownerId, tx);
    const contributions = await getContributions(original[0].ownerId, tx);
    const current = ownershipAtDate(investors, contributions, input.effectiveDate).find(item => item.investorId === original[0].investorId)?.contributedMinor ?? 0;
    if (current < toMinor(original[0].amount)) throw new TRPCError({ code: "CONFLICT", message: "Reversal would make contributed capital negative" });
    const [result] = await tx.insert(capitalContributions).values({ ownerId: original[0].ownerId, investorId: original[0].investorId, kind: "reversal", amount: original[0].amount, effectiveDate: dbDate(input.effectiveDate), notes: input.notes, reversalOfContributionId: input.contributionId, createdBy: userId });
    return { id: Number(result.insertId) };
  });
}

export async function reverseFundingBatch(input: { batchId: number; effectiveDate: string; notes?: string }, userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db.transaction(async tx => {
    const batch = await tx.select().from(capitalFundingBatches).where(eq(capitalFundingBatches.id, input.batchId)).limit(1);
    if (!batch.length || batch[0].kind !== "pro_rata") throw new TRPCError({ code: "NOT_FOUND", message: "Funding batch not found" });
    await lockOwnerPool(batch[0].ownerId, tx);
    if (input.effectiveDate < dateKey(batch[0].effectiveDate)) throw new TRPCError({ code: "BAD_REQUEST", message: "A reversal cannot predate its original batch" });
    await assertOpenDate(batch[0].ownerId, input.effectiveDate, tx);
    const alreadyReversed = await tx.select({ id: capitalFundingBatches.id }).from(capitalFundingBatches).where(eq(capitalFundingBatches.reversalOfBatchId, input.batchId)).limit(1);
    if (alreadyReversed.length) throw new TRPCError({ code: "CONFLICT", message: "This funding batch has already been reversed" });
    const children = await tx.select().from(capitalContributions).where(eq(capitalContributions.batchId, input.batchId));
    const investors = await getOwnerInvestors(batch[0].ownerId, tx);
    const contributions = await getContributions(batch[0].ownerId, tx);
    const balances = ownershipAtDate(investors, contributions, input.effectiveDate);
    for (const child of children) {
      const current = balances.find(item => item.investorId === child.investorId)?.contributedMinor ?? 0;
      if (current < toMinor(child.amount)) throw new TRPCError({ code: "CONFLICT", message: "Batch reversal would make an investor's contributed capital negative" });
    }
    const [reversal] = await tx.insert(capitalFundingBatches).values({ ownerId: batch[0].ownerId, kind: "reversal", amount: batch[0].amount, effectiveDate: dbDate(input.effectiveDate), notes: input.notes, reversalOfBatchId: input.batchId, createdBy: userId });
    await tx.insert(capitalContributions).values(children.map(child => ({ ownerId: child.ownerId, investorId: child.investorId, batchId: Number(reversal.insertId), kind: "reversal" as const, amount: child.amount, effectiveDate: dbDate(input.effectiveDate), notes: input.notes, reversalOfContributionId: child.id, createdBy: userId })));
    return { id: Number(reversal.insertId) };
  });
}

function headDays(rows: Array<{ ownerId: number | null; acquisitionDate: Date | string | null; exitDate: Date | string | null }>, ownerId: number, start: string, end: string) {
  const overlap = (from: string, to: string, low: string, high: string) => Math.max(0, Math.floor((Math.min(Date.parse(`${to}T00:00:00Z`), Date.parse(`${high}T00:00:00Z`)) - Math.max(Date.parse(`${from}T00:00:00Z`), Date.parse(`${low}T00:00:00Z`))) / 86400000) + 1);
  let owner = 0; let total = 0;
  for (const animal of rows) {
    const days = overlap(dateKey(animal.acquisitionDate ?? start), dateKey(animal.exitDate ?? end), start, end);
    total += days;
    if (animal.ownerId === ownerId) owner += days;
  }
  return { owner, total };
}

export async function getOwnerCapitalProfitPreview(ownerId: number, periodStart: string, periodEnd: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const income = await getIncomeStatement({ ownerId, fromDate: periodStart, toDate: periodEnd });
  if (!income) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Income statement unavailable" });
  const general = await db.select({ amount: expenses.amount, expenseDate: expenses.expenseDate }).from(expenses)
    .where(and(eq(expenses.targetType, "general"), sql`${expenses.expenseDate} >= ${periodStart}`, sql`${expenses.expenseDate} <= ${periodEnd}`, isNull(expenses.deletedAt)));
  const liveAnimals = await db.select({ ownerId: animals.ownerId, acquisitionDate: animals.acquisitionDate, exitDate: animals.exitDate }).from(animals).where(isNull(animals.deletedAt));
  // Unowned animals remain in the denominator, so their share is not silently
  // charged to an owner capital pool.
  const days = headDays(liveAnimals, ownerId, periodStart, periodEnd);
  const headsOn = (date: string) => {
    let ownerHeads = 0; let totalHeads = 0;
    for (const animal of liveAnimals) {
      const acquired = dateKey(animal.acquisitionDate ?? date);
      const exited = animal.exitDate ? dateKey(animal.exitDate) : null;
      if (acquired > date || (exited && exited < date)) continue;
      totalHeads++;
      if (animal.ownerId === ownerId) ownerHeads++;
    }
    return { ownerHeads, totalHeads };
  };
  const allocatedGeneralMinor = general.reduce((sum, expense) => {
    const heads = headsOn(dateKey(expense.expenseDate));
    return sum + (heads.totalHeads ? Math.round(toMinor(expense.amount) * heads.ownerHeads / heads.totalHeads) : 0);
  }, 0);
  const operatingProfitMinor = toMinor(income.grossProfit) - allocatedGeneralMinor;
  return {
    periodStart, periodEnd,
    operatingProfit: toMajor(operatingProfitMinor),
    sharedOverhead: toMajor(allocatedGeneralMinor),
    headDays: days,
  };
}

export async function getMonthlyAllocationPreview(ownerId: number, periodStart: string, periodEnd: string) {
  const [investors, contributions, profit] = await Promise.all([getOwnerInvestors(ownerId), getContributions(ownerId), getOwnerCapitalProfitPreview(ownerId, periodStart, periodEnd)]);
  const shares = dayWeightedOwnership(investors, contributions, periodStart, periodEnd).filter(item => item.ownershipPct > 0);
  const amountMinor = toMinor(profit.operatingProfit);
  const amounts = allocateByWeightsMinor(amountMinor, shares.map(share => ({ investorId: share.investorId, weight: share.ownershipPct })));
  return { ...profit, lines: amounts.map(amount => ({ investorId: amount.investorId, investorName: investors.find(investor => investor.id === amount.investorId)?.name ?? "Unknown", ownershipPct: shares.find(share => share.investorId === amount.investorId)?.ownershipPct ?? 0, amount: toMajor(amount.amountMinor) })) };
}

export async function finalizeMonthlyAllocation(input: { ownerId: number; periodStart: string; periodEnd: string; notes?: string }, userId: number) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(`${input.periodStart}T00:00:00Z`);
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  if (input.periodStart.slice(8) !== "01" || input.periodEnd !== monthEnd) throw new TRPCError({ code: "BAD_REQUEST", message: "A monthly allocation must cover one full calendar month" });
  if (input.periodEnd >= today) throw new TRPCError({ code: "BAD_REQUEST", message: "Only completed months can be finalized" });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db.transaction(async tx => {
    await lockOwnerPool(input.ownerId, tx);
    const existing = await tx.select({ id: capitalProfitAllocations.id }).from(capitalProfitAllocations).where(and(eq(capitalProfitAllocations.ownerId, input.ownerId), eq(capitalProfitAllocations.kind, "monthly"), eq(capitalProfitAllocations.status, "finalized"), sql`${capitalProfitAllocations.periodStart} <= ${input.periodEnd}`, sql`${capitalProfitAllocations.periodEnd} >= ${input.periodStart}`)).limit(1);
    if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "This period overlaps a finalized allocation" });
    const preview = await getMonthlyAllocationPreview(input.ownerId, input.periodStart, input.periodEnd);
    const [header] = await tx.insert(capitalProfitAllocations).values({ ownerId: input.ownerId, kind: "monthly", status: "finalized", periodStart: dbDate(input.periodStart), periodEnd: dbDate(input.periodEnd), amount: toMajor(toMinor(preview.operatingProfit)).toFixed(2), notes: input.notes, finalizedAt: new Date(), finalizedBy: userId, createdBy: userId });
    if (preview.lines.length) await tx.insert(capitalProfitAllocationLines).values(preview.lines.map(line => ({ allocationId: Number(header.insertId), investorId: line.investorId, ownershipPct: line.ownershipPct.toFixed(6), amount: toMajor(toMinor(line.amount)).toFixed(2) })));
    return { id: Number(header.insertId), ...preview };
  });
}

/** Corrections never mutate a closed month; they post as a later frozen entry. */
export async function postProfitAdjustment(input: { allocationId: number; effectiveDate: string; amount: number; notes?: string }, userId: number) {
  if (!Number.isFinite(input.amount) || input.amount === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Adjustment amount cannot be zero" });
  if (input.effectiveDate > new Date().toISOString().slice(0, 10)) throw new TRPCError({ code: "BAD_REQUEST", message: "An adjustment cannot be future-dated" });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db.transaction(async tx => {
    const original = await tx.select().from(capitalProfitAllocations).where(and(eq(capitalProfitAllocations.id, input.allocationId), eq(capitalProfitAllocations.status, "finalized"))).limit(1);
    if (!original.length) throw new TRPCError({ code: "NOT_FOUND", message: "Finalized allocation not found" });
    await lockOwnerPool(original[0].ownerId, tx);
    if (input.effectiveDate <= dateKey(original[0].periodEnd)) throw new TRPCError({ code: "BAD_REQUEST", message: "Adjustments must post after the closed period" });
    await assertOpenDate(original[0].ownerId, input.effectiveDate, tx);
    const originalLines = await tx.select().from(capitalProfitAllocationLines).where(eq(capitalProfitAllocationLines.allocationId, input.allocationId));
    if (!originalLines.length) throw new TRPCError({ code: "BAD_REQUEST", message: "The original allocation has no investor lines" });
    const amountMinor = toMinor(input.amount);
    const split = allocateByWeightsMinor(amountMinor, originalLines.map(line => ({ investorId: line.investorId, weight: Number(line.ownershipPct) })));
    const [header] = await tx.insert(capitalProfitAllocations).values({ ownerId: original[0].ownerId, kind: "adjustment", status: "finalized", periodStart: dbDate(input.effectiveDate), periodEnd: dbDate(input.effectiveDate), amount: toMajor(amountMinor).toFixed(2), adjustmentOfAllocationId: input.allocationId, notes: input.notes, finalizedAt: new Date(), finalizedBy: userId, createdBy: userId });
    await tx.insert(capitalProfitAllocationLines).values(split.map(item => ({ allocationId: Number(header.insertId), investorId: item.investorId, ownershipPct: (originalLines.find(line => line.investorId === item.investorId)?.ownershipPct ?? "0").toString(), amount: toMajor(item.amountMinor).toFixed(2) })));
    return { id: Number(header.insertId) };
  });
}

export async function getCapitalSummary(ownerId?: number) {
  const db = await getDb();
  if (!db) return { contributedCapital: 0, currentEquity: 0, owners: [], latestAllocation: null };
  const ownerRows = await db.select().from(owners).where(and(isNull(owners.deletedAt), ownerId ? eq(owners.id, ownerId) : sql`1 = 1`)).orderBy(asc(owners.name));
  const result = [] as any[];
  for (const owner of ownerRows) {
    const [investors, contributions, allocations] = await Promise.all([
      getOwnerInvestors(owner.id, db), getContributions(owner.id, db),
      db.select().from(capitalProfitAllocations).where(and(eq(capitalProfitAllocations.ownerId, owner.id), eq(capitalProfitAllocations.status, "finalized"))).orderBy(asc(capitalProfitAllocations.periodEnd)),
    ]);
    const shares = ownershipAtDate(investors, contributions, new Date().toISOString().slice(0, 10));
    const allocationIds = new Set(allocations.map(item => item.id));
    const allocationLines = allocations.length
      ? (await db.select().from(capitalProfitAllocationLines)).filter(line => allocationIds.has(line.allocationId))
      : [];
    const allocationByInvestor = new Map<number, number>();
    for (const line of allocationLines) allocationByInvestor.set(line.investorId, (allocationByInvestor.get(line.investorId) ?? 0) + toMinor(line.amount));
    result.push({ id: owner.id, name: owner.name, investors: investors.map(investor => {
      const share = shares.find(item => item.investorId === investor.id)!;
      const contributedMinor = share?.contributedMinor ?? 0;
      const additionalMinor = contributions.filter(row => {
        if (row.investorId !== investor.id) return false;
        if (row.kind === "direct" || row.kind === "pro_rata") return true;
        if (row.kind !== "reversal" || !row.reversalOfContributionId) return false;
        const original = contributions.find(item => item.id === row.reversalOfContributionId);
        return original?.kind === "direct" || original?.kind === "pro_rata";
      }).reduce((sum, row) => sum + signedMinor(row), 0);
      const allocationMinor = allocationByInvestor.get(investor.id) ?? 0;
      return { ...investor, contributedCapital: toMajor(contributedMinor), additionalFunding: toMajor(additionalMinor), ownershipPct: share?.ownershipPct ?? 0, currentEquity: toMajor(contributedMinor + allocationMinor) };
    }), contributions: contributions.map(row => ({ ...row, amount: toMajor(signedMinor(row)) })), allocations: allocations.map(allocation => ({ ...allocation, lines: allocationLines.filter(line => line.allocationId === allocation.id).map(line => ({ ...line, amount: toMajor(toMinor(line.amount)) })) })) });
  }
  const investors = result.flatMap(owner => owner.investors);
  const allocations = result.flatMap(owner => owner.allocations).sort((a, b) => dateKey(b.periodEnd).localeCompare(dateKey(a.periodEnd)));
  return { contributedCapital: investors.reduce((sum, investor) => sum + investor.contributedCapital, 0), currentEquity: investors.reduce((sum, investor) => sum + investor.currentEquity, 0), owners: result, latestAllocation: allocations[0] ?? null };
}
