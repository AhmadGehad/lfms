import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useMobile";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Filter, Rows3, Rows4, SlidersHorizontal } from "lucide-react";
import { EmptyState } from "./EmptyState";

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  /** Can be toggled off via the column menu. */
  hideable?: boolean;
  defaultHidden?: boolean;
  /** Label used in the mobile card layout. */
  mobileLabel?: string;
  /** Marks the field shown as the card title on mobile. */
  primary?: boolean;
  align?: "start" | "end" | "center";
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  /** Mobile cards: replaces `rowActions` (e.g. a single ⋯ menu). */
  mobileRowActions?: (row: T) => ReactNode;
  /** Mobile cards: only these column ids appear under the title. */
  mobileColumns?: string[];
  selection?: { selectedKeys: Set<string | number>; onChange: (keys: Set<string | number>) => void };
  bulkBar?: (selected: T[]) => ReactNode;
  empty?: ReactNode;
  pageSize?: number;
  toolbar?: ReactNode;
  /**
   * Secondary filter controls. Shown inline with the toolbar on desktop; on phones
   * they fold behind a "Filters" button so the list is visible without scrolling.
   */
  filters?: ReactNode;
  /** How many filters differ from their defaults — badges the phone "Filters" button. */
  activeFilterCount?: number;
  /** Initial sort, e.g. newest first for dated logs. */
  defaultSort?: { id: string; dir: "asc" | "desc" };
  /** Persists density / hidden columns / page under this key. */
  storageKey?: string;
}

type Density = "comfortable" | "compact";

function loadPref<T>(key: string | undefined, sub: string, fallback: T): T {
  if (!key || typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(`dt:${key}:${sub}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function savePref(key: string | undefined, sub: string, value: unknown) {
  if (!key || typeof window === "undefined") return;
  localStorage.setItem(`dt:${key}:${sub}`, JSON.stringify(value));
}

/**
 * One DataTable pattern reused across every New list (F-TBL5/DENSITY/BULK1/
 * MOBILE1). Pagination, sticky header, sortable columns, density toggle,
 * optional columns, visible row actions, multi-select + bulk bar, and a mobile
 * card layout — with density/columns persisted (saved-view seed).
 */
export function DataTable<T>({
  data,
  columns,
  rowKey,
  loading,
  onRowClick,
  rowActions,
  mobileRowActions,
  mobileColumns,
  selection,
  bulkBar,
  empty,
  pageSize: pageSizeProp = 25,
  toolbar,
  filters,
  activeFilterCount = 0,
  defaultSort,
  storageKey,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [density, setDensity] = useState<Density>(() => loadPref(storageKey, "density", "comfortable"));
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(loadPref<string[]>(storageKey, "hidden", columns.filter(c => c.defaultHidden).map(c => c.id)))
  );
  const [pageSize, setPageSize] = useState<number>(() => loadPref(storageKey, "pageSize", pageSizeProp));
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ id: string; dir: "asc" | "desc" } | null>(defaultSort ?? null);

  const visibleColumns = columns.filter(c => !hidden.has(c.id));

  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find(c => c.id === sort.id);
    if (!col?.sortValue) return data;
    const sv = col.sortValue;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = sv(a), bv = sv(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [data, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleHidden = (id: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      savePref(storageKey, "hidden", Array.from(next));
      return next;
    });
  };
  const setDensityP = (d: Density) => { setDensity(d); savePref(storageKey, "density", d); };
  const toggleSort = (id: string) => {
    setSort(prev => (prev?.id === id ? (prev.dir === "asc" ? { id, dir: "desc" } : null) : { id, dir: "asc" }));
  };

  // Selection helpers
  const selectedKeys = selection?.selectedKeys ?? new Set();
  const allOnPageSelected = pageRows.length > 0 && pageRows.every(r => selectedKeys.has(rowKey(r)));
  const toggleAllOnPage = () => {
    if (!selection) return;
    const next = new Set(selectedKeys);
    if (allOnPageSelected) pageRows.forEach(r => next.delete(rowKey(r)));
    else pageRows.forEach(r => next.add(rowKey(r)));
    selection.onChange(next);
  };
  const toggleRow = (r: T) => {
    if (!selection) return;
    const next = new Set(selectedKeys);
    const k = rowKey(r);
    next.has(k) ? next.delete(k) : next.add(k);
    selection.onChange(next);
  };
  const selectedRows = selection ? data.filter(r => selectedKeys.has(rowKey(r))) : [];

  const cellPad = density === "compact" ? "px-3 py-1.5" : "px-3 py-2.5";

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2 [&_button]:min-h-11 [&_input]:min-h-11 sm:[&_button]:min-h-9 sm:[&_input]:min-h-9">
          {toolbar}
          {filters && !isMobile && filters}
        </div>
        <div className="flex items-center gap-1">
          {filters && isMobile && (
            <button
              type="button"
              onClick={() => setFiltersOpen(o => !o)}
              aria-expanded={filtersOpen}
              className={cn(
                "flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
                filtersOpen || activeFilterCount > 0 ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border text-muted-foreground"
              )}
            >
              <Filter className="h-4 w-4" aria-hidden="true" />
              {t("common.filters", "Filters")}
              {activeFilterCount > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{activeFilterCount}</span>}
            </button>
          )}
          <button
            onClick={() => setDensityP(density === "compact" ? "comfortable" : "compact")}
            className="grid h-11 w-11 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-surface sm:h-9 sm:w-9"
            aria-label={t("table.toggleDensity", "Toggle density")}
            title={t("table.density", "Density")}
          >
            {density === "compact" ? <Rows3 className="h-4 w-4" /> : <Rows4 className="h-4 w-4" />}
          </button>
          {columns.some(c => c.hideable) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                <button className="grid h-11 w-11 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-surface sm:h-9 sm:w-9" aria-label={t("table.columns", "Columns")}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>{t("table.columns", "Columns")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columns.filter(c => c.hideable).map(c => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={!hidden.has(c.id)}
                    onCheckedChange={() => toggleHidden(c.id)}
                    onSelect={e => e.preventDefault()}
                  >
                    {c.mobileLabel ?? (typeof c.header === "string" ? c.header : c.id)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {filters && isMobile && filtersOpen && (
        <div className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-card p-3 [&_button]:min-h-11 [&_input]:min-h-11 [&>*]:!w-full">
          {filters}
        </div>
      )}

      {/* Bulk bar */}
      {selection && selectedRows.length > 0 && bulkBar && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary-soft px-3 py-2 text-sm text-primary-soft-foreground">
          <span className="font-medium">{t("table.selectedCount", { count: selectedRows.length, defaultValue: "{{count}} selected" })}</span>
          <div className="flex items-center gap-2 [&_button]:min-h-11 sm:[&_button]:min-h-8">{bulkBar(selectedRows)}</div>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
        </div>
      ) : sorted.length === 0 ? (
        empty ?? <EmptyState title={t("common.noneYet", "Nothing here yet")} />
      ) : isMobile ? (
        /* Mobile card layout */
        <div className="flex flex-col gap-2">
          {pageRows.map(row => {
            const primary = visibleColumns.find(c => c.primary);
            const cardActions = mobileRowActions ?? rowActions;
            const cardColumns = visibleColumns.filter(c => !c.primary && (!mobileColumns || mobileColumns.includes(c.id)));
            return (
              <div
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-sm)]",
                  onRowClick && "cursor-pointer active:bg-card-2 focus-within:ring-2 focus-within:ring-ring"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {selection && (
                      <span onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selectedKeys.has(rowKey(row))} onCheckedChange={() => toggleRow(row)} />
                      </span>
                    )}
                    {primary && <span className="font-semibold text-foreground">{primary.cell(row)}</span>}
                  </div>
                    {cardActions && (
                      <span
                        className="flex items-center gap-1 [&_button]:min-h-11 [&_button]:min-w-11 sm:[&_button]:min-h-8 sm:[&_button]:min-w-8"
                        onClick={e => e.stopPropagation()}
                      >
                        {cardActions(row)}
                      </span>
                    )}
                </div>
                <dl className={cn("mt-2 grid gap-x-3 gap-y-1.5", mobileColumns && mobileColumns.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
                  {cardColumns.map(c => (
                    <div key={c.id} className="min-w-0">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.mobileLabel ?? (typeof c.header === "string" ? c.header : "")}</dt>
                      <dd className="truncate text-sm text-foreground">{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop table */
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border text-start">
                {selection && (
                  <th className={cn("w-10", cellPad)}>
                    <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAllOnPage} aria-label={t("table.selectAll", "Select all")} />
                  </th>
                )}
                {visibleColumns.map(c => (
                  <th key={c.id} className={cn("whitespace-nowrap font-semibold text-muted-foreground", cellPad, c.align === "end" ? "text-end" : c.align === "center" ? "text-center" : "text-start", c.className)}>
                    {c.sortValue ? (
                      <button onClick={() => toggleSort(c.id)} className="inline-flex items-center gap-1 hover:text-foreground">
                        {c.header}
                        {sort?.id === c.id && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
                {rowActions && <th className={cn("w-px", cellPad)} />}
              </tr>
            </thead>
            <tbody>
              {pageRows.map(row => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? e => { if (e.key === "Enter") onRowClick(row); } : undefined}
                  className={cn(
                    "border-b border-border last:border-0 transition-colors",
                    onRowClick && "cursor-pointer hover:bg-card-2 focus-visible:bg-card-2 focus-visible:outline-2 focus-visible:outline-ring"
                  )}
                >
                  {selection && (
                    <td className={cellPad} onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selectedKeys.has(rowKey(row))} onCheckedChange={() => toggleRow(row)} />
                    </td>
                  )}
                  {visibleColumns.map(c => (
                    <td key={c.id} className={cn("text-foreground", cellPad, c.align === "end" && "text-end tabular-nums", c.align === "center" && "text-center", c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                  {rowActions && (
                    <td className={cn("text-end", cellPad)} onClick={e => e.stopPropagation()}>
                      {rowActions(row)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pager */}
      {sorted.length > pageSize && (
        <Pagination className="justify-between">
          <span className="text-xs text-muted-foreground">
            {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} {t("table.of", "of")} {sorted.length}
          </span>
          <PaginationContent>
            <PaginationItem>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="grid h-11 w-11 place-items-center rounded-lg border border-border disabled:opacity-40 hover:bg-surface sm:h-9 sm:w-9"
                aria-label={t("table.previousPage", "Previous page")}
              >
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
              </button>
            </PaginationItem>
            <PaginationItem>
              <span className="px-2 text-sm text-muted-foreground">{safePage + 1} / {pageCount}</span>
            </PaginationItem>
            <PaginationItem>
              <button
                onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="grid h-11 w-11 place-items-center rounded-lg border border-border disabled:opacity-40 hover:bg-surface sm:h-9 sm:w-9"
                aria-label={t("table.nextPage", "Next page")}
              >
                <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              </button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
