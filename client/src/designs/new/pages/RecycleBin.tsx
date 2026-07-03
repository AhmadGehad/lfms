import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { RotateCcw, Trash2 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { ConsequenceConfirm } from "../components/ConsequenceConfirm";

function fmtDate(d: unknown) {
  if (!d) return "—";
  const x = new Date(d as string);
  return Number.isNaN(x.getTime()) ? "—" : x.toLocaleString();
}

/**
 * New Recycle Bin. Restore or permanently purge soft-deleted records, with a
 * ConsequenceConfirm on every purge and on Purge All (fixes F-RB1: one-click
 * irreversible purge). Same per-type tRPC mutations + permissions as Old.
 */
export default function NewRecycleBin() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const canRestore = perms.can("recycleBin", "restore");
  const canPurge = perms.can("recycleBin", "purge");
  const utils = trpc.useUtils();

  const { data: items, isLoading } = trpc.recycleBin.list.useQuery({});
  const done = (msg: string) => () => { utils.recycleBin.list.invalidate(); toast.success(msg); };
  const fail = (e: { message: string }) => toast.error(e.message);
  const r = (msg: string) => ({ onSuccess: done(msg), onError: fail });
  const restored = t("recycleBin.restored", "Restored");
  const purged = t("recycleBin.purged", "Permanently deleted");

  // Restore mutations (14 entity types)
  const restore: Record<string, (v: { id: number }) => void> = {
    animal: trpc.recycleBin.restoreAnimal.useMutation(r(restored)).mutate,
    expense: trpc.recycleBin.restoreExpense.useMutation(r(restored)).mutate,
    weightLog: trpc.recycleBin.restoreWeightLog.useMutation(r(restored)).mutate,
    lambingLog: trpc.recycleBin.restoreLambingLog.useMutation(r(restored)).mutate,
    rationPlan: trpc.recycleBin.restoreRationPlan.useMutation(r(restored)).mutate,
    feedStock: trpc.recycleBin.restoreFeedStock.useMutation(r(restored)).mutate,
    sale: trpc.recycleBin.restoreSale.useMutation(r(restored)).mutate,
    species: trpc.recycleBin.restoreSpecies.useMutation(r(restored)).mutate,
    category: trpc.recycleBin.restoreCategory.useMutation(r(restored)).mutate,
    group: trpc.recycleBin.restoreGroup.useMutation(r(restored)).mutate,
    status: trpc.recycleBin.restoreStatus.useMutation(r(restored)).mutate,
    birthType: trpc.recycleBin.restoreBirthType.useMutation(r(restored)).mutate,
    feedItem: trpc.recycleBin.restoreFeedItem.useMutation(r(restored)).mutate,
    expenseCategory: trpc.recycleBin.restoreExpenseCategory.useMutation(r(restored)).mutate,
  };

  // Purge mutations (data entities only)
  const purge: Record<string, (v: { id: number }) => void> = {
    animal: trpc.recycleBin.purgeAnimal.useMutation(r(purged)).mutate,
    expense: trpc.recycleBin.purgeExpense.useMutation(r(purged)).mutate,
    weightLog: trpc.recycleBin.purgeWeightLog.useMutation(r(purged)).mutate,
    lambingLog: trpc.recycleBin.purgeLambingLog.useMutation(r(purged)).mutate,
    rationPlan: trpc.recycleBin.purgeRationPlan.useMutation(r(purged)).mutate,
    feedStock: trpc.recycleBin.purgeFeedStock.useMutation(r(purged)).mutate,
    sale: trpc.recycleBin.purgeSale.useMutation(r(purged)).mutate,
  };
  const purgeAll = trpc.recycleBin.purgeAll.useMutation({ onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success(purged); setConfirmAll(false); }, onError: fail });

  const [purgeRow, setPurgeRow] = useState<any | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const rows = (items as any[]) ?? [];
  const purgeableCount = useMemo(() => rows.filter(i => purge[i.entityType]).length, [rows]);

  const columns: Column<any>[] = [
    { id: "label", header: t("recycleBin.item", "Item"), cell: i => <span className="font-medium">{i.label}</span>, sortValue: i => i.label, primary: true, mobileLabel: t("recycleBin.item", "Item") },
    { id: "type", header: t("recycleBin.type", "Type"), cell: i => <StatusBadge tone="neutral" icon={false}>{i.entityType}</StatusBadge>, sortValue: i => i.entityType, mobileLabel: t("recycleBin.type", "Type") },
    { id: "deleted", header: t("recycleBin.deletedAt", "Deleted"), cell: i => fmtDate(i.deletedAt), sortValue: i => i.deletedAt, mobileLabel: t("recycleBin.deletedAt", "Deleted") },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("nav.recycleBin", "Recycle Bin")}
        subtitle={`${rows.length} ${t("recycleBin.items", "items")}`}
        actions={
          canPurge && purgeableCount > 0 ? (
            <button onClick={() => setConfirmAll(true)} className="flex h-9 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-sm font-medium text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
              {t("recycleBin.purgeAll", "Purge all")}
            </button>
          ) : undefined
        }
      />

      <DataTable
        data={rows}
        columns={columns}
        rowKey={i => `${i.entityType}:${i.id}`}
        loading={isLoading}
        storageKey="recycleBin"
        rowActions={i => (
          <div className="flex items-center justify-end gap-1">
            {canRestore && restore[i.entityType] && (
              <button onClick={() => restore[i.entityType]({ id: i.id })} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface" title={t("recycleBin.restore", "Restore")}>
                <RotateCcw className="h-3.5 w-3.5" />
                {t("recycleBin.restore", "Restore")}
              </button>
            )}
            {canPurge && purge[i.entityType] && (
              <button onClick={() => setPurgeRow(i)} className="grid h-8 w-8 place-items-center rounded-md text-destructive hover:bg-destructive/10" title={t("recycleBin.purge", "Purge")} aria-label={t("recycleBin.purge", "Purge")}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        empty={<EmptyState icon={Trash2} title={t("recycleBin.empty", "Recycle bin is empty")} />}
      />

      {/* Single purge */}
      <ConsequenceConfirm
        open={purgeRow !== null}
        onOpenChange={o => !o && setPurgeRow(null)}
        title={t("recycleBin.purgeTitle", "Permanently delete this record?")}
        description={purgeRow?.label}
        consequences={[{ text: t("recycleBin.purgeConsequence", "This cannot be undone — the record is removed forever, not soft-deleted."), tone: "danger" }]}
        confirmLabel={t("recycleBin.purge", "Purge")}
        destructive
        onConfirm={() => { if (purgeRow) { purge[purgeRow.entityType]?.({ id: purgeRow.id }); setPurgeRow(null); } }}
      />

      {/* Purge all */}
      <ConsequenceConfirm
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={t("recycleBin.purgeAllTitle", "Permanently delete everything in the bin?")}
        consequences={[
          { text: t("recycleBin.purgeAllConsequence", "All purgeable records are removed forever. This cannot be undone."), tone: "danger" },
          { text: `${purgeableCount} ${t("recycleBin.itemsAffected", "items affected")}`, tone: "warning" },
        ]}
        confirmLabel={t("recycleBin.purgeAll", "Purge all")}
        destructive
        loading={purgeAll.isPending}
        onConfirm={() => purgeAll.mutate()}
      />
    </div>
  );
}
