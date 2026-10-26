import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowDownRight, ArrowUpRight, Info, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
 * `info` adds an ⓘ button explaining what the number means (tap-friendly popover).
 * The click target is an overlay button so the ⓘ button isn't nested inside it.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  href,
  onClick,
  hint,
  info,
  tone = "neutral",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: LucideIcon;
  trend?: KpiTrend;
  href?: string;
  onClick?: () => void;
  hint?: React.ReactNode;
  info?: React.ReactNode;
  tone?: StatusTone;
}) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const clickable = Boolean(href || onClick);
  const activate = () => {
    if (onClick) onClick();
    else if (href) setLocation(href);
  };
  const good = trend ? (trend.invert ? trend.pct <= 0 : trend.pct >= 0) : true;

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-4 text-start shadow-[var(--shadow-sm)] transition-colors before:absolute before:inset-x-0 before:top-0 before:h-1",
        tone === "success" && "before:bg-success",
        tone === "warning" && "before:bg-warning",
        tone === "danger" && "before:bg-danger",
        tone === "info" && "before:bg-info",
        tone === "neutral" && "before:bg-border-strong",
        clickable && "hover:border-border-strong hover:bg-card-2 has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:outline-ring"
      )}
    >
      {clickable && (
        <button
          type="button"
          onClick={activate}
          className="absolute inset-0 rounded-xl focus-visible:outline-none"
          aria-label={typeof label === "string" ? label : undefined}
        />
      )}
      <div className="pointer-events-none relative flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground">
          <span className="truncate">{label}</span>
          {info && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="pointer-events-auto -m-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label={t("common.whatDoesThisMean", "What does this mean?")}
                >
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 text-xs leading-relaxed text-foreground">
                {info}
              </PopoverContent>
            </Popover>
          )}
        </span>
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
      <div className="pointer-events-none relative whitespace-nowrap text-lg font-bold tabular-nums tracking-tight text-foreground sm:text-2xl">{value}</div>
      <div className="pointer-events-none relative flex items-center gap-2">
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
    </div>
  );
}
