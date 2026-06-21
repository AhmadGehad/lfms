import {
  DataTable,
  FilterBar,
  PageHeader,
  PageShell,
  type DataTableColumn,
  type DataTableSortDirection,
} from "@/components/simple";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  Columns3,
  Eye,
  Pencil,
  Syringe,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

const COLUMN_STORAGE_KEY = "lfms.animals.simple-columns";
const OPTIONAL_COLUMN_KEYS = [
  "owner",
  "acquisitionType",
  "purchaseCost",
  "daysOnFarm",
] as const;

type OptionalColumnKey = (typeof OPTIONAL_COLUMN_KEYS)[number];

interface StoredColumnVisibility {
  version: 1;
  visible: OptionalColumnKey[];
}

interface DeleteTarget {
  id: number;
  animalId: string;
}

export interface SimpleAnimalsProps {
  rows: any[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  sortKey?: string;
  sortDirection?: DataTableSortDirection;
  onSort: (sortKey: string, direction: DataTableSortDirection) => void;
  filters: React.ReactNode;
  headerAction?: React.ReactNode;
  bulkActions?: React.ReactNode;
  canSelect: boolean;
  selectedIds: Set<number>;
  onToggleOne: (id: number) => void;
  allPageSelected: boolean;
  onTogglePage: () => void;
  canUpdate: boolean;
  canDelete: boolean;
  onView: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  formatAge: (date: any) => React.ReactNode;
  formatDaysOnFarm: (row: any) => React.ReactNode;
}

function getAnimal(row: any) {
  return row?.animal ?? row ?? {};
}

function getAnimalDatabaseId(row: any): number | null {
  const id = Number(getAnimal(row).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getAnimalDisplayId(row: any): string {
  const animal = getAnimal(row);
  return String(animal.animalId ?? animal.animalIdNumber ?? animal.id ?? "—");
}

function loadVisibleColumns(): Set<OptionalColumnKey> {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const stored = window.localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!stored) {
      return new Set();
    }

    const parsed = JSON.parse(stored) as Partial<StoredColumnVisibility>;
    const visible = Array.isArray(parsed.visible)
      ? parsed.visible.filter((key): key is OptionalColumnKey =>
          OPTIONAL_COLUMN_KEYS.includes(key as OptionalColumnKey)
        )
      : [];

    return new Set(visible);
  } catch {
    return new Set();
  }
}

function StatusBadge({ status }: { status?: string | null }) {
  const normalized = status?.toLowerCase() ?? "";

  if (
    normalized.includes("active") ||
    normalized.includes("fattening") ||
    normalized.includes("breeding")
  ) {
    return (
      <Badge className="border-green-200 bg-green-100 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
        {status}
      </Badge>
    );
  }

  if (normalized.includes("sold")) {
    return (
      <Badge className="border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
        {status}
      </Badge>
    );
  }

  if (normalized.includes("dead") || normalized.includes("mort")) {
    return <Badge variant="destructive">{status}</Badge>;
  }

  return <Badge variant="outline">{status || "—"}</Badge>;
}

function VaccineDueValue({
  date,
  name,
  locale,
}: {
  date?: string | Date | null;
  name?: string | null;
  locale: string;
}) {
  if (!date) {
    return <span className="text-muted-foreground">—</span>;
  }

  const dueDate = new Date(date);
  if (Number.isNaN(dueDate.getTime())) {
    return <span className="text-muted-foreground">—</span>;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  const daysUntilDue = Math.ceil(
    (dueDate.getTime() - today.getTime()) / 86_400_000
  );
  const dueClassName =
    daysUntilDue < 0
      ? "font-medium text-destructive"
      : daysUntilDue <= 7
        ? "font-medium text-amber-700 dark:text-amber-400"
        : "text-muted-foreground";

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Syringe className="size-3.5 text-muted-foreground" aria-hidden="true" />
      {name ? <span>{name}</span> : null}
      <span className={dueClassName}>{dueDate.toLocaleDateString(locale)}</span>
    </span>
  );
}

interface RowActionsProps {
  id: number | null;
  animalId: string;
  canUpdate: boolean;
  canDelete: boolean;
  onView: (id: number) => void;
  onEdit: (id: number) => void;
  onRequestDelete: (target: DeleteTarget) => void;
  viewLabel: string;
  editLabel: string;
  deleteLabel: string;
  actionsLabel: string;
}

function RowActions({
  id,
  animalId,
  canUpdate,
  canDelete,
  onView,
  onEdit,
  onRequestDelete,
  viewLabel,
  editLabel,
  deleteLabel,
  actionsLabel,
}: RowActionsProps) {
  return (
    <div
      className="flex flex-wrap items-center justify-end gap-1"
      role="group"
      aria-label={`${actionsLabel}: ${animalId}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title={viewLabel}
        aria-label={`${viewLabel}: ${animalId}`}
        disabled={id === null}
        onClick={() => {
          if (id !== null) {
            onView(id);
          }
        }}
      >
        <Eye aria-hidden="true" />
      </Button>
      {canUpdate ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={editLabel}
          aria-label={`${editLabel}: ${animalId}`}
          disabled={id === null}
          onClick={() => {
            if (id !== null) {
              onEdit(id);
            }
          }}
        >
          <Pencil aria-hidden="true" />
        </Button>
      ) : null}
      {canDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          title={deleteLabel}
          aria-label={`${deleteLabel}: ${animalId}`}
          disabled={id === null}
          onClick={() => {
            if (id !== null) {
              onRequestDelete({ id, animalId });
            }
          }}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

export function SimpleAnimals({
  rows,
  loading,
  total,
  page,
  pageSize,
  onPageChange,
  sortKey,
  sortDirection,
  onSort,
  filters,
  headerAction,
  bulkActions,
  canSelect,
  selectedIds,
  onToggleOne,
  allPageSelected,
  onTogglePage,
  canUpdate,
  canDelete,
  onView,
  onEdit,
  onDelete,
  formatAge,
  formatDaysOnFarm,
}: SimpleAnimalsProps) {
  const { t, i18n } = useTranslation();
  const [visibleOptionalColumns, setVisibleOptionalColumns] =
    React.useState<Set<OptionalColumnKey>>(loadVisibleColumns);
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(
    null
  );
  const selectedPageCount = React.useMemo(
    () =>
      rows.reduce((count, row) => {
        const id = getAnimalDatabaseId(row);
        return id !== null && selectedIds.has(id) ? count + 1 : count;
      }, 0),
    [rows, selectedIds]
  );

  React.useEffect(() => {
    const stored: StoredColumnVisibility = {
      version: 1,
      visible: OPTIONAL_COLUMN_KEYS.filter(key =>
        visibleOptionalColumns.has(key)
      ),
    };

    try {
      window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Column preferences are non-critical when storage is unavailable.
    }
  }, [visibleOptionalColumns]);

  const labels = React.useMemo(
    () => ({
      columns: t("common.columns", { defaultValue: "Columns" }),
      filters: t("animals.filters", { defaultValue: "Animal filters" }),
      selectPage: t("animals.selectPage", {
        defaultValue: "Select all animals on this page",
      }),
      selectAnimal: (animalId: string) =>
        t("animals.selectAnimal", {
          animalId,
          defaultValue: "Select animal {{animalId}}",
        }),
      latestWeight: t("animals.latestWeight", {
        defaultValue: "Latest weight",
      }),
      view: t("common.viewProfile"),
      edit: t("common.edit"),
      delete: t("common.delete"),
      actions: t("common.actions"),
    }),
    [t]
  );

  const setColumnVisible = React.useCallback(
    (key: OptionalColumnKey, visible: boolean) => {
      setVisibleOptionalColumns(current => {
        const next = new Set(current);
        if (visible) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });
    },
    []
  );

  const renderRowActions = React.useCallback(
    (row: any) => {
      const id = getAnimalDatabaseId(row);
      const animalId = getAnimalDisplayId(row);

      return (
        <RowActions
          id={id}
          animalId={animalId}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onView={onView}
          onEdit={onEdit}
          onRequestDelete={setDeleteTarget}
          viewLabel={labels.view}
          editLabel={labels.edit}
          deleteLabel={labels.delete}
          actionsLabel={labels.actions}
        />
      );
    },
    [
      canDelete,
      canUpdate,
      labels.delete,
      labels.edit,
      labels.view,
      labels.actions,
      onEdit,
      onView,
    ]
  );

  const columns = React.useMemo<DataTableColumn<any>[]>(() => {
    const result: DataTableColumn<any>[] = [];

    if (canSelect) {
      result.push({
        key: "selection",
        header: (
          <Checkbox
            checked={
              allPageSelected
                ? true
                : selectedPageCount > 0
                  ? "indeterminate"
                  : false
            }
            disabled={rows.length === 0}
            aria-label={labels.selectPage}
            onCheckedChange={onTogglePage}
          />
        ),
        mobileLabel: labels.selectPage,
        hideOnMobile: true,
        render: row => {
          const id = getAnimalDatabaseId(row);
          const animalId = getAnimalDisplayId(row);
          return (
            <Checkbox
              checked={id !== null && selectedIds.has(id)}
              disabled={id === null}
              aria-label={labels.selectAnimal(animalId)}
              onCheckedChange={() => {
                if (id !== null) {
                  onToggleOne(id);
                }
              }}
            />
          );
        },
      });
    }

    result.push(
      {
        key: "animalId",
        header: t("animals.animalId"),
        sortKey: "id",
        render: row => (
          <span className="font-mono font-semibold text-primary">
            {getAnimalDisplayId(row)}
          </span>
        ),
      },
      {
        key: "categorySpecies",
        header: `${t("common.category")} / ${t("common.species")}`,
        render: row => (
          <span className="grid gap-0.5">
            <span>{row?.categoryName ?? "—"}</span>
            <span className="text-xs text-muted-foreground">
              {row?.speciesName ?? "—"}
            </span>
          </span>
        ),
      },
      {
        key: "group",
        header: t("common.group"),
        render: row => row?.groupName ?? t("common.noGroup"),
      }
    );

    if (visibleOptionalColumns.has("owner")) {
      result.push({
        key: "owner",
        header: t("owners.owner"),
        render: row =>
          row?.ownerName ?? <span className="text-muted-foreground">—</span>,
      });
    }

    result.push({
      key: "status",
      header: t("common.status"),
      render: row => <StatusBadge status={row?.statusName} />,
    });

    if (visibleOptionalColumns.has("acquisitionType")) {
      result.push({
        key: "acquisitionType",
        header: t("animals.acquisitionType"),
        render: row => {
          const acquisitionType = getAnimal(row).acquisitionType;
          if (acquisitionType === "purchased") {
            return t("common.purchased");
          }
          if (acquisitionType === "born") {
            return t("animals.bornOnFarm");
          }
          return acquisitionType ?? "—";
        },
      });
    }

    result.push({
      key: "age",
      header: t("animals.age"),
      sortKey: "age",
      render: row => formatAge(getAnimal(row).birthDate),
    });

    if (visibleOptionalColumns.has("daysOnFarm")) {
      result.push({
        key: "daysOnFarm",
        header: t("animals.daysOnFarm"),
        render: row => formatDaysOnFarm(row),
      });
    }

    result.push({
      key: "latestWeight",
      header: labels.latestWeight,
      sortKey: "latestWeight",
      render: row => {
        const value = Number(row?.latestWeightKg);
        return Number.isFinite(value) ? (
          <span className="tabular-nums">
            {value.toLocaleString(i18n.language, {
              maximumFractionDigits: 1,
              minimumFractionDigits: 1,
            })}{" "}
            {t("common.kg")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    });

    if (visibleOptionalColumns.has("purchaseCost")) {
      result.push({
        key: "purchaseCost",
        header: t("animals.purchaseCost"),
        sortKey: "cost",
        render: row => {
          const value = Number(getAnimal(row).purchaseCost);
          return Number.isFinite(value) && value > 0 ? (
            <span className="tabular-nums">
              {value.toLocaleString(i18n.language, {
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              })}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      });
    }

    result.push(
      {
        key: "nextVaccine",
        header: t("vaccine.nextVaccine"),
        render: row => (
          <VaccineDueValue
            date={row?.nextVaccineDate}
            name={row?.nextVaccineName}
            locale={i18n.language}
          />
        ),
      },
      {
        key: "actions",
        header: t("common.actions"),
        hideOnMobile: true,
        render: renderRowActions,
      }
    );

    return result;
  }, [
    allPageSelected,
    canSelect,
    formatAge,
    formatDaysOnFarm,
    i18n.language,
    labels,
    onToggleOne,
    onTogglePage,
    renderRowActions,
    rows.length,
    selectedPageCount,
    selectedIds,
    t,
    visibleOptionalColumns,
  ]);

  const renderMobileActions = React.useCallback(
    (row: any) => {
      const id = getAnimalDatabaseId(row);
      const animalId = getAnimalDisplayId(row);

      return (
        <div className="flex w-full items-center justify-between gap-2">
          {canSelect ? (
            <Checkbox
              checked={id !== null && selectedIds.has(id)}
              disabled={id === null}
              aria-label={labels.selectAnimal(animalId)}
              onCheckedChange={() => {
                if (id !== null) {
                  onToggleOne(id);
                }
              }}
            />
          ) : (
            <span />
          )}
          {renderRowActions(row)}
        </div>
      );
    },
    [canSelect, labels, onToggleOne, renderRowActions, selectedIds]
  );

  const confirmDelete = React.useCallback(() => {
    if (!deleteTarget) {
      return;
    }

    onDelete(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, onDelete]);

  return (
    <PageShell className="mx-auto max-w-[1600px]">
      <PageHeader
        title={t("animals.title")}
        description={`${t("common.total")}: ${total.toLocaleString(i18n.language)}`}
        actions={headerAction}
      />

      <FilterBar aria-label={labels.filters}>
        {filters}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {selectedIds.size > 0 ? bulkActions : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline">
                <Columns3 aria-hidden="true" />
                {labels.columns}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{labels.columns}</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={visibleOptionalColumns.has("owner")}
                onCheckedChange={checked =>
                  setColumnVisible("owner", checked === true)
                }
              >
                {t("owners.owner")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={visibleOptionalColumns.has("acquisitionType")}
                onCheckedChange={checked =>
                  setColumnVisible("acquisitionType", checked === true)
                }
              >
                {t("animals.acquisitionType")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={visibleOptionalColumns.has("purchaseCost")}
                onCheckedChange={checked =>
                  setColumnVisible("purchaseCost", checked === true)
                }
              >
                {t("animals.purchaseCost")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={visibleOptionalColumns.has("daysOnFarm")}
                onCheckedChange={checked =>
                  setColumnVisible("daysOnFarm", checked === true)
                }
              >
                {t("animals.daysOnFarm")}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row, rowIndex) =>
          getAnimalDatabaseId(row) ?? `animal-row-${rowIndex}`
        }
        loading={loading}
        emptyContent={t("animals.noAnimalsFound")}
        pagination={{ page, pageSize, total, onPageChange }}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={onSort}
        renderMobileActions={renderMobileActions}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={open => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle
                className="size-5 text-destructive"
                aria-hidden="true"
              />
              {t("animals.deleteAnimal")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("animals.deleteAnimalDescription", {
                animalId: deleteTarget?.animalId ?? "",
                defaultValue:
                  "Move animal {{animalId}} to Recycle Bin? You can restore it later.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              {t("common.moveToBin")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
