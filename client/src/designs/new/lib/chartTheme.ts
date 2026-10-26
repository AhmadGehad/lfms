/**
 * Recharts styling that follows the active theme. Recharts' defaults are
 * light-only (white tooltip, #ccc hover bar, series-coloured tooltip text),
 * which reads badly on the dark theme.
 */
export const chartTooltipStyle = {
  borderRadius: 8,
  fontSize: 12,
  background: "var(--card)",
  border: "1px solid var(--border)",
  color: "var(--foreground)",
} as const;

export const chartTooltipLabelStyle = { color: "var(--foreground)", fontWeight: 600 } as const;
export const chartTooltipItemStyle = { color: "var(--foreground)" } as const;

/** Subtle hover band for bar charts in both themes. */
export const chartBarCursor = { fill: "var(--foreground)", fillOpacity: 0.06 } as const;

export const chartAxisTick = { fontSize: 11, fill: "var(--muted-foreground)" } as const;

/** Axis numbers like 500 / 1.5K / 2K — never repeated rounded labels. */
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
export const formatAxisNumber = (v: number) => compact.format(v);
