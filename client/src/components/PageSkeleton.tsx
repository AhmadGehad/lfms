import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Loading placeholders shaped like the real layouts, so content arrives into
 * the space it will occupy instead of popping in. Shared by the route-level
 * fallbacks and by pages while their first query loads.
 */

export function TableSkeleton({ rows = 6, columns = 5, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <div className={cn("w-full overflow-hidden rounded-xl border bg-card", className)} aria-hidden="true">
      <div className="flex gap-4 border-b px-4 py-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0">
          {Array.from({ length: columns }, (_, col) => (
            <Skeleton key={col} className={cn("h-4 flex-1", col === 0 && "max-w-28")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Placeholder rows for a table whose header is already rendered. */
export function TableRowsSkeleton({ rows = 6, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <TableRow key={row} aria-hidden="true" className="hover:bg-transparent">
          {Array.from({ length: columns }, (_, col) => (
            <TableCell key={col}>
              <Skeleton className={cn("h-4", col === 0 ? "w-24" : "w-full max-w-32")} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function CardGridSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card p-5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-10 w-36 rounded-lg" />
    </div>
  );
}

/** Whole-page placeholder for a page whose code or permissions are still loading. */
export function PageSkeleton({ variant = "table" }: { variant?: "table" | "dashboard" | "detail" | "list" }) {
  return (
    <div className="space-y-6 p-3 md:p-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <HeaderSkeleton />
      {variant === "dashboard" && (
        <>
          <CardGridSkeleton />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </>
      )}
      {variant === "table" && (
        <>
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-10 w-full max-w-sm rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
          <TableSkeleton rows={8} />
        </>
      )}
      {variant === "detail" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      )}
      {variant === "list" && <ListSkeleton rows={6} />}
    </div>
  );
}

/** Placeholder for the sign-in, password and invitation screens. */
export function AuthPageSkeleton() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-6">
        <Skeleton className="mx-auto h-10 w-10 rounded-lg" />
        <Skeleton className="mx-auto h-6 w-40" />
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    </main>
  );
}

/** Skeleton that can sit inside text elements (`<p>`, `<span>`), where a `<div>` is invalid. */
export function InlineSkeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block animate-pulse rounded-md bg-accent align-middle", className)} />;
}
