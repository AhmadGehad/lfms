/**
 * Money helpers — avoid binary floating-point error in financial math.
 *
 * The DB stores money as DECIMAL(scale 2). When we read it into JS, doing
 * arithmetic with the native `number` type accumulates error (0.1 + 0.2 !==
 * 0.3). To stay exact, we convert money to INTEGER MINOR UNITS (piastres,
 * 1/100 of a currency unit), do all addition/subtraction in integers, and
 * only convert back to a 2-decimal major-unit number at the boundary.
 *
 * Multiplication by a non-money factor (days, head count, quantity, price)
 * is done in minor units and rounded once, at the end, with banker-safe
 * half-up rounding — never as a chain of float operations.
 */

/** Parse a decimal money string/number into integer minor units (piastres). */
export function toMinor(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(n)) return 0;
  // Round to nearest minor unit to absorb any representational dust.
  return Math.round(n * 100);
}

/** Convert integer minor units back to a major-unit number with 2 decimals. */
export function toMajor(minor: number): number {
  return Math.round(minor) / 100;
}

/** Sum a list of money values (strings/numbers) exactly, return minor units. */
export function sumMinor(values: Array<string | number | null | undefined>): number {
  let acc = 0;
  for (const v of values) acc += toMinor(v);
  return acc;
}

/**
 * Multiply a money amount by a dimensionless factor (e.g. price × quantity)
 * and return integer minor units, rounded once. `amount` is a major-unit
 * money value; `factor` is a plain number (days, kg, head count, etc.).
 */
export function mulMoney(amount: string | number, factor: number): number {
  const minor = toMinor(amount);
  return Math.round(minor * factor);
}

/**
 * Multiply two plain rates and a money price into minor units in one shot:
 *   qty (kg/day) × days × pricePerUnit (money) -> minor units.
 * Keeps the single rounding at the end rather than compounding floats.
 */
export function feedLineMinor(qtyPerDay: number, days: number, pricePerUnit: string | number): number {
  const priceMinor = toMinor(pricePerUnit);
  return Math.round(priceMinor * qtyPerDay * days);
}

/** Divide minor units by a positive integer (e.g. allocate across N head), rounded. */
export function divMinor(minor: number, divisor: number): number {
  if (!divisor) return 0;
  return Math.round(minor / divisor);
}
