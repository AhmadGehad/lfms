import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Trash2,
  RotateCcw,
  Loader2,
  PackageOpen,
  Filter,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

const ENTITY_TYPES = [
  { value: "all", label: "All Types" },
  { value: "animal", label: "Animals" },
  { value: "expense", label: "Expenses" },
  { value: "weightLog", label: "Weight Entries" },
  { value: "lambingLog", label: "Lambing Records" },
  { value: "rationPlan", label: "Ration Plans" },
  { value: "feedStock", label: "Feed Stock Entries" },
  { value: "sale", label: "Sales" },
  { value: "species", label: "Species" },
  { value: "category", label: "Categories" },
  { value: "group", label: "Groups" },
  { value: "status", label: "Statuses" },
  { value: "birthType", label: "Birth Types" },
  { value: "feedItem", label: "Feed Items" },
  { value: "expenseCategory", label: "Expense Categories" },
];

const ENTITY_COLORS: Record<string, string> = {
  animal: "bg-emerald-100 text-emerald-800",
  expense: "bg-red-100 text-red-800",
  weightLog: "bg-blue-100 text-blue-800",
  lambingLog: "bg-purple-100 text-purple-800",
  rationPlan: "bg-yellow-100 text-yellow-800",
  feedStock: "bg-orange-100 text-orange-800",
  sale: "bg-pink-100 text-pink-800",
  species: "bg-teal-100 text-teal-800",
  category: "bg-indigo-100 text-indigo-800",
  group: "bg-cyan-100 text-cyan-800",
  status: "bg-gray-100 text-gray-800",
  birthType: "bg-lime-100 text-lime-800",
  feedItem: "bg-amber-100 text-amber-800",
  expenseCategory: "bg-rose-100 text-rose-800",
};

function formatDate(d: Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RecycleBin() {
  const { t } = useTranslation();
  const { canRestore } = usePermissions("recycleBin");
  const [filterType, setFilterType] = useState<string>("all");
  const utils = trpc.useUtils();

  const { data: items = [], isLoading } = trpc.recycleBin.list.useQuery(
    filterType && filterType !== "all" ? { entityType: filterType } : {}
  );

  // ─── RESTORE MUTATIONS ──────────────────────────────────────────────────────
  const invalidateAll = () => {
    utils.recycleBin.list.invalidate();
    utils.animals.list.invalidate();
    utils.animals.getAllPnL.invalidate();
    utils.expenses.list.invalidate();
    utils.sales.list.invalidate();
    utils.feed.getStockStatus.invalidate();
    utils.feed.getRationPlans.invalidate();
    utils.feed.getStockLedger.invalidate();
    utils.breeding.listLambing.invalidate();
    utils.dashboard.getKPIs.invalidate();
    utils.dashboard.getHeadCountByCategory.invalidate();
    utils.dashboard.getFeedStockStatus.invalidate();
    utils.config.getCategories.invalidate();
    utils.config.getSpecies.invalidate();
    utils.config.getGroups.invalidate();
    utils.config.getStatuses.invalidate();
    utils.config.getFeedItems.invalidate();
    utils.config.getExpenseCategories.invalidate();
  };

  const restoreAnimal = trpc.recycleBin.restoreAnimal.useMutation({
    onSuccess: () => { invalidateAll(); toast.success(`${t("animals.title")} ${t("recycleBin.restored")}`); },
    onError: (e) => toast.error(e.message),
  });
  const restoreExpense = trpc.recycleBin.restoreExpense.useMutation({
    onSuccess: () => { invalidateAll(); toast.success(`${t("nav.expenses")} ${t("recycleBin.restored")}`); },
    onError: (e) => toast.error(e.message),
  });
  const restoreWeightLog = trpc.recycleBin.restoreWeightLog.useMutation({
    onSuccess: () => { invalidateAll(); toast.success(`${t("animalProfile.weightLog")} ${t("recycleBin.restored")}`); },
    onError: (e) => toast.error(e.message),
  });
  const restoreLambingLog = trpc.recycleBin.restoreLambingLog.useMutation({
    onSuccess: () => { invalidateAll(); toast.success(`${t("breeding.lambingLog")} ${t("recycleBin.restored")}`); },
    onError: (e) => toast.error(e.message),
  });
  const restoreRationPlan = trpc.recycleBin.restoreRationPlan.useMutation({
    onSuccess: () => { invalidateAll(); toast.success(`${t("feed.rationPlans")} ${t("recycleBin.restored")}`); },
    onError: (e) => toast.error(e.message),
  });
  const restoreFeedStock = trpc.recycleBin.restoreFeedStock.useMutation({
    onSuccess: () => { invalidateAll(); toast.success(`${t("feed.stockLedger")} ${t("recycleBin.restored")}`); },
    onError: (e) => toast.error(e.message),
  });
  const restoreSale = trpc.recycleBin.restoreSale.useMutation({
    onSuccess: () => { invalidateAll(); toast.success(`${t("nav.sales")} ${t("recycleBin.restored")}`); },
    onError: (e) => toast.error(e.message),
  });
  const restoreSpecies = trpc.recycleBin.restoreSpecies.useMutation({
    onSuccess: () => { invalidateAll(); toast.success(`${t("config.species")} ${t("recycleBin.restored")}`); },
    onError: (e) => toast.error(e.message),
  });
  const restoreCategory = trpc.recycleBin.restoreCategory.useMutation({
    onSuccess: () => { invalidateAll(); toast.success(`${t("config.categories")} ${t("recycleBin.restored")}`); },
    onError: (e) => toast.error(e.message),
  });
  const restoreGroup = trpc.recycleBin.restoreGroup.useMutation({
    onSuccess: () => { invalidateAll(); toast.success(`${t("config.groups")} ${t("recycleBin.restored")}`); },
    onError: (e) => toast.error(e.message),
  });
  const restoreStatus = trpc.recycleBin.restoreStatus.useMutation({
    onSuccess: () => { invalidateAll(); toast.success(`${t("config.statusLabel")} ${t("recycleBin.restored")}`); },
    onError: (e) => toast.error(e.message),
  });
  const restoreBirthType = trpc.recycleBin.restoreBirthType.useMutation({
    onSuccess: () => { invalidateAll(); toast.success(`${t("config.birthTypes")} ${t("recycleBin.restored")}`); },
    onError: (e) => toast.error(e.message),
  });
  const restoreFeedItem = trpc.recycleBin.restoreFeedItem.useMutation({
    onSuccess: () => { invalidateAll(); toast.success(`${t("config.feedItems")} ${t("recycleBin.restored")}`); },
    onError: (e) => toast.error(e.message),
  });
  const restoreExpenseCategory = trpc.recycleBin.restoreExpenseCategory.useMutation({
    onSuccess: () => { invalidateAll(); toast.success(`${t("config.expenseCategories")} ${t("recycleBin.restored")}`); },
    onError: (e) => toast.error(e.message),
  });

  function handleRestore(entityType: string, id: number, expectedVersion: number) {
    const input = { id, expectedVersion };
    switch (entityType) {
      case "animal": restoreAnimal.mutate(input); break;
      case "expense": restoreExpense.mutate(input); break;
      case "weightLog": restoreWeightLog.mutate(input); break;
      case "lambingLog": restoreLambingLog.mutate(input); break;
      case "rationPlan": restoreRationPlan.mutate(input); break;
      case "feedStock": restoreFeedStock.mutate(input); break;
      case "sale": restoreSale.mutate(input); break;
      case "species": restoreSpecies.mutate(input); break;
      case "category": restoreCategory.mutate(input); break;
      case "group": restoreGroup.mutate(input); break;
      case "status": restoreStatus.mutate(input); break;
      case "birthType": restoreBirthType.mutate(input); break;
      case "feedItem": restoreFeedItem.mutate(input); break;
      case "expenseCategory": restoreExpenseCategory.mutate(input); break;
    }
  }

  const groupedItems = items.reduce<Record<string, typeof items>>((acc, item) => {
    if (!acc[item.entityType]) acc[item.entityType] = [];
    acc[item.entityType].push(item);
    return acc;
  }, {});

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Trash2 className="h-6 w-6 text-destructive" />
              {t("recycleBin.title")}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Soft-deleted records remain recoverable. Permanent deletion is managed by platform retention policy.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t("recycleBin.filterByType")} />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(groupedItems).map(([type, typeItems]) => (
            <Card key={type} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground capitalize">{type.replace(/([A-Z])/g, " $1")}</span>
                  <Badge className={ENTITY_COLORS[type] ?? "bg-gray-100 text-gray-800"}>
                    {typeItems.length}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Items */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <PackageOpen className="h-16 w-16 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">{t("recycleBin.empty")}</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                {t("recycleBin.emptyHint")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedItems).map(([type, typeItems]) => (
              <Card key={type} className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Badge className={ENTITY_COLORS[type] ?? "bg-gray-100 text-gray-800"}>
                      {type.replace(/([A-Z])/g, " $1")}
                    </Badge>
                    <span className="text-muted-foreground font-normal">
                      {typeItems.length} item{typeItems.length !== 1 ? "s" : ""}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {typeItems.map((item) => (
                      <div
                        key={`${item.entityType}-${item.id}`}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">
                            {item.label}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Deleted {formatDate(item.deletedAt)}
                          </p>
                          {/* Show meta info */}
                          <div className="flex flex-wrap gap-2 mt-1">
                            {Object.entries(item.meta).slice(0, 3).map(([k, v]) => (
                              <span key={k} className="text-xs text-muted-foreground">
                                <span className="font-medium">{k}:</span> {String(v)}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          {/* Restore */}
                          {canRestore && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            onClick={() => handleRestore(item.entityType, item.id, item.version)}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            {t("recycleBin.restore")}
                          </Button>
                          )}

                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
