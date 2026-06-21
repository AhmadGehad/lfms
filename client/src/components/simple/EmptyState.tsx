import * as React from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface EmptyStateProps extends Omit<
  React.ComponentProps<typeof Empty>,
  "title"
> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  headingLevel?: 2 | 3 | 4 | 5 | 6;
}

function EmptyState({
  title,
  description,
  icon,
  headingLevel = 2,
  children,
  className,
  role = "region",
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  ...props
}: EmptyStateProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();

  return (
    <Empty
      data-slot="empty-state"
      role={role}
      aria-labelledby={ariaLabelledBy ?? titleId}
      aria-describedby={
        ariaDescribedBy ?? (description ? descriptionId : undefined)
      }
      className={cn("min-h-56", className)}
      {...props}
    >
      <EmptyHeader>
        {icon ? (
          <EmptyMedia variant="icon" aria-hidden="true">
            {icon}
          </EmptyMedia>
        ) : null}
        <EmptyTitle id={titleId} role="heading" aria-level={headingLevel}>
          {title}
        </EmptyTitle>
        {description ? (
          <EmptyDescription id={descriptionId}>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {children ? <EmptyContent>{children}</EmptyContent> : null}
    </Empty>
  );
}

export { EmptyState };
export type { EmptyStateProps };
