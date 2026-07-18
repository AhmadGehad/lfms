import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useCurrency } from "@/hooks/useCurrency";
import { usePermissions } from "@/hooks/usePermissions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, Pencil, Plus, Trash2, Wheat } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { StatusBadge, type StatusTone } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { ConsequenceConfirm } from "../components/ConsequenceConfirm";
import { FormSection, FormField, FormFooter } from "../components/FormLayout";

function fmtDate(d: unknown) {
  if (!d) return "—";
  const x = new Date(d as string);
  return Number.isNaN(x.getTime()) ? "—" : x.toLocaleDateString();
}
const toDateInput = (d: unknown) =>
  d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : "";
function stockTone(status?: string): StatusTone {
  if (status === "critical") return "danger";
  if (status === "low") return "warning";
  return "success";
}
const today = () => new Date().toISOString().slice(0, 10);

type StockForm = {
  feedItemId: string; transactionDate: string; transactionType: string;
  qty: string; unitCost: string; totalCost: string; supplierName: string; notes: string;
};
type RationForm = {
  categoryId: string; feedItemId: string; qtyPerHeadPerDay: string;
  effectiveDate: string; endDate: string; isActive: boolean;
};
type PriceForm = { feedItemId: string; effectiveDate: string; pricePerUnit: string; notes: string };

const blankStock = (): StockForm => ({ feedItemId: "", transactionDate: today(), transactionType: "purchase", qty: "", unitCost: "", totalCost: "", supplierName: "", notes: "" });
const blankRation = (): RationForm => ({ categoryId: "", feedItemId: "", qtyPerHeadPerDay: "", effectiveDate: today(), endDate: "", isActive: true });
const blankPrice = (): PriceForm => ({ feedItemId: "", effectiveDate: today(), pricePerUnit: "", notes: "" });

/** Stock-entry fields shared by the add and edit dialogs (total auto-computed). */
function StockFormFields({ form, setForm, lockItem }: {
  form: StockForm;
  setForm: React.Dispatch<React.SetStateAction<StockForm>>;
  lockItem?: boolean;
}) {
  const { t } = useTranslation();
  const { data: feedItems } = trpc.config.getFeedItems.useQuery();
  const computedTotal = form.qty && form.unitCost
    ? (parseFloat(form.qty) * parseFloat(form.unitCost)).toFixed(2)
    : form.totalCost;

  return (
    <FormSection>
      {!lockItem && (
        <FormField label={t("feed.item", "Feed item")} required>
          <Select value={form.feedItemId} onValueChange={v => setForm(f => ({ ...f, feedItemId: v }))}>
            <SelectTrigger><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
            <SelectContent>{((feedItems as any[]) ?? []).map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
      )}
      <FormField label={t("feed.type", "Type")} required>
        <Select value={form.transactionType} onValueChange={v => setForm(f => ({ ...f, transactionType: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="purchase">{t("feed.purchase", "Purchase")}</SelectItem>
            <SelectItem value="stock_count">{t("feed.stockCount", "Stock count")}</SelectItem>
            <SelectItem value="adjustment">{t("feed.adjustment", "Adjustment")}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <FormField label={t("feed.date", "Date")} required>
        <Input type="date" value={form.transactionDate} onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))} />
      </FormField>
      <FormField label={t("feed.qty", "Quantity")} required>
        <Input type="number" inputMode="decimal" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} />
      </FormField>
      <FormField label={t("feed.unitCost", "Unit cost")}>
        <Input type="number" inputMode="decimal" value={form.unitCost} onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} />
      </FormField>
      <FormField
        label={t("feed.totalCost", "Total cost")}
        hint={form.qty && form.unitCost ? `${parseFloat(form.qty).toFixed(1)} × ${parseFloat(form.unitCost).toFixed(2)}` : undefined}
      >
        <Input
          type="number"
          inputMode="decimal"
          value={computedTotal ?? ""}
          onChange={e => setForm(f => ({ ...f, totalCost: e.target.value }))}
          readOnly={!!(form.qty && form.unitCost)}
          className={form.qty && form.unitCost ? "bg-surface text-muted-foreground" : ""}
        />
      </FormField>
      <FormField label={t("feed.supplier", "Supplier")}>
        <Input value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} />
      </FormField>
      <FormField label={t("common.notes", "Notes")} full>
        <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </FormField>
    </FormSection>
  );
}

/** Ration-plan fields shared by the add and edit dialogs. */
function RationFormFields({ form, setForm, showActive }: {
  form: RationForm;
  setForm: React.Dispatch<React.SetStateAction<RationForm>>;
  showActive?: boolean;
}) {
  const { t } = useTranslation();
  const { data: feedItems } = trpc.config.getFeedItems.useQuery();
  const { data: categories } = trpc.config.getCategories.useQuery();

  return (
    <FormSection>
      <FormField label={t("animals.category", "Category")} required>
        <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
          <SelectTrigger><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
          <SelectContent>{((categories as any[]) ?? []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </FormField>
      <FormField label={t("feed.item", "Feed item")} required>
        <Select value={form.feedItemId} onValueChange={v => setForm(f => ({ ...f, feedItemId: v }))}>
          <SelectTrigger><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
          <SelectContent>{((feedItems as any[]) ?? []).map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}</SelectContent>
        </Select>
      </FormField>
      <FormField label={t("feed.qtyPerHead", "Qty / head / day")} required>
        <Input type="number" inputMode="decimal" step="0.001" min="0" value={form.qtyPerHeadPerDay} onChange={e => setForm(f => ({ ...f, qtyPerHeadPerDay: e.target.value }))} />
      </FormField>
      <FormField label={t("feed.effective", "Effective date")} required>
        <Input type="date" value={form.effectiveDate} onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))} />
      </FormField>
      <FormField label={t("feed.endDate", "End date (optional)")}>
        <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
      </FormField>
      {showActive && (
        <FormField label={t("animals.status", "Status")}>
          <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--primary)]"
              checked={form.isActive}
              onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
            />
            {t("feed.active", "Active")}
          </label>
        </FormField>
      )}
    </FormSection>
  );
}

/**
 * New Feed. Stock / Ledger / Rations / Prices / Shrinkage preserving all Old
 * functionality (edit + delete-to-bin on ledger and rations, bulk effective-date
 * update, feed price history CRUD, shrinkage report), with low-stock emphasis
 * on the Stock view (the daily Supervisor task). Same tRPC + permissions as Old.
 */
export default function NewFeed() {
  const { t } = useTranslation();
  const { fmt } = useCurrency();
  const perms = usePermissions();
  const canCreate = perms.can("feed", "create");
  const canUpdate = perms.can("feed", "update");
  const canDelete = perms.can("feed", "delete");
  const utils = trpc.useUtils();

  const [activeTab, setActiveTab] = useState<string>("stock");

  const { data: stock, isLoading: stockLoading } = trpc.feed.getStockStatus.useQuery(undefined, {
    enabled: activeTab === "stock",
  });
  const { data: rations, isLoading: rationsLoading } = trpc.feed.getRationPlans.useQuery(undefined, {
    enabled: activeTab === "rations",
  });
  const { data: ledger, isLoading: ledgerLoading } = trpc.feed.getStockLedger.useQuery(undefined, {
    enabled: activeTab === "ledger",
  });
  const { data: shrinkage } = trpc.feed.getShrinkage.useQuery(undefined, {
    enabled: activeTab === "shrinkage",
  });
  const { data: prices, isLoading: pricesLoading } = trpc.config.getAllFeedItemPrices.useQuery(undefined, {
    enabled: activeTab === "prices",
  });

  // ── Stock entries (add / edit / delete) ──────────────────────────────────
  const [stockOpen, setStockOpen] = useState(false);
  const [stockIdempotencyKey, setStockIdempotencyKey] = useState(() => crypto.randomUUID());
  const [stockForm, setStockForm] = useState<StockForm>(blankStock());
  const [editEntry, setEditEntry] = useState<any | null>(null);
  const [editStockForm, setEditStockForm] = useState<StockForm>(blankStock());
  const [deleteEntry, setDeleteEntry] = useState<any | null>(null);

  const invalidateStock = () => {
    utils.feed.getStockStatus.invalidate();
    utils.feed.getStockLedger.invalidate();
  };
  const addStock = trpc.feed.addStockEntry.useMutation({
    onSuccess: () => { invalidateStock(); toast.success(t("feed.stockAdded", "Stock entry added")); setStockOpen(false); setStockIdempotencyKey(crypto.randomUUID()); },
    onError: e => toast.error(e.message),
  });
  const updateStock = trpc.feed.updateStockEntry.useMutation({
    onSuccess: () => { invalidateStock(); toast.success(t("feed.stockUpdated", "Stock entry updated")); setEditEntry(null); },
    onError: e => toast.error(e.message),
  });
  const deleteFeedStock = trpc.recycleBin.deleteFeedStock.useMutation({
    onSuccess: () => { invalidateStock(); toast.success(t("feed.stockMovedToBin", "Stock entry moved to Recycle Bin")); setDeleteEntry(null); },
    onError: e => toast.error(e.message),
  });

  const submitStock = () => {
    if (!stockForm.feedItemId || !(parseFloat(stockForm.qty) > 0)) { toast.error(t("feed.feedItemQtyRequired", "Pick a feed item and quantity")); return; }
    const computedTotal = stockForm.qty && stockForm.unitCost
      ? (parseFloat(stockForm.qty) * parseFloat(stockForm.unitCost)).toFixed(2)
      : stockForm.totalCost;
    addStock.mutate({
      feedItemId: Number(stockForm.feedItemId),
      transactionDate: stockForm.transactionDate,
      transactionType: stockForm.transactionType as any,
      qty: stockForm.qty,
      unitCost: stockForm.unitCost || undefined,
      totalCost: computedTotal || undefined,
      supplierName: stockForm.supplierName || undefined,
      notes: stockForm.notes || undefined,
      idempotencyKey: stockIdempotencyKey,
    } as any);
  };
  const startEditEntry = (e: any) => {
    setEditStockForm({
      feedItemId: String(e.feedItemId ?? ""),
      transactionDate: toDateInput(e.transactionDate),
      transactionType: e.transactionType,
      qty: String(parseFloat(e.qty)),
      unitCost: e.unitCost ? String(parseFloat(e.unitCost)) : "",
      totalCost: e.totalCost ? String(parseFloat(e.totalCost)) : "",
      supplierName: e.supplierName ?? "",
      notes: e.notes ?? "",
    });
    setEditEntry(e);
  };
  const submitEditEntry = () => {
    if (!editEntry) return;
    if (!(parseFloat(editStockForm.qty) > 0)) { toast.error(t("feed.qtyRequired", "Enter a quantity")); return; }
    const computedTotal = editStockForm.qty && editStockForm.unitCost
      ? (parseFloat(editStockForm.qty) * parseFloat(editStockForm.unitCost)).toFixed(2)
      : editStockForm.totalCost;
    updateStock.mutate({
      id: editEntry.id,
      expectedVersion: editEntry.version,
      transactionDate: editStockForm.transactionDate,
      transactionType: editStockForm.transactionType as any,
      qty: editStockForm.qty,
      unitCost: editStockForm.unitCost || null,
      totalCost: computedTotal || null,
      supplierName: editStockForm.supplierName || null,
      notes: editStockForm.notes || null,
    } as any);
  };

  // ── Ration plans (add / edit / delete / bulk date) ───────────────────────
  const [rationOpen, setRationOpen] = useState(false);
  const [rationIdempotencyKey, setRationIdempotencyKey] = useState(() => crypto.randomUUID());
  const [rationForm, setRationForm] = useState<RationForm>(blankRation());
  const [editPlan, setEditPlan] = useState<any | null>(null);
  const [editRationForm, setEditRationForm] = useState<RationForm>(blankRation());
  const [deletePlan, setDeletePlan] = useState<any | null>(null);
  const [selectedPlanKeys, setSelectedPlanKeys] = useState<Set<string | number>>(new Set());
  const [bulkDateOpen, setBulkDateOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState(today());

  const invalidateRations = () => {
    utils.feed.getRationPlans.invalidate();
    utils.feed.getStockStatus.invalidate();
  };
  const createRation = trpc.feed.createRationPlan.useMutation({
    onSuccess: () => { invalidateRations(); toast.success(t("feed.rationCreated", "Ration plan created")); setRationOpen(false); setRationIdempotencyKey(crypto.randomUUID()); },
    onError: e => toast.error(e.message),
  });
  const updateRation = trpc.feed.updateRationPlan.useMutation({
    onSuccess: () => { invalidateRations(); toast.success(t("feed.rationUpdated", "Ration plan updated")); setEditPlan(null); },
    onError: e => toast.error(e.message),
  });
  const deleteRationPlan = trpc.recycleBin.deleteRationPlan.useMutation({
    onSuccess: () => { invalidateRations(); toast.success(t("feed.rationMovedToBin", "Ration plan moved to Recycle Bin")); setDeletePlan(null); },
    onError: e => toast.error(e.message),
  });
  const bulkUpdateDates = trpc.feed.bulkUpdateRationPlanDates.useMutation({
    onSuccess: (res: any) => {
      toast.success(t("feed.bulkDateUpdated", "{{count}} plans updated", { count: res?.updated ?? 0 }));
      setSelectedPlanKeys(new Set());
      setBulkDateOpen(false);
      utils.feed.getRationPlans.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const submitRation = () => {
    if (!rationForm.categoryId || !rationForm.feedItemId || !(parseFloat(rationForm.qtyPerHeadPerDay) > 0) || !rationForm.effectiveDate) {
      toast.error(t("feed.catFeedQtyDateRequired", "Category, feed item, quantity and date are required"));
      return;
    }
    createRation.mutate({
      categoryId: Number(rationForm.categoryId),
      feedItemId: Number(rationForm.feedItemId),
      qtyPerHeadPerDay: rationForm.qtyPerHeadPerDay,
      effectiveDate: rationForm.effectiveDate,
      endDate: rationForm.endDate || undefined,
      idempotencyKey: rationIdempotencyKey,
    } as any);
  };
  const startEditPlan = (p: any) => {
    setEditRationForm({
      categoryId: String(p.categoryId),
      feedItemId: String(p.feedItemId),
      qtyPerHeadPerDay: String(parseFloat(p.qtyPerHeadPerDay)),
      effectiveDate: toDateInput(p.effectiveDate),
      endDate: toDateInput(p.endDate),
      isActive: p.isActive !== false,
    });
    setEditPlan(p);
  };
  const submitEditPlan = () => {
    if (!editPlan) return;
    if (!editRationForm.categoryId || !editRationForm.feedItemId || !(parseFloat(editRationForm.qtyPerHeadPerDay) > 0) || !editRationForm.effectiveDate) {
      toast.error(t("feed.catFeedQtyDateRequired", "Category, feed item, quantity and date are required"));
      return;
    }
    updateRation.mutate({
      id: editPlan.id,
      expectedVersion: editPlan.version,
      categoryId: Number(editRationForm.categoryId),
      feedItemId: Number(editRationForm.feedItemId),
      qtyPerHeadPerDay: editRationForm.qtyPerHeadPerDay,
      effectiveDate: editRationForm.effectiveDate,
      endDate: editRationForm.endDate || null,
      isActive: editRationForm.isActive,
    } as any);
  };

  // ── Feed prices (add / edit / delete) ────────────────────────────────────
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceForm, setPriceForm] = useState<PriceForm>(blankPrice());
  const [editPrice, setEditPrice] = useState<any | null>(null);
  const [deletePriceRow, setDeletePriceRow] = useState<any | null>(null);
  const { data: feedItems } = trpc.config.getFeedItems.useQuery();

  const addPrice = trpc.config.addFeedItemPrice.useMutation({
    onSuccess: () => { utils.config.getAllFeedItemPrices.invalidate(); toast.success(t("feed.priceSaved", "Price saved")); setPriceOpen(false); },
    onError: e => toast.error(e.message),
  });
  const updatePrice = trpc.config.updateFeedItemPrice.useMutation({
    onSuccess: () => { utils.config.getAllFeedItemPrices.invalidate(); toast.success(t("feed.priceSaved", "Price saved")); setEditPrice(null); },
    onError: e => toast.error(e.message),
  });
  const deletePrice = trpc.config.deleteFeedItemPrice.useMutation({
    onSuccess: () => { utils.config.getAllFeedItemPrices.invalidate(); toast.success(t("feed.priceDeleted", "Price deleted")); setDeletePriceRow(null); },
    onError: e => toast.error(e.message),
  });

  const submitPrice = () => {
    if (!priceForm.feedItemId || !priceForm.pricePerUnit || !priceForm.effectiveDate) { toast.error(t("feed.priceFieldsRequired", "Feed item, price and date are required")); return; }
    addPrice.mutate({
      feedItemId: Number(priceForm.feedItemId),
      effectiveDate: priceForm.effectiveDate,
      pricePerUnit: priceForm.pricePerUnit,
      notes: priceForm.notes || undefined,
    } as any);
  };
  const startEditPrice = (p: any) => {
    setPriceForm({
      feedItemId: String(p.feedItemId),
      effectiveDate: toDateInput(p.effectiveDate),
      pricePerUnit: String(parseFloat(p.pricePerUnit)),
      notes: p.notes ?? "",
    });
    setEditPrice(p);
  };
  const submitEditPrice = () => {
    if (!editPrice) return;
    if (!priceForm.pricePerUnit || !priceForm.effectiveDate) { toast.error(t("feed.priceFieldsRequired", "Feed item, price and date are required")); return; }
    updatePrice.mutate({
      id: editPrice.id,
      expectedVersion: editPrice.version,
      effectiveDate: priceForm.effectiveDate,
      pricePerUnit: priceForm.pricePerUnit,
      notes: priceForm.notes || null,
    } as any);
  };

  // ── Columns ──────────────────────────────────────────────────────────────
  const stockRows = (stock as any[]) ?? [];
  const stockCols: Column<any>[] = [
    { id: "item", header: t("feed.item", "Feed item"), cell: i => <span className="font-medium">{i.feedItemName}</span>, sortValue: i => i.feedItemName, primary: true, mobileLabel: t("feed.item", "Feed item") },
    { id: "onhand", header: t("feed.onHand", "On hand"), cell: i => `${parseFloat(i.stockOnHand ?? 0).toFixed(1)} ${i.unit ?? ""}`, sortValue: i => parseFloat(i.stockOnHand ?? 0), mobileLabel: t("feed.onHand", "On hand") },
    { id: "daily", header: t("feed.dailyUse", "Daily use"), cell: i => `${parseFloat(i.dailyConsumption ?? 0).toFixed(2)}`, hideable: true, mobileLabel: t("feed.dailyUse", "Daily use") },
    { id: "days", header: t("feed.daysLeft", "Days left"), cell: i => <span className={i.daysRemaining < 7 ? "font-medium text-danger-soft-foreground" : i.daysRemaining < 14 ? "text-warning-soft-foreground" : "text-foreground"}>{i.daysRemaining === 999 ? "∞" : i.daysRemaining}</span>, sortValue: i => i.daysRemaining, mobileLabel: t("feed.daysLeft", "Days left") },
    { id: "runout", header: t("feed.runOut", "Run-out"), cell: i => (i.runOutDate && i.daysRemaining !== 999 ? fmtDate(i.runOutDate) : "—"), sortValue: i => i.runOutDate, hideable: true, defaultHidden: true, mobileLabel: t("feed.runOut", "Run-out") },
    {
      id: "shrinkage",
      header: t("feed.shrinkage", "Shrinkage"),
      cell: i => {
        const sh = (shrinkage as any)?.byItemLatest?.[i.feedItemId];
        if (!sh || Math.abs(sh.shrinkageQty) < 0.01) return <span className="text-muted-foreground">—</span>;
        const lost = sh.shrinkageQty > 0;
        return (
          <span className={lost ? "text-danger-soft-foreground" : "text-success-soft-foreground"}>
            {lost ? "−" : "+"}{Math.abs(sh.shrinkageQty).toFixed(1)} {i.unit ?? ""}
          </span>
        );
      },
      hideable: true,
      mobileLabel: t("feed.shrinkage", "Shrinkage"),
    },
    { id: "status", header: t("animals.status", "Status"), cell: i => <StatusBadge tone={stockTone(i.status)}>{i.status ?? "ok"}</StatusBadge>, sortValue: i => i.status, mobileLabel: t("animals.status", "Status") },
  ];

  const rationRows = (rations as any[]) ?? [];
  const rationCols: Column<any>[] = [
    { id: "category", header: t("animals.category", "Category"), cell: p => <span className="font-medium">{p.categoryName}</span>, sortValue: p => p.categoryName, primary: true, mobileLabel: t("animals.category", "Category") },
    { id: "item", header: t("feed.item", "Feed item"), cell: p => p.feedItemName, sortValue: p => p.feedItemName, mobileLabel: t("feed.item", "Feed item") },
    { id: "qty", header: t("feed.qtyPerHead", "Qty/head/day"), cell: p => `${parseFloat(p.qtyPerHeadPerDay ?? 0).toFixed(3)} ${p.unit ?? ""}`, mobileLabel: t("feed.qtyPerHead", "Qty/head/day") },
    { id: "eff", header: t("feed.effective", "Effective"), cell: p => fmtDate(p.effectiveDate), sortValue: p => p.effectiveDate, hideable: true, mobileLabel: t("feed.effective", "Effective") },
    { id: "end", header: t("feed.endDate", "End date"), cell: p => (p.endDate ? fmtDate(p.endDate) : t("feed.ongoing", "Ongoing")), sortValue: p => p.endDate, hideable: true, defaultHidden: true, mobileLabel: t("feed.endDate", "End date") },
    { id: "active", header: t("animals.status", "Status"), cell: p => <StatusBadge tone={p.isActive ? "success" : "neutral"}>{p.isActive ? t("feed.active", "Active") : t("feed.ended", "Ended")}</StatusBadge>, mobileLabel: t("animals.status", "Status") },
  ];

  const ledgerRows = (ledger as any[]) ?? [];
  const ledgerCols: Column<any>[] = [
    { id: "date", header: t("feed.date", "Date"), cell: e => fmtDate(e.transactionDate), sortValue: e => e.transactionDate, primary: true, mobileLabel: t("feed.date", "Date") },
    { id: "item", header: t("feed.item", "Feed item"), cell: e => e.feedItemName, sortValue: e => e.feedItemName, mobileLabel: t("feed.item", "Feed item") },
    { id: "type", header: t("feed.type", "Type"), cell: e => <StatusBadge tone={e.transactionType === "purchase" ? "info" : "neutral"} icon={false}>{String(e.transactionType ?? "").replace("_", " ")}</StatusBadge>, mobileLabel: t("feed.type", "Type") },
    { id: "qty", header: t("feed.qty", "Qty"), cell: e => parseFloat(e.qty ?? 0).toFixed(1), mobileLabel: t("feed.qty", "Qty") },
    { id: "unitCost", header: t("feed.unitCost", "Unit cost"), cell: e => (e.unitCost ? fmt(parseFloat(e.unitCost)) : "—"), hideable: true, defaultHidden: true, mobileLabel: t("feed.unitCost", "Unit cost") },
    { id: "cost", header: t("feed.totalCost", "Total"), cell: e => (e.totalCost ? fmt(parseFloat(e.totalCost)) : e.qty && e.unitCost ? fmt(parseFloat(e.qty) * parseFloat(e.unitCost)) : "—"), hideable: true, mobileLabel: t("feed.totalCost", "Total") },
    { id: "supplier", header: t("feed.supplier", "Supplier"), cell: e => e.supplierName ?? "—", hideable: true, defaultHidden: true, mobileLabel: t("feed.supplier", "Supplier") },
  ];

  const priceRows = (prices as any[]) ?? [];
  const priceCols: Column<any>[] = [
    { id: "item", header: t("feed.item", "Feed item"), cell: p => <span className="font-medium">{p.feedItemName ?? `#${p.feedItemId}`}</span>, sortValue: p => p.feedItemName, primary: true, mobileLabel: t("feed.item", "Feed item") },
    { id: "price", header: t("feed.pricePerUnit", "Price per unit"), cell: p => <span className="tabular-nums">{fmt(parseFloat(p.pricePerUnit))}{p.unit ? `/${p.unit}` : ""}</span>, sortValue: p => parseFloat(p.pricePerUnit), mobileLabel: t("feed.pricePerUnit", "Price per unit") },
    { id: "eff", header: t("feed.effective", "Effective"), cell: p => fmtDate(p.effectiveDate), sortValue: p => p.effectiveDate, mobileLabel: t("feed.effective", "Effective") },
    { id: "notes", header: t("common.notes", "Notes"), cell: p => <span className="block max-w-40 truncate text-muted-foreground">{p.notes ?? "—"}</span>, hideable: true, defaultHidden: true, mobileLabel: t("common.notes", "Notes") },
    { id: "created", header: t("common.created", "Created"), cell: p => fmtDate(p.createdAt), sortValue: p => p.createdAt, hideable: true, defaultHidden: true, mobileLabel: t("common.created", "Created") },
  ];

  const shrinkMonths = ((shrinkage as any)?.byMonth ?? []) as any[];
  const shrinkRows = ((shrinkage as any)?.rows ?? []) as any[];
  const shrinkDetail = useMemo(() => shrinkRows.slice().reverse(), [shrinkRows]);

  const lowCount = stockRows.filter(s => s.status === "critical" || s.status === "low").length;

  const editButton = (onClick: () => void, label: string) => (
    <button onClick={onClick} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground" aria-label={label} title={label}>
      <Pencil className="h-4 w-4" />
    </button>
  );
  const deleteButton = (onClick: () => void, label: string) => (
    <button onClick={onClick} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger-soft-foreground" aria-label={label} title={label}>
      <Trash2 className="h-4 w-4" />
    </button>
  );

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("nav.feed", "Feed")}
        subtitle={lowCount > 0 ? `${lowCount} ${t("feed.needReorder", "items need reorder")}` : t("feed.healthy", "Stock healthy")}
        crumbs={[{ label: t("nav.dashboard", "Dashboard"), href: "/" }, { label: t("nav.feed", "Feed") }]}
      />

      <Tabs defaultValue="stock" onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="stock">{t("feed.stock", "Stock")}</TabsTrigger>
          <TabsTrigger value="ledger">{t("feed.ledger", "Ledger")}</TabsTrigger>
          <TabsTrigger value="rations">{t("feed.rations", "Rations")}</TabsTrigger>
          <TabsTrigger value="prices">{t("feed.priceHistory", "Prices")}</TabsTrigger>
          <TabsTrigger value="shrinkage">{t("feed.shrinkage", "Shrinkage")}</TabsTrigger>
        </TabsList>

        {/* Stock status */}
        <TabsContent value="stock" className="mt-4">
          {canCreate && (
            <div className="mb-3 flex justify-end">
              <button onClick={() => { setStockForm(blankStock()); setStockOpen(true); }} className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 sm:min-h-9">
                <Plus className="h-4 w-4" />{t("feed.addStock", "Add stock")}
              </button>
            </div>
          )}
          <DataTable data={stockRows} columns={stockCols} rowKey={i => i.feedItemId} loading={stockLoading} storageKey="feedStock" empty={<EmptyState icon={Wheat} title={t("feed.noStock", "No feed items yet")} />} />
        </TabsContent>

        {/* Stock ledger with edit / delete */}
        <TabsContent value="ledger" className="mt-4">
          <DataTable
            data={ledgerRows}
            columns={ledgerCols}
            rowKey={e => e.id}
            loading={ledgerLoading}
            storageKey="feedLedger"
            rowActions={(canUpdate || canDelete) ? e => (
              <div className="flex items-center justify-end gap-1">
                {canUpdate && editButton(() => startEditEntry(e), t("feed.editStockEntry", "Edit stock entry"))}
                {canDelete && deleteButton(() => setDeleteEntry(e), t("feed.deleteFeedStockEntry", "Delete stock entry"))}
              </div>
            ) : undefined}
            empty={<EmptyState icon={Wheat} title={t("feed.noLedger", "No stock transactions yet")} />}
          />
        </TabsContent>

        {/* Ration plans with edit / delete / bulk effective-date */}
        <TabsContent value="rations" className="mt-4">
          {canCreate && (
            <div className="mb-3 flex justify-end">
              <button onClick={() => { setRationForm(blankRation()); setRationOpen(true); }} className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 sm:min-h-9">
                <Plus className="h-4 w-4" />{t("feed.addRation", "Add ration plan")}
              </button>
            </div>
          )}
          <DataTable
            data={rationRows}
            columns={rationCols}
            rowKey={p => p.id}
            loading={rationsLoading}
            storageKey="feedRations"
            selection={canUpdate ? { selectedKeys: selectedPlanKeys, onChange: setSelectedPlanKeys } : undefined}
            bulkBar={canUpdate ? () => (
              <button onClick={() => setBulkDateOpen(true)} className="flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-surface sm:min-h-8">
                <CalendarDays className="h-3.5 w-3.5" />
                {t("feed.updateEffectiveDate", "Update effective date")}
              </button>
            ) : undefined}
            rowActions={(canUpdate || canDelete) ? p => (
              <div className="flex items-center justify-end gap-1">
                {canUpdate && editButton(() => startEditPlan(p), t("feed.editRationPlan", "Edit ration plan"))}
                {canDelete && deleteButton(() => setDeletePlan(p), t("feed.deleteRationPlan", "Delete ration plan"))}
              </div>
            ) : undefined}
            empty={<EmptyState icon={Wheat} title={t("feed.noRations", "No ration plans yet")} />}
          />
        </TabsContent>

        {/* Price history */}
        <TabsContent value="prices" className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t("feed.priceHistoryHint", "Prices drive feed cost in P&L from their effective date.")}</p>
            {canCreate && (
              <button onClick={() => { setPriceForm(blankPrice()); setPriceOpen(true); }} className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 sm:min-h-9">
                <Plus className="h-4 w-4" />{t("feed.addPrice", "Add price")}
              </button>
            )}
          </div>
          <DataTable
            data={priceRows}
            columns={priceCols}
            rowKey={p => p.id}
            loading={pricesLoading}
            storageKey="feedPrices"
            rowActions={(canUpdate || canDelete) ? p => (
              <div className="flex items-center justify-end gap-1">
                {canUpdate && editButton(() => startEditPrice(p), t("feed.editPrice", "Edit price"))}
                {canDelete && deleteButton(() => setDeletePriceRow(p), t("feed.deletePrice", "Delete price"))}
              </div>
            ) : undefined}
            empty={<EmptyState icon={Wheat} title={t("feed.noPrices", "No prices recorded yet")} />}
          />
        </TabsContent>

        {/* Shrinkage report */}
        <TabsContent value="shrinkage" className="mt-4 space-y-4">
          <section className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
            <h2 className="text-sm font-semibold">{t("feed.shrinkageMonthly", "Shrinkage by month")}</h2>
            <p className="mb-3 text-xs text-muted-foreground">{t("feed.shrinkageExplain", "Difference between expected use and counted stock between stock counts.")}</p>
            {shrinkMonths.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("feed.shrinkageNone", "No shrinkage measured yet — record stock counts to compare.")}</p>
            ) : (
              <dl className="space-y-2 text-sm">
                {shrinkMonths.map((m: any) => (
                  <div key={m.month} className="flex items-center justify-between">
                    <dt className="text-foreground">{m.month}</dt>
                    <dd className="flex items-center gap-4 tabular-nums">
                      <span className={m.shrinkageQty > 0 ? "text-danger-soft-foreground" : "text-success-soft-foreground"}>{m.shrinkageQty > 0 ? "−" : "+"}{Math.abs(m.shrinkageQty).toFixed(1)} kg</span>
                      <span className={m.shrinkageValue > 0 ? "text-danger-soft-foreground" : "text-success-soft-foreground"}>{fmt(Math.abs(m.shrinkageValue))}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {shrinkDetail.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
              <h2 className="mb-3 text-sm font-semibold">{t("feed.shrinkageDetail", "Shrinkage detail")}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-2 py-2 font-semibold">{t("feed.item", "Feed item")}</th>
                      <th className="px-2 py-2 font-semibold">{t("feed.period", "Period")}</th>
                      <th className="px-2 py-2 text-right font-semibold">{t("feed.expected", "Expected")}</th>
                      <th className="px-2 py-2 text-right font-semibold">{t("feed.counted", "Counted")}</th>
                      <th className="px-2 py-2 text-right font-semibold">{t("feed.shrinkage", "Shrinkage")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shrinkDetail.map((r: any, idx: number) => (
                      <tr key={`${r.feedItemId}-${r.toDate}-${idx}`} className="border-b border-border last:border-0">
                        <td className="px-2 py-2 font-medium">{r.feedItemName}</td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">{fmtDate(r.fromDate)} → {fmtDate(r.toDate)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.expectedQty.toFixed(1)} {r.unit}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.actualQty.toFixed(1)} {r.unit}</td>
                        <td className={`px-2 py-2 text-right font-medium tabular-nums ${r.shrinkageQty > 0 ? "text-danger-soft-foreground" : r.shrinkageQty < 0 ? "text-success-soft-foreground" : "text-muted-foreground"}`}>
                          {r.shrinkageQty > 0 ? "−" : r.shrinkageQty < 0 ? "+" : ""}{Math.abs(r.shrinkageQty).toFixed(1)} {r.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </TabsContent>
      </Tabs>

      {/* Add stock */}
      <Dialog open={stockOpen} onOpenChange={setStockOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("feed.addStock", "Add stock")}</DialogTitle></DialogHeader>
          <StockFormFields form={stockForm} setForm={setStockForm} />
          <FormFooter>
            <button onClick={() => setStockOpen(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button
              disabled={addStock.isPending || !stockForm.feedItemId || !(parseFloat(stockForm.qty) > 0)}
              onClick={submitStock}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {t("common.save", "Save")}
            </button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      {/* Edit stock entry */}
      <Dialog open={editEntry !== null} onOpenChange={o => !o && setEditEntry(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("feed.editStockEntry", "Edit stock entry")} · {editEntry?.feedItemName ?? ""}</DialogTitle>
          </DialogHeader>
          <StockFormFields form={editStockForm} setForm={setEditStockForm} lockItem />
          <FormFooter>
            <button onClick={() => setEditEntry(null)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button disabled={updateStock.isPending} onClick={submitEditEntry} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {updateStock.isPending ? t("common.saving", "Saving...") : t("common.save", "Save")}
            </button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      {/* Delete stock entry */}
      <ConsequenceConfirm
        open={deleteEntry !== null}
        onOpenChange={o => !o && setDeleteEntry(null)}
        title={t("feed.deleteFeedStockEntry", "Delete stock entry")}
        description={t("feed.deleteStockToBin", "Move this {{name}} entry to the Recycle Bin? You can restore it anytime.", { name: deleteEntry?.feedItemName ?? "" })}
        consequences={[{ text: t("feed.deleteStockRecalcHint", "Stock on hand and days-remaining are recalculated."), tone: "info" }]}
        confirmLabel={t("common.moveToBin", "Move to Bin")}
        cancelLabel={t("common.cancel", "Cancel")}
        destructive
        loading={deleteFeedStock.isPending}
        onConfirm={() => deleteEntry && deleteFeedStock.mutate({ id: deleteEntry.id, expectedVersion: deleteEntry.version })}
      />

      {/* Create ration plan */}
      <Dialog open={rationOpen} onOpenChange={setRationOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("feed.addRation", "Add ration plan")}</DialogTitle></DialogHeader>
          <RationFormFields form={rationForm} setForm={setRationForm} />
          <FormFooter>
            <button onClick={() => setRationOpen(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button
              disabled={createRation.isPending || !rationForm.categoryId || !rationForm.feedItemId || !(parseFloat(rationForm.qtyPerHeadPerDay) > 0)}
              onClick={submitRation}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {t("common.save", "Save")}
            </button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      {/* Edit ration plan */}
      <Dialog open={editPlan !== null} onOpenChange={o => !o && setEditPlan(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("feed.editRationPlan", "Edit ration plan")} · {editPlan?.categoryName ?? ""} — {editPlan?.feedItemName ?? ""}</DialogTitle>
          </DialogHeader>
          <RationFormFields form={editRationForm} setForm={setEditRationForm} showActive />
          <FormFooter>
            <button onClick={() => setEditPlan(null)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button disabled={updateRation.isPending} onClick={submitEditPlan} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {updateRation.isPending ? t("common.saving", "Saving...") : t("common.save", "Save")}
            </button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      {/* Delete ration plan */}
      <ConsequenceConfirm
        open={deletePlan !== null}
        onOpenChange={o => !o && setDeletePlan(null)}
        title={t("feed.deleteRationPlan", "Delete ration plan")}
        description={t("feed.deleteRationToBin", "Move the {{name}} ration plan to the Recycle Bin? You can restore it anytime.", { name: deletePlan?.categoryName ?? "" })}
        consequences={[{ text: t("feed.deleteRationRecalcHint", "Daily consumption and days-remaining forecasts are recalculated."), tone: "info" }]}
        confirmLabel={t("common.moveToBin", "Move to Bin")}
        cancelLabel={t("common.cancel", "Cancel")}
        destructive
        loading={deleteRationPlan.isPending}
        onConfirm={() => deletePlan && deleteRationPlan.mutate({ id: deletePlan.id, expectedVersion: deletePlan.version })}
      />

      {/* Bulk update ration effective dates */}
      <Dialog open={bulkDateOpen} onOpenChange={setBulkDateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t("feed.updateEffectiveDate", "Update effective date")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("feed.bulkDateHint", "Set a new effective date for {{count}} selected plans.", { count: selectedPlanKeys.size })}
            </p>
            <Input type="date" aria-label={t("feed.effective", "Effective date")} value={bulkDate} onChange={e => setBulkDate(e.target.value)} />
          </div>
          <FormFooter>
            <button onClick={() => setBulkDateOpen(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button
              disabled={!bulkDate || bulkUpdateDates.isPending}
              onClick={() => {
                const selectedIds = new Set(Array.from(selectedPlanKeys).map(Number));
                bulkUpdateDates.mutate({
                  plans: ((rations as any[]) ?? [])
                    .filter(plan => selectedIds.has(plan.id))
                    .map(plan => ({ id: plan.id, expectedVersion: plan.version })),
                  effectiveDate: bulkDate,
                });
              }}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {bulkUpdateDates.isPending ? t("common.saving", "Saving...") : t("common.save", "Save")}
            </button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      {/* Add price */}
      <Dialog open={priceOpen} onOpenChange={setPriceOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("feed.addPrice", "Add price")}</DialogTitle></DialogHeader>
          <FormSection>
            <FormField label={t("feed.item", "Feed item")} required>
              <Select value={priceForm.feedItemId} onValueChange={v => setPriceForm(f => ({ ...f, feedItemId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>{((feedItems as any[]) ?? []).map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t("feed.pricePerUnit", "Price per unit")} required>
              <Input type="number" inputMode="decimal" step="0.01" min="0" value={priceForm.pricePerUnit} onChange={e => setPriceForm(f => ({ ...f, pricePerUnit: e.target.value }))} placeholder="0.00" />
            </FormField>
            <FormField label={t("feed.effective", "Effective date")} required>
              <Input type="date" value={priceForm.effectiveDate} onChange={e => setPriceForm(f => ({ ...f, effectiveDate: e.target.value }))} />
            </FormField>
            <FormField label={t("common.notes", "Notes")} full>
              <Textarea rows={2} value={priceForm.notes} onChange={e => setPriceForm(f => ({ ...f, notes: e.target.value }))} />
            </FormField>
          </FormSection>
          <FormFooter>
            <button onClick={() => setPriceOpen(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button disabled={addPrice.isPending} onClick={submitPrice} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {addPrice.isPending ? t("common.saving", "Saving...") : t("common.save", "Save")}
            </button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      {/* Edit price (feed item locked, same as Old) */}
      <Dialog open={editPrice !== null} onOpenChange={o => !o && setEditPrice(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("feed.editPrice", "Edit price")} · {editPrice?.feedItemName ?? ""}</DialogTitle>
          </DialogHeader>
          <FormSection>
            <FormField label={t("feed.pricePerUnit", "Price per unit")} required>
              <Input type="number" inputMode="decimal" step="0.01" min="0" value={priceForm.pricePerUnit} onChange={e => setPriceForm(f => ({ ...f, pricePerUnit: e.target.value }))} />
            </FormField>
            <FormField label={t("feed.effective", "Effective date")} required>
              <Input type="date" value={priceForm.effectiveDate} onChange={e => setPriceForm(f => ({ ...f, effectiveDate: e.target.value }))} />
            </FormField>
            <FormField label={t("common.notes", "Notes")} full>
              <Textarea rows={2} value={priceForm.notes} onChange={e => setPriceForm(f => ({ ...f, notes: e.target.value }))} />
            </FormField>
          </FormSection>
          <FormFooter>
            <button onClick={() => setEditPrice(null)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button disabled={updatePrice.isPending} onClick={submitEditPrice} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {updatePrice.isPending ? t("common.saving", "Saving...") : t("common.save", "Save")}
            </button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      {/* Delete price */}
      <ConsequenceConfirm
        open={deletePriceRow !== null}
        onOpenChange={o => !o && setDeletePriceRow(null)}
        title={t("feed.deletePrice", "Delete price")}
        description={t("feed.deletePriceConfirm", "Delete the {{name}} price of {{price}} effective {{date}}?", {
          name: deletePriceRow?.feedItemName ?? "",
          price: deletePriceRow ? fmt(parseFloat(deletePriceRow.pricePerUnit)) : "",
          date: deletePriceRow ? fmtDate(deletePriceRow.effectiveDate) : "",
        })}
        consequences={[{ text: t("feed.deletePricePermanentHint", "This is permanent and changes feed cost calculations from that date."), tone: "danger" }]}
        confirmLabel={t("common.delete", "Delete")}
        cancelLabel={t("common.cancel", "Cancel")}
        destructive
        loading={deletePrice.isPending}
        onConfirm={() => deletePriceRow && deletePrice.mutate({ id: deletePriceRow.id, expectedVersion: deletePriceRow.version })}
      />
    </div>
  );
}
