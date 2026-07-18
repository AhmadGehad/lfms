export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat().format(Number(value ?? 0));
}

export function formatMoney(value: string | number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value));
}
