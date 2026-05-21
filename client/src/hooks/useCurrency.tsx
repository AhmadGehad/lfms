import { trpc } from "@/lib/trpc";
import { useMemo } from "react";

/**
 * Returns the current farm currency (default EGP) and a formatter.
 * Reads from system_settings table; falls back to EGP if not set.
 */
export function useCurrency() {
  const { data: settings } = trpc.config.getSettings.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 min — currency doesn't change often
  });

  const currency = useMemo(() => {
    const row = (settings ?? []).find((s: any) => s.settingKey === "currency");
    return (row?.settingValue ?? "EGP").trim();
  }, [settings]);

  /** Format a number as a currency string (e.g. "EGP 1,234.50"). */
  const fmt = useMemo(() => {
    return (value: number | null | undefined) => {
      if (value == null || isNaN(Number(value))) return `${currency} 0.00`;
      return `${currency} ${Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    };
  }, [currency]);

  /** Format a number without the currency symbol (e.g. "1,234.50"). */
  const fmtNum = (value: number | null | undefined) => {
    if (value == null || isNaN(Number(value))) return "0.00";
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return { currency, fmt, fmtNum };
}
