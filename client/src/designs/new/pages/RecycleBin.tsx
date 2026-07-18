import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { RotateCcw, Trash2 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";

function fmtDate(d: unknown) {
  if (!d) return "—";
  const x = new Date(d as string);
  return Number.isNaN(x.getTime()) ? "—" : x.toLocaleString();
}

/** Tenant recycle bin. Permanent deletion is owned by platform retention workflows. */
export default function NewRecycleBin() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const canRestore = perms.can("recycleBin", "restore");
  const utils = trpc.useUtils();

  const { data: items, isLoading } = trpc.recycleBin.list.useQuery({});
  const done = (msg: string) => () => { utils.recycleBin.list.invalidate(); toast.success(msg); };
  const fail = (e: { message: string }) => toast.error(e.message);
  const r = (msg: string) => ({ onSuccess: done(msg), onError: fail });
  const restored = t("recycleBin.restored", "Restored");

  // Restore mutations (14 entity types)
  const restore: Record<string, (v: { id: number; expectedVersion: number }) => void> = {
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

  const rows = (items as any[]) ?? [];

  const columns: Column<any>[] = [
    { id: "label", header: t("recycleBin.item", "Item"), cell: i => <span className="font-medium">{i.label}</span>, sortValue: i => i.label, primary: true, mobileLabel: t("recycleBin.item", "Item") },
    { id: "type", header: t("recycleBin.type", "Type"), cell: i => <StatusBadge tone="neutral" icon={false}>{i.entityType}</StatusBadge>, sortValue: i => i.entityType, mobileLabel: t("recycleBin.type", "Type") },
    { id: "deleted", header: t("recycleBin.deletedAt", "Deleted"), cell: i => fmtDate(i.deletedAt), sortValue: i => i.deletedAt, mobileLabel: t("recycleBin.deletedAt", "Deleted") },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("nav.recycleBin", "Recycle Bin")}
        subtitle={`${rows.length} ${t("recycleBin.items", "items")} · ${t("recycleBin.retentionPolicy", "Permanent deletion is managed by platform retention policy")}`}
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
              <button onClick={() => restore[i.entityType]({ id: i.id, expectedVersion: i.version })} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface" title={t("recycleBin.restore", "Restore")}>
                <RotateCcw className="h-3.5 w-3.5" />
                {t("recycleBin.restore", "Restore")}
              </button>
            )}
          </div>
        )}
        empty={<EmptyState icon={Trash2} title={t("recycleBin.empty", "Recycle bin is empty")} />}
      />

    </div>
  );
}
