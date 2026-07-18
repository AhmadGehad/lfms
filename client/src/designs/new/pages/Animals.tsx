import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EditAnimalDialog } from "@/components/EditAnimalDialog";
import { DollarSign, Leaf, Pencil, Plus, Scale, Search, ShoppingCart, Syringe, Trash2 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { StatusBadge, type StatusTone } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { ConsequenceConfirm } from "../components/ConsequenceConfirm";
import { AnimalCreateDialog, BulkRecordSaleDialog, RecordSaleDialog, WeighInSessionDialog } from "../components/AnimalWorkflows";
import { weightProgressPillClass, weightProgressTone, weightTargetPercent } from "../lib/weightProgress";

function AnimalPhotoCell({ animalId, photoKey, alt }: { animalId?: number; photoKey?: string | null; alt?: string }) {
  const { data } = trpc.animals.getPhotoUrl.useQuery(
    { id: animalId ?? 0 },
    { enabled: !!photoKey && !!animalId, staleTime: 5 * 60_000 },
  );
  return (
    <div className="h-10 w-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
      {data?.url ? (
        <img src={data.url} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">—</div>
      )}
    </div>
  );
}

function statusTone(name?: string): StatusTone {
  const l = (name ?? "").toLowerCase();
  if (l.includes("active") || l.includes("نشط")) return "success";
  if (l.includes("sold") || l.includes("بيع")) return "info";
  if (l.includes("dead") || l.includes("mort") || l.includes("نفوق")) return "danger";
  if (l.includes("transport") || l.includes("نقل")) return "warning";
  return "neutral";
}

function fmtDate(d: unknown) {
  if (!d) return "—";
  const date = new Date(d as string);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function dueLabel(date: unknown, name?: string | null) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(date as string);
  due.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  const cls = diff < 0 ? "text-danger-soft-foreground" : diff <= 7 ? "text-warning-soft-foreground" : "text-muted-foreground";
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Syringe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      {name && <span className="truncate text-muted-foreground">{name}</span>}
      <span className={cls}>{fmtDate(date)}</span>
    </span>
  );
}

function formatAge(birthDate: unknown, daysSuffix: string, monthsSuffix: string, yearsSuffix: string): string {
  if (!birthDate) return "—";
  const birth = new Date(birthDate as string);
  if (Number.isNaN(birth.getTime())) return "—";
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return "—";
  if (months === 0) {
    const days = Math.max(0, Math.floor((now.getTime() - birth.getTime()) / 86400000));
    return `${days}${daysSuffix}`;
  }
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem}${monthsSuffix}`;
  return rem === 0
    ? `${years}${yearsSuffix}`
    : `${years}${yearsSuffix} ${rem}${monthsSuffix}`;
}

function daysOnFarm(row: any) {
  const start = new Date(row.animal?.acquisitionDate);
  if (Number.isNaN(start.getTime())) return null;
  const end = row.animal?.exitDate ? new Date(row.animal.exitDate) : new Date();
  if (Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function money(value: unknown) {
  const amount = parseFloat(String(value ?? ""));
  return Number.isFinite(amount) && amount > 0
    ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";
}

type AnimalView = "all" | "active" | "fattening" | "ready" | "females" | "sold";

function matchesAnimalSearch(row: any, query: string) {
  if (!query) return true;
  return (
    row.animal?.animalId?.toLowerCase().includes(query) ||
    row.categoryName?.toLowerCase().includes(query) ||
    row.speciesName?.toLowerCase().includes(query) ||
    row.groupName?.toLowerCase().includes(query) ||
    row.ownerName?.toLowerCase().includes(query)
  );
}

function matchesAnimalView(row: any, view: AnimalView) {
  const status = String(row.statusName ?? "").toLowerCase();
  const category = String(row.categoryName ?? "").toLowerCase();
  const isSold = row.isExitStatus || status.includes("sold") || row.animal?.isActive === false;
  if (view === "all") return true;
  if (view === "sold") return isSold;
  if (row.animal?.isActive === false) return false;
  if (view === "active") return true;
  if (view === "fattening") return category.includes("fatten") || status.includes("fatten");
  if (view === "ready") {
    const target = parseFloat(row.targetWeightKg ?? 0);
    const latest = parseFloat(row.latestWeightKg ?? row.animal?.weightAtAcquisition ?? 0);
    const threshold = parseFloat(row.categoryReadyToSellThreshold ?? "80") / 100;
    return target > 0 && latest >= target * threshold;
  }
  if (view === "females") return row.animal?.sex === "female";
  return false;
}

function BulkVaccinationDialog({
  open,
  onOpenChange,
  selectedAnimals,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAnimals: any[];
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [vaccineId, setVaccineId] = useState("");
  const [vaccinationDate, setVaccinationDate] = useState(new Date().toISOString().slice(0, 10));
  const [batchNumber, setBatchNumber] = useState("");
  const [veterinarian, setVeterinarian] = useState("");
  const [notes, setNotes] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const { data: vaccines } = trpc.config.getVaccines.useQuery();

  useEffect(() => {
    if (!open) return;
    setVaccineId("");
    setVaccinationDate(new Date().toISOString().slice(0, 10));
    setBatchNumber("");
    setVeterinarian("");
    setNotes("");
  }, [open]);

  const bulkApply = trpc.vaccination.bulkApplyToAnimals.useMutation({
    onSuccess: () => {
      toast.success(t("vaccine.bulkVaccinationApplied", "Bulk vaccination applied"));
      utils.vaccination.getVaccinationRecords.invalidate();
      utils.animals.list.invalidate();
      setIdempotencyKey(crypto.randomUUID());
      onOpenChange(false);
      onSuccess();
    },
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    if (!vaccineId || !vaccinationDate || selectedAnimals.length === 0) {
      toast.error(t("common.required", "Fill required fields"));
      return;
    }
    bulkApply.mutate({
      animalIds: selectedAnimals.map(a => a.animal.id),
      vaccineId: Number(vaccineId),
      vaccinationDate,
      batchNumber: batchNumber || undefined,
      veterinarian: veterinarian || undefined,
      notes: notes || undefined,
      idempotencyKey,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-info-soft text-info-soft-foreground">
              <Syringe className="h-4 w-4" aria-hidden="true" />
            </span>
            {t("vaccine.bulkApply", "Bulk Apply")} ({selectedAnimals.length})
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bulk-vaccine">{t("vaccine.selectVaccine", "Select Vaccine")} *</Label>
            <Select value={vaccineId} onValueChange={setVaccineId}>
              <SelectTrigger id="bulk-vaccine"><SelectValue placeholder={t("vaccine.selectVaccine", "Select Vaccine")} /></SelectTrigger>
              <SelectContent>{((vaccines as any[]) ?? []).map(v => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-vaccine-date">{t("vaccine.vaccinationDate", "Vaccination Date")} *</Label>
            <Input id="bulk-vaccine-date" name="vaccinationDate" type="date" value={vaccinationDate} onChange={e => setVaccinationDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-vaccine-batch">{t("vaccine.batchNumber", "Batch Number")}</Label>
            <Input id="bulk-vaccine-batch" name="batchNumber" autoComplete="off" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} placeholder="BATCH-001" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-vaccine-vet">{t("vaccine.veterinarian", "Veterinarian")}</Label>
            <Input id="bulk-vaccine-vet" name="veterinarian" autoComplete="off" value={veterinarian} onChange={e => setVeterinarian(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-vaccine-notes">{t("common.notes", "Notes")}</Label>
            <Input id="bulk-vaccine-notes" name="notes" autoComplete="off" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="border-t border-border bg-card px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button type="button" disabled={bulkApply.isPending} onClick={submit}>
            {bulkApply.isPending ? t("common.saving", "Saving…") : t("common.apply", "Apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkEditDialog({
  open,
  onOpenChange,
  selectedAnimals,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAnimals: any[];
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const KEEP = "__keep";
  const CLEAR = "__clear";
  const [groupId, setGroupId] = useState(KEEP);
  const [statusId, setStatusId] = useState(KEEP);
  const [ownerId, setOwnerId] = useState(KEEP);
  const [sex, setSex] = useState(KEEP);
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [notes, setNotes] = useState("");
  const [setNotesEnabled, setSetNotesEnabled] = useState(false);
  const [exitDate, setExitDate] = useState("");
  const [exitReason, setExitReason] = useState("");
  const [isActiveChoice, setIsActiveChoice] = useState(KEEP);

  const speciesIds = Array.from(new Set(selectedAnimals.map(a => a.animal?.speciesId).filter(Boolean)));
  const speciesId = speciesIds.length === 1 ? Number(speciesIds[0]) : undefined;
  const { data: groups } = trpc.config.getGroups.useQuery(speciesId ? { speciesId } : undefined);
  const { data: statuses } = trpc.config.getStatuses.useQuery();
  const { data: owners } = trpc.config.getOwnerOptions.useQuery();

  useEffect(() => {
    if (!open) return;
    setGroupId(KEEP); setStatusId(KEEP); setOwnerId(KEEP); setSex(KEEP);
    setAcquisitionDate(""); setNotes(""); setSetNotesEnabled(false);
    setExitDate(""); setExitReason(""); setIsActiveChoice(KEEP);
  }, [open]);

  const fieldsChanged =
    (groupId !== KEEP ? 1 : 0) +
    (statusId !== KEEP ? 1 : 0) +
    (ownerId !== KEEP ? 1 : 0) +
    (sex !== KEEP ? 1 : 0) +
    (acquisitionDate ? 1 : 0) +
    (setNotesEnabled ? 1 : 0) +
    (exitDate ? 1 : 0) +
    (exitReason ? 1 : 0) +
    (isActiveChoice !== KEEP ? 1 : 0);

  const bulkUpdate = trpc.animals.bulkUpdate.useMutation({
    onSuccess: (r: any) => {
      toast.success(`${r.count} ${t("animals.title", "animals")} ${t("common.updated", "updated")}`);
      utils.animals.list.invalidate();
      utils.dashboard.getKPIs.invalidate();
      onOpenChange(false);
      onSuccess();
    },
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    if (fieldsChanged === 0) {
      toast.error(t("animals.bulkEditNoFields", "Choose at least one field to update"));
      return;
    }
    bulkUpdate.mutate({
      animals: selectedAnimals.map(a => ({ id: a.animal.id, expectedVersion: a.animal.version })),
      groupId: groupId === KEEP ? undefined : groupId === CLEAR ? null : Number(groupId),
      statusId: statusId === KEEP ? undefined : Number(statusId),
      ownerId: ownerId === KEEP ? undefined : ownerId === CLEAR ? null : Number(ownerId),
      sex: sex === KEEP ? undefined : sex as "male" | "female",
      acquisitionDate: acquisitionDate || undefined,
      notes: setNotesEnabled ? (notes || null) : undefined,
      exitDate: exitDate || undefined,
      exitReason: exitReason || undefined,
      isActive: isActiveChoice === KEEP ? undefined : isActiveChoice === "true",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{t("animals.bulkEdit", "Bulk Edit")} ({selectedAnimals.length})</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-group">{t("common.group", "Group")}</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger id="bulk-group"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>{t("animals.bulkEditKeep", "Keep")}</SelectItem>
                <SelectItem value={CLEAR}>{t("animals.bulkEditClear", "Clear")}</SelectItem>
                {((groups as any[]) ?? []).map(g => <SelectItem key={g.id} value={String(g.id)}>{g.groupCode ?? g.name} - {g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-status">{t("common.status", "Status")}</Label>
            <Select value={statusId} onValueChange={setStatusId}>
              <SelectTrigger id="bulk-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>{t("animals.bulkEditKeep", "Keep")}</SelectItem>
                {((statuses as any[]) ?? []).map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-owner">{t("owners.owner", "Owner")}</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger id="bulk-owner"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>{t("animals.bulkEditKeep", "Keep")}</SelectItem>
                <SelectItem value={CLEAR}>{t("animals.bulkEditClear", "Clear")}</SelectItem>
                {((owners as any[]) ?? []).map(o => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-sex">{t("common.sex", "Sex")}</Label>
            <Select value={sex} onValueChange={setSex}>
              <SelectTrigger id="bulk-sex"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>{t("animals.bulkEditKeep", "Keep")}</SelectItem>
                <SelectItem value="male">{t("common.male", "Male")}</SelectItem>
                <SelectItem value="female">{t("common.female", "Female")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-acq-date">{t("animals.acquisitionDate", "Acquisition Date")}</Label>
            <Input id="bulk-acq-date" name="acquisitionDate" type="date" value={acquisitionDate} onChange={e => setAcquisitionDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-active">{t("animals.active", "Active")}</Label>
            <Select value={isActiveChoice} onValueChange={setIsActiveChoice}>
              <SelectTrigger id="bulk-active"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>{t("animals.bulkEditKeep", "Keep")}</SelectItem>
                <SelectItem value="true">{t("animals.active", "Active")}</SelectItem>
                <SelectItem value="false">{t("animals.inactive", "Inactive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-exit-date">{t("animals.exitDate", "Exit Date")}</Label>
            <Input id="bulk-exit-date" name="exitDate" type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-exit-reason">{t("animals.exitReason", "Exit Reason")}</Label>
            <Input id="bulk-exit-reason" name="exitReason" autoComplete="off" value={exitReason} onChange={e => setExitReason(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" checked={setNotesEnabled} onChange={e => setSetNotesEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            <span className="text-sm font-medium">{t("animals.bulkEditSetNotes", "Set notes")}</span>
          </label>
          {setNotesEnabled && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bulk-notes">{t("common.notes", "Notes")}</Label>
              <Input id="bulk-notes" name="notes" autoComplete="off" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter className="border-t border-border bg-card px-6 py-4">
          <span className="me-auto text-sm text-muted-foreground">
            {fieldsChanged === 0 ? t("animals.bulkEditNoFields", "No fields selected") : `${fieldsChanged} ${t("animals.bulkEditFieldsCount", "fields")}`}
          </span>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button type="button" disabled={bulkUpdate.isPending || fieldsChanged === 0} onClick={submit}>
            {bulkUpdate.isPending ? t("common.saving", "Saving…") : t("animals.bulkEdit", "Bulk Edit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * New Animals list on the shared DataTable (F-TBL5/DENSITY/MOBILE1). Replaces the
 * dense unpaginated table with pagination, sortable columns, density, mobile
 * cards, multi-select, row→profile, and per-row quick actions. Same data and
 * permissions as Old; Fattening folds in here as a saved view.
 */
export default function NewAnimals() {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const searchStr = useSearch();
  const { ownerParam } = useOwnerFilter();
  const perms = usePermissions();
  const canEdit = perms.can("animals", "update");
  const canCreate = perms.can("animals", "create");
  const canDelete = perms.can("animals", "delete");
  const canSell = perms.can("sales", "create");
  const canWeigh = perms.can("fattening", "create");
  const canVaccinate = perms.can("vaccinations", "create");
  const utils = trpc.useUtils();

  const query = useMemo(() => new URLSearchParams(searchStr), [searchStr]);
  const [search, setSearch] = useState("");
  const [filterSpecies, setFilterSpecies] = useState(() => query.get("species") || "all");
  const [filterStatus, setFilterStatus] = useState(() => query.get("status") || "all");
  const [filterAcquisitionType, setFilterAcquisitionType] = useState(() => query.get("source") || "all");
  
  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    if (filterSpecies !== "all") params.set("species", filterSpecies);
    else params.delete("species");
    if (filterStatus !== "all") params.set("status", filterStatus);
    else params.delete("status");
    if (filterAcquisitionType !== "all") params.set("source", filterAcquisitionType);
    else params.delete("source");
    const qs = params.toString();
    setLocation(`${location.split("?")[0]}${qs ? `?${qs}` : ""}`);
  }, [filterSpecies, filterStatus, filterAcquisitionType]);
  const [deleteRow, setDeleteRow] = useState<any | null>(null);
  const [view, setView] = useState<AnimalView>("active");
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());
  const [editId, setEditId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [weighOpen, setWeighOpen] = useState(false);
  const [weighAnimals, setWeighAnimals] = useState<any[] | null>(null);
  const [saleAnimal, setSaleAnimal] = useState<any | null>(null);
  const [bulkSaleOpen, setBulkSaleOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkVaccinationOpen, setBulkVaccinationOpen] = useState(false);
  const [weighStartId, setWeighStartId] = useState<number | null>(null);

  const { data: animals, isLoading } = trpc.animals.list.useQuery({
    speciesId: filterSpecies !== "all" ? Number(filterSpecies) : undefined,
    statusId: filterStatus !== "all" ? Number(filterStatus) : undefined,
    acquisitionType: filterAcquisitionType !== "all" ? (filterAcquisitionType as any) : undefined,
    ownerId: ownerParam,
  });
  const { data: species } = trpc.config.getSpecies.useQuery();
  const { data: statuses } = trpc.config.getStatuses.useQuery();

  const deleteAnimal = trpc.recycleBin.deleteAnimal.useMutation({
    onSuccess: () => {
      toast.success(t("animals.movedToBin", "Animal moved to Recycle Bin"));
      utils.animals.list.invalidate();
      utils.dashboard.getKPIs.invalidate();
      utils.feed.getStockStatus.invalidate();
      utils.animals.getAllPnL.invalidate();
      setDeleteRow(null);
    },
    onError: e => toast.error(e.message),
  });
  const rowsBase = (animals as any[]) ?? [];

  useEffect(() => {
    const qView = query.get("view");
    if (qView === "all" || qView === "active" || qView === "fattening" || qView === "ready" || qView === "females" || qView === "sold") {
      setView(qView);
    }
    if (query.get("new") === "1" && canCreate) setCreateOpen(true);
    if (query.get("weigh") === "1") {
      const animalId = query.get("animalId");
      setWeighStartId(animalId ? Number(animalId) : null);
      setWeighAnimals(null);
      setWeighOpen(true);
    }
  }, [canCreate, query]);

  const searchMatchedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rowsBase.filter(a => matchesAnimalSearch(a, q));
  }, [rowsBase, search]);

  const rows = useMemo(() => searchMatchedRows.filter(a => matchesAnimalView(a, view)), [searchMatchedRows, view]);

  const counts = useMemo(() => {
    const count = (nextView: AnimalView) => searchMatchedRows.filter(a => matchesAnimalView(a, nextView)).length;
    return {
      all: count("all"),
      active: count("active"),
      fattening: count("fattening"),
      ready: count("ready"),
      females: count("females"),
      sold: count("sold"),
    };
  }, [searchMatchedRows]);

  useEffect(() => {
    setSelectedKeys(prev => {
      if (prev.size === 0) return prev;
      const available = new Set(rows.map(a => a.animal?.id));
      const next = new Set(Array.from(prev).filter(id => available.has(Number(id))));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const setSavedView = (next: typeof view) => {
    setView(next);
    const params = new URLSearchParams(searchStr);
    params.set("view", next);
    params.delete("new");
    params.delete("weigh");
    const qs = params.toString();
    setLocation(`${location.split("?")[0]}${qs ? `?${qs}` : ""}`);
  };

  const columns: Column<any>[] = [
    {
      id: "photo",
      header: "",
      cell: a => <AnimalPhotoCell animalId={a.animal?.id} photoKey={a.animal?.photoUrl} alt={a.animal?.animalId} />,
      sortValue: () => null,
      hideable: false,
      mobileLabel: "",
    },
    {
      id: "animalId",
      header: t("animals.animalId", "Animal ID"),
      cell: a => <span className="font-medium text-foreground">{a.animal?.animalId}</span>,
      sortValue: a => a.animal?.animalId,
      primary: true,
      mobileLabel: t("animals.animalId", "Animal ID"),
    },
    { id: "species", header: t("animals.species", "Species"), cell: a => a.speciesName ?? "—", sortValue: a => a.speciesName, hideable: true, mobileLabel: t("animals.species", "Species") },
    { id: "category", header: t("animals.category", "Category"), cell: a => a.categoryName ?? "—", sortValue: a => a.categoryName, mobileLabel: t("animals.category", "Category") },
    { id: "group", header: t("animals.group", "Group"), cell: a => a.groupName ?? "—", sortValue: a => a.groupName, hideable: true, mobileLabel: t("animals.group", "Group") },
    { id: "owner", header: t("owners.owner", "Owner"), cell: a => a.ownerName ?? "—", sortValue: a => a.ownerName, hideable: true, defaultHidden: true, mobileLabel: t("owners.owner", "Owner") },
    { id: "sex", header: t("animals.sex", "Sex"), cell: a => t(`animals.${a.animal?.sex}`, a.animal?.sex), sortValue: a => a.animal?.sex, hideable: true, mobileLabel: t("animals.sex", "Sex") },
    { id: "weight", header: t("animals.currentWeight", "Current Weight (kg)"), cell: a => <span className="tabular-nums">{a.latestWeightKg ? parseFloat(a.latestWeightKg).toFixed(1) : a.animal?.weightAtAcquisition ? parseFloat(a.animal.weightAtAcquisition).toFixed(1) : "—"}</span>, sortValue: a => parseFloat(a.latestWeightKg ?? a.animal?.weightAtAcquisition ?? "0"), hideable: true, mobileLabel: t("animals.currentWeight", "Current Weight") },
    {
      id: "status",
      header: t("animals.status", "Status"),
      cell: a => <StatusBadge tone={statusTone(a.statusName)}>{a.statusName ?? "—"}</StatusBadge>,
      sortValue: a => a.statusName,
      mobileLabel: t("animals.status", "Status"),
    },
    { id: "acqType", header: t("animals.acquisitionType", "Acquisition Type"), cell: a => t(`animals.${a.animal?.acquisitionType}`, a.animal?.acquisitionType ?? "—"), sortValue: a => a.animal?.acquisitionType, hideable: true, defaultHidden: true, mobileLabel: t("animals.acquisitionType", "Acquisition Type") },
    { id: "birth", header: t("animals.birthDate", "Birth Date"), cell: a => fmtDate(a.animal?.birthDate), sortValue: a => a.animal?.birthDate, hideable: true, defaultHidden: true, mobileLabel: t("animals.birthDate", "Birth Date") },
    { id: "age", header: t("animals.age", "Age"), cell: a => formatAge(a.animal?.birthDate, t("animals.ageDaysSuffix", "d"), t("animals.ageMonthsSuffix", "m"), t("animals.ageYearsSuffix", "y")), sortValue: a => a.animal?.birthDate ? -new Date(a.animal.birthDate).getTime() : null, hideable: true, defaultHidden: true, mobileLabel: t("animals.age", "Age") },
    { id: "acq", header: t("animals.acquisitionDate", "Acquired"), cell: a => fmtDate(a.animal?.acquisitionDate), sortValue: a => a.animal?.acquisitionDate, hideable: true, mobileLabel: t("animals.acquisitionDate", "Acquired") },
    { id: "purchaseCost", header: t("animals.purchaseCost", "Purchase Cost"), cell: a => <span className="tabular-nums">{money(a.animal?.purchaseCost)}</span>, sortValue: a => parseFloat(a.animal?.purchaseCost ?? "0"), hideable: true, defaultHidden: true, mobileLabel: t("animals.purchaseCost", "Purchase Cost") },
    { id: "nextVaccine", header: t("vaccine.nextVaccine", "Next Vaccine"), cell: a => dueLabel(a.nextVaccineDate, a.nextVaccineName), sortValue: a => a.nextVaccineDate, hideable: true, defaultHidden: true, mobileLabel: t("vaccine.nextVaccine", "Next Vaccine") },
    { id: "booster", header: t("vaccine.boosterDue", "Booster Due"), cell: a => dueLabel(a.nextBoosterDate, a.nextBoosterName), sortValue: a => a.nextBoosterDate, hideable: true, defaultHidden: true, mobileLabel: t("vaccine.boosterDue", "Booster Due") },
    { id: "days", header: t("animals.daysOnFarm", "Days On Farm"), cell: a => <span className="tabular-nums">{daysOnFarm(a) ?? "—"}</span>, sortValue: a => daysOnFarm(a), hideable: true, defaultHidden: true, mobileLabel: t("animals.daysOnFarm", "Days On Farm") },
    {
      id: "percentage",
      header: t("animals.percentage", "% of Target"),
      cell: a => {
        const target = parseFloat(a.targetWeightKg ?? 0);
        const latest = parseFloat(a.latestWeightKg ?? a.animal?.weightAtAcquisition ?? 0);
        const pct = weightTargetPercent(latest, target);
        if (pct == null) return "—";
        const threshold = parseFloat(a.categoryReadyToSellThreshold ?? "80");
        const tone = weightProgressTone(pct, threshold);
        return <span className={`inline-flex min-w-[4.25rem] justify-end rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${weightProgressPillClass(tone)}`}>{pct.toFixed(1)}%</span>;
      },
      sortValue: a => {
        const target = parseFloat(a.targetWeightKg ?? 0);
        const latest = parseFloat(a.latestWeightKg ?? a.animal?.weightAtAcquisition ?? 0);
        return weightTargetPercent(latest, target) ?? 0;
      },
      hideable: true,
      mobileLabel: t("animals.percentage", "% of Target"),
    },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("newNav.animals", "Animals")}
        subtitle={`${rows.length} ${t("animals.head", "head")}`}
        crumbs={[{ label: t("nav.dashboard", "Dashboard"), href: "/" }, { label: t("newNav.animals", "Animals") }]}
        actions={
          canCreate ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring sm:min-h-9"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("animals.registerAnimal", "Register Animal")}
            </button>
          ) : undefined
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:gap-1 sm:overflow-x-auto sm:border-b sm:border-border">
        {([
          ["all", t("common.all", "All"), counts.all],
          ["active", t("animals.active", "Active"), counts.active],
          ["fattening", t("newNav.fattening", "Fattening"), counts.fattening],
          ["ready", t("animals.readyToSell", "Ready To Sell"), counts.ready],
          ["females", t("animals.females", "Females"), counts.females],
          ["sold", t("animals.sold", "Sold"), counts.sold],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSavedView(key)}
            className={`min-h-11 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring sm:h-10 sm:rounded-none sm:border-x-0 sm:border-t-0 sm:border-b-2 ${
              view === key ? "border-primary bg-primary-soft text-primary-soft-foreground sm:bg-transparent sm:text-foreground" : "border-border text-muted-foreground hover:text-foreground sm:border-transparent"
            }`}
            aria-pressed={view === key}
          >
            {label} <span className="ms-1 text-xs text-muted-2">{count}</span>
          </button>
        ))}
      </div>

      <DataTable
        data={rows}
        columns={columns}
        rowKey={a => a.animal?.id}
        loading={isLoading}
        storageKey="animals"
        onRowClick={a => setLocation(`/animals/${a.animal?.id}`)}
        selection={(canEdit || canSell || canVaccinate || canWeigh) ? { selectedKeys, onChange: setSelectedKeys } : undefined}
        bulkBar={(canEdit || canSell || canVaccinate || canWeigh) ? selected => (
          <>
            {canWeigh && (
              <button
                type="button"
                onClick={() => {
                  const first = selected[0];
                  setWeighAnimals(selected);
                  setWeighStartId(first?.animal?.id ?? null);
                  setWeighOpen(true);
                }}
                className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring"
              >
                {t("weight.record", "Record Weight")}
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setBulkEditOpen(true)}
                className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring"
              >
                {t("animals.bulkEdit", "Bulk Edit")}
              </button>
            )}
            {canVaccinate && (
              <button
                type="button"
                onClick={() => setBulkVaccinationOpen(true)}
                className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring"
              >
                {t("vaccine.bulkApply", "Bulk Apply")}
              </button>
            )}
            {canSell && (
              <button
                type="button"
                onClick={() => setBulkSaleOpen(true)}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
              >
                {t("animals.bulkSell", "Bulk Sell")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedKeys(new Set())}
              className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t("common.clear", "Clear")}
            </button>
          </>
        ) : undefined}
        rowActions={a => (
          <div className="flex items-center justify-end gap-1">
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditId(a.animal?.id)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-surface"
                aria-label={t("common.edit", "Edit")}
                title={t("common.edit", "Edit")}
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {canWeigh && (
              <button
                type="button"
                onClick={() => {
                  setWeighAnimals([a]);
                  setWeighStartId(a.animal?.id);
                  setWeighOpen(true);
                }}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-surface"
                aria-label={t("weight.record", "Record weight")}
                title={t("weight.record", "Record weight")}
              >
                <Scale className="h-4 w-4" />
              </button>
            )}
            {canSell && (
              <button
                type="button"
                onClick={() => setSaleAnimal(a)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-surface"
                aria-label={t("sales.recordSale", "Record sale")}
                title={t("sales.recordSale", "Record sale")}
              >
                <ShoppingCart className="h-4 w-4" />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => setDeleteRow(a)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger-soft-foreground"
                aria-label={t("animals.deleteAnimal", "Delete animal")}
                title={t("animals.deleteAnimal", "Delete animal")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        empty={
          <EmptyState
            icon={Leaf}
            title={t("animals.none", "No animals yet")}
            description={t("animals.noneHint", "Animals you register or that are born will appear here.")}
          />
        }
        toolbar={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute inset-y-0 start-2.5 my-auto h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t("common.search", "Search…")}
                aria-label={t("animals.searchAnimals", "Search animals")}
                className="h-9 w-44 ps-8"
              />
            </div>
            <Select value={filterSpecies} onValueChange={setFilterSpecies}>
              <SelectTrigger className="h-9 w-36"><SelectValue placeholder={t("animals.species", "Species")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.allSpecies", "All species")}</SelectItem>
                {((species as any[]) ?? []).map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 w-36"><SelectValue placeholder={t("animals.status", "Status")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pnl.allStatus", "All statuses")}</SelectItem>
                {((statuses as any[]) ?? []).map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterAcquisitionType} onValueChange={setFilterAcquisitionType}>
              <SelectTrigger className="h-9 w-36"><SelectValue placeholder={t("animals.acquisitionType", "Source")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("animals.allSources", "All sources")}</SelectItem>
                <SelectItem value="purchased">{t("animals.purchased", "Purchased")}</SelectItem>
                <SelectItem value="born">{t("animals.born", "Born")}</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      <ConsequenceConfirm
        open={deleteRow !== null}
        onOpenChange={o => !o && setDeleteRow(null)}
        title={t("animals.deleteAnimal", "Delete animal")}
        description={t("animals.deleteToBinDescription", "Move {{id}} and all related records to the Recycle Bin? You can restore it anytime.", { id: deleteRow?.animal?.animalId ?? "" })}
        consequences={[
          { text: t("animals.deleteCascadeHint", "Its weights, expenses, sales and vaccination records go to the bin with it."), tone: "warning" },
          { text: t("animals.deleteRecalcHint", "Dashboard KPIs, feed forecasts and P&L are recalculated."), tone: "info" },
        ]}
        confirmLabel={t("common.moveToBin", "Move to Bin")}
        cancelLabel={t("common.cancel", "Cancel")}
        destructive
        loading={deleteAnimal.isPending}
        onConfirm={() => deleteRow && deleteAnimal.mutate({ id: deleteRow.animal.id, expectedVersion: deleteRow.animal.version })}
      />

      <EditAnimalDialog animalId={editId} open={editId !== null} onOpenChange={o => !o && setEditId(null)} />
      <AnimalCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <WeighInSessionDialog
        open={weighOpen}
        onOpenChange={open => {
          setWeighOpen(open);
          if (!open) setWeighAnimals(null);
        }}
        animals={weighAnimals ?? rowsBase}
        startAnimalId={weighStartId}
      />
      <RecordSaleDialog open={saleAnimal !== null} onOpenChange={open => !open && setSaleAnimal(null)} animal={saleAnimal} />
      <BulkRecordSaleDialog
        open={bulkSaleOpen}
        onOpenChange={open => {
          setBulkSaleOpen(open);
          if (!open) setSelectedKeys(new Set());
        }}
        animals={rows.filter(a => selectedKeys.has(a.animal?.id))}
        initialSelectedIds={Array.from(selectedKeys).map(Number)}
      />
      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        selectedAnimals={rows.filter(a => selectedKeys.has(a.animal?.id))}
        onSuccess={() => setSelectedKeys(new Set())}
      />
      <BulkVaccinationDialog
        open={bulkVaccinationOpen}
        onOpenChange={setBulkVaccinationOpen}
        selectedAnimals={rows.filter(a => selectedKeys.has(a.animal?.id))}
        onSuccess={() => setSelectedKeys(new Set())}
      />
    </div>
  );
}
