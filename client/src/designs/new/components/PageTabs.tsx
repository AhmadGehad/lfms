import type { ComponentProps } from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Section tabs for the new design: one underline style everywhere (same look as
 * the animal profile tabs), instead of the segmented shadcn default.
 */
export function PageTabsList({ className, ...props }: ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      className={cn("h-auto min-h-0 w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0 sm:min-h-0", className)}
      {...props}
    />
  );
}

export function PageTabsTrigger({ className, ...props }: ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      className={cn(
        "h-10 min-h-10 flex-none rounded-none border-0 border-b-2 border-transparent px-3 text-muted-foreground shadow-none hover:text-foreground sm:min-h-10 sm:px-3",
        "data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
        "dark:text-muted-foreground dark:data-[state=active]:border-primary dark:data-[state=active]:bg-transparent",
        className
      )}
      {...props}
    />
  );
}
