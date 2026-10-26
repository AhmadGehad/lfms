import { useTranslation } from "react-i18next";
import { Link } from "wouter";
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
            const title = n.title || n.message || "—";
            // Opening a notification takes you to what it's about and marks it read.
            // The title link is stretched over the whole card (after:inset-0); the
            // mark-read button sits above it so both stay real, separate controls.
            return (
              <li
                key={n.id}
                className={`relative flex items-start gap-3 rounded-xl border p-3 ${isRead ? "border-border bg-card" : "border-primary/30 bg-primary-soft/40"} ${href ? "transition-colors hover:border-border-strong has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-ring" : ""}`}
              >
                <Bell className={`mt-0.5 h-4 w-4 shrink-0 ${isRead ? "text-muted-foreground" : "text-primary"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {href ? (
                      <Link
                        href={href}
                        onClick={() => { if (canUpdate && !isRead) markRead.mutate({ id: n.id }); }}
                        className="text-sm font-medium text-foreground after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
                      >
                        {title}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium text-foreground">{title}</p>
                    )}
                    <StatusBadge tone={priorityTone(n.priority)} icon={false}>
                      {tag}
                    </StatusBadge>
                  </div>
                  {n.title && n.message && <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{fmtTime(n.createdAt)}</p>
                </div>
                {canUpdate && !isRead && (
                  <button
                    type="button"
                    onClick={() => markRead.mutate({ id: n.id })}
                    className="relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring sm:h-8 sm:w-8"
                    aria-label={t("notifications.markRead", "Mark read")}
                    title={t("notifications.markRead", "Mark read")}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
                {href && <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
