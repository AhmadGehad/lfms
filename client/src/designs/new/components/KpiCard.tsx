import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import type { StatusTone } from "./StatusBadge";

export interface KpiTrend {
  /** Signed percentage change, e.g. +12 or -4. */
  pct: number;
  /** Lower is better for this metric (e.g. mortality) — flips the color. */
  invert?: boolean;
}

/**
 * Clickable KPI/stat card (F-DASH1). Unlike the Old static cards, these drill to
 * a filtered list so the dashboard becomes an entry point, not a dead report.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  href,
  onClick,
  hint,
  tone = "neutral",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: LucideIcon;
  trend?: KpiTrend;
  href?: string;
  onClick?: () => void;
  hint?: React.ReactNode;
  tone?: StatusTone;
}) {
  const [, setLocation] = useLocation();
  const clickable = Boolean(href || onClick);
  const activate = () => {
    if (onClick) onClick();
    else if (href) setLocation(href);
  };
  const good = trend ? (trend.invert ? trend.pct <= 0 : trend.pct >= 0) : true;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={clickable ? activate : undefined}
      className={cn(
        "relative flex h-full w-full flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-4 text-left shadow-[var(--shadow-sm)] transition-colors before:absolute before:inset-x-0 before:top-0 before:h-1",
        tone === "success" && "before:bg-success",
        tone === "warning" && "before:bg-warning",
        tone === "danger" && "before:bg-danger",
        tone === "info" && "before:bg-info",
        tone === "neutral" && "before:bg-border-strong",
        clickable ? "hover:border-border-strong hover:bg-card-2 focus-visible:outline-2 focus-visible:outline-ring" : "cursor-default"
      )}
      aria-label={typeof label === "string" ? label : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <span
            className={cn(
              "grid h-8 w-8 place-items-center rounded-lg",
              tone === "success" && "bg-success-soft text-success-soft-foreground",
              tone === "warning" && "bg-warning-soft text-warning-soft-foreground",
              tone === "danger" && "bg-danger-soft text-danger-soft-foreground",
              tone === "info" && "bg-info-soft text-info-soft-foreground",
              tone === "neutral" && "bg-surface text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</div>
      <div className="flex items-center gap-2">
        {trend && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium",
              good ? "text-success-soft-foreground" : "text-danger-soft-foreground"
            )}
          >
            {trend.pct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend.pct)}%
          </span>
        )}
        {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
      </div>
    </button>
  );
}
