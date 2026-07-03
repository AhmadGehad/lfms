import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useCurrency } from "@/hooks/useCurrency";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, ShoppingCart, Trash2, Wallet } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { StatusBadge, type StatusTone } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { ConsequenceConfirm } from "../components/ConsequenceConfirm";
import { FormSection, FormField, FormFooter } from "../components/FormLayout";
import { RecordSaleDialog } from "../components/AnimalWorkflows";

function fmtDate(d: unknown) {
  if (!d) return "—";
  const x = new Date(d as string);
  return Number.isNaN(x.getTime()) ? "—" : x.toLocaleDateString();
}
const toDateInput = (d: unknown) =>
  d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : "";

function paymentState(outstanding: number, paid: number): { tone: StatusTone; key: string; fallback: string } {
  if (outstanding <= 0.001) return { tone: "success", key: "sales.paid", fallback: "Paid" };
  if (paid > 0) return { tone: "warning", key: "sales.partial", fallback: "Partial" };
  return { tone: "danger", key: "sales.unpaid", fallback: "Unpaid" };
}

/**
 * New Sales on the DataTable with a first-class "unpaid only" saved view and an
 * inline Record-payment flow (brief priority #5: financial review + the
 * unpaid-sales view that the Action Center links to). Full parity with Old:
 * edit sale (incl. pending-price entry), delete-to-bin, buyer search.
 */
export default function NewSales() {
  const { t } = useTranslation();
  const { fmt } = useCurrency();
  const { ownerParam } = useOwnerFilter();
  const perms = usePermissions();
  const canUpdate = perms.can("sales", "update");
  const canCreate = perms.can("sales", "create");
  const canDelete = perms.can("sales", "delete");
  const utils = trpc.useUtils();
  const searchStr = useSearch();

  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [filterBuyer, setFilterBuyer] = useState("");
  const [payRow, setPayRow] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [salePickerOpen, setSalePickerOpen] = useState(false);
  const [saleAnimalId, setSaleAnimalId] = useState("");
  const [saleAnimal, setSaleAnimal] = useState<any | null>(null);
  const [editRow, setEditRow] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ salePrice: "", weightAtSale: "", saleDate: "", buyerName: "", notes: "" });
  const [deleteRow, setDeleteRow] = useState<any | null>(null);

  const { data: sales, isLoading } = trpc.sales.list.useQuery({
    outstandingOnly: unpaidOnly || undefined,
    ownerId: ownerParam,
    buyer: filterBuyer || undefined,
  });
  const { data: animals } = trpc.animals.list.useQuery({ isActive: true, ownerId: ownerParam }, { enabled: canCreate });
  useEffect(() => {
    if (new URLSearchParams(searchStr).get("new") === "1" && canCreate) setSalePickerOpen(true);
  }, [canCreate, searchStr]);

  const invalidate = () => {
    utils.sales.list.invalidate();
    utils.dashboard.getKPIs.invalidate();
    utils.animals.getAllPnL.invalidate();
  };
  const recordPayment = trpc.sales.recordPayment.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("sales.paymentRecorded", "Payment recorded"));
      setPayRow(null);
      setPayAmount("");
    },
    onError: e => toast.error(e.message),
  });
  const updateSale = trpc.sales.update.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("sales.updated", "Sale updated"));
      setEditRow(null);
    },
    onError: e => toast.error(e.message),
  });
  const deleteSale = trpc.recycleBin.deleteSale.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("sales.movedToBin", "Sale moved to Recycle Bin"));
      setDeleteRow(null);
    },
    onError: e => toast.error(e.message),
  });

  const rows = (sales as any[]) ?? [];
  const totalOutstanding = useMemo(
    () => rows.reduce((sum, r) => sum + parseFloat(r.outstanding ?? 0), 0),
    [rows]
  );
  const pendingCount = useMemo(
    () => rows.filter(r => parseFloat(r.sale?.salePrice ?? 0) === 0).length,
    [rows]
  );

  const startEdit = (r: any) => {
    setEditForm({
      salePrice: String(r.sale?.salePrice ?? ""),
      weightAtSale: r.sale?.weightAtSale ? String(r.sale.weightAtSale) : "",
      saleDate: toDateInput(r.sale?.saleDate),
      buyerName: r.sale?.buyerName ?? "",
      notes: r.sale?.notes ?? "",
    });
    setEditRow(r);
  };
  const submitEdit = () => {
    if (!editRow) return;
    if (!editForm.salePrice) { toast.error(t("sales.priceRequired", "Enter a sale price")); return; }
    updateSale.mutate({
      id: editRow.sale.id,
      salePrice: editForm.salePrice,
      weightAtSale: editForm.weightAtSale || undefined,
      saleDate: editForm.saleDate || undefined,
      buyerName: editForm.buyerName || undefined,
      notes: editForm.notes || undefined,
    });
  };

  const payOutstanding = parseFloat(payRow?.outstanding ?? 0);
  const payNum = parseFloat(payAmount) || 0;

  const columns: Column<any>[] = [
    { id: "date", header: t("sales.date", "Date"), cell: r => fmtDate(r.sale?.saleDate), sortValue: r => r.sale?.saleDate, primary: true, mobileLabel: t("sales.date", "Date") },
    { id: "animal", header: t("animals.animalId", "Animal"), cell: r => r.animalCode ?? "—", sortValue: r => r.animalCode, mobileLabel: t("animals.animalId", "Animal") },
    { id: "speciesCategory", header: t("sales.speciesCategory", "Species / Category"), cell: r => `${r.speciesName ?? "—"} / ${r.categoryName ?? "—"}`, hideable: true, defaultHidden: true, mobileLabel: t("sales.speciesCategory", "Species / Category") },
    { id: "owner", header: t("owners.owner", "Owner"), cell: r => r.ownerName ?? "—", hideable: true, defaultHidden: true, mobileLabel: t("owners.owner", "Owner") },
    { id: "buyer", header: t("sales.buyer", "Buyer"), cell: r => r.sale?.buyerName ?? "—", sortValue: r => r.sale?.buyerName, mobileLabel: t("sales.buyer", "Buyer") },
    {
      id: "price",
      header: t("sales.price", "Price"),
      cell: r => {
        const price = parseFloat(r.sale?.salePrice ?? 0);
        return price === 0
          ? <StatusBadge tone="warning">{t("sales.enterPrice", "Enter price")}</StatusBadge>
          : fmt(price);
      },
      sortValue: r => parseFloat(r.sale?.salePrice ?? 0),
      align: "end",
      mobileLabel: t("sales.price", "Price"),
    },
    { id: "paid", header: t("sales.paid", "Paid"), cell: r => fmt(parseFloat(r.sale?.amountPaid ?? 0)), align: "end", hideable: true, mobileLabel: t("sales.paid", "Paid") },
    {
      id: "weight",
      header: t("pnl.weightAtSale", "Weight"),
      cell: r => (r.sale?.weightAtSale ? `${parseFloat(r.sale.weightAtSale).toFixed(1)} kg` : "—"),
      sortValue: r => parseFloat(r.sale?.weightAtSale ?? 0),
      align: "end",
      hideable: true,
      defaultHidden: true,
      mobileLabel: t("pnl.weightAtSale", "Weight"),
    },
    {
      id: "pricePerKg",
      header: t("pnl.pricePerKg", "Price/kg"),
      cell: r => {
        const price = parseFloat(r.sale?.salePrice ?? 0);
        const w = parseFloat(r.sale?.weightAtSale ?? 0);
        return price > 0 && w > 0 ? fmt(price / w) : "—";
      },
      align: "end",
      hideable: true,
      defaultHidden: true,
      mobileLabel: t("pnl.pricePerKg", "Price/kg"),
    },
    {
      id: "status",
      header: t("sales.status", "Status"),
      cell: r => {
        const out = parseFloat(r.outstanding ?? 0);
        const st = paymentState(out, parseFloat(r.sale?.amountPaid ?? 0));
        return (
          <div className="flex items-center gap-2">
            <StatusBadge tone={st.tone}>{t(st.key, st.fallback)}</StatusBadge>
            {out > 0.001 && <span className="text-xs text-muted-foreground">{fmt(out)}</span>}
          </div>
        );
      },
      sortValue: r => parseFloat(r.outstanding ?? 0),
      mobileLabel: t("sales.status", "Status"),
    },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("nav.sales", "Sales")}
        subtitle={
          totalOutstanding > 0.001
            ? `${t("sales.outstanding", "Outstanding")}: ${fmt(totalOutstanding)}${pendingCount > 0 ? ` · ${pendingCount} ${t("sales.pendingPrice", "pending price")}` : ""}`
            : t("sales.allSettled", "All sales settled")
        }
        crumbs={[{ label: t("nav.dashboard", "Dashboard"), href: "/" }, { label: t("nav.sales", "Sales") }]}
      />

      <DataTable
        data={rows}
        columns={columns}
        rowKey={r => r.sale?.id}
        loading={isLoading}
        storageKey="sales"
        rowActions={(canUpdate || canDelete) ? r => {
          const out = parseFloat(r.outstanding ?? 0);
          const isPending = parseFloat(r.sale?.salePrice ?? 0) === 0;
          return (
            <div className="flex items-center justify-end gap-1">
              {canUpdate && out > 0.001 && !isPending && (
                <button
                  onClick={() => { setPayRow(r); setPayAmount(String(out)); }}
                  className="flex min-h-11 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface sm:min-h-8"
                >
                  <Wallet className="h-3.5 w-3.5" />
                  {t("sales.recordPayment", "Record payment")}
                </button>
              )}
              {canUpdate && (
                <button
                  onClick={() => startEdit(r)}
                  className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"
                  aria-label={t("sales.editSaleAria", "Edit sale")}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => setDeleteRow(r)}
                  className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger-soft-foreground"
                  aria-label={t("sales.deleteSaleRecord", "Delete sale record")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        } : undefined}
        empty={<EmptyState icon={ShoppingCart} title={t("sales.noSalesYet", "No sales yet")} />}
        toolbar={
          <>
            <button
              onClick={() => setUnpaidOnly(v => !v)}
              aria-pressed={unpaidOnly}
              className={`min-h-11 rounded-lg border px-3 text-sm font-medium sm:min-h-9 ${unpaidOnly ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border text-muted-foreground hover:bg-surface"}`}
            >
              {t("sales.unpaidOnly", "Unpaid only")}
            </button>
              <Input
                className="h-9 w-44"
                placeholder={t("sales.searchBuyer", "Search buyer…")}
                aria-label={t("sales.searchBuyer", "Search buyer")}
                value={filterBuyer}
                onChange={e => setFilterBuyer(e.target.value)}
              />
            {canCreate && (
              <button
                type="button"
                onClick={() => setSalePickerOpen(true)}
                className="min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring sm:min-h-9"
              >
                {t("sales.recordSale", "Record Sale")}
              </button>
            )}
          </>
        }
      />

      {/* Record payment */}
      <Dialog open={payRow !== null} onOpenChange={o => !o && setPayRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sales.recordPayment", "Record payment")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("sales.outstanding", "Outstanding")}: <span className="font-medium text-foreground">{fmt(payOutstanding)}</span>
            </p>
            <Input
              type="number"
              inputMode="decimal"
              aria-label={t("sales.amount", "Amount")}
              value={payAmount}
              onChange={e => setPayAmount(e.target.value)}
              placeholder={t("sales.amount", "Amount")}
              autoFocus
            />
            {payNum > payOutstanding && (
              <p className="text-sm text-danger">{t("sales.paymentExceedsOutstanding", "Payment cannot exceed outstanding")}</p>
            )}
            {payNum > 0 && payNum <= payOutstanding && (
              <p className="text-sm text-muted-foreground">
                {t("sales.newOutstanding", "New outstanding")}: <span className="font-medium text-foreground">{fmt(Math.max(0, payOutstanding - payNum))}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => setPayRow(null)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">
              {t("common.cancel", "Cancel")}
            </button>
            <button
              disabled={recordPayment.isPending || !(payNum > 0) || payNum > payOutstanding}
              onClick={() => recordPayment.mutate({ id: payRow.sale.id, payment: payAmount })}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {t("common.save", "Save")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit sale */}
      <Dialog open={editRow !== null} onOpenChange={o => !o && setEditRow(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("sales.editSaleFor", "Edit sale")} · {editRow?.animalCode ?? ""}</DialogTitle>
          </DialogHeader>
          <FormSection>
            <FormField label={t("sales.price", "Price")} required>
              <Input type="number" inputMode="decimal" value={editForm.salePrice} onChange={e => setEditForm(f => ({ ...f, salePrice: e.target.value }))} placeholder="0.00" autoFocus />
            </FormField>
            <FormField label={t("pnl.weightAtSale", "Sale Weight (kg)")}>
              <Input type="number" inputMode="decimal" value={editForm.weightAtSale} onChange={e => setEditForm(f => ({ ...f, weightAtSale: e.target.value }))} placeholder="0.0" />
            </FormField>
            <FormField label={t("sales.date", "Date")}>
              <Input type="date" value={editForm.saleDate} onChange={e => setEditForm(f => ({ ...f, saleDate: e.target.value }))} />
            </FormField>
            <FormField label={t("sales.buyer", "Buyer")}>
              <Input value={editForm.buyerName} onChange={e => setEditForm(f => ({ ...f, buyerName: e.target.value }))} placeholder={t("sales.buyerPlaceholder", "Buyer name...")} />
            </FormField>
            <FormField label={t("common.notes", "Notes")} full>
              <Textarea rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </FormField>
          </FormSection>
          {parseFloat(editForm.salePrice) > 0 && parseFloat(editForm.weightAtSale) > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("pnl.pricePerKg", "Price/kg")}: <span className="font-medium text-foreground">{fmt(parseFloat(editForm.salePrice) / parseFloat(editForm.weightAtSale))}</span>
            </p>
          )}
          <FormFooter>
            <button onClick={() => setEditRow(null)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button disabled={updateSale.isPending} onClick={submitEdit} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {updateSale.isPending ? t("common.saving", "Saving...") : t("common.save", "Save")}
            </button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      {/* Delete sale to Recycle Bin */}
      <ConsequenceConfirm
        open={deleteRow !== null}
        onOpenChange={o => !o && setDeleteRow(null)}
        title={t("sales.deleteSaleRecord", "Delete sale record")}
        description={t("sales.deleteToBinDescription", "Move this sale record to the Recycle Bin? You can restore it anytime.")}
        consequences={deleteRow ? [
          { text: `${deleteRow.animalCode ?? ""} · ${fmt(parseFloat(deleteRow.sale?.salePrice ?? 0))}`, tone: "warning" },
          { text: t("sales.deleteRecalcHint", "Revenue totals and animal P&L are recalculated."), tone: "info" },
        ] : []}
        confirmLabel={t("common.moveToBin", "Move to Bin")}
        cancelLabel={t("common.cancel", "Cancel")}
        destructive
        loading={deleteSale.isPending}
        onConfirm={() => deleteRow && deleteSale.mutate({ id: deleteRow.sale.id })}
      />

      <Dialog open={salePickerOpen} onOpenChange={setSalePickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sales.pickAnimal", "Pick Animal To Sell")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="sale-animal-picker" className="text-sm font-medium">{t("animals.title", "Animals")}</label>
            <Select value={saleAnimalId} onValueChange={setSaleAnimalId}>
              <SelectTrigger id="sale-animal-picker"><SelectValue placeholder={t("animals.selectAnimal", "Select animal")} /></SelectTrigger>
              <SelectContent>
                {((animals as any[]) ?? []).map(a => (
                  <SelectItem key={a.animal.id} value={String(a.animal.id)}>
                    {a.animal.animalId} · {a.categoryName ?? ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setSalePickerOpen(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button
              type="button"
              disabled={!saleAnimalId}
              onClick={() => {
                const selected = ((animals as any[]) ?? []).find(a => String(a.animal.id) === saleAnimalId);
                if (selected) setSaleAnimal(selected);
                setSalePickerOpen(false);
              }}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {t("common.next", "Next")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RecordSaleDialog open={saleAnimal !== null} onOpenChange={open => !open && setSaleAnimal(null)} animal={saleAnimal} />
    </div>
  );
}
