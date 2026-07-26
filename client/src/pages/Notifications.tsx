import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { formatAlertType, priorityTone, type NotificationTone } from "@shared/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/hooks/usePermissions";

type NotificationRow = RouterOutputs["notifications"]["list"][number];

const TONE_CLASSES: Record<NotificationTone, string> = {
  danger: "bg-red-100 text-red-800 border-red-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  info: "bg-blue-100 text-blue-800 border-blue-200",
  neutral: "bg-slate-100 text-slate-800 border-slate-200",
};

export default function Notifications() {
  const { t } = useTranslation();
  const { canUpdate } = usePermissions("notifications");
  const { data: notifications, isLoading } = trpc.notifications.list.useQuery();
  // Use the underlying QueryClient to invalidate ALL notifications.list queries
  // regardless of input (unreadOnly: true or undefined). This ensures the sidebar
  // badge updates immediately without a page refresh.
  const queryClient = useQueryClient();

  const invalidateAllNotificationQueries = () => {
    // tRPC v11 stores query keys as [["notifications", "list"], { input, type }]
    // Passing just the path prefix invalidates ALL variants (with and without unreadOnly)
    queryClient.invalidateQueries({ queryKey: [["notifications", "list"]] });
  };

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: invalidateAllNotificationQueries,
    onError: (e) => toast.error(e.message),
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      toast.success(t("notifications.markAllRead"));
      invalidateAllNotificationQueries();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows: NotificationRow[] = notifications ?? [];
  const unreadCount = rows.filter(n => !n.isRead).length;

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            {t("notifications.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unreadCount > 0 ? `${unreadCount} ${t("notifications.markRead")}` : t("common.all")}
          </p>
        </div>
        {canUpdate && unreadCount > 0 && (
          <Button variant="outline" className="gap-2" onClick={() => markAllRead.mutate()}>
            <CheckCheck className="h-4 w-4" />
            {t("notifications.markAllRead")}
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">{t("common.loading")}</p>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Bell className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              {t("notifications.noNotifications")}
            </CardContent>
          </Card>
        ) : (
          rows.map(n => (
            <Card
              key={n.id}
              className={`transition-colors ${canUpdate && !n.isRead ? "cursor-pointer" : ""} ${!n.isRead ? "border-primary/30 bg-primary/5" : ""}`}
              onClick={() => canUpdate && !n.isRead && markRead.mutate({ id: n.id })}
            >
              <CardContent className="py-4 flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={`text-xs ${TONE_CLASSES[priorityTone(n.priority)]}`}>
                      {formatAlertType(n.alertType)}
                    </Badge>
                    {!n.isRead && <Badge className="bg-primary text-primary-foreground text-xs">{t("common.active")}</Badge>}
                  </div>
                  <p className="text-sm font-medium">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
