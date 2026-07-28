import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import {
  getStoredFarmPublicId,
  setStoredFarmPublicId,
} from "@/lib/farmSelection";
import { useOfflineSync } from "@/lib/offline/useOfflineSync";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_FARMS = "all";

export function FarmSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [storedFarm, setStoredFarm] = useState(() => getStoredFarmPublicId());
  const { isOnline, pendingCount } = useOfflineSync();
  const { data } = trpc.auth.tenantContext.useQuery(undefined, {
    staleTime: 60_000,
    retry: false,
  });

  /**
   * Switching farm reloads into a different dataset. Offline that dataset was
   * never cached (only the active farm is persisted), so the user would land on
   * empty screens; and queued writes were made under the previous farm's
   * context, so they must reach the server before the context changes.
   */
  const switchBlockedReason = !isOnline
    ? t("farm.switchOffline", "Connect to the internet to switch farms.")
    : pendingCount > 0
      ? t(
          "farm.switchPendingSync",
          "Wait for your saved records to finish syncing before switching farms.",
        )
      : null;

  useEffect(() => {
    if (!data || !storedFarm) return;
    if (data.farms.some(farm => farm.publicId === storedFarm)) return;
    setStoredFarmPublicId(null);
    setStoredFarm(null);
    window.location.reload();
  }, [data, storedFarm]);

  if (!data || data.farms.length === 0) return null;

  if (data.farms.length === 1) {
    return (
      <div className={`flex h-8 min-w-0 items-center gap-1.5 text-xs text-muted-foreground ${className ?? ""}`}>
        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{data.farms[0].name}</span>
      </div>
    );
  }

  return (
    <Select
      value={storedFarm ?? ALL_FARMS}
      disabled={switchBlockedReason !== null}
      onValueChange={value => {
        if (switchBlockedReason) return;
        const publicId = value === ALL_FARMS ? null : value;
        setStoredFarmPublicId(publicId);
        setStoredFarm(publicId);
        window.location.reload();
      }}
    >
      <SelectTrigger
        className={`h-8 min-w-32 max-w-48 gap-1.5 text-xs ${storedFarm ? "border-primary text-primary" : ""} ${className ?? ""}`}
        aria-label={t("farm.select", "Select farm")}
        title={switchBlockedReason ?? undefined}
      >
        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <SelectValue placeholder={t("farm.select", "Select farm")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_FARMS}>{t("farm.all", "All farms")}</SelectItem>
        {data.farms.map(farm => (
          <SelectItem key={farm.publicId} value={farm.publicId}>
            {farm.name} ({farm.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
