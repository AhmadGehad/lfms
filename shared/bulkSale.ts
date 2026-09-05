import { toMajor, toMinor } from "../server/_core/money";
import { allocateMinor } from "../server/expenseSplit";

type SaleRow = { id: number; salePrice?: string; amountPaid?: string; weightAtSale?: string };

/** One quote for preview and persistence. Charge shares sum to the exact entered amount. */
export function calculateBulkSale(input: SaleRow[], pricePerKg?: string, extraCharge?: string) {
  const decimal = (value: string, max: number, positive = false) => {
    if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) > max || (positive && Number(value) <= 0)) {
      throw new Error("Enter valid amounts and weights with at most two decimal places");
    }
    return Number(value);
  };
  if (new Set(input.map(row => row.id)).size !== input.length) throw new Error("Duplicate animal selection");
  const rate = pricePerKg ? decimal(pricePerKg, 99_999_999.99, true) : undefined;
  const chargeMinor = toMinor(extraCharge ? decimal(extraCharge, 99_999_999.99) : 0);
  if (chargeMinor > 0 && input.length === 0) throw new Error("Select at least one animal");
  const weights = input.map(row => row.weightAtSale ? decimal(row.weightAtSale, 2000, true) : 0);
  const base = input.map((row, i) => {
    if (rate !== undefined) {
      if (!weights[i]) throw new Error("Enter a weight for every animal");
      return Math.round((toMinor(rate) * toMinor(weights[i])) / 100);
    }
    if (chargeMinor > 0 && !row.salePrice) throw new Error("Enter a sale price for every animal");
    return toMinor(row.salePrice ? decimal(row.salePrice, 99_999_999.99) : 0);
  });
  const shares = allocateMinor(chargeMinor, base.some(value => value > 0) ? base : base.map(() => 1));
  const rows = input.map((row, i) => {
    const priceMinor = base[i] + shares[i];
    if (priceMinor > 9_999_999_999) throw new Error("Calculated sale price is too large");
    if (weights[i] && Math.round(priceMinor / weights[i]) > 9_999_999_999) {
      throw new Error("Calculated price per kg is too large");
    }
    const paidMinor = row.amountPaid ? toMinor(decimal(row.amountPaid, 99_999_999.99)) : priceMinor;
    if (paidMinor > priceMinor) throw new Error("Amount paid exceeds sale price");
    return {
      ...row,
      weightAtSale: row.weightAtSale || undefined,
      salePrice: rate !== undefined || row.salePrice || chargeMinor > 0 ? toMajor(priceMinor).toFixed(2) : undefined,
      amountPaid: row.amountPaid ? toMajor(paidMinor).toFixed(2) : undefined,
      extraCharge: toMajor(shares[i]).toFixed(2),
    };
  });
  const subtotalMinor = base.reduce((sum, value) => sum + value, 0);
  return {
    rows,
    subtotal: toMajor(subtotalMinor),
    extraCharge: toMajor(chargeMinor),
    total: toMajor(subtotalMinor + chargeMinor),
    paid: toMajor(rows.reduce((sum, row) => sum + toMinor(row.amountPaid ?? row.salePrice), 0)),
    weight: toMajor(weights.reduce((sum, weight) => sum + toMinor(weight), 0)),
  };
}
