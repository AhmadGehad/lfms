import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { StatusTone } from "./StatusBadge";

export interface QueueItem {
  id: string | number;
  title: React.ReactNode;
  meta?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  action?: React.ReactNode;
  tone?: StatusTone;
}

const TONE_BAR: Record<StatusTone, string> = {
  success: "before:bg-success",
  warning: "before:bg-warning",
  danger: "before:bg-danger",
  info: "before:bg-info",
  neutral: "before:bg-border-strong",
};

/**
 * A "needs attention" queue card for the Action Center dashboard (F-DASH7):
 * pregnancies due, vaccinations overdue, lambs to promote, ready-to-sell,
 * critical feed, unpaid sales. Every row is actionable — the dashboard becomes
 * the daily decision surface instead of a static report.
 */
export function ActionQueue({
  icon: Icon,
  title,
  tone = "neutral",
  count,
  items,
  emptyText = "All clear",
  viewAllHref,
  viewAllLabel = "View all",
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  tone?: StatusTone;
  count?: number;
  items: QueueItem[];
  emptyText?: React.ReactNode;
  viewAllHref?: string;
  viewAllLabel?: React.ReactNode;
}) {
  const [, setLocation] = useLocation();
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-sm)]",
        tone === "danger" && "border-danger/35",
        tone === "warning" && "border-warning/35",
        tone === "success" && "border-success/35",
        tone === "info" && "border-info/35",
        tone === "neutral" && "border-border"
      )}
      aria-label={typeof title === "string" ? title : undefined}
    >
      <header
        className={cn(
          "flex items-center justify-between gap-2 border-b border-border px-4 py-3",
          tone === "danger" && "bg-danger-soft/40",
          tone === "warning" && "bg-warning-soft/40",
          tone === "success" && "bg-success-soft/40",
          tone === "info" && "bg-info-soft/40"
        )}
      >
        <div className="flex items-center gap-2">
          <Icon className={cn(
            "h-4 w-4",
            tone === "danger" && "text-danger",
            tone === "warning" && "text-warning",
            tone === "success" && "text-success",
            tone === "info" && "text-info",
            tone === "neutral" && "text-muted-foreground"
          )} />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {count != null && count > 0 && (
            <span className="rounded-full bg-secondary px-1.5 text-xs font-medium text-secondary-foreground">{count}</span>
          )}
        </div>
        {viewAllHref && items.length > 0 && (
          <button type="button" onClick={() => setLocation(viewAllHref)} className="text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            {viewAllLabel}
          </button>
        )}
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.slice(0, 5).map(item => {
            const clickable = Boolean(item.href || item.onClick);
            const go = () => (item.onClick ? item.onClick() : item.href && setLocation(item.href));
            const rowTone = item.tone ?? tone;
            const rowClass = cn(
              "relative flex w-full items-center justify-between gap-3 px-4 py-2.5 pl-5 text-start",
              "before:absolute before:inset-y-2 before:left-1.5 before:w-1 before:rounded-full",
              TONE_BAR[rowTone]
            );
            return (
              <li key={item.id}>
                {item.action ? (
                  <div className={cn(rowClass, clickable && "hover:bg-card-2")}>
                    {clickable ? (
                      <button
                        type="button"
                        onClick={go}
                        className="min-w-0 flex-1 rounded-md text-start focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                        {item.meta && <p className="truncate text-xs text-muted-foreground">{item.meta}</p>}
                      </button>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                        {item.meta && <p className="truncate text-xs text-muted-foreground">{item.meta}</p>}
                      </div>
                    )}
                    {item.action}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!clickable}
                    className={cn(rowClass, clickable && "hover:bg-card-2 focus-visible:outline-2 focus-visible:outline-ring")}
                    onClick={clickable ? go : undefined}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                      {item.meta && <p className="truncate text-xs text-muted-foreground">{item.meta}</p>}
                    </div>
                    {clickable && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
