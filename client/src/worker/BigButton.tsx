import { cn } from "@/lib/utils";
import type { ComponentProps, ComponentType } from "react";

const TONES = {
  start: "bg-primary text-primary-foreground",
  done: "bg-success text-success-foreground",
  blocked: "border-2 border-warning bg-warning-soft text-warning-soft-foreground",
  plain: "border-2 border-border bg-card text-foreground",
} as const;

/**
 * The tablet's only control: icon plus word, thumb-sized, readable at arm's
 * length with a dirty screen. Pressed state dims rather than moves, so a tap
 * never shifts what's under the next finger.
 */
export function BigButton({
  tone,
  icon: Icon,
  className,
  children,
  ...props
}: ComponentProps<"button"> & {
  tone: keyof typeof TONES;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-[96px] touch-manipulation select-none items-center justify-center gap-4 rounded-2xl px-6 py-4 text-3xl font-bold transition-opacity active:opacity-70 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ring",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden="true" className="h-9 w-9 shrink-0" />}
      <span className="min-w-0 break-words">{children}</span>
    </button>
  );
}
