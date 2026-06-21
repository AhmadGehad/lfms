import * as React from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AccessibleName =
  | {
      "aria-label": string;
      "aria-labelledby"?: never;
    }
  | {
      "aria-label"?: never;
      "aria-labelledby": string;
    };

type PageShellProps = React.ComponentProps<"div">;

function PageShell({ className, ...props }: PageShellProps) {
  return (
    <div
      data-slot="page-shell"
      className={cn("space-y-4 p-3 md:space-y-6 md:p-6", className)}
      {...props}
    />
  );
}

interface PageHeaderProps extends Omit<
  React.ComponentProps<"header">,
  "title"
> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  headingId?: string;
}

function PageHeader({
  title,
  description,
  icon,
  actions,
  headingId,
  children,
  className,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: PageHeaderProps) {
  const generatedHeadingId = React.useId();
  const resolvedHeadingId = headingId ?? generatedHeadingId;

  return (
    <header
      data-slot="page-header"
      aria-labelledby={ariaLabelledBy ?? resolvedHeadingId}
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? (
            <span
              aria-hidden="true"
              className="text-primary flex shrink-0 items-center justify-center"
            >
              {icon}
            </span>
          ) : null}
          <h1
            id={resolvedHeadingId}
            className="min-w-0 break-words text-xl font-bold tracking-tight text-balance sm:text-2xl"
          >
            {title}
          </h1>
        </div>
        {description ? (
          <div className="text-muted-foreground mt-1 text-sm text-pretty">
            {description}
          </div>
        ) : null}
        {children}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

type PageToolbarProps = Omit<
  React.ComponentProps<"div">,
  "aria-label" | "aria-labelledby"
> &
  AccessibleName;

function PageToolbar({
  className,
  role = "group",
  ...props
}: PageToolbarProps) {
  return (
    <div
      data-slot="page-toolbar"
      role={role}
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      {...props}
    />
  );
}

type FilterBarProps = Omit<
  React.ComponentProps<typeof Card>,
  "aria-label" | "aria-labelledby"
> &
  AccessibleName;

function FilterBar({ className, role = "group", ...props }: FilterBarProps) {
  return (
    <Card
      data-slot="filter-bar"
      role={role}
      className={cn(
        "flex-row flex-wrap items-center gap-3 px-4 py-4",
        className
      )}
      {...props}
    />
  );
}

export { FilterBar, PageHeader, PageShell, PageToolbar };
export type {
  FilterBarProps,
  PageHeaderProps,
  PageShellProps,
  PageToolbarProps,
};
