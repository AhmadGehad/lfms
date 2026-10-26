import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { usePermissions } from "@/hooks/usePermissions";
import { Bell, BellOff, Check, CheckCheck, ChevronRight } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { ListSkeleton } from "@/components/PageSkeleton";
import { formatAlertType, notificationCategory, notificationLink, priorityTone } from "@shared/notifications";
import { fmtDateTime } from "../lib/format";

type NotificationRow = RouterOutputs["notifications"]["list"][number];

function fmtTime(d: unknown) {
  return fmtDateTime(d, "");
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
  const [, setLocation] = useLocation();

  const { data: notifications, isLoading } = trpc.notifications.list.useQuery({});
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => utils.notifications.list.invalidate() });
  const markAllRead = trpc.notifications.markAllRead.useMutation({ onSuccess: () => utils.notifications.list.invalidate() });

  const rows: NotificationRow[] = notifications ?? [];
  const unread = rows.filter(n => !n.isRead).length;

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

      {isLoading ? <ListSkeleton rows={5} /> : rows.length === 0 ? (
        <EmptyState icon={BellOff} title={t("notifications.none", "No notifications")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(n => {
            const isRead = Boolean(n.isRead);
            const category = notificationCategory(n.alertType);
            const tag = category === "other"
              ? formatAlertType(n.alertType)
              : t(`notifications.category.${category}`, { defaultValue: category[0].toUpperCase() + category.slice(1) });
            const href = notificationLink(n);
            // Opening a notification takes you to what it's about and marks it read.
            const open = href
              ? () => {
                  if (canUpdate && !isRead) markRead.mutate({ id: n.id });
                  setLocation(href);
                }
              : undefined;
            return (
              <li
                key={n.id}
                role={open ? "link" : undefined}
                tabIndex={open ? 0 : undefined}
                onClick={open}
                onKeyDown={open ? e => { if (e.key === "Enter") open(); } : undefined}
                className={`flex items-start gap-3 rounded-xl border p-3 ${isRead ? "border-border bg-card" : "border-primary/30 bg-primary-soft/40"} ${open ? "cursor-pointer transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring" : ""}`}
              >
                <Bell className={`mt-0.5 h-4 w-4 shrink-0 ${isRead ? "text-muted-foreground" : "text-primary"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{n.title || n.message || "—"}</p>
                    <StatusBadge tone={priorityTone(n.priority)} icon={false}>
                      {tag}
                    </StatusBadge>
                  </div>
                  {n.title && n.message && <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{fmtTime(n.createdAt)}</p>
                </div>
                {canUpdate && !isRead && (
                  <button
                    onClick={e => { e.stopPropagation(); markRead.mutate({ id: n.id }); }}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface"
                    aria-label={t("notifications.markRead", "Mark read")}
                    title={t("notifications.markRead", "Mark read")}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
                {open && <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
