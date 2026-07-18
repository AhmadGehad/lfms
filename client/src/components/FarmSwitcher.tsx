import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import {
  getStoredFarmPublicId,
  setStoredFarmPublicId,
} from "@/lib/farmSelection";
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
  const { data } = trpc.auth.tenantContext.useQuery(undefined, {
    staleTime: 60_000,
    retry: false,
  });

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
      onValueChange={value => {
        const publicId = value === ALL_FARMS ? null : value;
        setStoredFarmPublicId(publicId);
        setStoredFarm(publicId);
        window.location.reload();
      }}
    >
      <SelectTrigger
        className={`h-8 min-w-32 max-w-48 gap-1.5 text-xs ${storedFarm ? "border-primary text-primary" : ""} ${className ?? ""}`}
        aria-label={t("farm.select", "Select farm")}
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
