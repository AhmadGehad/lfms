/**
 * Header control showing whether anything is still waiting to reach the server.
 *
 * Shared by both design systems on purpose: the offline queue is a correctness
 * concern, not a styling one, and a user must never be left unsure whether the
 * weights they entered in a field have actually been saved.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useOfflineSync } from "@/lib/offline/useOfflineSync";
import type { QueueItem } from "@/lib/offline/syncQueue";
import { AlertTriangle, CloudOff, RefreshCw, Trash2, UploadCloud, Wifi } from "lucide-react";
import { useTranslation } from "react-i18next";

const STATUS_LABELS: Record<QueueItem["status"], string> = {
  pending: "Waiting for signal",
  syncing: "Sending…",
  retrying: "Retrying",
  blocked: "Needs attention",
};

/** `animals.addWeight` → `Add weight` */
function describePath(path: string) {
  const action = path.split(".")[1] ?? path;
  const spaced = action.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function OfflineSyncIndicator({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { isOnline, items, pendingCount, blockedCount, staleCount, retryAll, discard } =
    useOfflineSync();

  // Nothing to say when online with an empty queue — no permanent clutter.
  if (isOnline && items.length === 0) return null;

  const tone = blockedCount > 0 ? "danger" : isOnline ? "info" : "warning";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-1.5", className)}
          aria-label={t("offline.syncStatus", "Sync status")}
        >
          {blockedCount > 0 ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : isOnline ? (
            <UploadCloud className="h-4 w-4" />
          ) : (
            <CloudOff className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {isOnline
              ? t("offline.syncing", "Syncing")
              : t("offline.offline", "Offline")}
          </span>
          {items.length > 0 && (
            <Badge
              variant={tone === "danger" ? "destructive" : "secondary"}
              className="px-1.5 py-0 text-[11px]"
            >
              {items.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {isOnline ? <Wifi className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
            {isOnline
              ? t("offline.online", "Connected")
              : t("offline.offlineTitle", "Working offline")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {items.length === 0
              ? t("offline.allSynced", "Everything is saved to the server.")
              : t(
                  "offline.pendingSummary",
                  "{{count}} record(s) saved on this device, waiting to sync.",
                  { count: pendingCount },
                )}
          </p>
        </div>

        {staleCount > 0 && (
          <p className="border-b border-border bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {t(
              "offline.staleWarning",
              "Some records have been waiting for days. Connect soon so they are not lost.",
            )}
          </p>
        )}

        <ul className="max-h-64 divide-y divide-border overflow-y-auto">
          {items.map(item => (
            <li key={item.id} className="flex items-start gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{describePath(item.path)}</p>
                <p
                  className={cn(
                    "text-xs",
                    item.status === "blocked"
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {STATUS_LABELS[item.status]}
                  {item.status === "blocked" && item.errorMessage
                    ? ` — ${item.errorMessage}`
                    : ""}
                </p>
              </div>
              {item.status === "blocked" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  onClick={() => discard(item.id)}
                  aria-label={t("offline.discard", "Discard record")}
                  title={t("offline.discard", "Discard record")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>

        {items.length > 0 && (
          <div className="border-t border-border px-3 py-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={retryAll}
              disabled={!isOnline}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("offline.retryAll", "Try syncing now")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
