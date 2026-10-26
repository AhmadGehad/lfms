import { trpc } from "@/lib/trpc";
import { useMemo } from "react";

/** Thousands-separated amount; shows cents only when there are any (1,250 / 1,250.50). */
export function formatAmount(value: number) {
  const whole = Math.abs(value - Math.round(value)) < 0.005;
  // Always Western digits and comma grouping (0123, 1,250) — even on Arabic
  // browsers — so amounts look the same everywhere in the app.
  return value.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

/**
 * Returns the current farm currency (default EGP) and a formatter.
 * Reads from system_settings table; falls back to EGP if not set.
 */
export function useCurrency() {
  const { data: settings } = trpc.config.getDisplaySettings.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 min — currency doesn't change often
  });

  const currency = useMemo(() => {
    const row = (settings ?? []).find((s: any) => s.settingKey === "currency");
    return (row?.settingValue ?? "EGP").trim();
  }, [settings]);

  /** Format a number as a currency string (e.g. "EGP 1,234" or "EGP 1,234.50"). */
  const fmt = useMemo(() => {
    return (value: number | null | undefined) => {
      if (value == null || isNaN(Number(value))) return `${currency} 0`;
      return `${currency} ${formatAmount(Number(value))}`;
    };
  }, [currency]);

  /** Format a number without the currency symbol (e.g. "1,234.50"). */
  const fmtNum = (value: number | null | undefined) => {
    if (value == null || isNaN(Number(value))) return "0";
    return formatAmount(Number(value));
  };

  return { currency, fmt, fmtNum };
}
