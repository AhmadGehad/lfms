import { cn } from "@/lib/utils";
import { StatusBadge, type StatusTone } from "./StatusBadge";
import { Plus, Pencil, Trash2, RotateCcw, Dot } from "lucide-react";

export interface AuditEntry {
  id: string | number;
  action: string; // create | update | delete | revert | restore | …
  entityType: string;
  entityId?: string;
  userName?: string;
  at: string | Date;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  reverted?: boolean;
}

const ACTION_META: Record<string, { tone: StatusTone; icon: typeof Plus }> = {
  create: { tone: "success", icon: Plus },
  update: { tone: "info", icon: Pencil },
  delete: { tone: "danger", icon: Trash2 },
  revert: { tone: "warning", icon: RotateCcw },
  restore: { tone: "success", icon: RotateCcw },
};

function fmtTime(at: string | Date) {
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? String(at) : d.toLocaleString();
}

/** Compact field-level diff of old → new values. */
function Diff({ oldV, newV }: { oldV?: Record<string, unknown> | null; newV?: Record<string, unknown> | null }) {
  const keys = Array.from(new Set([...Object.keys(oldV ?? {}), ...Object.keys(newV ?? {})]));
  const changed = keys.filter(k => JSON.stringify(oldV?.[k]) !== JSON.stringify(newV?.[k]));
  if (changed.length === 0) return null;
  return (
    <dl className="mt-2 space-y-1 rounded-lg border border-border bg-surface p-2 text-xs">
      {changed.map(k => (
        <div key={k} className="flex flex-wrap items-center gap-1">
          <dt className="font-medium text-muted-foreground">{k}:</dt>
          {oldV && k in oldV && <dd className="rounded bg-danger-soft px-1 text-danger-soft-foreground line-through">{String(oldV[k] ?? "∅")}</dd>}
          {newV && k in newV && <dd className="rounded bg-success-soft px-1 text-success-soft-foreground">{String(newV[k] ?? "∅")}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Audit log as a readable timeline with inline diffs (F-AUD1/2). */
export function AuditTimeline({ entries, renderAction }: { entries: AuditEntry[]; renderAction?: (e: AuditEntry) => React.ReactNode }) {
  return (
    <ol className="relative flex flex-col gap-4 ps-6">
      <span className="absolute inset-y-1 start-[7px] w-px bg-border" aria-hidden />
      {entries.map(e => {
        const meta = ACTION_META[e.action] ?? { tone: "neutral" as StatusTone, icon: Dot };
        const Icon = meta.icon;
        return (
          <li key={e.id} className="relative">
            <span
              className={cn(
                "absolute -start-6 top-0.5 grid h-4 w-4 place-items-center rounded-full ring-4 ring-background",
                meta.tone === "success" && "bg-success",
                meta.tone === "info" && "bg-info",
                meta.tone === "danger" && "bg-danger",
                meta.tone === "warning" && "bg-warning",
                meta.tone === "neutral" && "bg-border-strong"
              )}
            >
              <Icon className="h-2.5 w-2.5 text-background" />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={meta.tone} icon={false}>{e.action}</StatusBadge>
              <span className="text-sm font-medium text-foreground">{e.entityType}{e.entityId ? ` #${e.entityId}` : ""}</span>
              {e.reverted && <StatusBadge tone="warning">reverted</StatusBadge>}
              <span className="text-xs text-muted-foreground">· {e.userName ?? "system"} · {fmtTime(e.at)}</span>
              {renderAction && <span className="ms-auto">{renderAction(e)}</span>}
            </div>
            {e.action === "update" && <Diff oldV={e.oldValues} newV={e.newValues} />}
          </li>
        );
      })}
    </ol>
  );
}
