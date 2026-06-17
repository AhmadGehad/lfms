import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { Plus, ShoppingCart, Trash2, AlertTriangle, Pencil } from "lucide-react";
import { useState } from "react";
import * as React from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/hooks/usePermissions";

function RecordSaleDialog({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    animalId: "",
    saleDate: new Date().toISOString().split("T")[0],
    salePrice: "",
    amountPaid: "",
    weightAtSale: "",
    buyerName: "",
    notes: "",
    statusId: "",
  });

  const { data: animals } = trpc.animals.list.useQuery({ isActive: true });
  const { data: statuses } = trpc.config.getStatuses.useQuery();
  // F1: only exit statuses are valid here; default to the one named "sold"
  // when present, otherwise the first exit status.
  const exitStatuses = (statuses ?? []).filter((s: any) => s.isExitStatus);
  React.useEffect(() => {
    if (!form.statusId && exitStatuses.length > 0) {
      const sold = exitStatuses.find((s: any) => String(s.name).toLowerCase().includes("sold"));
      setForm((f) => ({ ...f, statusId: String((sold ?? exitStatuses[0]).id) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exitStatuses.length]);

  const utils = trpc.useUtils();

  const exitAnimal = trpc.animals.exit.useMutation({
    onSuccess: () => {
      toast.success(t("sales.recorded"));
      utils.animals.list.invalidate();
      utils.sales.list.invalidate();
      utils.dashboard.getKPIs.invalidate();
      utils.animals.getAllPnL.invalidate();
      utils.feed.getStockStatus.invalidate();
      setOpen(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const priceNum = parseFloat(form.salePrice) || 0;
  const paidNum = form.amountPaid === "" ? priceNum : (parseFloat(form.amountPaid) || 0);
  const outstandingPreview = Math.max(0, priceNum - paidNum);

  const handleSubmit = () => {
    if (!form.animalId || !form.salePrice) { toast.error(t("sales.animalPriceRequired")); return; }
    if (!form.statusId) { toast.error(t("animals.selectExitStatus")); return; }
    if (paidNum > priceNum) { toast.error(t("sales.paymentExceedsOutstanding")); return; }
    exitAnimal.mutate({
      id: Number(form.animalId),
      exitDate: form.saleDate,
      exitReason: "sold",
      newStatusId: Number(form.statusId),
      salePrice: form.salePrice,
      amountPaid: form.amountPaid === "" ? undefined : form.amountPaid,
      weightAtSale: form.weightAtSale || undefined,
      buyerName: form.buyerName || undefined,
      saleNotes: form.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" />{t("sales.recordSale")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("sales.recordAnimalSale")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Animal *</Label>
            <Select value={form.animalId} onValueChange={(v) => setForm((f) => ({ ...f, animalId: v }))}>
              <SelectTrigger><SelectValue placeholder={t("sales.selectAnimal")} /></SelectTrigger>
              <SelectContent>
                {(animals ?? []).map((a: any) => (
                  <SelectItem key={a.animal.id} value={String(a.animal.id)}>{a.animal.animalId}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Sale Date *</Label>
              <Input type="date" value={form.saleDate} onChange={(e) => setForm((f) => ({ ...f, saleDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Sale Price (EGP) *</Label>
              <Input type="number" placeholder="0.00" value={form.salePrice} onChange={(e) => setForm((f) => ({ ...f, salePrice: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("sales.amountPaid")} (EGP)</Label>
              <Input type="number" placeholder={form.salePrice || "0.00"} value={form.amountPaid} onChange={(e) => setForm((f) => ({ ...f, amountPaid: e.target.value }))} />
              {outstandingPreview > 0 && (
                <p className="text-xs text-amber-600">{t("sales.outstanding")}: {outstandingPreview.toLocaleString("en-EG", { minimumFractionDigits: 2 })}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.status")} *</Label>
              <Select value={form.statusId} onValueChange={(v) => setForm((f) => ({ ...f, statusId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("animals.selectExitStatus")} /></SelectTrigger>
                <SelectContent>
                  {exitStatuses.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Weight at Sale (kg)</Label>
              <Input type="number" placeholder="0.0" value={form.weightAtSale} onChange={(e) => setForm((f) => ({ ...f, weightAtSale: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("sales.buyerName")}</Label>
              <Input placeholder={t("common.buyer")} value={form.buyerName} onChange={(e) => setForm((f) => ({ ...f, buyerName: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Input placeholder={t("common.optionalNotes")} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={exitAnimal.isPending}>
            {exitAnimal.isPending ? "Saving..." : "Record Sale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Sale Dialog ──────────────────────────────────────────────────────────
function EditSaleDialog({ sale, onSuccess }: { sale: any; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    salePrice: String(sale.salePrice ?? ""),
    weightAtSale: String(sale.weightAtSale ?? ""),
    saleDate: sale.saleDate ? (sale.saleDate instanceof Date ? sale.saleDate.toISOString().split("T")[0] : String(sale.saleDate).substring(0, 10)) : "",
    buyerName: sale.buyerName ?? "",
    notes: sale.notes ?? "",
  });
  const utils = trpc.useUtils();

  const update = trpc.sales.update.useMutation({
    onSuccess: () => {
      toast.success(t("sales.updated"));
      utils.sales.list.invalidate();
      utils.dashboard.getKPIs.invalidate();
      utils.animals.getAllPnL.invalidate();
      setOpen(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Reset form when dialog opens with fresh data
  const handleOpen = (v: boolean) => {
    if (v) {
      setForm({
        salePrice: String(sale.salePrice ?? ""),
        weightAtSale: String(sale.weightAtSale ?? ""),
        saleDate: sale.saleDate ? (sale.saleDate instanceof Date ? sale.saleDate.toISOString().split("T")[0] : String(sale.saleDate).substring(0, 10)) : "",
        buyerName: sale.buyerName ?? "",
        notes: sale.notes ?? "",
      });
    }
    setOpen(v);
  };

  const handleSave = () => {
    if (!form.salePrice) { toast.error(t("sales.priceRequired")); return; }
    const pricePerKg = form.weightAtSale && parseFloat(form.weightAtSale) > 0
      ? String(parseFloat(form.salePrice) / parseFloat(form.weightAtSale))
      : undefined;
    update.mutate({
      id: sale.id,
      salePrice: form.salePrice,
      weightAtSale: form.weightAtSale || undefined,
      saleDate: form.saleDate || undefined,
      buyerName: form.buyerName || undefined,
      notes: form.notes || undefined,
    });
  };

  const isPending = parseFloat(String(sale.salePrice)) === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 h-8">
          <Pencil className="h-3.5 w-3.5" />
          {isPending ? <span className="text-xs text-amber-600 font-medium">{t("sales.enterPrice")}</span> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("sales.editSale", { code: sale.animalCode ?? sale.animalId })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Sale Price (EGP) *</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={form.salePrice}
                onChange={(e) => setForm((f) => ({ ...f, salePrice: e.target.value }))}
                className={isPending ? "border-amber-400 focus-visible:ring-amber-400" : ""}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Weight at Sale (kg)</Label>
              <Input type="number" placeholder="0.0" value={form.weightAtSale} onChange={(e) => setForm((f) => ({ ...f, weightAtSale: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("common.saleDate")}</Label>
              <Input type="date" value={form.saleDate} onChange={(e) => setForm((f) => ({ ...f, saleDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("sales.buyerName")}</Label>
              <Input placeholder={t("common.buyer")} value={form.buyerName} onChange={(e) => setForm((f) => ({ ...f, buyerName: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Input placeholder={t("common.optionalNotes")} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          {form.salePrice && form.weightAtSale && parseFloat(form.weightAtSale) > 0 && (
            <p className="text-sm text-muted-foreground">
              Price per kg: <strong>EGP {(parseFloat(form.salePrice) / parseFloat(form.weightAtSale)).toFixed(2)}</strong>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "Saving..." : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentDialog({ saleId, animalCode, outstanding, onSuccess }: { saleId: number; animalCode: string; outstanding: number; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [payment, setPayment] = useState("");

  const recordPayment = trpc.sales.recordPayment.useMutation({
    onSuccess: () => {
      toast.success(t("sales.paymentRecorded"));
      setOpen(false);
      setPayment("");
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const amount = parseFloat(payment) || 0;
  const newOutstanding = Math.max(0, outstanding - amount);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-green-700 hover:bg-green-50 h-8 px-2 gap-1" title={t("sales.recordPayment")}>
          <span className="text-xs font-semibold">+ {t("sales.payment")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("sales.recordPaymentFor")} {animalCode}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {t("sales.currentOutstanding")}: <strong className="text-amber-600">EGP {outstanding.toLocaleString("en-EG", { minimumFractionDigits: 2 })}</strong>
          </div>
          <div className="space-y-1.5">
            <Label>{t("sales.paymentAmount")} (EGP) *</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
              max={outstanding}
              autoFocus
            />
          </div>
          {amount > outstanding && (
            <div className="text-sm text-red-600">{t("sales.paymentExceedsOutstanding")}</div>
          )}
          {amount > 0 && amount <= outstanding && (
            <div className="text-sm text-muted-foreground">
              {t("sales.newOutstanding")}: <strong>{newOutstanding.toLocaleString("en-EG", { minimumFractionDigits: 2 })}</strong>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button
            disabled={amount <= 0 || amount > outstanding || recordPayment.isPending}
            onClick={() => recordPayment.mutate({ id: saleId, payment: String(amount) })}
          >
            {recordPayment.isPending ? "..." : t("sales.recordPayment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Sales() {
  const { t } = useTranslation();
  const { canMutate } = usePermissions();
  const [filterOwner, setFilterOwner] = useState<string>("all");
  const [filterBuyer, setFilterBuyer] = useState<string>("");
  const [outstandingOnly, setOutstandingOnly] = useState<boolean>(false);
  const { data: sales, isLoading, refetch } = trpc.sales.list.useQuery({
    ownerId: filterOwner !== "all" ? Number(filterOwner) : undefined,
    buyer: filterBuyer || undefined,
    outstandingOnly: outstandingOnly || undefined,
  });
  const { data: ownersList } = trpc.config.getOwners.useQuery({ activeOnly: true });
  const utils = trpc.useUtils();

  const deleteSale = trpc.recycleBin.deleteSale.useMutation({
    onSuccess: () => {
      toast.success(t("sales.movedToBin"));
      utils.sales.list.invalidate();
      utils.dashboard.getKPIs.invalidate();
      utils.animals.getAllPnL.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const totalRevenue = (sales ?? []).reduce((sum: number, s: any) => sum + parseFloat(String(s.sale?.salePrice ?? 0)), 0);
  const totalPaid = (sales ?? []).reduce((sum: number, s: any) => sum + parseFloat(String(s.sale?.amountPaid ?? 0)), 0);
  const totalOutstanding = totalRevenue - totalPaid;
  const pendingCount = (sales ?? []).filter((s: any) => parseFloat(String(s.sale?.salePrice ?? 0)) === 0).length;
  const outstandingCount = (sales ?? []).filter((s: any) => parseFloat(String(s.outstanding ?? 0)) > 0).length;

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            {t("sales.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {(sales ?? []).length} sales · Total Revenue: EGP {totalRevenue.toLocaleString("en-EG", { minimumFractionDigits: 2 })}
            · <span className="text-green-700">{t("sales.paid")}: EGP {totalPaid.toLocaleString("en-EG", { minimumFractionDigits: 2 })}</span>
            {totalOutstanding > 0 && <span className="ml-1 text-amber-600 font-medium">· {t("sales.outstanding")}: EGP {totalOutstanding.toLocaleString("en-EG", { minimumFractionDigits: 2 })}</span>}
            {pendingCount > 0 && <span className="ml-2 text-amber-600 font-medium">· {t("sales.pendingPriceEntry", { count: pendingCount })}</span>}
          </p>
        </div>
        {canMutate && <RecordSaleDialog onSuccess={refetch} />}
      </div>

      {outstandingCount > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{outstandingCount} {t("sales.salesWithOutstanding")}</span>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{pendingCount} sale record{pendingCount > 1 ? "s" : ""} have no sale price yet. Click the <strong>pencil icon</strong> to enter the price.</span>
        </div>
      )}

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={filterOwner} onValueChange={setFilterOwner}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder={t("owners.owner")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("owners.allOwners")}</SelectItem>
                {(ownersList ?? []).map((o: any) => (
                  <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="text"
              placeholder={t("sales.searchBuyer")}
              className="w-44"
              value={filterBuyer}
              onChange={(e) => setFilterBuyer(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={outstandingOnly}
                onChange={(e) => setOutstandingOnly(e.target.checked)}
                className="rounded"
              />
              {t("sales.outstandingOnly")}
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("animals.animalId")}</TableHead>
                  <TableHead>{t("sales.speciesCategory")}</TableHead>
                  <TableHead>{t("owners.owner")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>Sale Price (EGP)</TableHead>
                  <TableHead>{t("sales.paid")} (EGP)</TableHead>
                  <TableHead>{t("sales.outstanding")} (EGP)</TableHead>
                  <TableHead>{t("pnl.weightAtSale")}</TableHead>
                  <TableHead>{t("pnl.pricePerKg")}</TableHead>
                  <TableHead>{t("pnl.buyer")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (sales ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-12 text-muted-foreground">{t("sales.noSalesYet")}</TableCell></TableRow>
                ) : (
                  (sales ?? []).map((s: any) => {
                    // Support both flat and nested response shapes
                    const saleId = s.sale?.id ?? s.id;
                    const animalCode = s.animalCode ?? s.sale?.animalCode ?? s.animalId;
                    const salePrice = parseFloat(String(s.sale?.salePrice ?? s.salePrice ?? 0));
                    const amountPaid = parseFloat(String(s.sale?.amountPaid ?? 0));
                    const outstanding = parseFloat(String(s.outstanding ?? (salePrice - amountPaid)));
                    const ownerName = s.ownerName;
                    const weightAtSale = s.sale?.weightAtSale ?? s.weightAtSale;
                    const saleDate = s.sale?.saleDate ?? s.saleDate;
                    const buyerName = s.sale?.buyerName ?? s.buyerName;
                    const notes = s.sale?.notes ?? s.notes;
                    const speciesName = s.speciesName ?? "—";
                    const categoryName = s.categoryName ?? "—";
                    const isPending = salePrice === 0;
                    const pricePerKg = weightAtSale && salePrice > 0
                      ? (salePrice / parseFloat(String(weightAtSale))).toFixed(2)
                      : "—";

                    // Build a flat sale object for the edit dialog
                    const saleForEdit = {
                      id: saleId,
                      animalCode,
                      salePrice: String(salePrice),
                      weightAtSale: weightAtSale ? String(weightAtSale) : "",
                      saleDate: saleDate ? (saleDate instanceof Date ? saleDate.toISOString().split("T")[0] : String(saleDate).substring(0, 10)) : "",
                      buyerName: buyerName ?? "",
                      notes: notes ?? "",
                    };

                    return (
                      <TableRow key={saleId} className={isPending ? "bg-amber-50/40" : (outstanding > 0 ? "bg-amber-50/20" : "")}>
                        <TableCell className="font-mono font-semibold text-primary">{animalCode}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{speciesName} / {categoryName}</TableCell>
                        <TableCell className="text-sm">{ownerName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell>{saleDate ? new Date(saleDate).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          {isPending
                            ? <Badge variant="outline" className="border-amber-400 text-amber-700 text-xs">{t("common.pending")}</Badge>
                            : <span className="font-semibold text-green-600">{salePrice.toLocaleString("en-EG", { minimumFractionDigits: 2 })}</span>
                          }
                        </TableCell>
                        <TableCell>
                          <span className="text-green-700">{amountPaid.toLocaleString("en-EG", { minimumFractionDigits: 2 })}</span>
                        </TableCell>
                        <TableCell>
                          {outstanding > 0
                            ? <span className="font-semibold text-amber-600">{outstanding.toLocaleString("en-EG", { minimumFractionDigits: 2 })}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>{weightAtSale ? `${parseFloat(String(weightAtSale)).toFixed(1)} kg` : "—"}</TableCell>
                        <TableCell>{pricePerKg !== "—" ? `EGP ${pricePerKg}` : "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{buyerName ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canMutate && outstanding > 0 && !isPending && (
                              <RecordPaymentDialog saleId={saleId} animalCode={animalCode} outstanding={outstanding} onSuccess={refetch} />
                            )}
                            {canMutate && <EditSaleDialog sale={saleForEdit} onSuccess={refetch} />}
                            {canMutate && <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 h-8 w-8 p-0">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-destructive" />
                                    {t("sales.deleteSaleRecord")}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Move sale record for <strong>{animalCode}</strong> to the Recycle Bin? You can restore it anytime.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                  <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteSale.mutate({ id: saleId })}>
                                    {t("common.moveToBin")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
