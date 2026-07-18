import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useCurrency } from "@/hooks/useCurrency";
import { usePermissions } from "@/hooks/usePermissions";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AnimalCostDetailsDialog } from "@/components/AnimalCostDetailsDialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, ArrowLeft, Baby, Download, DollarSign, GitBranch, Pencil, ReceiptText, Scale, ShoppingCart, Syringe, Trash2, Wallet, Wheat } from "lucide-react";
import { LineChart, Line, CartesianGrid, Tooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge, type StatusTone } from "../components/StatusBadge";
import { ConsequenceConfirm } from "../components/ConsequenceConfirm";
import { FormSection, FormField, FormFooter } from "../components/FormLayout";
import { EditAnimalDialog } from "@/components/EditAnimalDialog";
import { RecordSaleDialog, WeighInSessionDialog } from "../components/AnimalWorkflows";
import { signedPercentPillClass, weightProgressBarClass, weightProgressTextClass, weightProgressTone, weightTargetPercent } from "../lib/weightProgress";

function tone(name?: string): StatusTone {
  const l = (name ?? "").toLowerCase();
  if (l.includes("active")) return "success";
  if (l.includes("sold")) return "info";
  if (l.includes("dead") || l.includes("mort")) return "danger";
  if (l.includes("transport")) return "warning";
  return "neutral";
}
function fmtDate(d: unknown) {
  if (!d) return "—";
  const x = new Date(d as string);
  return Number.isNaN(x.getTime()) ? "—" : x.toLocaleDateString();
}
const today = () => new Date().toISOString().slice(0, 10);

/** Named, accessible panel wrapper (fixes unnamed colored panels, a11y). */
function Panel({ title, icon: Icon, action, children }: { title: React.ReactNode; icon: typeof Wallet; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]" aria-label={typeof title === "string" ? title : undefined}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: rows * 2 }).map((_, i) => (
        <div key={i} className="space-y-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Animal photo with upload / change / remove / zoom (parity with Old). */
function AnimalPhoto({ animalId, animalVersion }: { animalId: number; animalVersion: number }) {
  const { t } = useTranslation();
  const { canUpdate } = usePermissions("animals");
  const utils = trpc.useUtils();
  const { data: photo } = trpc.animals.getPhotoUrl.useQuery({ id: animalId });
  const [uploading, setUploading] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  const invalidate = () => {
    utils.animals.getPhotoUrl.invalidate({ id: animalId });
    utils.animals.getById.invalidate({ id: animalId });
  };
  const setPhoto = trpc.animals.setPhoto.useMutation({
    onSuccess: () => { toast.success(t("animalProfile.photoUpdated", "Photo updated")); invalidate(); setUploading(false); },
    onError: e => { toast.error(e.message); setUploading(false); },
  });
  const removePhoto = trpc.animals.removePhoto.useMutation({
    onSuccess: () => { toast.success(t("animalProfile.photoRemoved", "Photo removed")); invalidate(); },
    onError: e => toast.error(e.message),
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast.error(t("animalProfile.photoTooLarge", "Photo too large (max 3 MB)")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setUploading(true);
      setPhoto.mutate({ id: animalId, expectedVersion: animalVersion, dataUrl: String(reader.result) });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const url = (photo as any)?.url ?? null;
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => url && setZoomOpen(true)}
        className={`grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface ${url ? "cursor-zoom-in" : "cursor-default"}`}
        aria-label={t("animalProfile.photo", "Animal photo")}
      >
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="text-3xl" aria-hidden="true">🐑</span>}
      </button>
      {url && (
        <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
          <DialogContent className="max-w-2xl overflow-hidden p-0">
            <img src={url} alt="" className="h-auto max-h-[80vh] w-full object-contain" />
          </DialogContent>
        </Dialog>
      )}
      {canUpdate && (
        <div className="flex items-center gap-1 text-xs">
          <label className="cursor-pointer text-primary hover:underline">
            {url ? t("animalProfile.changePhoto", "Change photo") : t("animalProfile.addPhoto", "Add photo")}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} disabled={uploading} />
          </label>
          {url && (
            <button className="text-danger-soft-foreground hover:underline" onClick={() => removePhoto.mutate({ id: animalId, expectedVersion: animalVersion })}>
              · {t("common.remove", "Remove")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Per-head add-expense dialog that stays on the profile (parity with Old). */
function ProfileAddExpense({ animalId, code, open, onOpenChange }: { animalId: number; code: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ expenseDate: today(), categoryId: "", amount: "", vendorName: "", notes: "" });
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const { data: categories } = trpc.config.getExpenseCategories.useQuery();
  const create = trpc.expenses.create.useMutation({
    onSuccess: () => {
      toast.success(t("expenses.created", "Expense added"));
      utils.animals.getExpenseHistory.invalidate({ animalId });
      utils.animals.getPnL.invalidate({ animalId });
      utils.animals.getAllPnL.invalidate();
      utils.dashboard.getKPIs.invalidate();
      onOpenChange(false);
      setForm(f => ({ ...f, amount: "", vendorName: "", notes: "" }));
      setIdempotencyKey(crypto.randomUUID());
    },
    onError: e => toast.error(e.message),
  });
  const submit = () => {
    if (!form.categoryId || !(parseFloat(form.amount) > 0)) { toast.error(t("expenses.fillRequired", "Enter a category and amount")); return; }
    create.mutate({
      expenseDate: form.expenseDate,
      categoryId: Number(form.categoryId),
      amount: form.amount,
      targetType: "head",
      headId: animalId,
      vendorName: form.vendorName || undefined,
      notes: form.notes || undefined,
      idempotencyKey,
    } as any);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{t("expenses.add", "Add expense")} · {code}</DialogTitle></DialogHeader>
        <FormSection>
          <FormField label={t("expenses.date", "Date")} required>
            <Input type="date" value={form.expenseDate} onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} />
          </FormField>
          <FormField label={t("expenses.amount", "Amount")} required>
            <Input type="number" inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
          </FormField>
          <FormField label={t("expenses.category", "Category")} required>
            <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
              <SelectTrigger><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
              <SelectContent>{((categories as any[]) ?? []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormField label={t("expenses.vendor", "Vendor")}>
            <Input value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} />
          </FormField>
          <FormField label={t("expenses.notes", "Notes")} full>
            <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </FormField>
        </FormSection>
        <FormFooter>
          <button onClick={() => onOpenChange(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
          <button disabled={create.isPending} onClick={submit} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {create.isPending ? t("common.saving", "Saving...") : t("common.save", "Save")}
          </button>
        </FormFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reproductive summary + active pregnancy with record/mark-delivered (parity with Old). */
function PregnancyPanel({ animalId }: { animalId: number }) {
  const { t } = useTranslation();
  const { canCreate, canUpdate } = usePermissions("pregnancy");
  const { data: records } = trpc.pregnancy.byAnimal.useQuery({ animalId });
  const { data: history } = trpc.pregnancy.reproductiveHistory.useQuery({ animalId });
  const utils = trpc.useUtils();
  const [confirmationDate, setConfirmationDate] = useState(today());

  const invalidate = () => {
    utils.pregnancy.byAnimal.invalidate({ animalId });
    utils.pregnancy.reproductiveHistory.invalidate({ animalId });
  };
  const create = trpc.pregnancy.create.useMutation({
    onSuccess: () => { toast.success(t("pregnancy.recorded", "Pregnancy recorded")); invalidate(); },
    onError: e => toast.error(e.message),
  });
  const update = trpc.pregnancy.update.useMutation({
    onSuccess: () => { toast.success(t("pregnancy.updated", "Pregnancy updated")); invalidate(); },
    onError: e => toast.error(e.message),
  });

  const h = history as any;
  const active = ((records as any[]) ?? []).find(p => p.record?.status === "active");

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("pregnancy.totalPregnancies", "Total pregnancies")} value={h?.totalPregnancies ?? 0} />
        <Stat label={t("pregnancy.delivered", "Delivered")} value={h?.delivered ?? 0} />
        <Stat label={t("pregnancy.lastDelivery", "Last delivery")} value={h?.lastDeliveryDate ? String(h.lastDeliveryDate).slice(0, 10) : "—"} />
        <Stat label={t("pregnancy.status", "Status")} value={active ? t("pregnancy.active", "Active") : t("pregnancy.noActive", "No active pregnancy")} />
      </dl>

      {active ? (
        <div className="rounded-xl border border-border bg-card-2 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("pregnancy.dueDate", "Due date")}</span>
            <span className="font-semibold">{String(active.record.expectedDueDate).slice(0, 10)}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-primary" style={{ width: `${active.progressPct ?? 0}%` }} />
            </div>
            <span className="w-9 text-xs tabular-nums text-muted-foreground">{active.progressPct ?? 0}%</span>
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{t("pregnancy.daysPregnant", "Days pregnant")}: {active.daysPregnant}</span>
            <span>
              {active.daysRemaining < 0
                ? t("pregnancy.overdueBy", "Overdue by {{days}} days", { days: Math.abs(active.daysRemaining) })
                : t("pregnancy.dueIn", "Due in {{days}} days", { days: active.daysRemaining })}
            </span>
          </div>
          {canUpdate && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: active.record.id, expectedVersion: active.record.version, status: "delivered", completedDate: today() })}
            >
              {t("pregnancy.markDelivered", "Mark delivered")}
            </Button>
          )}
        </div>
      ) : canCreate ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4">
          <div className="space-y-1.5">
            <label htmlFor="profile-pregnancy-date" className="text-sm font-medium">{t("pregnancy.confirmationDate", "Confirmation date")}</label>
            <Input id="profile-pregnancy-date" type="date" className="w-44" value={confirmationDate} onChange={e => setConfirmationDate(e.target.value)} />
          </div>
          <Button type="button" disabled={!confirmationDate || create.isPending} onClick={() => create.mutate({ animalId, confirmationDate })}>
            {t("pregnancy.record", "Record pregnancy")}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("pregnancy.noActive", "No active pregnancy")}</p>
      )}
    </div>
  );
}

/**
 * New Animal Profile. Directly fixes F-PROF2: the financial and lineage panels
 * show a loading SKELETON while their (slower) queries resolve, instead of
 * looking broken with empty boxes. Same data/permissions as Old; panels are
 * named regions for accessibility.
 */
export default function NewAnimalProfile() {
  const { t } = useTranslation();
  const params = useParams();
  const [, setLocation] = useLocation();
  const { fmt } = useCurrency();
  const perms = usePermissions();
  const utils = trpc.useUtils();
  const animalId = Number(params.id);
  const [weighOpen, setWeighOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [costDetailsOpen, setCostDetailsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteWeightRow, setDeleteWeightRow] = useState<any | null>(null);
  const [tab, setTab] = useState<"weight" | "financial" | "expenses" | "feed" | "vaccinations" | "pregnancy" | "lineage" | "activity">("weight");

  const { data: animal } = trpc.animals.getById.useQuery({ id: animalId }, { enabled: Number.isFinite(animalId) });
  const { data: pnl, isLoading: pnlLoading } = trpc.animals.getPnL.useQuery({ animalId }, { enabled: Number.isFinite(animalId) });
  const { data: lineage, isLoading: lineageLoading } = trpc.animals.getLineage.useQuery({ animalId }, { enabled: Number.isFinite(animalId) });
  const { data: weights } = trpc.animals.getWeightLog.useQuery({ animalId }, { enabled: Number.isFinite(animalId) });
  const { data: sales } = trpc.animals.getAnimalSales.useQuery({ animalId }, { enabled: Number.isFinite(animalId) });
  const { data: statusHistory } = trpc.animals.getStatusHistory.useQuery({ animalId }, { enabled: Number.isFinite(animalId) });
  const { data: expenseHistory } = trpc.animals.getExpenseHistory.useQuery({ animalId }, { enabled: Number.isFinite(animalId) && tab === "expenses" });
  const { data: feedHistory } = trpc.animals.getFeedHistory.useQuery({ animalId }, { enabled: Number.isFinite(animalId) && tab === "feed" });
  const { data: vaccinations } = trpc.vaccination.getVaccinationRecords.useQuery({ animalId }, { enabled: Number.isFinite(animalId) && tab === "vaccinations" });

  const canDeleteWeight = perms.can("fattening", "delete") || perms.can("animals", "update");
  const deleteWeight = trpc.animals.deleteWeight.useMutation({
    onSuccess: () => {
      toast.success(t("animalProfile.weightDeleted", "Weight entry deleted"));
      utils.animals.getWeightLog.invalidate({ animalId });
      utils.animals.getById.invalidate({ id: animalId });
      utils.animals.getPnL.invalidate({ animalId });
      setDeleteWeightRow(null);
    },
    onError: e => toast.error(e.message),
  });

  const a = (animal as any)?.animal;
  const code = a?.animalId ?? `#${animalId}`;
  const p = pnl as any;
  const lin = lineage as any;
  const isFemale = a?.sex === "female";
  const relation = (node: any) =>
    node ? (
      <button onClick={() => (node.id ?? node.animal?.id) && setLocation(`/animals/${node.id ?? node.animal?.id}`)} className="text-sm font-medium text-primary hover:underline">
        {node.animalId ?? node.animalCode ?? node.animal?.animalId ?? `#${node.id}`}
      </button>
    ) : (
      <span className="text-sm text-muted-foreground">—</span>
    );
  const weightRows = useMemo(
    () => ((weights as any[]) ?? []).slice().sort((a, b) => new Date(a.weighDate ?? a.recordedDate ?? a.date).getTime() - new Date(b.weighDate ?? b.recordedDate ?? b.date).getTime()),
    [weights]
  );
  const latestWeight = weightRows.length ? parseFloat(weightRows[weightRows.length - 1].weightKg ?? weightRows[weightRows.length - 1].weight ?? 0) : parseFloat(a?.weightAtAcquisition ?? 0);
  const targetWeight = parseFloat((animal as any)?.targetWeightKg ?? 0);
  const progressPercent = weightTargetPercent(latestWeight, targetWeight);
  const progress = progressPercent == null ? 0 : Math.min(100, Math.round(progressPercent));
  const progressTone = weightProgressTone(progressPercent);
  const row = animal ? {
    ...(animal as any),
    animal: a,
    latestWeightKg: latestWeight || undefined,
    targetWeightKg: targetWeight || undefined,
  } : null;
  const netPnl = parseFloat(p?.netPnL ?? 0);

  const tabs = ([
    ["weight", t("weight.history", "Weight History")],
    ["financial", t("animals.financial", "Financial")],
    ["expenses", t("nav.expenses", "Expenses")],
    ["feed", t("nav.feed", "Feed")],
    ["vaccinations", t("vaccine.title", "Vaccinations")],
    ...(isFemale ? ([["pregnancy", t("pregnancy.title", "Pregnancy")]] as const) : []),
    ["lineage", t("animals.lineage", "Lineage")],
    ["activity", t("animalProfile.activity", "Activity")],
  ] as const);

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {code}
            <StatusBadge tone={tone((animal as any)?.statusName)}>{(animal as any)?.statusName ?? "—"}</StatusBadge>
          </span>
        }
        subtitle={`${(animal as any)?.speciesName ?? ""} · ${(animal as any)?.categoryName ?? ""}`}
        crumbs={[{ label: t("newNav.animals", "Animals"), href: "/animals" }, { label: code }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("common.back", "Back")}
            </Button>
            {perms.can("animals", "update") && (
              <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                {t("common.edit", "Edit")}
              </Button>
            )}
            {perms.can("expenses", "create") && (
              <Button type="button" variant="outline" onClick={() => setExpenseOpen(true)}>
                <DollarSign className="h-4 w-4" aria-hidden="true" />
                {t("expenses.add", "Add expense")}
              </Button>
            )}
            {perms.can("fattening", "create") && a?.isActive !== false && (
              <Button type="button" variant="outline" onClick={() => setWeighOpen(true)}>
                <Scale className="h-4 w-4" aria-hidden="true" />
                {t("weight.record", "Record Weight")}
              </Button>
            )}
            {perms.can("sales", "create") && a?.isActive !== false && (
              <Button type="button" onClick={() => setSaleOpen(true)}>
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                {t("sales.recordSale", "Record Sale")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => window.print()} aria-label={t("animalProfile.downloadProfile", "Download profile")}>
              <Download className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <AnimalPhoto animalId={animalId} animalVersion={animal?.animal.version ?? 1} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("animalProfile.currentWeight", "Current Weight")}</p>
              <div className="mt-1 flex items-end gap-3">
                <p className="text-4xl font-bold tabular-nums">{latestWeight ? latestWeight.toFixed(1) : "--"} kg</p>
                {targetWeight > 0 && <p className="pb-1 text-sm text-muted-foreground">{t("weight.target", "Target")}: {targetWeight.toFixed(0)} kg</p>}
              </div>
              {targetWeight > 0 && (
                <>
                  <div className="mt-3 h-2 max-w-md overflow-hidden rounded-full bg-surface">
                    <div className={`h-full rounded-full ${weightProgressBarClass(progressTone)}`} style={{ width: `${progress}%` }} />
                  </div>
                  <p className={`mt-1 text-xs font-medium tabular-nums ${weightProgressTextClass(progressTone)}`}>{progressPercent?.toFixed(1) ?? "--"}%</p>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:min-w-64">
              <div className="rounded-lg bg-surface p-3">
                <p className="text-xs text-muted-foreground">{t("pnl.totalCost", "Total Cost")}</p>
                <p className="font-semibold tabular-nums">{pnlLoading ? "..." : fmt(parseFloat(p?.totalCost ?? 0))}</p>
              </div>
              <div className="rounded-lg bg-surface p-3">
                <p className="text-xs text-muted-foreground">{t("pnl.netPnL", "Net P&L")}</p>
                <p className={`font-semibold tabular-nums ${netPnl >= 0 ? "text-success-soft-foreground" : "text-danger-soft-foreground"}`}>{pnlLoading ? "..." : fmt(netPnl)}</p>
              </div>
            </div>
          </div>
        </section>

        <Panel title={t("animals.details", "Details")} icon={Scale}>
          <dl className="grid grid-cols-2 gap-3">
            <Stat label={t("animals.group", "Group")} value={(animal as any)?.groupName ?? "—"} />
            <Stat label={t("owners.owner", "Owner")} value={(animal as any)?.ownerName ?? "—"} />
            <Stat label={t("animals.sex", "Sex")} value={String(t(`animals.${a?.sex}`, a?.sex ?? "—"))} />
            <Stat label={t("animals.acquisitionType", "Source")} value={String(t(`animals.${a?.acquisitionType}`, a?.acquisitionType ?? "—"))} />
            <Stat label={t("animals.acquisitionDate", "Acquired")} value={fmtDate(a?.acquisitionDate)} />
            <Stat label={t("animals.birthDate", "Born")} value={fmtDate(a?.birthDate)} />
          </dl>
        </Panel>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key as typeof tab)}
            className={`h-10 whitespace-nowrap border-b-2 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring ${
              tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={tab === key}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "financial" && (
        <Panel
          title={t("animals.financial", "Financial")}
          icon={Wallet}
          action={
            <Button variant="outline" size="sm" onClick={() => setCostDetailsOpen(true)} disabled={pnlLoading || !p}>
              <ReceiptText className="h-4 w-4" />
              {t("pnl.viewCostDetails", "Cost details")}
            </Button>
          }
        >
          {pnlLoading ? (
            <PanelSkeleton rows={4} />
          ) : (
            <dl className="grid grid-cols-2 gap-3">
              <Stat label={t("pnl.purchaseCost", "Purchase cost")} value={fmt(parseFloat(p?.purchaseCost ?? 0))} />
              <Stat label={t("pnl.feedCost", "Feed cost")} value={fmt(parseFloat(p?.feedCost ?? 0))} />
              <Stat label={t("pnl.directExpenses", "Direct expenses")} value={fmt(parseFloat(p?.directExpenseTotal ?? 0))} />
              <Stat label={t("pnl.allocatedCatExpenses", "Category expenses")} value={fmt(parseFloat(p?.categoryExpenseAllocation ?? 0))} />
              <Stat label={t("pnl.allocatedHerdExpenses", "Animal-wide expenses")} value={fmt(parseFloat(p?.herdExpenseAllocation ?? 0))} />
              <Stat label={t("pnl.allocatedGeneralExpenses", "General expenses")} value={fmt(parseFloat(p?.generalExpenseAllocation ?? 0))} />
              <Stat label={t("pnl.totalCost", "Total cost")} value={fmt(parseFloat(p?.totalCost ?? 0))} />
              <Stat label={t("pnl.saleRevenue", "Sale revenue")} value={fmt(parseFloat(p?.revenue ?? 0))} />
              <Stat
                label={t("pnl.netPnL", "Net P&L")}
                value={<span className={Number(p?.netPnL ?? 0) >= 0 ? "text-success-soft-foreground" : "text-danger-soft-foreground"}>{fmt(parseFloat(p?.netPnL ?? 0))}</span>}
              />
            </dl>
          )}
        </Panel>
      )}
      <AnimalCostDetailsDialog
        animal={p ? { ...p, animalId, animalCode: code } : null}
        open={costDetailsOpen}
        onOpenChange={setCostDetailsOpen}
      />

      {tab === "expenses" && (
        <Panel
          title={t("animalProfile.directExpensesAllocated", "Direct expenses allocated to this animal")}
          icon={DollarSign}
          action={perms.can("expenses", "create") ? (
            <button onClick={() => setExpenseOpen(true)} className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface">
              {t("expenses.add", "Add expense")}
            </button>
          ) : undefined}
        >
          {!expenseHistory ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : ((expenseHistory as any[]) ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("animalProfile.noDirectExpenses", "No direct expenses yet.")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 font-medium">{t("expenses.date", "Date")}</th>
                    <th className="py-2 font-medium">{t("expenses.category", "Category")}</th>
                    <th className="py-2 text-right font-medium">{t("expenses.amount", "Amount")}</th>
                    <th className="py-2 font-medium">{t("expenses.vendor", "Vendor")}</th>
                    <th className="py-2 font-medium">{t("common.notes", "Notes")}</th>
                  </tr>
                </thead>
                <tbody>
                  {((expenseHistory as any[]) ?? []).map((e: any) => (
                    <tr key={e.id} className="border-b border-border last:border-0">
                      <td className="py-2">{fmtDate(e.expenseDate)}</td>
                      <td className="py-2">{e.categoryName ?? "—"}</td>
                      <td className="py-2 text-right font-medium tabular-nums">{fmt(parseFloat(e.amount))}</td>
                      <td className="py-2">{e.vendorName ?? "—"}</td>
                      <td className="py-2 text-muted-foreground">{e.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === "feed" && (
        <Panel title={t("animalProfile.feedRationPlans", "Feed ration plans (this animal's category)")} icon={Wheat}>
          {!feedHistory ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : ((feedHistory as any[]) ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("animalProfile.noRationPlans", "No ration plans for this category.")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 font-medium">{t("feed.item", "Feed item")}</th>
                    <th className="py-2 pe-6 font-medium">{t("feed.qtyPerHead", "Qty/head/day")}</th>
                    <th className="py-2 font-medium">{t("feed.effective", "Effective")}</th>
                    <th className="py-2 font-medium">{t("feed.endDate", "End date")}</th>
                    <th className="py-2 font-medium">{t("animals.status", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {((feedHistory as any[]) ?? []).map((pl: any) => (
                    <tr key={pl.id} className="border-b border-border last:border-0">
                      <td className="py-2 font-medium">{pl.feedItemName ?? pl.feedItemId}</td>
                      <td className="py-2 pe-6 tabular-nums">{parseFloat(pl.qtyPerHeadPerDay).toFixed(2)} kg</td>
                      <td className="py-2">{fmtDate(pl.effectiveDate)}</td>
                      <td className="py-2">{pl.endDate ? fmtDate(pl.endDate) : t("feed.ongoing", "Ongoing")}</td>
                      <td className="py-2"><StatusBadge tone={pl.isActive ? "success" : "neutral"}>{pl.isActive ? t("feed.active", "Active") : t("feed.ended", "Ended")}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === "vaccinations" && (
        <Panel title={t("vaccine.title", "Vaccinations")} icon={Syringe}>
          {!vaccinations ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : ((vaccinations as any[]) ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("vaccine.none", "No vaccination records yet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 font-medium">{t("vaccine.vaccine", "Vaccine")}</th>
                    <th className="py-2 font-medium">{t("vaccine.date", "Date")}</th>
                    <th className="py-2 font-medium">{t("vaccine.nextDue", "Next due")}</th>
                    <th className="py-2 font-medium">{t("vaccine.booster", "Booster")}</th>
                    <th className="py-2 font-medium">{t("vaccine.vet", "Vet")}</th>
                  </tr>
                </thead>
                <tbody>
                  {((vaccinations as any[]) ?? []).map((v: any) => (
                    <tr key={v.id} className="border-b border-border last:border-0">
                      <td className="py-2 font-medium">{v.vaccineName ?? "—"}</td>
                      <td className="py-2">{fmtDate(v.vaccinationDate)}</td>
                      <td className="py-2">{fmtDate(v.nextDueDate)}</td>
                      <td className="py-2">{fmtDate(v.boosterDueDate)}</td>
                      <td className="py-2 text-muted-foreground">{v.veterinarian ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === "pregnancy" && isFemale && (
        <Panel title={t("pregnancy.title", "Pregnancy Tracking")} icon={Baby}>
          <PregnancyPanel animalId={animalId} />
        </Panel>
      )}

      {tab === "lineage" && (
        <Panel title={t("animals.lineage", "Lineage")} icon={GitBranch}>
          {lineageLoading ? (
            <PanelSkeleton rows={3} />
          ) : (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-3">
                <Stat label={t("animals.dam", "Dam")} value={relation(lin?.dam)} />
                <Stat label={t("animals.sire", "Sire")} value={relation(lin?.sire)} />
                <Stat label={t("animals.damDam", "Dam's dam")} value={relation(lin?.damDam)} />
                <Stat label={t("animals.sireDam", "Sire's dam")} value={relation(lin?.sireDam)} />
              </dl>
              {((lin?.offspring as any[]) ?? []).length > 0 && (
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">{t("animals.offspring", "Offspring")} ({(lin.offspring as any[]).length})</p>
                  <div className="flex flex-wrap gap-2">
                    {(lin.offspring as any[]).map((o: any) => (
                      <button
                        key={o.animal?.id ?? o.id}
                        onClick={() => setLocation(`/animals/${o.animal?.id ?? o.id}`)}
                        className="rounded-md bg-primary-soft px-2 py-1 text-xs font-medium text-primary-soft-foreground hover:opacity-80"
                      >
                        {o.animal?.animalId ?? o.animalId ?? `#${o.id}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>
      )}

      {tab === "weight" && (
        <Panel title={t("weight.history", "Weight history")} icon={Scale}>
          {!weights ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : weightRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("weight.none", "No weights recorded yet.")}</p>
          ) : (
            <div className="space-y-4">
              <div className="h-64 rounded-xl bg-surface p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weightRows.slice(-30).map(w => ({
                    date: fmtDate(w.weighDate ?? w.recordedDate ?? w.date),
                    weight: parseFloat(w.weightKg ?? w.weight ?? 0),
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date" stroke="var(--color-muted-foreground)" style={{ fontSize: "12px" }} />
                    <YAxis stroke="var(--color-muted-foreground)" style={{ fontSize: "12px" }} />
                    <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }} />
                    <Line type="monotone" dataKey="weight" stroke="var(--color-primary)" dot={{ fill: "var(--color-primary)", r: 3 }} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 font-medium">{t("weight.date", "Date")}</th>
                    <th className="py-2 font-medium">{t("weight.weight", "Weight (kg)")}</th>
                    <th className="py-2 font-medium">{t("weight.change", "Change (kg)")}</th>
                    <th className="py-2 font-medium">{t("weight.changePercent", "Change (%)")}</th>
                    {canDeleteWeight && <th className="w-px py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {weightRows.slice().reverse().map((w, i) => {
                    const currentWeight = parseFloat(w.weightKg ?? w.weight ?? 0);
                    const prevWeight = i < weightRows.length - 1 ? parseFloat(weightRows[weightRows.length - 2 - i].weightKg ?? weightRows[weightRows.length - 2 - i].weight ?? 0) : null;
                    const weightDiff = prevWeight !== null ? currentWeight - prevWeight : null;
                    const weightPercent = weightDiff !== null && prevWeight !== null && prevWeight > 0 ? (weightDiff / prevWeight) * 100 : null;
                    return (
                      <tr key={w.id ?? i} className="border-b border-border last:border-0">
                        <td className="py-2">{fmtDate(w.weighDate ?? w.recordedDate ?? w.date)}</td>
                        <td className="py-2 font-medium tabular-nums">{currentWeight.toFixed(1)}</td>
                        <td className="py-2 tabular-nums">{weightDiff !== null ? (weightDiff >= 0 ? '+' : '') + weightDiff.toFixed(1) : '—'}</td>
                        <td className="py-2 tabular-nums">
                          <span className={`inline-flex min-w-[4rem] justify-end rounded-md px-2 py-0.5 text-xs font-semibold ${signedPercentPillClass(weightPercent)}`}>
                            {weightPercent !== null ? (weightPercent >= 0 ? '+' : '') + weightPercent.toFixed(1) + '%' : '—'}
                          </span>
                        </td>
                        {canDeleteWeight && (
                          <td className="py-1 text-right">
                            <button
                              onClick={() => setDeleteWeightRow(w)}
                              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger-soft-foreground"
                              aria-label={t("animalProfile.deleteWeightTitle", "Delete weight entry")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === "activity" && (
        <Panel title={t("animalProfile.activity", "Activity")} icon={Activity}>
          <div className="space-y-3">
            {((sales as any[]) ?? []).map((s: any) => (
              <div key={`sale-${s.sale?.id}`} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">{t("sales.recordSale", "Record Sale")} · {fmt(parseFloat(s.sale?.salePrice ?? 0))}</p>
                <p className="text-muted-foreground">
                  {fmtDate(s.sale?.saleDate)} · {s.sale?.buyerName ?? t("sales.noBuyer", "No buyer")}
                  {s.sale?.weightAtSale ? ` · ${parseFloat(s.sale.weightAtSale).toFixed(1)} kg` : ""}
                </p>
              </div>
            ))}
            {((statusHistory as any[]) ?? []).map((h: any) => (
              <div key={`status-${h.id}`} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">{h.fromStatusName ?? h.previousStatusName ?? "--"} {"->"} {h.toStatusName ?? h.newStatusName ?? "--"}</p>
                <p className="text-muted-foreground">{fmtDate(h.changedAt)}</p>
              </div>
            ))}
            {((sales as any[]) ?? []).length === 0 && ((statusHistory as any[]) ?? []).length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("animalProfile.noActivity", "No activity yet.")}</p>
            )}
          </div>
        </Panel>
      )}

      <EditAnimalDialog open={editOpen} onOpenChange={setEditOpen} animalId={animalId} />
      <WeighInSessionDialog open={weighOpen} onOpenChange={setWeighOpen} animals={row ? [row] : []} startAnimalId={animalId} />
      <RecordSaleDialog open={saleOpen} onOpenChange={setSaleOpen} animal={row} pnl={p} />
      <ProfileAddExpense animalId={animalId} code={code} open={expenseOpen} onOpenChange={setExpenseOpen} />
      <ConsequenceConfirm
        open={deleteWeightRow !== null}
        onOpenChange={o => !o && setDeleteWeightRow(null)}
        title={t("animalProfile.deleteWeightTitle", "Delete weight entry")}
        description={t("animalProfile.deleteWeightConfirm", "Delete the {{weight}} kg entry from {{date}}?", {
          weight: deleteWeightRow ? parseFloat(deleteWeightRow.weightKg ?? deleteWeightRow.weight ?? 0).toFixed(1) : "",
          date: deleteWeightRow ? fmtDate(deleteWeightRow.weighDate ?? deleteWeightRow.recordedDate ?? deleteWeightRow.date) : "",
        })}
        consequences={[{ text: t("animalProfile.deleteWeightHint", "Growth history and stage progress are recalculated."), tone: "warning" }]}
        confirmLabel={t("common.delete", "Delete")}
        cancelLabel={t("common.cancel", "Cancel")}
        destructive
        loading={deleteWeight.isPending}
        onConfirm={() => deleteWeightRow && deleteWeight.mutate({ id: deleteWeightRow.id, expectedVersion: deleteWeightRow.version })}
      />
    </div>
  );
}
