import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";

export default function Notifications() {
  const { data: notifications, isLoading, refetch } = trpc.notifications.list.useQuery();
  const utils = trpc.useUtils();

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => { utils.notifications.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => { toast.success("All notifications marked as read"); utils.notifications.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const unreadCount = (notifications ?? []).filter((n: any) => !n.isRead).length;

  const severityColor = (severity: string) => {
    if (severity === "critical" || severity === "red") return "bg-red-100 text-red-800 border-red-200";
    if (severity === "warning" || severity === "amber") return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-blue-100 text-blue-800 border-blue-200";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" className="gap-2" onClick={() => markAllRead.mutate()}>
            <CheckCheck className="h-4 w-4" />
            Mark All Read
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">Loading...</p>
        ) : (notifications ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Bell className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              No notifications yet.
            </CardContent>
          </Card>
        ) : (
          (notifications ?? []).map((n: any) => (
            <Card
              key={n.id}
              className={`transition-colors cursor-pointer ${!n.isRead ? "border-primary/30 bg-primary/5" : ""}`}
              onClick={() => !n.isRead && markRead.mutate({ id: n.id })}
            >
              <CardContent className="py-4 flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={`text-xs ${severityColor(n.severity ?? "info")}`}>
                      {n.alertType?.replace(/_/g, " ") ?? "Alert"}
                    </Badge>
                    {!n.isRead && <Badge className="bg-primary text-primary-foreground text-xs">New</Badge>}
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
