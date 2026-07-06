import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FarmMapPreview } from "@/components/FarmMapPreview";
import { EditAnimalDialog } from "@/components/EditAnimalDialog";
import { readMapShape } from "@/lib/farmMap";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, DollarSign, Egg, ExternalLink, FileDown, GitBranch, MapPinned, Maximize2, Pencil, Plus, Scale, ShoppingCart, TrendingUp, Trash2, Syringe } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { generateAnimalPnLPdf } from "@/lib/pdfReports";
import { useCurrency } from "@/hooks/useCurrency";
import { useState } from "react";
import * as React from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/hooks/usePermissions";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function AnimalPhoto({ animalId, hasPhoto }: { animalId: number; hasPhoto: boolean }) {
  const { t } = useTranslation();
  const { canUpdate } = usePermissions("animals");
  const utils = trpc.useUtils();
  const { data: photo } = trpc.animals.getPhotoUrl.useQuery({ id: animalId });
  const [uploading, setUploading] = useState(false);

  const setPhoto = trpc.animals.setPhoto.useMutation({
    onSuccess: () => {
      toast.success(t("animalProfile.photoUpdated"));
      utils.animals.getPhotoUrl.invalidate({ id: animalId });
      utils.animals.getById.invalidate({ id: animalId });
      setUploading(false);
    },
    onError: (e) => { toast.error(e.message); setUploading(false); },
  });
  const removePhoto = trpc.animals.removePhoto.useMutation({
    onSuccess: () => {
      toast.success(t("animalProfile.photoRemoved"));
      utils.animals.getPhotoUrl.invalidate({ id: animalId });
      utils.animals.getById.invalidate({ id: animalId });
    },
    onError: (e) => toast.error(e.message),
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast.error(t("animalProfile.photoTooLarge")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setUploading(true);
      setPhoto.mutate({ id: animalId, dataUrl: String(reader.result) });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const url = photo?.url ?? null;
  const [zoomOpen, setZoomOpen] = useState(false);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`h-24 w-24 rounded-lg overflow-hidden border bg-muted flex items-center justify-center shrink-0 ${url ? "cursor-pointer" : ""}`}
        onClick={() => url && setZoomOpen(true)}
      >
        {url ? (
          <img src={url} alt="animal" className="h-full w-full object-cover" />
        ) : (
          <span className="text-3xl">🐑</span>
        )}
      </div>
      {url && (
        <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden">
            <img src={url} alt="animal" className="w-full h-auto object-contain max-h-[80vh]" />
          </DialogContent>
        </Dialog>
      )}
      <div className="flex items-center gap-1">
        {canUpdate && <label className="text-xs text-primary cursor-pointer hover:underline">
          {hasPhoto ? t("animalProfile.changePhoto") : t("animalProfile.addPhoto")}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} disabled={uploading} />
        </label>}
        {canUpdate && hasPhoto && (
          <button className="text-xs text-red-500 hover:underline" onClick={() => removePhoto.mutate({ id: animalId })}>
            · {t("common.remove")}
          </button>
        )}
      </div>
    </div>
  );
}

function PnLCard({ animalId }: { animalId: number }) {
  const { t } = useTranslation();
  const { canView } = usePermissions("pnl");
  const { data: pnl, isLoading } = trpc.animals.getPnL.useQuery(
    { animalId },
    { enabled: canView },
  );
  const { data: animal } = trpc.animals.getById.useQuery({ id: animalId });
  const { data: rationPlans } = trpc.feed.getRationPlans.useQuery(
    { categoryId: animal?.animal.categoryId },
    { enabled: !!animal?.animal.categoryId }
  );

  if (!canView) return null;
  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const fmt = (v: number) =>
    new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

  // Diagnose why feed cost is zero, so it's not mistaken for a bug.
  const activePlans = (rationPlans ?? []).filter((p: any) => p.isActive);
  const feedCostZero = (pnl?.feedCost ?? 0) === 0;
  let feedHint: string | null = null;
  if (feedCostZero) {
    if (activePlans.length === 0) feedHint = t("pnl.feedHintNoPlan");
    else if (activePlans.some((p: any) => p.currentPrice == null)) feedHint = t("pnl.feedHintNoPrice");
  }

  const items = [
    { label: t("pnl.purchaseCost"), value: pnl?.purchaseCost ?? 0, type: "cost" },
    { label: t("pnl.animalOperatingCost"), value: pnl?.animalOperatingCost ?? 0, type: "cost" },
    { label: t("pnl.feedCost"), value: pnl?.feedCost ?? 0, type: "cost" },
    { label: t("pnl.directExpenses"), value: pnl?.directExpenseTotal ?? 0, type: "cost" },
    { label: t("pnl.allocatedCatExpenses"), value: pnl?.categoryExpenseAllocation ?? 0, type: "cost" },
    { label: t("pnl.allocatedHerdExpenses"), value: pnl?.herdExpenseAllocation ?? 0, type: "cost" },
    { label: t("pnl.totalCost"), value: pnl?.totalCost ?? 0, type: "total-cost" },
    { label: t("pnl.saleRevenue"), value: pnl?.revenue ?? 0, type: "revenue" },
    { label: t("pnl.netPnL"), value: pnl?.netPnL ?? 0, type: "pnl" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          {t("animalProfile.financialSummary")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.label} className={`flex justify-between items-center py-1.5 ${
              item.type === "total-cost" || item.type === "pnl" ? "border-t font-semibold" : ""
            }`}>
              <span className="text-sm text-muted-foreground">{item.label}</span>
              <span className={`text-sm font-medium ${
                item.type === "revenue" ? "text-green-600" :
                item.type === "pnl" ? (item.value >= 0 ? "text-green-600" : "text-red-600") :
                item.type === "cost" || item.type === "total-cost" ? "text-red-600" : ""
              }`}>
                {fmt(item.value)}
              </span>
            </div>
          ))}
        </div>
        {feedHint && (
          <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            <span>⚠️</span><span>{feedHint}</span>
          </div>
        )}
        {pnl && (
          <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">{t("animalProfile.costDay")}</p>
              <p className="text-lg font-bold">{fmt(pnl.costPerDay ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("animalProfile.costMonth")}</p>
              <p className="text-lg font-bold">{fmt(pnl.costPerMonth ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("animals.daysOnFarm")}</p>
              <p className="text-lg font-bold">{pnl.daysOnFarm ?? 0}</p>
            </div>
            {pnl.pricePerKg > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">{t("animalProfile.pricePerKgAtSale")}</p>
                <p className="text-lg font-bold text-green-600">EGP {(pnl.pricePerKg ?? 0).toFixed(2)}</p>
              </div>
            )}
            {pnl.projectedCost != null && pnl.isActive && (
              <div>
                <p className="text-xs text-muted-foreground">{t("pnl.projectedCostToTarget")}</p>
                <p className="text-lg font-bold text-amber-600">{fmt(pnl.projectedCost)}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AnimalLocationPreview({ animal }: { animal: any }) {
  const { t } = useTranslation();
  const { data: mapImage } = trpc.config.getFarmMapImage.useQuery();
  const { data: groups } = trpc.config.getGroups.useQuery();
  const group = (groups ?? []).find((item: any) => item.id === animal.animal.groupId);
  const shape = readMapShape(group?.mapShape);

  if (!mapImage?.url || !group || !shape) return null;

  const groupLabel = group.groupCode ? `${group.groupCode} - ${group.name}` : group.name ?? animal.groupName;

  return (
    <div className="border-t pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPinned aria-hidden="true" className="h-3.5 w-3.5" />
          {t("animalProfile.mapLocation")}
        </span>
      </div>
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="group block w-full rounded-md text-left outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={t("animalProfile.openMapLocation")}
          >
            <div className="relative">
              <FarmMapPreview
                imageUrl={mapImage.url}
                imageAlt={t("farmMap.imageAlt")}
                groups={groups ?? []}
                selectedGroupId={animal.animal.groupId}
                selectedLabel={groupLabel}
                focusSelected
                className="shadow-xs"
              />
              <span className="absolute right-2 top-2 rounded bg-background/90 p-1 shadow">
                <Maximize2 aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
            </div>
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[95dvh] w-[95vw] max-w-[95vw] overflow-y-auto overscroll-contain sm:max-w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPinned aria-hidden="true" className="h-4 w-4 text-primary" />
              {t("animalProfile.mapLocation")}
            </DialogTitle>
          </DialogHeader>
          <FarmMapPreview
            imageUrl={mapImage.url}
            imageAlt={t("farmMap.imageAlt")}
            groups={groups ?? []}
            selectedGroupId={animal.animal.groupId}
            selectedLabel={groupLabel}
            showLabels
            focusSelected
            interactive
            className="shadow-sm"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WeightChart({ animalId }: { animalId: number }) {
  const { t } = useTranslation();
  const { canCreate, canDelete } = usePermissions("fattening");
  const { data: weights } = trpc.animals.getWeightLog.useQuery({ animalId });
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [weight, setWeight] = useState("");
  const utils = trpc.useUtils();

  const addWeight = trpc.animals.addWeight.useMutation({
    onSuccess: (result: any) => {
      if (result?.autoStaged && result?.newAnimalId) {
        toast.success(t("animalProfile.weightAutoStaged", { id: result.newAnimalId }));
      } else {
        toast.success(t("animalProfile.weightRecorded"));
      }
      utils.animals.getWeightLog.invalidate({ animalId });
      utils.animals.getPnL.invalidate({ animalId });
      utils.animals.getById.invalidate({ id: animalId });
      utils.animals.getAllPnL.invalidate();
      utils.feed.getStockStatus.invalidate();
      utils.dashboard.getKPIs.invalidate();
      setOpen(false);
      setWeight("");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteWeight = trpc.animals.deleteWeight.useMutation({
    onSuccess: () => {
      toast.success(t("animalProfile.weightDeleted"));
      utils.animals.getWeightLog.invalidate({ animalId });
      utils.animals.getPnL.invalidate({ animalId });
      utils.animals.getById.invalidate({ id: animalId });
      utils.animals.getAllPnL.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const chartData = (weights ?? [])
    .slice()
    .sort((a: any, b: any) => new Date(a.weighDate).getTime() - new Date(b.weighDate).getTime())
    .map((w: any, i: number, arr: any[]) => {
      const currentWeight = parseFloat(w.weightKg);
      const prevWeight = i > 0 ? parseFloat(arr[i - 1].weightKg) : null;
      const diffPct = prevWeight && prevWeight > 0
        ? ((currentWeight - prevWeight) / prevWeight * 100).toFixed(1)
        : null;
      return {
        date: new Date(w.weighDate).toLocaleDateString("en-EG", { month: "short", day: "numeric" }),
        weight: currentWeight,
        diff: diffPct ? parseFloat(diffPct) : 0,
      };
    });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">{t("animals.weightHistory")}</h3>
        {canCreate && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2">
              <Plus className="h-3 w-3" />
              {t("fattening.recordWeight")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{t("fattening.recordWeight")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("common.date")}</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Weight (kg)</Label>
                <Input type="number" placeholder="0.0" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => addWeight.mutate({ animalId, weighDate: date, weightKg: weight })} disabled={!weight || addWeight.isPending}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>}
      </div>

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit=" kg" />
            <Tooltip formatter={(v: number) => [`${v} kg`, "Weight"]} />
            <Line type="monotone" dataKey="weight" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4, fill: "var(--primary)" }} activeDot={{ r: 6 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {t("animalProfile.noWeightRecords")}
        </div>
      )}

      {(weights ?? []).length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.date")}</TableHead>
              <TableHead>Weight (kg)</TableHead>
              <TableHead>Δ %</TableHead>
              <TableHead>{t("common.notes")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(weights ?? []).map((w: any, i: number, arr: any[]) => {
              const currentWeight = parseFloat(w.weightKg);
              const prevWeight = i > 0 ? parseFloat(arr[i - 1].weightKg) : null;
              const diffPct = prevWeight && prevWeight > 0
                ? ((currentWeight - prevWeight) / prevWeight * 100)
                : null;
              return (
              <TableRow key={w.id}>
                <TableCell>{new Date(w.weighDate).toLocaleDateString()}</TableCell>
                <TableCell className="font-medium">{parseFloat(w.weightKg).toFixed(1)} kg</TableCell>
                <TableCell>
                  <span className={`inline-flex min-w-[4rem] justify-end rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${
                    diffPct === null || diffPct === 0
                      ? "bg-secondary text-secondary-foreground"
                      : diffPct > 0
                        ? "bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300"
                        : "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300"
                  }`}>
                    {diffPct !== null ? `${diffPct > 0 ? "+" : ""}${diffPct.toFixed(1)}%` : "—"}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{w.notes ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {canDelete && <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("animalProfile.deleteWeightTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("animalProfile.deleteWeightConfirm", { weight: parseFloat(w.weightKg).toFixed(1), date: new Date(w.weighDate).toLocaleDateString() })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteWeight.mutate({ id: w.id })}>
                          {t("common.delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>}
                </TableCell>
              </TableRow>
            )})}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function LineageTree({ animalId }: { animalId: number }) {
  const { t } = useTranslation();
  const { data: lineage } = trpc.animals.getLineage.useQuery({ animalId });
  const [, setLocation] = useLocation();

  if (!lineage) return <Skeleton className="h-40 w-full" />;

  const AnimalNode = ({ animal, label }: { animal: any; label: string }) => (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {animal ? (
        <button
          onClick={() => setLocation(`/animals/${animal.animal.id}`)}
          className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-mono font-semibold hover:bg-primary/20 transition-colors"
        >
          {animal.animal.animalId}
        </button>
      ) : (
        <span className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs">{t("common.unknown")}</span>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <h3 className="font-semibold flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-primary" />
        {t("animalProfile.lineageTree")}
      </h3>

      {/* Grandparents */}
      <div className="grid grid-cols-4 gap-4 justify-items-center">
        <AnimalNode animal={lineage.damDam} label="Dam's Dam" />
        <AnimalNode animal={lineage.damSire} label="Dam's Sire" />
        <AnimalNode animal={lineage.sireDam} label="Sire's Dam" />
        <AnimalNode animal={lineage.sireSire} label="Sire's Sire" />
      </div>

      {/* Parents */}
      <div className="grid grid-cols-2 gap-4 justify-items-center">
        <AnimalNode animal={lineage.dam} label="Dam (Mother)" />
        <AnimalNode animal={lineage.sire} label="Sire (Father)" />
      </div>

      {/* This animal */}
      <div className="flex justify-center">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-muted-foreground">{t("animalProfile.thisAnimal")}</span>
          <span className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-mono font-bold">
            {lineage.animal?.animal.animalId}
          </span>
        </div>
      </div>

      {/* Offspring */}
      {lineage.offspring.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">{t("animalProfile.offspring", { count: lineage.offspring.length })}</p>
          <div className="flex flex-wrap gap-2">
            {lineage.offspring.map((o: any) => (
              <button
                key={o.animal.id}
                onClick={() => setLocation(`/animals/${o.animal.id}`)}
                className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs font-mono hover:bg-green-200 transition-colors"
              >
                {o.animal.animalId}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── In-profile Add Expense (stays on the animal profile) ─────────────────────
function ProfileAddExpenseDialog({ animal }: { animal: any }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ expenseDate: new Date().toISOString().slice(0, 10), categoryId: "", amount: "", vendorName: "", notes: "" });
  const { data: categories } = trpc.config.getExpenseCategories.useQuery();
  const create = trpc.expenses.create.useMutation({
    onSuccess: () => {
      toast.success(t("expenses.recorded"));
      utils.animals.getExpenseHistory.invalidate({ animalId: animal.animal.id });
      utils.animals.getPnL.invalidate({ animalId: animal.animal.id });
      utils.animals.getAllPnL.invalidate();
      utils.dashboard.getKPIs.invalidate();
      setOpen(false);
      setForm(f => ({ ...f, amount: "", vendorName: "", notes: "" }));
    },
    onError: (e) => toast.error(e.message),
  });
  const submit = () => {
    if (!form.categoryId || !form.amount) { toast.error(t("expenses.categoryAmountRequired")); return; }
    create.mutate({
      expenseDate: form.expenseDate,
      categoryId: Number(form.categoryId),
      amount: form.amount,
      targetType: "head",
      headId: animal.animal.id,
      vendorName: form.vendorName || undefined,
      notes: form.notes || undefined,
    });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2"><DollarSign className="h-3.5 w-3.5" />{t("expenses.addExpense")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md w-[95vw] sm:w-auto">
        <DialogHeader><DialogTitle>{t("expenses.recordExpense")} — {animal.animal.animalId}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>{t("common.date") || "Date"} *</Label><Input type="date" value={form.expenseDate} onChange={(e) => setForm(f => ({ ...f, expenseDate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t("expenses.amount") || "Amount"} *</Label><Input type="number" placeholder="0.00" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.category")} *</Label>
            <Select value={form.categoryId} onValueChange={(v) => setForm(f => ({ ...f, categoryId: v }))}>
              <SelectTrigger><SelectValue placeholder={t("common.category")} /></SelectTrigger>
              <SelectContent>{(categories ?? []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>{t("expenses.vendor") || "Vendor"}</Label><Input value={form.vendorName} onChange={(e) => setForm(f => ({ ...f, vendorName: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>{t("common.notes") || "Notes"}</Label><Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={create.isPending}>{t("common.save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── In-profile Record Sale (stays on the animal profile) ─────────────────────
function ProfileRecordSaleDialog({ animal }: { animal: any }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const { data: statuses } = trpc.config.getStatuses.useQuery();
  const exitStatuses = (statuses ?? []).filter((s: any) => s.isExitStatus);
  const [form, setForm] = useState({ saleDate: new Date().toISOString().slice(0, 10), salePrice: "", amountPaid: "", statusId: "", weightAtSale: "", buyerName: "", notes: "" });
  React.useEffect(() => {
    if (!form.statusId && exitStatuses.length > 0) setForm(f => ({ ...f, statusId: String(exitStatuses[0].id) }));
  }, [exitStatuses, form.statusId]);
  const exitAnimal = trpc.animals.exit.useMutation({
    onSuccess: () => {
      toast.success(t("sales.recorded"));
      utils.animals.getById.invalidate({ id: animal.animal.id });
      utils.animals.getAnimalSales.invalidate({ animalId: animal.animal.id });
      utils.animals.getStatusHistory.invalidate({ animalId: animal.animal.id });
      utils.animals.getPnL.invalidate({ animalId: animal.animal.id });
      utils.animals.getAllPnL.invalidate();
      utils.dashboard.getKPIs.invalidate();
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const priceNum = parseFloat(form.salePrice) || 0;
  const paidNum = form.amountPaid === "" ? priceNum : (parseFloat(form.amountPaid) || 0);
  const submit = () => {
    if (!form.salePrice) { toast.error(t("sales.animalPriceRequired")); return; }
    if (!form.statusId) { toast.error(t("animals.selectExitStatus")); return; }
    if (paidNum > priceNum) { toast.error(t("sales.paymentExceedsOutstanding")); return; }
    exitAnimal.mutate({
      id: animal.animal.id,
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
        <Button size="sm" variant="outline" className="gap-2"><ShoppingCart className="h-3.5 w-3.5" />{t("sales.recordSale")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md w-[95vw] sm:w-auto max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("sales.recordAnimalSale")} — {animal.animal.animalId}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>{t("common.date") || "Date"} *</Label><Input type="date" value={form.saleDate} onChange={(e) => setForm(f => ({ ...f, saleDate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t("pnl.salePrice") || "Sale price"} *</Label><Input type="number" placeholder="0.00" value={form.salePrice} onChange={(e) => setForm(f => ({ ...f, salePrice: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>{t("sales.paid") || "Paid"}</Label><Input type="number" placeholder={form.salePrice || "0.00"} value={form.amountPaid} onChange={(e) => setForm(f => ({ ...f, amountPaid: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t("common.status")} *</Label>
              <Select value={form.statusId} onValueChange={(v) => setForm(f => ({ ...f, statusId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("common.status")} /></SelectTrigger>
                <SelectContent>{exitStatuses.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>{t("pnl.weightAtSale") || "Weight at sale"}</Label><Input type="number" placeholder="0.0" value={form.weightAtSale} onChange={(e) => setForm(f => ({ ...f, weightAtSale: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t("common.buyer") || "Buyer"}</Label><Input value={form.buyerName} onChange={(e) => setForm(f => ({ ...f, buyerName: e.target.value }))} /></div>
          </div>
          <div className="space-y-1.5"><Label>{t("common.notes") || "Notes"}</Label><Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={exitAnimal.isPending}>{t("common.save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PregnancyTab({ animalId }: { animalId: number }) {
  const { t } = useTranslation();
  const { canCreate, canUpdate } = usePermissions("pregnancy");
  const { data: records } = trpc.pregnancy.byAnimal.useQuery({ animalId });
  const { data: history } = trpc.pregnancy.reproductiveHistory.useQuery({ animalId });
  const utils = trpc.useUtils();
  const [confirmationDate, setConfirmationDate] = useState(new Date().toISOString().slice(0, 10));

  const invalidate = () => {
    utils.pregnancy.byAnimal.invalidate({ animalId });
    utils.pregnancy.reproductiveHistory.invalidate({ animalId });
  };
  const create = trpc.pregnancy.create.useMutation({
    onSuccess: () => { toast.success(t("pregnancy.recorded")); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.pregnancy.update.useMutation({
    onSuccess: () => { toast.success(t("pregnancy.updated")); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const active = (records ?? []).find((p: any) => p.record.status === "active");

  return (
    <div className="space-y-4">
      {/* Reproductive history summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{t("pregnancy.totalPregnancies")}</p><p className="text-lg font-bold">{history?.totalPregnancies ?? 0}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{t("pregnancy.delivered")}</p><p className="text-lg font-bold text-green-600">{history?.delivered ?? 0}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{t("pregnancy.lastDelivery")}</p><p className="text-sm font-medium">{history?.lastDeliveryDate ? String(history.lastDeliveryDate).slice(0, 10) : "—"}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{t("pregnancy.status")}</p><p className="text-sm font-medium">{active ? t("pregnancy.active") : t("pregnancy.noActive")}</p></div>
      </div>

      {active ? (
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("pregnancy.dueDate")}</span>
              <span className="font-semibold">{String(active.record.expectedDueDate).slice(0, 10)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Progress value={active.progressPct} className="h-2.5" />
              <span className="text-xs text-muted-foreground w-9 tabular-nums">{active.progressPct}%</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t("pregnancy.daysPregnant")}: {active.daysPregnant}</span>
              <span>{active.daysRemaining < 0 ? t("pregnancy.overdueBy", { days: Math.abs(active.daysRemaining) }) : t("pregnancy.dueIn", { days: active.daysRemaining })}</span>
            </div>
            {canUpdate && (
              <Button size="sm" variant="outline" className="gap-2" onClick={() => update.mutate({ id: active.record.id, status: "delivered", completedDate: new Date().toISOString().slice(0, 10) })}>
                {t("pregnancy.markDelivered")}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : canCreate ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <div className="space-y-1.5">
            <Label>{t("pregnancy.confirmationDate")}</Label>
            <Input type="date" className="w-44" value={confirmationDate} onChange={(e) => setConfirmationDate(e.target.value)} />
          </div>
          <Button className="gap-2" disabled={!confirmationDate || create.isPending} onClick={() => create.mutate({ animalId, confirmationDate })}>
            <Plus className="h-4 w-4" />{t("pregnancy.record")}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("pregnancy.noActive")}</p>
      )}
    </div>
  );
}

function FeedHistoryTab({ animalId }: { animalId: number }) {
  const { t } = useTranslation();
  const { data: plans } = trpc.animals.getFeedHistory.useQuery({ animalId });
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Feed Ration Plans (for this animal's category)</h3>
      {(plans ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("animalProfile.noRationPlans")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.feedItem")}</TableHead>
              <TableHead>{t("animalProfile.qtyHeadDay")}</TableHead>
              <TableHead>{t("common.effectiveDate")}</TableHead>
              <TableHead>{t("common.endDate")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(plans ?? []).map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.feedItemName ?? p.feedItemId}</TableCell>
                <TableCell>{parseFloat(p.qtyPerHeadPerDay).toFixed(2)} kg</TableCell>
                <TableCell>{p.effectiveDate ? new Date(p.effectiveDate instanceof Date ? p.effectiveDate.toISOString() : p.effectiveDate).toLocaleDateString() : "—"}</TableCell>
                <TableCell>{p.endDate ? new Date(p.endDate instanceof Date ? p.endDate.toISOString() : p.endDate).toLocaleDateString() : "—"}</TableCell>
                <TableCell>
                  <Badge variant={p.isActive ? "default" : "secondary"}>
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ExpenseHistoryTab({ animalId }: { animalId: number }) {
  const { t } = useTranslation();
  const { data: expenses } = trpc.animals.getExpenseHistory.useQuery({ animalId });
  const fmt = (v: number) =>
    new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(v);
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">{t("animalProfile.directExpensesAllocated")}</h3>
      {(expenses ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("animalProfile.noDirectExpenses")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.date")}</TableHead>
              <TableHead>{t("common.category")}</TableHead>
              <TableHead>{t("common.amount")}</TableHead>
              <TableHead>{t("common.vendor")}</TableHead>
              <TableHead>{t("common.notes")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(expenses ?? []).map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{new Date(e.expenseDate).toLocaleDateString()}</TableCell>
                <TableCell>{e.categoryName ?? "—"}</TableCell>
                <TableCell className="font-medium text-red-600">{fmt(parseFloat(e.amount))}</TableCell>
                <TableCell>{e.vendorName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{e.notes ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function AnimalSalesTab({ animalId }: { animalId: number }) {
  const { t } = useTranslation();
  const { data: salesData } = trpc.animals.getAnimalSales.useQuery({ animalId });
  const fmt = (v: number) =>
    new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(v);
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">{t("animalProfile.saleRecords")}</h3>
      {(salesData ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("animalProfile.noSaleRecords")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.saleDate")}</TableHead>
              <TableHead>{t("common.salePrice")}</TableHead>
              <TableHead>{t("animalProfile.weightAtSale")}</TableHead>
              <TableHead>{t("pnl.pricePerKg")}</TableHead>
              <TableHead>{t("common.buyer")}</TableHead>
              <TableHead>{t("common.notes")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(salesData ?? []).map((s: any) => (
              <TableRow key={s.sale.id}>
                <TableCell>{new Date(s.sale.saleDate).toLocaleDateString()}</TableCell>
                <TableCell className="font-medium text-green-600">{fmt(parseFloat(s.sale.salePrice))}</TableCell>
                <TableCell>{s.sale.weightAtSale ? `${parseFloat(s.sale.weightAtSale).toFixed(1)} kg` : "—"}</TableCell>
                <TableCell>{s.sale.pricePerKg ? `${parseFloat(s.sale.pricePerKg).toFixed(2)} EGP/kg` : "—"}</TableCell>
                <TableCell>{s.sale.buyerName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{s.sale.notes ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function StatusHistory({ animalId }: { animalId: number }) {
  const { t } = useTranslation();
  const { data: history } = trpc.animals.getStatusHistory.useQuery({ animalId });

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">{t("animals.statusHistory")}</h3>
      {(history ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("animalProfile.noStatusChanges")}</p>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-4">
            {(history ?? []).map((h: any, i: number) => (
              <div key={h.id} className="flex gap-4 pl-10 relative">
                <div className="absolute left-3 top-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                <div>
                  <p className="text-sm font-medium">{h.newStatusName}</p>
                  {h.previousStatusName && (
                    <p className="text-xs text-muted-foreground">{t("animalProfile.fromStatus", { status: h.previousStatusName })}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{new Date(h.changedAt).toLocaleString()}</p>
                  {h.notes && <p className="text-xs text-muted-foreground italic">{h.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VaccinationHistoryTab({ animalId }: { animalId: number }) {
  const { t } = useTranslation();
  const { data: vaccinations } = trpc.vaccination.getVaccinationRecords.useQuery({ animalId });

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">{t("vaccine.title")}</h3>
      {(vaccinations ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("vaccine.noVaccinations")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("vaccine.vaccineName")}</TableHead>
              <TableHead>{t("vaccine.vaccinationDate")}</TableHead>
              <TableHead>{t("vaccine.nextDueDate")}</TableHead>
              <TableHead>{t("vaccine.boosterDueDate")}</TableHead>
              <TableHead>{t("vaccine.batchNumber")}</TableHead>
              <TableHead>{t("vaccine.veterinarian")}</TableHead>
              <TableHead>{t("vaccine.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(vaccinations ?? []).map((v: any) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.vaccineName}</TableCell>
                <TableCell>{new Date(v.vaccinationDate).toLocaleDateString()}</TableCell>
                <TableCell>
                  {v.nextDueDate ? (
                    <span className={(() => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const dueDate = new Date(v.nextDueDate);
                      dueDate.setHours(0, 0, 0, 0);
                      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
                      if (diffDays < 0) return "text-red-600 font-medium";
                      if (diffDays <= 7) return "text-amber-600 font-medium";
                      return "";
                    })()}>
                      {new Date(v.nextDueDate).toLocaleDateString()}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  {v.boosterDueDate ? (
                    <span className={(() => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const due = new Date(v.boosterDueDate);
                      due.setHours(0, 0, 0, 0);
                      const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);
                      if (diffDays < 0) return "text-red-600 font-medium";
                      if (diffDays <= 7) return "text-amber-600 font-medium";
                      return "";
                    })()}>
                      {new Date(v.boosterDueDate).toLocaleDateString()}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell>{v.batchNumber ?? "—"}</TableCell>
                <TableCell>{v.veterinarian ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={v.isCompleted ? "default" : "secondary"}>
                    {v.isCompleted ? t("vaccine.completed") : t("vaccine.due")}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function AnimalProfile() {
  const { t } = useTranslation();
  const permissions = usePermissions("animals");
  const params = useParams<{ id: string }>();
  const animalId = Number(params.id);
  const [, setLocation] = useLocation();

  const { data: animal, isLoading } = trpc.animals.getById.useQuery({ id: animalId });
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="p-3 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!animal) {
    return (
      <div className="p-3 md:p-6">
        <p className="text-muted-foreground">{t("animalProfile.animalNotFound")}</p>
        <Button variant="link" onClick={() => setLocation("/animals")}>{t("animals.title")}</Button>
      </div>
    );
  }

  const acqDate = new Date(animal.animal.acquisitionDate);
  const exitDate = animal.animal.exitDate ? new Date(animal.animal.exitDate) : new Date();
  const daysOnFarm = Math.floor((exitDate.getTime() - acqDate.getTime()) / (1000 * 60 * 60 * 24));
  const originBirthRecord = animal.originBirthRecord;
  const canViewBirthRecord = permissions.can("breeding", "view");

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/animals")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          {t("animalProfile.back")}
        </Button>
        <AnimalPhoto animalId={animal.animal.id} hasPhoto={!!animal.animal.photoUrl} />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono">{animal.animal.animalId}</h1>
            <Badge variant={animal.animal.isActive ? "default" : "secondary"}>
              {animal.animal.isActive ? "Active" : "Exited"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {animal.speciesName} · {animal.categoryName} · {animal.groupName} · {animal.animal.sex} · {daysOnFarm} days on farm
          </p>
        </div>
        {/* Quick Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {permissions.can("expenses", "create") && <ProfileAddExpenseDialog animal={animal} />}
          {permissions.can("sales", "create") && animal.animal.isActive && <ProfileRecordSaleDialog animal={animal} />}
          {permissions.canUpdate && <Button size="sm" variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>
            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
            {t("common.edit")}
          </Button>}
          <DownloadPdfButton animal={animal} animalId={animalId} />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* P&L Card */}
        <PnLCard animalId={animalId} />

        {/* Animal Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              {t("animalProfile.animalDetails")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
{[
              { label: "Animal ID", value: animal.animal.animalId },
              { label: "Species", value: animal.speciesName },
              { label: "Category", value: animal.categoryName },
              { label: "Group", value: animal.groupName },
              { label: "Owner", value: animal.ownerName ?? "—" },
              { label: "Sex", value: animal.animal.sex },
              { label: "Status", value: animal.statusName },
              { label: "Acquisition Type", value: animal.animal.acquisitionType },
              { label: "Birth Date", value: animal.animal.birthDate ? new Date(animal.animal.birthDate).toLocaleDateString() : "—" },
              { label: "Acquisition Date", value: new Date(animal.animal.acquisitionDate).toLocaleDateString() },
              { label: "Purchase Cost", value: animal.animal.purchaseCost ? `EGP ${parseFloat(String(animal.animal.purchaseCost)).toFixed(2)}` : "—" },
              { label: "Weight at Acquisition", value: animal.animal.weightAtAcquisition ? `${parseFloat(String(animal.animal.weightAtAcquisition)).toFixed(1)} kg` : "—" },
              { label: "Target Weight", value: animal.targetWeightKg ? `${parseFloat(String(animal.targetWeightKg)).toFixed(1)} kg` : "—" },
              { label: "% Left to Target", value: (() => {
                const tw = parseFloat(String(animal.targetWeightKg ?? "0"));
                const cw = animal.animal.weightAtAcquisition ? parseFloat(String(animal.animal.weightAtAcquisition)) : 0;
                if (tw > 0 && cw > 0) {
                  const pct = Math.max(0, Math.round((1 - cw / tw) * 100));
                  return `${pct}% remaining`;
                }
                return "—";
              })() },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-start">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="text-sm font-medium text-right max-w-32 truncate">{value ?? "—"}</span>
              </div>
            ))}
            {originBirthRecord ? (
              <div className="flex items-start justify-between gap-3 border-t pt-3">
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Egg aria-hidden="true" className="h-3.5 w-3.5" />
                  {t("animalProfile.birthRecord")}
                </span>
                {canViewBirthRecord ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-right font-mono text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => setLocation(`/breeding?record=${originBirthRecord.id}`)}
                  >
                    {originBirthRecord.lambId}
                    <ExternalLink aria-hidden="true" className="h-3 w-3" />
                    <span className="sr-only">{t("animalProfile.viewBirthRecord")}</span>
                  </button>
                ) : (
                  <span className="font-mono text-sm font-semibold">
                    {originBirthRecord.lambId}
                  </span>
                )}
              </div>
            ) : null}
            {animal.nextVaccineDate && (
              <div className="flex justify-between items-start border-t pt-2">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Syringe aria-hidden="true" className="h-3.5 w-3.5" />
                  {t("vaccine.nextVaccine")}
                </span>
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <span className="text-muted-foreground">{animal.nextVaccineName}</span>
                  <span className={(() => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const dueDate = new Date(animal.nextVaccineDate);
                    dueDate.setHours(0, 0, 0, 0);
                    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
                    if (diffDays < 0) return "text-red-600 font-medium";
                    if (diffDays <= 7) return "text-amber-600 font-medium";
                    return "";
                  })()}>
                    {new Date(animal.nextVaccineDate).toLocaleDateString()}
                  </span>
                </span>
              </div>
            )}
            <AnimalLocationPreview animal={animal} />
            {animal.animal.exitDate && (
              <div className="flex justify-between items-start border-t pt-2">
                <span className="text-sm text-muted-foreground">{t("common.exitDate")}</span>
                <span className="text-sm font-medium">{new Date(animal.animal.exitDate).toLocaleDateString()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lineage */}
        <Card>
          <CardContent className="pt-6">
            <LineageTree animalId={animalId} />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="weights">
            <TabsList className="mb-4 flex-wrap h-auto gap-1">
              <TabsTrigger value="weights">{t("animalProfile.weightLog")}</TabsTrigger>
              <TabsTrigger value="feed">{t("animals.feedHistory")}</TabsTrigger>
              <TabsTrigger value="vaccinations">{t("vaccine.title")}</TabsTrigger>
              {animal?.animal?.sex === "female" && <TabsTrigger value="pregnancy">{t("nav.pregnancy")}</TabsTrigger>}
              <TabsTrigger value="expenses">{t("nav.expenses")}</TabsTrigger>
              <TabsTrigger value="sales">{t("nav.sales")}</TabsTrigger>
              <TabsTrigger value="status">{t("animals.statusHistory")}</TabsTrigger>
            </TabsList>
            <TabsContent value="weights">
              <WeightChart animalId={animalId} />
            </TabsContent>
            <TabsContent value="feed">
              <FeedHistoryTab animalId={animalId} />
            </TabsContent>
            <TabsContent value="vaccinations">
              <VaccinationHistoryTab animalId={animalId} />
            </TabsContent>
            {animal?.animal?.sex === "female" && (
              <TabsContent value="pregnancy">
                <PregnancyTab animalId={animalId} />
              </TabsContent>
            )}
            <TabsContent value="expenses">
              <ExpenseHistoryTab animalId={animalId} />
            </TabsContent>
            <TabsContent value="sales">
              <AnimalSalesTab animalId={animalId} />
            </TabsContent>
            <TabsContent value="status">
              <StatusHistory animalId={animalId} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <EditAnimalDialog
        animalId={animal.animal.id}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}

// ── Download PDF button (fetches pnl + weight log, generates PDF) ────────────
function DownloadPdfButton({ animal, animalId }: { animal: any; animalId: number }) {
  const { t } = useTranslation();
  const { canReport } = usePermissions("animals");
  const { canView: canViewPnl } = usePermissions("pnl");
  const { data: pnl } = trpc.animals.getPnL.useQuery(
    { animalId },
    { enabled: canReport && canViewPnl },
  );
  const { data: weights } = trpc.animals.getWeightLog.useQuery({ animalId });
  const { data: settings } = trpc.config.getDisplaySettings.useQuery();
  const { currency } = useCurrency();

  const farmName = (settings as any[] | undefined)?.find((s) => s.settingKey === "farmName")?.settingValue;

  const handleDownload = () => {
    if (!pnl) {
      toast.error(t("animalProfile.loadingData"));
      return;
    }
    generateAnimalPnLPdf({
      animal,
      pnl,
      weights: weights ?? [],
      currency,
      farmName,
    });
    toast.success(t("animalProfile.pdfDownloaded"));
  };

  if (!canReport || !canViewPnl) return null;

  return (
    <Button size="sm" variant="outline" className="gap-2" onClick={handleDownload} disabled={!pnl}>
      <FileDown className="h-3.5 w-3.5" />
      {t("animalProfile.downloadPDF")}
    </Button>
  );
}
