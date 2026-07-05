import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useCurrency } from "@/hooks/useCurrency";
import { AnimalIdNumberField } from "@/components/AnimalIdNumberField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, DollarSign, Leaf, Scale, Search, ShoppingCart } from "lucide-react";
import { FormField, FormFooter, FormSection } from "./FormLayout";

type AnimalRow = any;

const today = () => new Date().toISOString().slice(0, 10);
const num = (value: unknown) => {
  const parsed = parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

function invalidateAnimalWorkflows(utils: ReturnType<typeof trpc.useUtils>, animalId?: number) {
  utils.animals.list.invalidate();
  utils.animals.listFattening.invalidate();
  utils.dashboard.getKPIs.invalidate();
  utils.feed.getStockStatus.invalidate();
  utils.sales.list.invalidate();
  utils.animals.getAllPnL.invalidate();
  if (animalId) {
    utils.animals.getById.invalidate({ id: animalId });
    utils.animals.getWeightLog.invalidate({ animalId });
    utils.animals.getPnL.invalidate({ animalId });
    utils.animals.getAnimalSales.invalidate({ animalId });
    utils.animals.getStatusHistory.invalidate({ animalId });
  }
}

export function QuickExpenseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    expenseDate: today(),
    categoryId: "",
    subCategoryId: "",
    amount: "",
    vendorName: "",
    notes: "",
  });

  const { data: categories } = trpc.config.getExpenseCategories.useQuery();
  const { data: subCategories } = trpc.config.getExpenseSubCategories.useQuery(
    { categoryId: Number(form.categoryId) },
    { enabled: !!form.categoryId }
  );

  const reset = () => setForm({ expenseDate: today(), categoryId: "", subCategoryId: "", amount: "", vendorName: "", notes: "" });
  useEffect(() => {
    if (open) reset();
  }, [open]);

  const create = trpc.expenses.create.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      utils.dashboard.getKPIs.invalidate();
      toast.success(t("expenses.created", "Expense added"));
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });

  const submit = (addAnother: boolean) => {
    if (!form.categoryId || !(parseFloat(form.amount) > 0)) {
      toast.error(t("expenses.fillRequired", "Enter a category and amount"));
      return;
    }
    create.mutate(
      {
        expenseDate: form.expenseDate,
        categoryId: Number(form.categoryId),
        subCategoryId: form.subCategoryId ? Number(form.subCategoryId) : undefined,
        amount: form.amount,
        targetType: "general",
        vendorName: form.vendorName || undefined,
        notes: form.notes || undefined,
      } as any,
      {
        onSuccess: () => {
          if (addAnother) {
            reset();
            onOpenChange(true);
          }
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-warning-soft text-warning-soft-foreground">
              <DollarSign className="h-4 w-4" aria-hidden="true" />
            </span>
            {t("expenses.add", "Add Expense")}
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5">
          <FormSection>
            <FormField label={t("expenses.date", "Date")} htmlFor="dash-expense-date" required>
              <Input id="dash-expense-date" name="expenseDate" type="date" value={form.expenseDate} onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} />
            </FormField>
            <FormField label={t("expenses.amount", "Amount")} htmlFor="dash-expense-amount" required>
              <Input id="dash-expense-amount" name="amount" type="number" inputMode="decimal" autoComplete="off" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </FormField>
            <FormField label={t("expenses.category", "Category")} htmlFor="dash-expense-category" required>
              <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v, subCategoryId: "" }))}>
                <SelectTrigger id="dash-expense-category"><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>
                  {((categories as any[]) ?? []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("expenses.subCategory", "Sub-category")} htmlFor="dash-expense-subcategory" hint={!form.categoryId ? t("expenses.pickCategoryFirst", "Pick a category first") : undefined}>
              <Select value={form.subCategoryId} onValueChange={v => setForm(f => ({ ...f, subCategoryId: v }))} disabled={!form.categoryId}>
                <SelectTrigger id="dash-expense-subcategory"><SelectValue placeholder={t("common.optional", "Optional")} /></SelectTrigger>
                <SelectContent>
                  {((subCategories as any[]) ?? []).map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("expenses.vendor", "Vendor")} htmlFor="dash-expense-vendor" full>
              <Input id="dash-expense-vendor" name="vendorName" autoComplete="organization" value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} />
            </FormField>
            <FormField label={t("expenses.notes", "Notes")} htmlFor="dash-expense-notes" full>
              <Textarea id="dash-expense-notes" name="notes" autoComplete="off" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </FormField>
          </FormSection>
          <FormFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel", "Cancel")}</Button>
            <Button type="button" variant="outline" disabled={create.isPending} onClick={() => submit(true)}>{t("common.saveAddAnother", "Save & add another")}</Button>
            <Button type="button" disabled={create.isPending} onClick={() => submit(false)}>{create.isPending ? t("common.saving", "Saving...") : t("common.save", "Save")}</Button>
          </FormFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AnimalCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    speciesId: "",
    categoryId: "",
    groupId: "",
    statusId: "",
    sex: "",
    acquisitionType: "",
    acquisitionDate: today(),
    birthDate: today(),
    purchaseCost: "",
    weightAtAcquisition: "",
    ownerId: "none",
    animalIdNumber: "",
  });

  const { data: species } = trpc.config.getSpecies.useQuery();
  const { data: categories } = trpc.config.getCategories.useQuery(
    { speciesId: form.speciesId ? Number(form.speciesId) : undefined }
  );
  const { data: groups } = trpc.config.getGroups.useQuery(
    { speciesId: form.speciesId ? Number(form.speciesId) : undefined }
  );
  const { data: statuses } = trpc.config.getStatuses.useQuery();
  const { data: owners } = trpc.config.getOwnerOptions.useQuery();
  const selectedCategory = ((categories as any[]) ?? []).find(c => String(c.id) === form.categoryId);
  const create = trpc.animals.create.useMutation({
    onSuccess: () => {
      toast.success(t("animals.registered", "Animal registered"));
      invalidateAnimalWorkflows(utils);
      onOpenChange(false);
      onCreated?.();
      setForm(f => ({
        ...f,
        categoryId: "",
        groupId: "",
        animalIdNumber: "",
        purchaseCost: "",
        weightAtAcquisition: "",
      }));
    },
    onError: e => toast.error(e.message),
  });

  const set = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const submit = (addAnother: boolean) => {
    if (!form.speciesId || !form.categoryId || !form.groupId || !form.statusId || !form.sex || !form.acquisitionType) {
      toast.error(t("common.required", "Fill required fields"));
      return;
    }
    create.mutate(
      {
        speciesId: Number(form.speciesId),
        categoryId: Number(form.categoryId),
        groupId: Number(form.groupId),
        statusId: Number(form.statusId),
        sex: form.sex as "male" | "female",
        acquisitionType: form.acquisitionType as "purchased" | "born",
        acquisitionDate: form.acquisitionDate,
        birthDate: form.birthDate,
        purchaseCost: form.purchaseCost || undefined,
        weightAtAcquisition: form.weightAtAcquisition || undefined,
        ownerId: form.ownerId !== "none" ? Number(form.ownerId) : undefined,
        animalIdNumber: form.animalIdNumber || undefined,
      },
      { onSuccess: () => addAnother && onOpenChange(true) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
              <Leaf className="h-4 w-4" aria-hidden="true" />
            </span>
            {t("animals.registerAnimal", "Register Animal")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 px-6 py-5">
          <FormSection title={t("animals.identity", "Identity")} description={t("animals.identityHint", "Species, category, owner, and generated ID.")}>
            <FormField label={t("common.species", "Species")} htmlFor="new-species" required>
              <Select value={form.speciesId} onValueChange={value => setForm(f => ({ ...f, speciesId: value, categoryId: "", groupId: "", animalIdNumber: "" }))}>
                <SelectTrigger id="new-species"><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>{((species as any[]) ?? []).map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t("animals.category", "Category")} htmlFor="new-category" required>
              <Select value={form.categoryId} onValueChange={value => setForm(f => ({ ...f, categoryId: value, groupId: "", animalIdNumber: "" }))} disabled={!form.speciesId}>
                <SelectTrigger id="new-category"><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>{((categories as any[]) ?? []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.idPrefix})</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t("animals.group", "Group")} htmlFor="new-group" required>
              <Select value={form.groupId} onValueChange={value => set("groupId", value)} disabled={!form.speciesId}>
                <SelectTrigger id="new-group"><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>{((groups as any[]) ?? []).map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t("animals.status", "Status")} htmlFor="new-status" required>
              <Select value={form.statusId} onValueChange={value => set("statusId", value)}>
                <SelectTrigger id="new-status"><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>{((statuses as any[]) ?? []).filter(s => s.isActive).map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <AnimalIdNumberField
              inputId="new-animal-id-number"
              label={t("animals.animalIdNumber", "Animal ID Number (Optional)")}
              hint={t("animals.animalIdNumberHint", "The selected category prefix is added automatically. Leave blank to use the next sequence number.")}
              placeholder={t("animals.animalIdNumberPlaceholder", "Example: 00123")}
              prefix={selectedCategory?.idPrefix ?? ""}
              value={form.animalIdNumber}
              onChange={value => set("animalIdNumber", value)}
              className="sm:col-span-2"
            />
          </FormSection>

          <FormSection title={t("animals.acquisition", "Acquisition")}>
            <FormField label={t("animals.sex", "Sex")} htmlFor="new-sex" required>
              <Select value={form.sex} onValueChange={value => set("sex", value)}>
                <SelectTrigger id="new-sex"><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{t("animals.male", "Male")}</SelectItem>
                  <SelectItem value="female">{t("animals.female", "Female")}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("animals.acquisitionType", "Source")} htmlFor="new-source" required>
              <Select value={form.acquisitionType} onValueChange={value => set("acquisitionType", value)}>
                <SelectTrigger id="new-source"><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchased">{t("animals.purchased", "Purchased")}</SelectItem>
                  <SelectItem value="born">{t("animals.born", "Born")}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("animals.acquisitionDate", "Acquisition Date")} htmlFor="new-acq-date">
              <Input id="new-acq-date" name="acquisitionDate" type="date" value={form.acquisitionDate} onChange={e => set("acquisitionDate", e.target.value)} />
            </FormField>
            <FormField label={t("animals.birthDate", "Birth Date")} htmlFor="new-birth-date">
              <Input id="new-birth-date" name="birthDate" type="date" value={form.birthDate} onChange={e => set("birthDate", e.target.value)} />
            </FormField>
            <FormField label={t("animals.purchaseCost", "Purchase Cost")} htmlFor="new-purchase-cost">
              <Input id="new-purchase-cost" name="purchaseCost" type="number" inputMode="decimal" autoComplete="off" placeholder="0.00" value={form.purchaseCost} onChange={e => set("purchaseCost", e.target.value)} />
            </FormField>
            <FormField label={t("animals.weightAtAcquisition", "Start Weight")} htmlFor="new-start-weight">
              <Input id="new-start-weight" name="weightAtAcquisition" type="number" inputMode="decimal" autoComplete="off" placeholder="0.0" value={form.weightAtAcquisition} onChange={e => set("weightAtAcquisition", e.target.value)} />
            </FormField>
            <FormField label={t("owners.owner", "Owner")} htmlFor="new-owner" full>
              <Select value={form.ownerId} onValueChange={value => set("ownerId", value)}>
                <SelectTrigger id="new-owner"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("owners.none", "No owner")}</SelectItem>
                  {((owners as any[]) ?? []).map(o => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          </FormSection>
        </div>
        <FormFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button type="button" variant="outline" disabled={create.isPending} onClick={() => submit(true)}>{t("common.saveAddAnother", "Save & Add Another")}</Button>
          <Button type="button" disabled={create.isPending} onClick={() => submit(false)}>{create.isPending ? t("common.saving", "Saving...") : t("common.save", "Save")}</Button>
        </FormFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WeighInSessionDialog({
  open,
  onOpenChange,
  animals,
  startAnimalId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animals: AnimalRow[];
  startAnimalId?: number | null;
}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [index, setIndex] = useState(0);
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(today());
  const [animalSearch, setAnimalSearch] = useState("");
  const activeAnimals = useMemo(() => animals.filter(a => a?.animal?.id), [animals]);
  const matchingAnimals = useMemo(() => {
    const q = animalSearch.trim().toLowerCase();
    if (!q) return activeAnimals.slice(0, 8);
    return activeAnimals
      .filter(a =>
        a.animal?.animalId?.toLowerCase().includes(q) ||
        a.categoryName?.toLowerCase().includes(q) ||
        a.groupName?.toLowerCase().includes(q) ||
        a.ownerName?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [activeAnimals, animalSearch]);

  useEffect(() => {
    if (!open) return;
    const startIndex = startAnimalId ? activeAnimals.findIndex(a => a.animal.id === startAnimalId) : 0;
    setIndex(startIndex >= 0 ? startIndex : 0);
    setWeight("");
    setAnimalSearch("");
    setDate(today());
  }, [activeAnimals.length, open, startAnimalId]);

  const current = activeAnimals[index];
  const latest = num(current?.latestWeightKg ?? current?.animal?.weightAtAcquisition);
  const target = num(current?.targetWeightKg);
  const progress = target > 0 ? Math.min(100, Math.round((latest / target) * 100)) : 0;
  const newWeight = num(weight);
  const gain = newWeight > 0 && latest > 0 ? newWeight - latest : 0;
  const addWeight = trpc.animals.addWeight.useMutation({
    onSuccess: (result: any) => {
      if (result?.autoStaged && result?.newAnimalId) {
        toast.success(t("animalProfile.weightAutoStaged", { id: result.newAnimalId }));
      } else {
        toast.success(t("animalProfile.weightRecorded", "Weight recorded"));
      }
      invalidateAnimalWorkflows(utils, current?.animal?.id);
      setWeight("");
      if (index < activeAnimals.length - 1) setIndex(i => i + 1);
      else onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });

  const save = () => {
    if (!current?.animal?.id || !(newWeight > 0)) {
      toast.error(t("weight.required", "Enter weight"));
      return;
    }
    addWeight.mutate({ animalId: current.animal.id, weighDate: date, weightKg: weight });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] max-h-[calc(100dvh-2rem)] overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-info-soft text-info-soft-foreground">
              <Scale className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block">{t("weight.session", "Weigh-in Session")}</span>
              <span className="block text-xs font-normal text-muted-foreground">
                {Math.min(index + 1, activeAnimals.length)} / {activeAnimals.length || 1} {t("weight.recorded", "recorded")}
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        {!current ? (
          <div className="p-6 text-sm text-muted-foreground">{t("animals.none", "No animals yet")}</div>
        ) : (
          <div className="space-y-4 overflow-y-auto px-6 py-5">
            {activeAnimals.length > 1 && (
              <section className="rounded-xl border border-border bg-card p-3">
                <Label htmlFor="weigh-animal-search">{t("animals.selectAnimal", "Select Animal")}</Label>
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="weigh-animal-search"
                    name="animalSearch"
                    autoComplete="off"
                    placeholder={t("animals.searchByIdCategory", "Search by ID, category, group...")}
                    value={animalSearch}
                    onChange={e => setAnimalSearch(e.target.value)}
                    className="ps-9"
                  />
                </div>
                <div className="mt-2 grid max-h-32 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                  {matchingAnimals.map((a, i) => {
                    const realIndex = activeAnimals.findIndex(item => item.animal.id === a.animal.id);
                    const selected = current?.animal?.id === a.animal.id;
                    return (
                      <button
                        key={a.animal.id}
                        type="button"
                        onClick={() => {
                          setIndex(realIndex >= 0 ? realIndex : i);
                          setWeight("");
                        }}
                        className={cn(
                          "flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-start text-sm focus-visible:outline-2 focus-visible:outline-ring",
                          selected ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border hover:bg-surface"
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{a.animal.animalId}</span>
                          <span className="block truncate text-xs opacity-75">{a.categoryName ?? "--"} · {a.groupName ?? "--"}</span>
                        </span>
                        {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            <div className="rounded-xl border border-border bg-card-2 p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-lg bg-surface text-primary" aria-hidden="true">
                  <Leaf className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-xl font-bold tracking-tight">{current.animal.animalId}</h3>
                  <p className="truncate text-sm text-muted-foreground">{current.speciesName} · {current.categoryName} · {current.groupName} · {current.animal.sex}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-card p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("weight.current", "Current")}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{latest ? `${latest.toFixed(1)} kg` : "--"}</p>
                </div>
                <div className="rounded-lg bg-card p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("weight.target", "Target")}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{target ? `${target.toFixed(0)} kg` : "--"}</p>
                  {target > 0 && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div>}
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px]">
                <div>
                  <Label htmlFor="weigh-session-weight">{t("weight.newWeight", "New Weight (kg)")}</Label>
                  <Input
                    id="weigh-session-weight"
                    name="weightKg"
                    type="number"
                    inputMode="decimal"
                    autoComplete="off"
                    className="mt-1 h-16 text-center text-3xl font-bold tabular-nums"
                    value={weight}
                    onChange={e => setWeight(e.target.value)}
                    placeholder="0.0"
                  />
                </div>
                <div>
                  <Label htmlFor="weigh-session-date">{t("common.date", "Date")}</Label>
                  <Input id="weigh-session-date" name="weighDate" type="date" className="mt-1" value={date} onChange={e => setDate(e.target.value)} />
                </div>
              </div>
              {newWeight > 0 && latest > 0 && (
                <div className={cn("mt-3 rounded-lg px-3 py-2 text-sm font-medium", gain >= 0 ? "bg-success-soft text-success-soft-foreground" : "bg-warning-soft text-warning-soft-foreground")}>
                  {gain >= 0 ? "+" : ""}{gain.toFixed(1)} kg {t("weight.sinceLast", "since last")}
                </div>
              )}
              {target > 0 && newWeight >= target && (
                <div className="mt-3 flex gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-soft-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {t("weight.targetReached", "Target reached. Saving may move this animal into its next configured stage.")}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-border bg-card px-6 py-4">
          <Button type="button" variant="outline" disabled={index === 0 || addWeight.isPending} onClick={() => { setIndex(i => Math.max(0, i - 1)); setWeight(""); }}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("common.back", "Back")}
          </Button>
          <Button type="button" variant="outline" disabled={index >= activeAnimals.length - 1 || addWeight.isPending} onClick={() => { setIndex(i => Math.min(activeAnimals.length - 1, i + 1)); setWeight(""); }}>
            {t("common.skip", "Skip")}
          </Button>
          <Button type="button" disabled={addWeight.isPending || !current || !(newWeight > 0)} onClick={save}>
            {index >= activeAnimals.length - 1 ? t("common.finish", "Finish") : t("weight.nextAnimal", "Next Animal")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecordSaleDialog({
  open,
  onOpenChange,
  animal,
  pnl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animal: AnimalRow | null;
  pnl?: any;
}) {
  const { t } = useTranslation();
  const { fmt } = useCurrency();
  const utils = trpc.useUtils();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [form, setForm] = useState({
    saleDate: today(),
    salePrice: "",
    amountPaid: "",
    statusId: "",
    weightAtSale: "",
    buyerName: "",
    notes: "",
  });
  const { data: statuses } = trpc.config.getStatuses.useQuery();
  const exitStatuses = useMemo(() => ((statuses as any[]) ?? []).filter(s => s.isExitStatus), [statuses]);
  const row = animal?.animal ? animal : animal ? { animal } : null;
  const code = row?.animal?.animalId ?? "--";
  const animalId = row?.animal?.id;
  const salePrice = num(form.salePrice);
  const amountPaid = form.amountPaid === "" ? salePrice : num(form.amountPaid);
  const outstanding = Math.max(0, salePrice - amountPaid);
  const totalCost = num(pnl?.totalCost ?? row?.totalCost);
  const realized = salePrice - totalCost;
  const loss = realized < 0;

  useEffect(() => {
    if (!open) return;
    setConfirmOpen(false);
    setTyped("");
    const soldStatus = exitStatuses.find(s => String(s.name ?? "").toLowerCase().includes("sold")) ?? exitStatuses[0];
    setForm({
      saleDate: today(),
      salePrice: "",
      amountPaid: "",
      statusId: soldStatus ? String(soldStatus.id) : "",
      weightAtSale: row?.latestWeightKg ? String(row.latestWeightKg) : "",
      buyerName: "",
      notes: "",
    });
  }, [exitStatuses, open, row?.latestWeightKg]);

  const exitAnimal = trpc.animals.exit.useMutation({
    onSuccess: () => {
      toast.success(t("sales.recorded", "Sale recorded"));
      invalidateAnimalWorkflows(utils, animalId);
      setConfirmOpen(false);
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });

  const review = () => {
    if (!animalId || !form.salePrice || !form.statusId) {
      toast.error(t("common.required", "Fill required fields"));
      return;
    }
    if (amountPaid > salePrice) {
      toast.error(t("sales.paymentExceedsOutstanding", "Payment cannot exceed sale price"));
      return;
    }
    setConfirmOpen(true);
  };
  const submit = () => {
    if (!animalId) return;
    exitAnimal.mutate({
      id: animalId,
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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-danger-soft text-danger-soft-foreground">
                <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block">{t("sales.recordSale", "Record Sale")}</span>
                <span className="block text-xs font-normal text-muted-foreground">{code} · {row?.speciesName ?? ""} · {row?.categoryName ?? ""}</span>
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-6 py-5">
            <FormSection>
              <FormField label={t("pnl.weightAtSale", "Sale Weight (kg)")} htmlFor="sale-weight">
                <Input id="sale-weight" name="weightAtSale" type="number" inputMode="decimal" autoComplete="off" value={form.weightAtSale} onChange={e => setForm(f => ({ ...f, weightAtSale: e.target.value }))} placeholder="0.0" />
              </FormField>
              <FormField label={t("pnl.salePrice", "Total Price")} htmlFor="sale-price" required>
                <Input id="sale-price" name="salePrice" type="number" inputMode="decimal" autoComplete="off" value={form.salePrice} onChange={e => setForm(f => ({ ...f, salePrice: e.target.value }))} placeholder="0.00" />
              </FormField>
              <FormField label={t("sales.paid", "Paid")} htmlFor="sale-paid">
                <Input id="sale-paid" name="amountPaid" type="number" inputMode="decimal" autoComplete="off" value={form.amountPaid} onChange={e => setForm(f => ({ ...f, amountPaid: e.target.value }))} placeholder={form.salePrice || "0.00"} />
              </FormField>
              <FormField label={t("common.status", "Status")} htmlFor="sale-status" required>
                <Select value={form.statusId} onValueChange={value => setForm(f => ({ ...f, statusId: value }))}>
                  <SelectTrigger id="sale-status"><SelectValue placeholder={t("animals.selectExitStatus", "Select exit status")} /></SelectTrigger>
                  <SelectContent>{exitStatuses.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </FormField>
              <FormField label={t("common.buyer", "Buyer")} htmlFor="sale-buyer" full>
                <Input id="sale-buyer" name="buyerName" autoComplete="off" value={form.buyerName} onChange={e => setForm(f => ({ ...f, buyerName: e.target.value }))} placeholder={t("sales.buyerPlaceholder", "Buyer name...")} />
              </FormField>
              <FormField label={t("common.notes", "Notes")} htmlFor="sale-notes" full>
                <Textarea id="sale-notes" name="notes" autoComplete="off" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </FormField>
            </FormSection>

            <div className="rounded-xl border border-border bg-card-2 p-4">
              <div className="mb-3 flex items-center gap-2 font-semibold">
                <DollarSign className="h-4 w-4 text-info" aria-hidden="true" />
                {t("sales.saleImpact", "Sale Impact")}
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div><p className="text-muted-foreground">{t("pnl.saleRevenue", "Revenue")}</p><p className="font-semibold tabular-nums">{fmt(salePrice)}</p></div>
                <div><p className="text-muted-foreground">{t("sales.outstanding", "Outstanding")}</p><p className="font-semibold tabular-nums">{fmt(outstanding)}</p></div>
                <div><p className="text-muted-foreground">{t("pnl.netPnL", "Net P&L")}</p><p className={cn("font-semibold tabular-nums", realized < 0 ? "text-danger-soft-foreground" : "text-success-soft-foreground")}>{totalCost ? fmt(realized) : "--"}</p></div>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-border bg-card px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel", "Cancel")}</Button>
            <Button type="button" onClick={review} disabled={!animalId || !form.salePrice || !form.statusId}>{t("sales.reviewConfirm", "Review & Confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-danger-soft text-danger-soft-foreground">
                <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              </span>
              {t("sales.confirmSaleOf", "Confirm Sale Of")} {code}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("sales.finalExitWarning", "This final action removes the animal from active inventory and closes its P&L.")}
            </p>
            <div className="overflow-hidden rounded-xl border border-border">
              {[
                t("sales.consequenceExit", "{{code}} leaves active inventory", { code }),
                totalCost ? `${loss ? t("sales.realizedLoss", "Realized loss") : t("sales.realizedProfit", "Realized profit")}: ${fmt(realized)}` : t("sales.pnlCloses", "Animal P&L closes"),
                outstanding > 0 ? `${t("sales.receivableCreated", "Receivable created")}: ${fmt(outstanding)}` : t("sales.markedPaid", "Sale marked paid"),
                t("sales.removedSchedules", "Removed from feed and weigh schedules"),
              ].map((text, idx) => (
                <div key={idx} className="flex gap-3 border-b border-border px-3 py-3 text-sm last:border-0">
                  <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", idx === 1 && loss ? "text-danger" : "text-info")} aria-hidden="true" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
            {loss && (
              <div>
                <Label htmlFor="sale-confirm-text">{t("sales.typeSell", "Selling at a loss - type SELL to confirm")}</Label>
                <Input id="sale-confirm-text" name="confirmSell" autoComplete="off" spellCheck={false} className="mt-1 font-mono" value={typed} onChange={e => setTyped(e.target.value.toUpperCase())} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>{t("common.back", "Back")}</Button>
            <Button type="button" variant="destructive" disabled={exitAnimal.isPending || (loss && typed !== "SELL")} onClick={submit}>
              {exitAnimal.isPending ? t("common.saving", "Saving...") : t("sales.confirmSale", "Confirm Sale")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BulkRecordSaleDialog({
  open,
  onOpenChange,
  animals,
  initialSelectedIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animals: AnimalRow[];
  initialSelectedIds?: number[];
}) {
  const { t } = useTranslation();
  const { fmt } = useCurrency();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form, setForm] = useState({
    saleDate: today(),
    statusId: "",
    buyerName: "",
    notes: "",
  });
  const [perAnimal, setPerAnimal] = useState<Record<number, { salePrice: string; amountPaid: string; weightAtSale: string }>>({});
  const { data: statuses } = trpc.config.getStatuses.useQuery();
  const exitStatuses = useMemo(() => ((statuses as any[]) ?? []).filter(s => s.isExitStatus), [statuses]);
  const activeAnimals = useMemo(() => animals.filter(a => a?.animal?.id), [animals]);
  const initialSelectedKey = (initialSelectedIds ?? []).join(",");

  useEffect(() => {
    if (!open) return;
    const soldStatus = exitStatuses.find(s => String(s.name ?? "").toLowerCase().includes("sold")) ?? exitStatuses[0];
    setForm({ saleDate: today(), statusId: soldStatus ? String(soldStatus.id) : "", buyerName: "", notes: "" });
    setSearch("");
    const activeIds = new Set(activeAnimals.map(a => Number(a.animal.id)));
    setSelectedIds(new Set((initialSelectedIds ?? []).filter(id => activeIds.has(Number(id))).map(Number)));
    setPerAnimal({});
    setConfirmOpen(false);
  }, [exitStatuses, initialSelectedKey, open]);

  const visibleAnimals = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeAnimals.slice(0, 8);
    return activeAnimals
      .filter(a =>
        a.animal?.animalId?.toLowerCase().includes(q) ||
        a.categoryName?.toLowerCase().includes(q) ||
        a.groupName?.toLowerCase().includes(q) ||
        a.ownerName?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [activeAnimals, search]);

  const selectedAnimals = useMemo(
    () => activeAnimals.filter(a => selectedIds.has(a.animal.id)),
    [activeAnimals, selectedIds]
  );
  const totals = useMemo(() => {
    return selectedAnimals.reduce(
      (acc, a) => {
        const row = perAnimal[a.animal.id] ?? { salePrice: "", amountPaid: "", weightAtSale: "" };
        const price = num(row.salePrice);
        const paid = row.amountPaid === "" ? price : num(row.amountPaid);
        acc.price += price;
        acc.paid += paid;
        return acc;
      },
      { price: 0, paid: 0 }
    );
  }, [perAnimal, selectedAnimals]);
  const outstanding = Math.max(0, totals.price - totals.paid);

  const toggle = (animal: AnimalRow) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const id = animal.animal.id;
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPerAnimal(prev => ({
      ...prev,
      [animal.animal.id]: prev[animal.animal.id] ?? {
        salePrice: "",
        amountPaid: "",
        weightAtSale: animal.latestWeightKg ? String(animal.latestWeightKg) : "",
      },
    }));
  };

  const setRow = (id: number, patch: Partial<{ salePrice: string; amountPaid: string; weightAtSale: string }>) => {
    setPerAnimal(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? { salePrice: "", amountPaid: "", weightAtSale: "" }), ...patch },
    }));
  };

  const bulkExit = trpc.animals.bulkExit.useMutation({
    onSuccess: () => {
      toast.success(t("sales.recorded", "Sale recorded"));
      invalidateAnimalWorkflows(utils);
      setConfirmOpen(false);
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });

  const review = () => {
    if (selectedAnimals.length === 0) {
      toast.error(t("sales.selectAtLeastOne", "Select at least one animal"));
      return;
    }
    if (!form.statusId || !form.saleDate) {
      toast.error(t("common.required", "Fill required fields"));
      return;
    }
    setConfirmOpen(true);
  };

  const submit = () => {
    bulkExit.mutate({
      exitDate: form.saleDate,
      exitReason: "sold",
      newStatusId: Number(form.statusId),
      buyerName: form.buyerName || undefined,
      saleNotes: form.notes || undefined,
      animals: selectedAnimals.map(a => {
        const row = perAnimal[a.animal.id] ?? { salePrice: "", amountPaid: "", weightAtSale: "" };
        return {
          id: a.animal.id,
          salePrice: row.salePrice || undefined,
          amountPaid: row.amountPaid || undefined,
          weightAtSale: row.weightAtSale || undefined,
        };
      }),
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] max-h-[calc(100dvh-2rem)] overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-danger-soft text-danger-soft-foreground">
                <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block">{t("sales.recordSale", "Record Sale")}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {selectedAnimals.length} {t("animals.selected", "selected")}
                </span>
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto px-6 py-5">
            <section className="rounded-xl border border-border bg-card p-3">
              <Label htmlFor="sale-animal-search">{t("animals.selectAnimal", "Select Animal")}</Label>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="sale-animal-search"
                  name="saleAnimalSearch"
                  autoComplete="off"
                  placeholder={t("animals.searchByIdCategory", "Search by ID, category, group...")}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="ps-9"
                />
              </div>
              <div className="mt-2 grid max-h-32 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                {visibleAnimals.map(animal => {
                  const selected = selectedIds.has(animal.animal.id);
                  return (
                    <button
                      key={animal.animal.id}
                      type="button"
                      onClick={() => toggle(animal)}
                      className={cn(
                        "flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-start text-sm focus-visible:outline-2 focus-visible:outline-ring",
                        selected ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border hover:bg-surface"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{animal.animal.animalId}</span>
                        <span className="block truncate text-xs opacity-75">{animal.categoryName ?? "--"} · {animal.groupName ?? "--"}</span>
                      </span>
                      {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card-2 p-4 shadow-[var(--shadow-sm)]">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t("common.date", "Date")} htmlFor="bulk-sale-date" required>
                  <Input id="bulk-sale-date" name="saleDate" type="date" value={form.saleDate} onChange={e => setForm(f => ({ ...f, saleDate: e.target.value }))} />
                </FormField>
                <FormField label={t("common.status", "Status")} htmlFor="bulk-sale-status" required>
                  <Select value={form.statusId} onValueChange={value => setForm(f => ({ ...f, statusId: value }))}>
                    <SelectTrigger id="bulk-sale-status"><SelectValue placeholder={t("animals.selectExitStatus", "Select exit status")} /></SelectTrigger>
                    <SelectContent>{exitStatuses.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </FormField>
                <FormField label={t("common.buyer", "Buyer")} htmlFor="bulk-sale-buyer" full>
                  <Input id="bulk-sale-buyer" name="buyerName" autoComplete="off" value={form.buyerName} onChange={e => setForm(f => ({ ...f, buyerName: e.target.value }))} placeholder={t("sales.buyerPlaceholder", "Buyer name…")} />
                </FormField>
                <FormField label={t("common.notes", "Notes")} htmlFor="bulk-sale-notes" full>
                  <Textarea id="bulk-sale-notes" name="saleNotes" autoComplete="off" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </FormField>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr] gap-2 border-b border-border bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>{t("animals.animalId", "Animal")}</span>
                  <span>{t("pnl.weightAtSale", "Weight")}</span>
                  <span>{t("sales.salePrice", "Price")}</span>
                  <span>{t("sales.amountPaid", "Paid")}</span>
                </div>
                {selectedAnimals.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t("sales.selectAnimalsToSell", "Select animals to sell")}</p>
                ) : (
                  <div className="max-h-64 divide-y divide-border overflow-y-auto">
                    {selectedAnimals.map(animal => {
                      const row = perAnimal[animal.animal.id] ?? { salePrice: "", amountPaid: "", weightAtSale: "" };
                      return (
                        <div key={animal.animal.id} className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr] gap-2 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{animal.animal.animalId}</p>
                            <p className="truncate text-xs text-muted-foreground">{animal.categoryName ?? "--"}</p>
                          </div>
                          <Input aria-label={`${animal.animal.animalId} weight`} type="number" inputMode="decimal" autoComplete="off" value={row.weightAtSale} onChange={e => setRow(animal.animal.id, { weightAtSale: e.target.value })} placeholder="0.0" />
                          <Input aria-label={`${animal.animal.animalId} price`} type="number" inputMode="decimal" autoComplete="off" value={row.salePrice} onChange={e => setRow(animal.animal.id, { salePrice: e.target.value })} placeholder="0.00" />
                          <Input aria-label={`${animal.animal.animalId} paid`} type="number" inputMode="decimal" autoComplete="off" value={row.amountPaid} onChange={e => setRow(animal.animal.id, { amountPaid: e.target.value })} placeholder={row.salePrice || "0.00"} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-3 rounded-xl border border-border bg-card-2 p-3 text-sm sm:grid-cols-3">
                <div><p className="text-muted-foreground">{t("sales.totalPrice", "Total Price")}</p><p className="font-semibold tabular-nums">{fmt(totals.price)}</p></div>
                <div><p className="text-muted-foreground">{t("sales.totalPaid", "Total Paid")}</p><p className="font-semibold tabular-nums">{fmt(totals.paid)}</p></div>
                <div><p className="text-muted-foreground">{t("sales.outstanding", "Outstanding")}</p><p className="font-semibold tabular-nums">{fmt(outstanding)}</p></div>
              </div>
            </section>
          </div>

          <DialogFooter className="border-t border-border bg-card px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel", "Cancel")}</Button>
            <Button type="button" onClick={review} disabled={selectedAnimals.length === 0}>{t("sales.reviewConfirm", "Review & Confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("sales.confirmBulkSale", "Confirm Sale")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("sales.bulkExitWarning", "This removes selected animals from active inventory, records sale payments, and closes their active P&L.")}
            </p>
            <div className="rounded-xl border border-border bg-card-2 p-3 text-sm">
              <p>{selectedAnimals.length} {t("animals.selected", "selected")}</p>
              <p>{t("sales.totalPrice", "Total Price")}: <strong>{fmt(totals.price)}</strong></p>
              <p>{t("sales.outstanding", "Outstanding")}: <strong>{fmt(outstanding)}</strong></p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>{t("common.back", "Back")}</Button>
            <Button type="button" variant="destructive" disabled={bulkExit.isPending} onClick={submit}>
              {bulkExit.isPending ? t("common.saving", "Saving…") : t("sales.confirmSale", "Confirm Sale")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
