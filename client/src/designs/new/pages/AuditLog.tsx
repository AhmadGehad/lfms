import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { RotateCcw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { AuditTimeline, type AuditEntry } from "../components/AuditTimeline";
import { ConsequenceConfirm } from "../components/ConsequenceConfirm";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * New Audit Log as a readable timeline with inline diffs (F-AUD1/2) and a
 * consequence-aware Revert (admin/owner only; only the newest change to a record
 * is revertable — guarded server-side, surfaced here).
 */
export default function NewAuditLog() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const canRevert = perms.can("audit", "revert");
  const utils = trpc.useUtils();

  const { data: rows, isLoading } = trpc.audit.list.useQuery({});
  const [confirm, setConfirm] = useState<any | null>(null);

  const revert = trpc.audit.revert.useMutation({
    onSuccess: () => {
      utils.audit.list.invalidate();
      toast.success(t("audit.reverted", "Action reverted"));
      setConfirm(null);
    },
    onError: e => { toast.error(e.message); setConfirm(null); },
  });

  const list = (rows as any[]) ?? [];
  const entries: AuditEntry[] = list.map(r => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    userName: r.userName,
    at: r.createdAt,
    oldValues: r.oldValues,
    newValues: r.newValues,
    reverted: Boolean(r.revertedAt),
  }));

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("nav.auditLog", "Audit log")}
        subtitle={t("audit.subtitle", "Every change, with safe undo")}
      />

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : entries.length === 0 ? (
        <EmptyState icon={RotateCcw} title={t("audit.none", "No activity recorded")} />
      ) : (
        <AuditTimeline
          entries={entries}
          renderAction={e => {
            const row = list.find(r => r.id === e.id);
            if (!canRevert || !row?.revertable) return null;
            return (
              <button
                onClick={() => setConfirm(row)}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-surface"
              >
                <RotateCcw className="h-3 w-3" />
                {t("audit.revert", "Revert")}
              </button>
            );
          }}
        />
      )}

      <ConsequenceConfirm
        open={confirm !== null}
        onOpenChange={o => !o && setConfirm(null)}
        title={t("audit.revertTitle", "Revert this action?")}
        description={confirm ? `${confirm.action} · ${confirm.entityType} #${confirm.entityId}` : ""}
        consequences={[
          { text: t("audit.revertConsequence", "This recreates the prior state of the record and is itself recorded as an audit entry."), tone: "warning" },
        ]}
        confirmLabel={t("audit.revert", "Revert")}
        destructive
        loading={revert.isPending}
        onConfirm={() => confirm && revert.mutate({ auditId: confirm.id })}
      />
    </div>
  );
}
