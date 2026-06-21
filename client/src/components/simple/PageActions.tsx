import * as React from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type PageActionsBaseProps = Omit<React.ComponentProps<"div">, "children"> & {
  allowed: boolean;
  children: React.ReactNode;
};

type PageActionsProps = PageActionsBaseProps &
  (
    | {
        deniedBehavior?: "hide";
        deniedReason?: React.ReactNode;
      }
    | {
        deniedBehavior: "disable";
        deniedReason: React.ReactNode;
      }
  );

function PageActions({
  allowed,
  deniedBehavior = "hide",
  deniedReason,
  children,
  className,
  role = "group",
  onClick,
  onClickCapture,
  onKeyDown,
  onKeyDownCapture,
  ...props
}: PageActionsProps) {
  const reasonId = React.useId();

  if (!allowed && deniedBehavior === "hide") {
    return null;
  }

  if (allowed) {
    return (
      <div
        {...props}
        data-slot="page-actions"
        role={role}
        className={cn("flex flex-wrap items-center gap-2", className)}
        onClick={onClick}
        onClickCapture={onClickCapture}
        onKeyDown={onKeyDown}
        onKeyDownCapture={onKeyDownCapture}
      >
        {children}
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          {...props}
          data-slot="page-actions"
          data-disabled="true"
          role={role}
          tabIndex={0}
          aria-disabled="true"
          aria-describedby={reasonId}
          className={cn(
            "inline-flex cursor-not-allowed rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            className
          )}
          onClickCapture={event => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDownCapture={event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          <div
            data-slot="page-actions-content"
            inert
            aria-hidden="true"
            className="pointer-events-none flex flex-wrap items-center gap-2 opacity-50"
          >
            {children}
          </div>
          <span id={reasonId} className="sr-only">
            {deniedReason}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent aria-hidden="true" side="bottom">
        {deniedReason}
      </TooltipContent>
    </Tooltip>
  );
}

export { PageActions };
export type { PageActionsProps };
