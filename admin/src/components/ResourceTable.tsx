import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import type { ReactNode } from "react";

export type ResourceColumn<T> = {
  key: string;
  label: string;
  className?: string;
  render: (row: T) => ReactNode;
};

export function ResourceTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  emptyTitle = "No records found",
  onNext,
  onPrevious,
  canNext = false,
  canPrevious = false,
}: {
  rows: readonly T[];
  columns: readonly ResourceColumn<T>[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyTitle?: string;
  onNext?: () => void;
  onPrevious?: () => void;
  canNext?: boolean;
  canPrevious?: boolean;
}) {
  return (
    <div className="overflow-hidden border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {columns.map(column => <TableHead key={column.key} className={`h-9 whitespace-nowrap text-[11px] font-semibold uppercase ${column.className || ""}`}>{column.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 7 }).map((_, index) => (
              <TableRow key={index}>{columns.map(column => <TableCell key={column.key} className="h-12"><Skeleton className="h-4 w-full max-w-32" /></TableCell>)}</TableRow>
            )) : rows.length ? rows.map(row => (
              <TableRow key={rowKey(row)} className="h-12">
                {columns.map(column => <TableCell key={column.key} className={`py-2.5 ${column.className || ""}`}>{column.render(row)}</TableCell>)}
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={columns.length} className="h-52 text-center"><Inbox className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><p className="text-sm font-medium">{emptyTitle}</p><p className="mt-1 text-xs text-muted-foreground">Adjust filters or create a new record.</p></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {(onNext || onPrevious) && (
        <div className="flex h-12 items-center justify-between border-t border-border px-3">
          <p className="text-xs text-muted-foreground">{rows.length} records on this page</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" disabled={!canPrevious} onClick={onPrevious} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" disabled={!canNext} onClick={onNext} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
