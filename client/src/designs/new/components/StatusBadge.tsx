import { cn } from "@/lib/utils";
import type { ComponentType } from "react";
import { Check, AlertTriangle, XCircle, Info, Circle } from "lucide-react";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONES: Record<StatusTone, { cls: string; icon: ComponentType<{ className?: string }> }> = {
  success: { cls: "bg-success-soft text-success-soft-foreground", icon: Check },
  warning: { cls: "bg-warning-soft text-warning-soft-foreground", icon: AlertTriangle },
  danger: { cls: "bg-danger-soft text-danger-soft-foreground", icon: XCircle },
  info: { cls: "bg-info-soft text-info-soft-foreground", icon: Info },
  neutral: { cls: "bg-secondary text-secondary-foreground", icon: Circle },
};

/**
 * Status pill that conveys state with color PLUS icon + text (WCAG: never
 * color-only) and reads from semantic tokens so dark mode is always correct
 * (fixes F-THEME1 hard-coded bg-green-100 etc.).
 */
export function StatusBadge({
  tone = "neutral",
  children,
  icon = true,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  icon?: boolean;
  className?: string;
}) {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        t.cls,
        className
      )}
    >
      {icon && <Icon className="h-3 w-3 shrink-0" />}
      {children}
    </span>
  );
}
