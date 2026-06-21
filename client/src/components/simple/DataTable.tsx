import * as React from "react";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";

import {
  MobileRecordCard,
  type MobileRecordCardField,
} from "@/components/simple/MobileRecordCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export type DataTableSortDirection = "asc" | "desc";

export interface DataTableColumn<T> {
  key: React.Key;
  header: React.ReactNode;
  render: (row: T, rowIndex: number) => React.ReactNode;
  mobileLabel?: React.ReactNode;
  hideOnMobile?: boolean;
  sortKey?: string;
}

export interface DataTablePaginationData {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T, rowIndex: number) => React.Key;
  loading?: boolean;
  emptyContent?: React.ReactNode;
  pagination?: DataTablePaginationData;
  sortKey?: string;
  sortDirection?: DataTableSortDirection;
  onSort?: (sortKey: string, direction: DataTableSortDirection) => void;
  renderMobileActions?: (row: T, rowIndex: number) => React.ReactNode;
  className?: string;
}

interface SortIndicatorProps {
  direction?: DataTableSortDirection;
}

function SortIndicator({ direction }: SortIndicatorProps) {
  if (direction === "asc") {
    return <ArrowUpIcon aria-hidden="true" />;
  }

  if (direction === "desc") {
    return <ArrowDownIcon aria-hidden="true" />;
  }

  return <ArrowUpDownIcon aria-hidden="true" />;
}

function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
}: DataTablePaginationData) {
  const { t, i18n } = useTranslation();
  const totalPages =
    pageSize > 0 ? Math.ceil(Math.max(0, total) / pageSize) : 0;

  if (totalPages <= 1) {
    return null;
  }

  const hasPreviousPage = page > 1;
  const hasNextPage = page < totalPages;
  const isRtl = i18n.dir() === "rtl";
  const PreviousIcon = isRtl ? ChevronRightIcon : ChevronLeftIcon;
  const NextIcon = isRtl ? ChevronLeftIcon : ChevronRightIcon;

  return (
    <Pagination aria-label={t("common.pageOf", { page, total: totalPages })}>
      <PaginationContent>
        <PaginationItem>
          <Button
            type="button"
            variant="outline"
            size="default"
            aria-label={t("common.previous")}
            disabled={!hasPreviousPage}
            onClick={() => onPageChange(page - 1)}
          >
            <PreviousIcon aria-hidden="true" />
            <span className="hidden sm:inline">{t("common.previous")}</span>
          </Button>
        </PaginationItem>

        <PaginationItem>
          <span
            aria-current="page"
            className="text-muted-foreground flex h-9 items-center px-3 text-sm tabular-nums"
          >
            {t("common.pageOf", { page, total: totalPages })}
          </span>
        </PaginationItem>

        <PaginationItem>
          <Button
            type="button"
            variant="outline"
            size="default"
            aria-label={t("common.next")}
            disabled={!hasNextPage}
            onClick={() => onPageChange(page + 1)}
          >
            <span className="hidden sm:inline">{t("common.next")}</span>
            <NextIcon aria-hidden="true" />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

interface DataStateProps {
  children: React.ReactNode;
  role?: "status";
}

interface DesktopDataStateProps extends DataStateProps {
  colSpan: number;
}

function DesktopDataState({ children, role, colSpan }: DesktopDataStateProps) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        role={role}
        aria-live={role ? "polite" : undefined}
        className="text-muted-foreground h-24 whitespace-normal text-center"
      >
        {children}
      </TableCell>
    </TableRow>
  );
}

function MobileDataState({ children, role }: DataStateProps) {
  return (
    <Card role={role} aria-live={role ? "polite" : undefined}>
      <CardContent className="text-muted-foreground text-center text-sm">
        {children}
      </CardContent>
    </Card>
  );
}

function DataTable<T>({
  columns,
  rows,
  getRowKey,
  loading = false,
  emptyContent,
  pagination,
  sortKey,
  sortDirection,
  onSort,
  renderMobileActions,
  className,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const handleSort = (columnSortKey: string) => {
    const nextDirection =
      sortKey === columnSortKey && sortDirection === "asc" ? "desc" : "asc";
    onSort?.(columnSortKey, nextDirection);
  };
  const sortableColumns = columns.filter(column => column.sortKey && onSort);
  const resolvedEmptyContent = emptyContent ?? t("common.noData");

  return (
    <div className={cn("space-y-4", className)} aria-busy={loading}>
      {!isMobile ? (
        <div>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map(column => {
                  const isSortable = Boolean(column.sortKey && onSort);
                  const activeDirection =
                    isSortable && sortKey === column.sortKey
                      ? sortDirection
                      : undefined;
                  const ariaSort = isSortable
                    ? activeDirection === "asc"
                      ? "ascending"
                      : activeDirection === "desc"
                        ? "descending"
                        : "none"
                    : undefined;

                  return (
                    <TableHead
                      key={column.key}
                      scope="col"
                      aria-sort={ariaSort}
                    >
                      {isSortable ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="-ms-2"
                          aria-label={t("common.sortBy", {
                            field:
                              typeof column.header === "string"
                                ? column.header
                                : String(column.key),
                          })}
                          onClick={() => handleSort(column.sortKey!)}
                        >
                          <span>{column.header}</span>
                          <SortIndicator direction={activeDirection} />
                        </Button>
                      ) : (
                        column.header
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <DesktopDataState
                  role="status"
                  colSpan={Math.max(columns.length, 1)}
                >
                  {t("common.loading")}
                </DesktopDataState>
              ) : rows.length === 0 ? (
                <DesktopDataState colSpan={Math.max(columns.length, 1)}>
                  {resolvedEmptyContent}
                </DesktopDataState>
              ) : (
                rows.map((row, rowIndex) => (
                  <TableRow key={getRowKey(row, rowIndex)}>
                    {columns.map(column => (
                      <TableCell
                        key={column.key}
                        className="whitespace-normal break-words"
                      >
                        {column.render(row, rowIndex)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <>
          {sortableColumns.length > 0 ? (
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t("common.actions")}
            >
              {sortableColumns.map(column => {
                const activeDirection =
                  sortKey === column.sortKey ? sortDirection : undefined;
                return (
                  <Button
                    key={column.key}
                    type="button"
                    variant={activeDirection ? "secondary" : "outline"}
                    size="sm"
                    aria-pressed={Boolean(activeDirection)}
                    onClick={() => handleSort(column.sortKey!)}
                  >
                    {t("common.sortBy", {
                      field:
                        typeof column.mobileLabel === "string"
                          ? column.mobileLabel
                          : typeof column.header === "string"
                            ? column.header
                            : String(column.key),
                    })}
                    <SortIndicator direction={activeDirection} />
                  </Button>
                );
              })}
            </div>
          ) : null}

          <div className="grid gap-3">
            {loading ? (
              <MobileDataState role="status">
                {t("common.loading")}
              </MobileDataState>
            ) : rows.length === 0 ? (
              <MobileDataState>{resolvedEmptyContent}</MobileDataState>
            ) : (
              rows.map((row, rowIndex) => {
                const fields: MobileRecordCardField[] = columns
                  .map(column => ({
                    key: column.key,
                    label: column.mobileLabel ?? column.header,
                    value: column.render(row, rowIndex),
                  }))
                  .filter(
                    (_, columnIndex) => !columns[columnIndex].hideOnMobile
                  );

                return (
                  <MobileRecordCard
                    key={getRowKey(row, rowIndex)}
                    fields={fields}
                    actions={renderMobileActions?.(row, rowIndex)}
                  />
                );
              })
            )}
          </div>
        </>
      )}

      {pagination ? <TablePagination {...pagination} /> : null}
    </div>
  );
}

export { DataTable };
