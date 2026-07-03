import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer group relative grid size-11 shrink-0 place-items-center rounded-md border border-transparent text-primary-foreground transition-shadow outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 sm:size-4 sm:rounded-[4px]",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-4 rounded-[4px] border border-input shadow-xs group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary group-aria-invalid:border-destructive group-aria-invalid:ring-destructive/20 dark:bg-input/30 dark:group-data-[state=checked]:bg-primary"
      />
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="relative z-10 flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
