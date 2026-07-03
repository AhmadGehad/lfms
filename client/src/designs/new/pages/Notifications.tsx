import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { usePermissions } from "@/hooks/usePermissions";
import { Bell, BellOff, Check, CheckCheck } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge, type StatusTone } from "../components/StatusBadge";

function typeTone(type?: string): StatusTone {
  const l = (type ?? "").toLowerCase();
  if (l.includes("critical") || l.includes("overdue") || l.includes("danger")) return "danger";
  if (l.includes("warn") || l.includes("low") || l.includes("due")) return "warning";
  if (l.includes("success") || l.includes("done")) return "success";
  return "info";
}
function fmtTime(d: unknown) {
  if (!d) return "";
  const x = new Date(d as string);
  return Number.isNaN(x.getTime()) ? "" : x.toLocaleString();
}

/**
 * New Notifications. Same data + mark-read mutations as Old; redesigned as a
 * readable, prioritised feed (the redesign also surfaces unread count in the
 * top bar — this is the full list).
 */
export default function NewNotifications() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const canUpdate = perms.can("notifications", "update");
  const utils = trpc.useUtils();

  const { data: notifications, isLoading } = trpc.notifications.list.useQuery({});
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => utils.notifications.list.invalidate() });
  const markAllRead = trpc.notifications.markAllRead.useMutation({ onSuccess: () => utils.notifications.list.invalidate() });

  const rows = (notifications as any[]) ?? [];
  const unread = rows.filter(n => !(n.isRead ?? n.readAt)).length;

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("nav.notifications", "Notifications")}
        subtitle={unread > 0 ? `${unread} ${t("notifications.unread", "unread")}` : t("notifications.allRead", "All caught up")}
        actions={
          canUpdate && unread > 0 ? (
            <button
              onClick={() => markAllRead.mutate()}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-surface"
            >
              <CheckCheck className="h-4 w-4" />
              {t("notifications.markAllRead", "Mark all read")}
            </button>
          ) : undefined
        }
      />

      {isLoading ? null : rows.length === 0 ? (
        <EmptyState icon={BellOff} title={t("notifications.none", "No notifications")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(n => {
            const isRead = Boolean(n.isRead ?? n.readAt);
            return (
              <li
                key={n.id}
                className={`flex items-start gap-3 rounded-xl border p-3 ${isRead ? "border-border bg-card" : "border-primary/30 bg-primary-soft/40"}`}
              >
                <Bell className={`mt-0.5 h-4 w-4 shrink-0 ${isRead ? "text-muted-foreground" : "text-primary"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{n.title ?? n.message ?? "—"}</p>
                    {n.type && <StatusBadge tone={typeTone(n.type)} icon={false}>{n.type}</StatusBadge>}
                  </div>
                  {n.title && n.message && <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{fmtTime(n.createdAt)}</p>
                </div>
                {canUpdate && !isRead && (
                  <button
                    onClick={() => markRead.mutate({ id: n.id })}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface"
                    aria-label={t("notifications.markRead", "Mark read")}
                    title={t("notifications.markRead", "Mark read")}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
