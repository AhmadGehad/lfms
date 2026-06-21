import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type StatCardTone = "default" | "info" | "positive" | "warning" | "destructive";

const toneStyles: Record<StatCardTone, { icon: string; value: string }> = {
  default: {
    icon: "bg-muted text-muted-foreground",
    value: "text-card-foreground",
  },
  info: {
    icon: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    value: "text-blue-700 dark:text-blue-400",
  },
  positive: {
    icon: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    value: "text-emerald-700 dark:text-emerald-400",
  },
  warning: {
    icon: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    value: "text-amber-700 dark:text-amber-400",
  },
  destructive: {
    icon: "bg-destructive/10 text-destructive",
    value: "text-destructive",
  },
};

interface StatCardProps extends Omit<
  React.ComponentProps<typeof Card>,
  "title"
> {
  title: React.ReactNode;
  value: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  tone?: StatCardTone;
}

function StatCard({
  title,
  value,
  description,
  icon,
  loading = false,
  loadingLabel = "Loading…",
  tone = "default",
  className,
  ...props
}: StatCardProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const styles = toneStyles[tone] ?? toneStyles.default;

  return (
    <Card
      data-slot="stat-card"
      data-tone={tone}
      aria-busy={loading}
      aria-labelledby={titleId}
      aria-describedby={!loading && description ? descriptionId : undefined}
      className={cn("gap-0 py-0", className)}
      {...props}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p
              id={titleId}
              className="text-muted-foreground text-sm font-medium text-pretty"
            >
              {title}
            </p>
            {loading ? (
              <div className="mt-3 space-y-2">
                <span className="sr-only">{loadingLabel}</span>
                <Skeleton aria-hidden="true" className="h-8 w-24" />
                {description ? (
                  <Skeleton aria-hidden="true" className="h-4 w-36" />
                ) : null}
              </div>
            ) : (
              <>
                <div
                  className={cn(
                    "mt-1 whitespace-nowrap text-2xl font-bold tracking-tight tabular-nums sm:text-[1.75rem]",
                    styles.value
                  )}
                >
                  {value}
                </div>
                {description ? (
                  <div
                    id={descriptionId}
                    className="text-muted-foreground mt-1 text-xs text-pretty"
                  >
                    {description}
                  </div>
                ) : null}
              </>
            )}
          </div>
          {loading ? (
            <Skeleton
              aria-hidden="true"
              className="size-10 shrink-0 rounded-lg"
            />
          ) : icon ? (
            <span
              aria-hidden="true"
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-5",
                styles.icon
              )}
            >
              {icon}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export { StatCard };
export type { StatCardProps, StatCardTone };
