import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CalendarDays, Pencil, Wheat, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";

function StockStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "critical") return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">{t("dashboard.critical")}</Badge>;
  if (status === "low") return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">{t("dashboard.lowStock")}</Badge>;
  return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">{t("dashboard.adequate")}</Badge>;
}

function AddStockDialog({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    feedItemId: "",
    transactionDate: new Date().toISOString().split("T")[0],
    transactionType: "purchase",
    qty: "",
    unitCost: "",
    totalCost: "",
    supplierName: "",
    notes: "",
  });

  const { data: feedItems } = trpc.config.getFeedItems.useQuery();
  const utils = trpc.useUtils();

  const addStock = trpc.feed.addStockEntry.useMutation({
    onSuccess: () => {
      toast.success(t("feed.stockRecorded"));
      utils.feed.getStockStatus.invalidate();
      utils.feed.getStockLedger.invalidate();
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const computedTotal = form.qty && form.unitCost
    ? (parseFloat(form.qty) * parseFloat(form.unitCost)).toFixed(2)
    : form.totalCost;

  const handleSubmit = () => {
    if (!form.feedItemId || !form.qty) return toast.error(t("feed.feedItemQtyRequired"));
    addStock.mutate({
      feedItemId: parseInt(form.feedItemId),
      transactionDate: form.transactionDate,
      transactionType: form.transactionType as any,
      qty: form.qty,
      unitCost: form.unitCost || undefined,
      totalCost: computedTotal || undefined,
      supplierName: form.supplierName || undefined,
      notes: form.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><span className="text-lg leading-none">+</span> {t("feed.addStock")}</Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("feed.addStockEntry")}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Feed Item *</Label>
            <Select value={form.feedItemId} onValueChange={(v) => setForm((f) => ({ ...f, feedItemId: v }))}>
              <SelectTrigger><SelectValue placeholder={t("feed.selectFeedItem")} /></SelectTrigger>
              <SelectContent>
                {(feedItems ?? []).map((fi: any) => (
                  <SelectItem key={fi.id} value={String(fi.id)}>{fi.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={form.transactionDate} onChange={(e) => setForm((f) => ({ ...f, transactionDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select value={form.transactionType} onValueChange={(v) => setForm((f) => ({ ...f, transactionType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">{t("feed.purchase")}</SelectItem>
                  <SelectItem value="stock_count">{t("feed.stockCount")}</SelectItem>
                  <SelectItem value="adjustment">{t("feed.adjustment")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity *</Label>
              <Input type="number" placeholder="0.0" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("feed.unitCost")}</Label>
              <Input type="number" placeholder="0.00" value={form.unitCost} onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("feed.totalCost")}</Label>
              <Input
                type="number" step="0.01" placeholder="0.00"
                value={computedTotal ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, totalCost: e.target.value, unitCost: f.unitCost }))}
                className={form.qty && form.unitCost ? "bg-muted text-muted-foreground" : ""}
                readOnly={!!(form.qty && form.unitCost)}
              />
              {form.qty && form.unitCost && (
                <p className="text-xs text-muted-foreground">{parseFloat(form.qty).toFixed(1)} × EGP {parseFloat(form.unitCost).toFixed(2)}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("feed.supplier")}</Label>
              <Input placeholder={t("feed.supplierName")} value={form.supplierName} onChange={(e) => setForm((f) => ({ ...f, supplierName: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={addStock.isPending}>
            {addStock.isPending ? "Saving..." : "Save Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditStockDialog({ entry, onSuccess }: { entry: any; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    transactionDate: entry.transactionDate instanceof Date
      ? entry.transactionDate.toISOString().split("T")[0]
      : String(entry.transactionDate ?? "").split("T")[0],
    transactionType: entry.transactionType as string,
    qty: String(parseFloat(entry.qty)),
    unitCost: entry.unitCost ? String(parseFloat(entry.unitCost)) : "",
    totalCost: entry.totalCost ? String(parseFloat(entry.totalCost)) : "",
    supplierName: entry.supplierName ?? "",
    notes: entry.notes ?? "",
  });

  const editComputedTotal = form.qty && form.unitCost
    ? (parseFloat(form.qty) * parseFloat(form.unitCost)).toFixed(2)
    : form.totalCost;

  const { data: feedItems } = trpc.config.getFeedItems.useQuery();
  const utils = trpc.useUtils();

  const updateStock = trpc.feed.updateStockEntry.useMutation({
    onSuccess: () => {
      toast.success(t("feed.stockUpdated"));
      utils.feed.getStockLedger.invalidate();
      utils.feed.getStockStatus.invalidate();
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.qty) return toast.error(t("feed.qtyRequired"));
    updateStock.mutate({
      id: entry.id,
      transactionDate: form.transactionDate,
      transactionType: form.transactionType as any,
      qty: form.qty,
      unitCost: form.unitCost || null,
      totalCost: editComputedTotal || null,
      supplierName: form.supplierName || null,
      notes: form.notes || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("feed.editStockEntry")}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">{entry.feedItemName}</p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={form.transactionDate} onChange={(e) => setForm((f) => ({ ...f, transactionDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select value={form.transactionType} onValueChange={(v) => setForm((f) => ({ ...f, transactionType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">{t("feed.purchase")}</SelectItem>
                  <SelectItem value="stock_count">{t("feed.stockCount")}</SelectItem>
                  <SelectItem value="adjustment">{t("feed.adjustment")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity (kg) *</Label>
              <Input type="number" step="0.1" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("feed.unitCost")}</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={form.unitCost} onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("feed.totalCost")}</Label>
              <Input
                type="number" step="0.01" placeholder="0.00"
                value={editComputedTotal ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, totalCost: e.target.value }))}
                className={form.qty && form.unitCost ? "bg-muted text-muted-foreground" : ""}
                readOnly={!!(form.qty && form.unitCost)}
              />
              {form.qty && form.unitCost && (
                <p className="text-xs text-muted-foreground">{parseFloat(form.qty).toFixed(1)} × EGP {parseFloat(form.unitCost).toFixed(2)}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("feed.supplier")}</Label>
              <Input placeholder={t("feed.supplierName")} value={form.supplierName} onChange={(e) => setForm((f) => ({ ...f, supplierName: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Input placeholder={t("common.optionalNotes")} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={updateStock.isPending}>
            {updateStock.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddRationPlanDialog({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    categoryId: "",
    feedItemId: "",
    qtyPerHeadPerDay: "",
    effectiveDate: new Date().toISOString().split("T")[0],
    endDate: "",
  });
  const { data: feedItems } = trpc.config.getFeedItems.useQuery();
  const { data: categories } = trpc.config.getCategories.useQuery();
  const utils = trpc.useUtils();

  const createPlan = trpc.feed.createRationPlan.useMutation({
    onSuccess: () => {
      toast.success(t("feed.rationCreated"));
      utils.feed.getRationPlans.invalidate();
      utils.feed.getStockStatus.invalidate();
      setOpen(false);
      setForm({ categoryId: "", feedItemId: "", qtyPerHeadPerDay: "", effectiveDate: new Date().toISOString().split("T")[0], endDate: "" });
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.categoryId || !form.feedItemId || !form.qtyPerHeadPerDay || !form.effectiveDate) {
      return toast.error(t("feed.catFeedQtyDateRequired"));
    }
    createPlan.mutate({
      categoryId: parseInt(form.categoryId),
      feedItemId: parseInt(form.feedItemId),
      qtyPerHeadPerDay: form.qtyPerHeadPerDay,
      effectiveDate: form.effectiveDate,
      endDate: form.endDate || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><span className="text-lg leading-none">+</span> {t("feed.addRationPlan")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("feed.addRationPlan")}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("common.selectCategory")} /></SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Feed Item *</Label>
              <Select value={form.feedItemId} onValueChange={(v) => setForm((f) => ({ ...f, feedItemId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("feed.selectFeedItem")} /></SelectTrigger>
                <SelectContent>
                  {(feedItems ?? []).map((fi: any) => (
                    <SelectItem key={fi.id} value={String(fi.id)}>{fi.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Qty / Head / Day (kg) *</Label>
            <Input type="number" step="0.001" min="0" placeholder="0.000" value={form.qtyPerHeadPerDay} onChange={(e) => setForm((f) => ({ ...f, qtyPerHeadPerDay: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Effective Date *</Label>
              <Input type="date" value={form.effectiveDate} onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date (optional)</Label>
              <Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={createPlan.isPending}>
            {createPlan.isPending ? "Saving..." : "Create Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditRationPlanDialog({ plan, onSuccess }: { plan: any; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    categoryId: String(plan.categoryId),
    feedItemId: String(plan.feedItemId),
    qtyPerHeadPerDay: String(parseFloat(plan.qtyPerHeadPerDay)),
    effectiveDate: plan.effectiveDate instanceof Date
      ? plan.effectiveDate.toISOString().split("T")[0]
      : String(plan.effectiveDate ?? ""),
    endDate: plan.endDate
      ? (plan.endDate instanceof Date ? plan.endDate.toISOString().split("T")[0] : String(plan.endDate))
      : "",
    isActive: plan.isActive !== false,
  });

  const { data: feedItems } = trpc.config.getFeedItems.useQuery();
  const { data: categories } = trpc.config.getCategories.useQuery();
  const utils = trpc.useUtils();

  const updatePlan = trpc.feed.updateRationPlan.useMutation({
    onSuccess: () => {
      toast.success(t("feed.rationUpdated"));
      utils.feed.getRationPlans.invalidate();
      utils.feed.getStockStatus.invalidate();
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.qtyPerHeadPerDay || !form.effectiveDate || !form.categoryId || !form.feedItemId) {
      return toast.error(t("feed.catFeedQtyDateRequired"));
    }
    updatePlan.mutate({
      id: plan.id,
      categoryId: parseInt(form.categoryId),
      feedItemId: parseInt(form.feedItemId),
      qtyPerHeadPerDay: form.qtyPerHeadPerDay,
      effectiveDate: form.effectiveDate,
      endDate: form.endDate || null,
      isActive: form.isActive,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("feed.editRationPlan")}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {plan.categoryName} — {plan.feedItemName}
          </p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("common.selectCategory")} /></SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Feed Item *</Label>
              <Select value={form.feedItemId} onValueChange={(v) => setForm((f) => ({ ...f, feedItemId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("feed.selectFeedItem")} /></SelectTrigger>
                <SelectContent>
                  {(feedItems ?? []).map((fi: any) => (
                    <SelectItem key={fi.id} value={String(fi.id)}>{fi.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Qty / Head / Day (kg) *</Label>
            <Input
              type="number"
              step="0.001"
              min="0"
              value={form.qtyPerHeadPerDay}
              onChange={(e) => setForm((f) => ({ ...f, qtyPerHeadPerDay: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Effective Date *</Label>
              <Input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>End Date (optional)</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4"
            />
            <Label htmlFor="isActive">{t("common.active")}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={updatePlan.isPending}>
            {updatePlan.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Feed() {
  const { t } = useTranslation();
  const { data: stockStatus, isLoading: stockLoading } = trpc.feed.getStockStatus.useQuery();
  const { data: shrinkage } = trpc.feed.getShrinkage.useQuery();
  const { data: stockLedger, isLoading: ledgerLoading } = trpc.feed.getStockLedger.useQuery();
  const { data: rationPlans, isLoading: rationLoading } = trpc.feed.getRationPlans.useQuery();
  const utils = trpc.useUtils();

  const deleteFeedStock = trpc.recycleBin.deleteFeedStock.useMutation({
    onSuccess: () => {
      toast.success(t("feed.stockMovedToBin"));
      utils.feed.getStockLedger.invalidate();
      utils.feed.getStockStatus.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteRationPlan = trpc.recycleBin.deleteRationPlan.useMutation({
    onSuccess: () => {
      toast.success(t("feed.rationMovedToBin"));
      utils.feed.getRationPlans.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<number>>(new Set());
  const [bulkDateOpen, setBulkDateOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState(() => new Date().toISOString().split("T")[0]);

  const bulkUpdateDates = trpc.feed.bulkUpdateRationPlanDates.useMutation({
    onSuccess: (res) => {
      toast.success(t("feed.bulkDateUpdated", { count: res.updated }));
      setSelectedPlanIds(new Set());
      setBulkDateOpen(false);
      utils.feed.getRationPlans.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const togglePlanSelect = (id: number) => {
    setSelectedPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allIds = (rationPlans ?? []).map((p: any) => p.id as number);
    if (selectedPlanIds.size === allIds.length) {
      setSelectedPlanIds(new Set());
    } else {
      setSelectedPlanIds(new Set(allIds));
    }
  };

  const criticalCount = (stockStatus ?? []).filter((s: any) => s.status === "critical").length;
  const lowCount = (stockStatus ?? []).filter((s: any) => s.status === "low").length;
  const alertItems = (stockStatus ?? []).filter((s: any) => s.status === "critical" || s.status === "low");

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Wheat className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            {t("feed.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {criticalCount > 0 && <span className="text-red-600 font-medium">{t("feed.criticalCount", { count: criticalCount })} · </span>}
            {lowCount > 0 && <span className="text-amber-600 font-medium">{t("feed.lowCount", { count: lowCount })} · </span>}
            {t("feed.feedItemsTracked", { count: (stockStatus ?? []).length })}
          </p>
        </div>
        <AddStockDialog onSuccess={() => {}} />
      </div>

      {/* Low Stock Alert Banner */}
      {alertItems.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-amber-800 dark:text-amber-400 text-sm">{t("feed.lowStockAlerts")}</p>
              <div className="mt-2 space-y-1">
                {alertItems.map((item: any) => (
                  <div key={item.feedItemId} className="flex items-center gap-2 text-sm">
                    <StockStatusBadge status={item.status} />
                    <span className="font-medium">{item.feedItemName}</span>
                    <span className="text-muted-foreground">
                      — {item.daysRemaining !== 999
                        ? t("feed.kgRemainingDays", { qty: parseFloat(item.stockOnHand).toFixed(0), unit: item.unit, days: item.daysRemaining })
                        : `${parseFloat(item.stockOnHand).toFixed(0)} ${item.unit} ${t("feed.remaining")}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stock Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stockLoading && Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-l-4 border-l-muted">
            <CardContent className="pt-4 pb-4 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-10" />
            </CardContent>
          </Card>
        ))}
        {!stockLoading && (stockStatus ?? []).map((item: any) => (
          <Card key={item.feedItemId} className={`border-l-4 ${
            item.status === "critical" ? "border-l-red-500" :
            item.status === "low" ? "border-l-amber-500" : "border-l-green-500"
          }`}>
            <CardContent className="pt-4 pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-sm">{item.feedItemName}</p>
                  <p className="text-2xl font-bold mt-1">{parseFloat(item.stockOnHand).toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground">{item.unit}</p>
                  {item.consumedSinceCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      −{t("feed.kgUsedSince", { qty: parseFloat(item.consumedSinceCount).toFixed(0), days: item.daysSinceCount })}
                    </p>
                  )}
                  {(() => {
                    const sh = shrinkage?.byItemLatest?.[item.feedItemId];
                    if (!sh || Math.abs(sh.shrinkageQty) < 0.01) return null;
                    const lost = sh.shrinkageQty > 0;
                    return (
                      <p className={`text-xs mt-0.5 ${lost ? "text-red-600" : "text-green-600"}`}>
                        {lost
                          ? t("feed.shrinkageLost", { qty: Math.abs(sh.shrinkageQty).toFixed(1), unit: item.unit })
                          : t("feed.shrinkageSurplus", { qty: Math.abs(sh.shrinkageQty).toFixed(1), unit: item.unit })}
                      </p>
                    );
                  })()}
                </div>
                <div className="text-right">
                  <StockStatusBadge status={item.status} />
                  <p className="text-xs text-muted-foreground mt-2">
                    {item.daysRemaining === 999 ? "∞" : `${item.daysRemaining} ${t("feed.daysLabel")}`}
                  </p>
                  {item.runOutDate && item.daysRemaining !== 999 && (
                    <p className="text-xs text-muted-foreground">
                      {t("feed.outDate", { date: new Date(item.runOutDate).toLocaleDateString() })}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t("feed.perDayUnit", { qty: parseFloat(item.dailyConsumption ?? 0).toFixed(1), unit: item.unit })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {(!stockStatus || stockStatus.length === 0) && !stockLoading && (
          <Card className="col-span-4">
            <CardContent className="pt-6 text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              {t("feed.noFeedItems")}
            </CardContent>
          </Card>
        )}
      </div>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">{t("feed.stockLedger")}</TabsTrigger>
          <TabsTrigger value="rations">{t("feed.rationPlans")}</TabsTrigger>
          <TabsTrigger value="shrinkage">{t("feed.shrinkage")}</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.date")}</TableHead>
                      <TableHead>{t("feed.feedItem")}</TableHead>
                      <TableHead>{t("common.type")}</TableHead>
                      <TableHead>{t("common.quantity")}</TableHead>
                      <TableHead>{t("feed.unitCost")}</TableHead>
                      <TableHead>{t("feed.totalCost")}</TableHead>
                      <TableHead>{t("feed.supplier")}</TableHead>
                      <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 8 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (stockLedger ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                          {t("feed.noStockEntries")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      (stockLedger ?? []).map((entry: any) => (
                        <TableRow key={entry.id}>
                          <TableCell>{new Date(entry.transactionDate instanceof Date ? entry.transactionDate.toISOString() : entry.transactionDate).toLocaleDateString()}</TableCell>
                          <TableCell className="font-medium">{entry.feedItemName}</TableCell>
                          <TableCell className="capitalize">{entry.transactionType.replace("_", " ")}</TableCell>
                          <TableCell>{parseFloat(entry.qty).toFixed(1)}</TableCell>
                          <TableCell>{entry.unitCost ? `EGP ${parseFloat(entry.unitCost).toFixed(2)}` : "—"}</TableCell>
                          <TableCell>{entry.totalCost ? `EGP ${parseFloat(entry.totalCost).toFixed(2)}` : (entry.qty && entry.unitCost ? `EGP ${(parseFloat(entry.qty) * parseFloat(entry.unitCost)).toFixed(2)}` : "—")}</TableCell>
                          <TableCell className="text-muted-foreground">{entry.supplierName ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <EditStockDialog
                                entry={entry}
                                onSuccess={() => {}}
                              />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="flex items-center gap-2">
                                      <AlertTriangle className="h-5 w-5 text-destructive" />
                                      {t("feed.deleteFeedStockEntry")}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Move this <strong>{entry.feedItemName}</strong> entry to the Recycle Bin? You can restore it anytime.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                    <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteFeedStock.mutate({ id: entry.id })}>
                                      {t("common.moveToBin")}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rations">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              {selectedPlanIds.size > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">{selectedPlanIds.size} {t("feed.plansSelected")}</span>
                  <Dialog open={bulkDateOpen} onOpenChange={setBulkDateOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-2">
                        <CalendarDays className="h-4 w-4" />
                        {t("feed.updateEffectiveDate")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-sm">
                      <DialogHeader>
                        <DialogTitle>{t("feed.updateEffectiveDate")}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3 py-2">
                        <p className="text-sm text-muted-foreground">
                          {t("feed.bulkDateHint", { count: selectedPlanIds.size })}
                        </p>
                        <div className="space-y-1">
                          <Label>{t("feed.effectiveDate")}</Label>
                          <Input
                            type="date"
                            value={bulkDate}
                            onChange={(e) => setBulkDate(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setBulkDateOpen(false)}>{t("common.cancel")}</Button>
                        <Button
                          disabled={!bulkDate || bulkUpdateDates.isPending}
                          onClick={() => bulkUpdateDates.mutate({ ids: Array.from(selectedPlanIds), effectiveDate: bulkDate })}
                        >
                          {bulkUpdateDates.isPending ? t("common.saving") : t("common.save")}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setSelectedPlanIds(new Set())}>
                    {t("common.clearSelection")}
                  </Button>
                </>
              )}
            </div>
            <AddRationPlanDialog onSuccess={() => {}} />
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={(rationPlans ?? []).length > 0 && selectedPlanIds.size === (rationPlans ?? []).length}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead>{t("common.category")}</TableHead>
                      <TableHead>{t("feed.feedItem")}</TableHead>
                      <TableHead>{t("feed.qtyHeadDay")}</TableHead>
                      <TableHead>{t("feed.effectiveDate")}</TableHead>
                      <TableHead>{t("common.endDate")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                      <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rationLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 8 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (rationPlans ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                          {t("feed.noRationPlansConfigured")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      (rationPlans ?? []).map((plan: any) => (
                        <TableRow key={plan.id} className={selectedPlanIds.has(plan.id) ? "bg-muted/50" : ""}>
                          <TableCell className="w-10">
                            <Checkbox
                              checked={selectedPlanIds.has(plan.id)}
                              onCheckedChange={() => togglePlanSelect(plan.id)}
                              aria-label={`Select plan ${plan.id}`}
                            />
                          </TableCell>
                          <TableCell>{plan.categoryName}</TableCell>
                          <TableCell>{plan.feedItemName}</TableCell>
                          <TableCell>{parseFloat(plan.qtyPerHeadPerDay).toFixed(2)} {plan.unit}</TableCell>
                          <TableCell>{plan.effectiveDate ? new Date(plan.effectiveDate instanceof Date ? plan.effectiveDate.toISOString() : plan.effectiveDate).toLocaleDateString() : "—"}</TableCell>
                          <TableCell>{plan.endDate ? new Date(plan.endDate instanceof Date ? plan.endDate.toISOString() : plan.endDate).toLocaleDateString() : "Ongoing"}</TableCell>
                          <TableCell>
                            {plan.isActive ? (
                              <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">{t("common.active")}</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">{t("feed.inactive")}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <EditRationPlanDialog
                                plan={plan}
                                onSuccess={() => utils.feed.getRationPlans.invalidate()}
                              />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="flex items-center gap-2">
                                      <AlertTriangle className="h-5 w-5 text-destructive" />
                                      {t("feed.deleteRationPlan")}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Move ration plan for <strong>{plan.categoryName}</strong> to the Recycle Bin? You can restore it anytime.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                    <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteRationPlan.mutate({ id: plan.id })}>
                                      {t("common.moveToBin")}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shrinkage">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <h4 className="font-semibold text-sm mb-1">{t("feed.shrinkageMonthly")}</h4>
                <p className="text-xs text-muted-foreground mb-3">{t("feed.shrinkageExplain")}</p>
                {(shrinkage?.byMonth ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">{t("feed.shrinkageNone")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("feed.month")}</TableHead>
                        <TableHead className="text-right">{t("feed.shrinkageQty")}</TableHead>
                        <TableHead className="text-right">{t("feed.shrinkageValue")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(shrinkage?.byMonth ?? []).map((m: any) => (
                        <TableRow key={m.month}>
                          <TableCell>{m.month}</TableCell>
                          <TableCell className={`text-right ${m.shrinkageQty > 0 ? "text-red-600" : "text-green-600"}`}>
                            {m.shrinkageQty > 0 ? "" : "+"}{(-m.shrinkageQty).toFixed(1) === "0.0" ? m.shrinkageQty.toFixed(1) : m.shrinkageQty.toFixed(1)} kg
                          </TableCell>
                          <TableCell className={`text-right ${m.shrinkageValue > 0 ? "text-red-600" : "text-green-600"}`}>
                            EGP {m.shrinkageValue.toLocaleString("en-EG", { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {(shrinkage?.rows ?? []).length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">{t("feed.shrinkageDetail")}</h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("feed.feedItem")}</TableHead>
                          <TableHead>{t("feed.period")}</TableHead>
                          <TableHead className="text-right">{t("feed.expected")}</TableHead>
                          <TableHead className="text-right">{t("feed.counted")}</TableHead>
                          <TableHead className="text-right">{t("feed.shrinkage")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(shrinkage?.rows ?? []).slice().reverse().map((r: any, idx: number) => (
                          <TableRow key={`${r.feedItemId}-${r.toDate}-${idx}`}>
                            <TableCell className="font-medium">{r.feedItemName}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(r.fromDate).toLocaleDateString()} → {new Date(r.toDate).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">{r.expectedQty.toFixed(1)} {r.unit}</TableCell>
                            <TableCell className="text-right">{r.actualQty.toFixed(1)} {r.unit}</TableCell>
                            <TableCell className={`text-right font-medium ${r.shrinkageQty > 0 ? "text-red-600" : r.shrinkageQty < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                              {r.shrinkageQty > 0 ? "−" : r.shrinkageQty < 0 ? "+" : ""}{Math.abs(r.shrinkageQty).toFixed(1)} {r.unit}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
