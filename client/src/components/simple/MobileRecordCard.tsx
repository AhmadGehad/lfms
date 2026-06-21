import * as React from "react";

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface MobileRecordCardField {
  key?: React.Key;
  label: React.ReactNode;
  value: React.ReactNode;
}

export interface MobileRecordCardProps extends Omit<
  React.ComponentProps<typeof Card>,
  "children"
> {
  fields: readonly MobileRecordCardField[];
  actions?: React.ReactNode;
}

function MobileRecordCard({
  fields,
  actions,
  className,
  ...props
}: MobileRecordCardProps) {
  return (
    <Card className={cn("gap-4 py-4", className)} {...props}>
      {fields.length > 0 ? (
        <CardContent className="px-4">
          <dl className="grid gap-3">
            {fields.map((field, index) => (
              <div
                key={field.key ?? index}
                className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-3"
              >
                <dt className="text-muted-foreground min-w-0 break-words text-sm">
                  {field.label}
                </dt>
                <dd className="min-w-0 break-words text-end text-sm">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      ) : null}

      {actions !== undefined && actions !== null ? (
        <CardFooter className="flex-wrap justify-end gap-2 border-t px-4 pt-4">
          {actions}
        </CardFooter>
      ) : null}
    </Card>
  );
}

export { MobileRecordCard };
