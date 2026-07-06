/**
 * Pure expense-split math for multi-category allocation. An expense targeted
 * at several animal categories is stored as N independent expense rows (one
 * per category), so every downstream consumer (PnL, owner allocation, export)
 * keeps working on single-target rows. All math is in integer minor units;
 * row amounts always sum EXACTLY to the entered total.
 */

export type SplitMode = "headcount" | "equal";

export type SplitTarget = { categoryId: number; headCount: number };

export type ExpenseSplitRow = { categoryTarget: number | null; amountMinor: number };

/**
 * Largest-remainder allocation of `totalMinor` across `weights`: floors the
 * proportional shares, then hands the leftover minor units (one each) to the
 * largest fractional remainders, ties broken by lowest index. Parts sum
 * exactly to totalMinor. Non-positive total weight returns all zeros.
 */
export function allocateMinor(totalMinor: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((a, w) => a + w, 0);
  if (weights.length === 0) return [];
  if (totalWeight <= 0 || totalMinor <= 0) return weights.map(() => 0);

  const raw = weights.map(w => (totalMinor * w) / totalWeight);
  const parts = raw.map(Math.floor);
  let leftover = totalMinor - parts.reduce((a, p) => a + p, 0);

  const order = raw
    .map((r, i) => ({ frac: r - Math.floor(r), i }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (leftover <= 0) break;
    parts[i] += 1;
    leftover -= 1;
  }
  return parts;
}

/**
 * Split an expense amount across its target animal categories. No targets
 * (general/herd/head expenses) → one row with a null categoryTarget.
 * "headcount" weighs by active heads per category (falling back to an equal
 * split when every category has zero heads); "equal" splits evenly. Rows that
 * round to zero are dropped — the surviving rows still sum to amountMinor.
 */
export function computeExpenseSplits(
  amountMinor: number,
  targets: SplitTarget[] | null | undefined,
  splitMode: SplitMode,
): ExpenseSplitRow[] {
  if (!targets || targets.length === 0) {
    return amountMinor > 0 ? [{ categoryTarget: null, amountMinor }] : [];
  }

  let weights =
    splitMode === "headcount" ? targets.map(t => Math.max(0, t.headCount)) : targets.map(() => 1);
  // Every selected category empty on the expense date — an all-zero weighting
  // would drop the whole expense, so degrade to an equal split instead.
  if (weights.every(w => w === 0)) weights = targets.map(() => 1);

  const parts = allocateMinor(amountMinor, weights);
  return targets
    .map((t, i) => ({ categoryTarget: t.categoryId, amountMinor: parts[i] }))
    .filter(r => r.amountMinor > 0);
}
