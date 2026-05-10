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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  Loader2,
  PackageOpen,
  Filter,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

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
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "owner";
  const [filterType, setFilterType] = useState<string>("all");
  const utils = trpc.useUtils();

  const { data: items = [], isLoading } = trpc.recycleBin.list.useQuery(
    filterType && filterType !== "all" ? { entityType: filterType } : {}
  );

  // ─── RESTORE MUTATIONS ──────────────────────────────────────────────────────
  const restoreAnimal = trpc.recycleBin.restoreAnimal.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Animal restored successfully"); },
    onError: (e) => toast.error(e.message),
  });
  const restoreExpense = trpc.recycleBin.restoreExpense.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Expense restored"); },
    onError: (e) => toast.error(e.message),
  });
  const restoreWeightLog = trpc.recycleBin.restoreWeightLog.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Weight entry restored"); },
    onError: (e) => toast.error(e.message),
  });
  const restoreLambingLog = trpc.recycleBin.restoreLambingLog.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Lambing record restored"); },
    onError: (e) => toast.error(e.message),
  });
  const restoreRationPlan = trpc.recycleBin.restoreRationPlan.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Ration plan restored"); },
    onError: (e) => toast.error(e.message),
  });
  const restoreFeedStock = trpc.recycleBin.restoreFeedStock.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Feed stock entry restored"); },
    onError: (e) => toast.error(e.message),
  });
  const restoreSale = trpc.recycleBin.restoreSale.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Sale record restored"); },
    onError: (e) => toast.error(e.message),
  });
  const restoreSpecies = trpc.recycleBin.restoreSpecies.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Species restored"); },
    onError: (e) => toast.error(e.message),
  });
  const restoreCategory = trpc.recycleBin.restoreCategory.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Category restored"); },
    onError: (e) => toast.error(e.message),
  });
  const restoreGroup = trpc.recycleBin.restoreGroup.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Group restored"); },
    onError: (e) => toast.error(e.message),
  });
  const restoreStatus = trpc.recycleBin.restoreStatus.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Status restored"); },
    onError: (e) => toast.error(e.message),
  });
  const restoreBirthType = trpc.recycleBin.restoreBirthType.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Birth type restored"); },
    onError: (e) => toast.error(e.message),
  });
  const restoreFeedItem = trpc.recycleBin.restoreFeedItem.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Feed item restored"); },
    onError: (e) => toast.error(e.message),
  });
  const restoreExpenseCategory = trpc.recycleBin.restoreExpenseCategory.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Expense category restored"); },
    onError: (e) => toast.error(e.message),
  });

  // ─── PURGE MUTATIONS ────────────────────────────────────────────────────────
  const purgeAnimal = trpc.recycleBin.purgeAnimal.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Animal permanently deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const purgeExpense = trpc.recycleBin.purgeExpense.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Expense permanently deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const purgeWeightLog = trpc.recycleBin.purgeWeightLog.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Weight entry permanently deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const purgeLambingLog = trpc.recycleBin.purgeLambingLog.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Lambing record permanently deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const purgeRationPlan = trpc.recycleBin.purgeRationPlan.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Ration plan permanently deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const purgeFeedStock = trpc.recycleBin.purgeFeedStock.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Feed stock entry permanently deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const purgeSale = trpc.recycleBin.purgeSale.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Sale permanently deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const purgeAll = trpc.recycleBin.purgeAll.useMutation({
    onSuccess: () => { utils.recycleBin.list.invalidate(); toast.success("Recycle bin emptied permanently"); },
    onError: (e) => toast.error(e.message),
  });

  function handleRestore(entityType: string, id: number) {
    switch (entityType) {
      case "animal": restoreAnimal.mutate({ id }); break;
      case "expense": restoreExpense.mutate({ id }); break;
      case "weightLog": restoreWeightLog.mutate({ id }); break;
      case "lambingLog": restoreLambingLog.mutate({ id }); break;
      case "rationPlan": restoreRationPlan.mutate({ id }); break;
      case "feedStock": restoreFeedStock.mutate({ id }); break;
      case "sale": restoreSale.mutate({ id }); break;
      case "species": restoreSpecies.mutate({ id }); break;
      case "category": restoreCategory.mutate({ id }); break;
      case "group": restoreGroup.mutate({ id }); break;
      case "status": restoreStatus.mutate({ id }); break;
      case "birthType": restoreBirthType.mutate({ id }); break;
      case "feedItem": restoreFeedItem.mutate({ id }); break;
      case "expenseCategory": restoreExpenseCategory.mutate({ id }); break;
    }
  }

  function handlePurge(entityType: string, id: number) {
    switch (entityType) {
      case "animal": purgeAnimal.mutate({ id }); break;
      case "expense": purgeExpense.mutate({ id }); break;
      case "weightLog": purgeWeightLog.mutate({ id }); break;
      case "lambingLog": purgeLambingLog.mutate({ id }); break;
      case "rationPlan": purgeRationPlan.mutate({ id }); break;
      case "feedStock": purgeFeedStock.mutate({ id }); break;
      case "sale": purgeSale.mutate({ id }); break;
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
              Recycle Bin
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              All soft-deleted records. Restore anytime or permanently delete (admin only).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by type" />
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
            {isAdmin && items.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Empty Bin
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      Empty Recycle Bin
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will <strong>permanently delete all {items.length} records</strong> in the recycle bin. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive hover:bg-destructive/90"
                      onClick={() => purgeAll.mutate()}
                    >
                      {purgeAll.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Permanently Delete All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
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
              <h3 className="text-lg font-medium text-muted-foreground">Recycle bin is empty</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Deleted items will appear here and can be restored at any time.
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
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            onClick={() => handleRestore(item.entityType, item.id)}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            Restore
                          </Button>

                          {/* Permanent delete (admin only, and only for supported types) */}
                          {isAdmin && ["animal", "expense", "weightLog", "lambingLog", "rationPlan", "feedStock", "sale"].includes(item.entityType) && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                  Delete Forever
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                                    <AlertTriangle className="h-5 w-5" />
                                    Permanently Delete
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to permanently delete <strong>{item.label}</strong>?
                                    This action <strong>cannot be undone</strong>.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive hover:bg-destructive/90"
                                    onClick={() => handlePurge(item.entityType, item.id)}
                                  >
                                    Delete Forever
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
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
