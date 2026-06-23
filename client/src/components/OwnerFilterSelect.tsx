import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";
import type { PermissionPage } from "@shared/permissions";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";

// Pages whose data can be scoped to an owner — mirrors the server's
// OWNER_VIEW_PERMISSIONS. The owner selector only appears for users who can
// view at least one of these, since getOwnerOptions is gated the same way.
const OWNER_VIEW_PAGES: PermissionPage[] = [
  "animals",
  "expenses",
  "pnl",
  "incomeStatement",
  "sales",
  "configuration",
];

export function OwnerFilterSelect({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { ownerId, setOwnerId } = useOwnerFilter();
  const { can } = usePermissions();

  const canViewOwners = OWNER_VIEW_PAGES.some(page => can(page, "view"));
  const { data: owners } = trpc.config.getOwnerOptions.useQuery(undefined, {
    enabled: canViewOwners,
    staleTime: 5 * 60 * 1000,
  });

  if (!canViewOwners || !owners || owners.length === 0) return null;

  return (
    <Select
      value={ownerId == null ? "all" : String(ownerId)}
      onValueChange={v => setOwnerId(v === "all" ? null : Number(v))}
    >
      <SelectTrigger
        className={`h-8 text-xs gap-1.5 ${ownerId != null ? "border-primary text-primary font-medium" : ""} ${className ?? "w-40"}`}
      >
        <Users className="h-3.5 w-3.5 shrink-0" />
        <SelectValue placeholder={t("owners.owner")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("owners.allOwners")}</SelectItem>
        {owners.map((o: any) => (
          <SelectItem key={o.id} value={String(o.id)}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
