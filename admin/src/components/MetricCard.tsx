import type { LucideIcon } from "lucide-react";

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "danger";
}) {
  const iconTone = tone === "danger" ? "bg-danger-soft text-danger-soft-foreground" : tone === "warning" ? "bg-warning-soft text-warning-soft-foreground" : "bg-info-soft text-info-soft-foreground";
  return (
    <article className="border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className={`grid h-8 w-8 shrink-0 place-items-center ${iconTone}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      </div>
    </article>
  );
}
