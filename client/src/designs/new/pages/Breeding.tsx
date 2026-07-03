import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { AnimalIdNumberField } from "@/components/AnimalIdNumberField";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";
import { extractAnimalIdNumber } from "@shared/animalIds";
import { Baby, Egg, ExternalLink, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { ConsequenceConfirm } from "../components/ConsequenceConfirm";
import { FormSection, FormField, FormFooter } from "../components/FormLayout";
import { PregnancyPanel } from "./Pregnancy";

type LambingFilter = "all" | "pending" | "promoted";
type WorkspaceTab = "breeding" | "pregnancy";

const today = () => new Date().toISOString().slice(0, 10);

function fmtDate(d: unknown) {
  if (!d) return "-";
  const x = new Date(d as string);
  return Number.isNaN(x.getTime()) ? "-" : x.toLocaleDateString();
}

function fmtDateInput(d: unknown) {
  if (!d) return "";
  const x = new Date(d as string);
  return Number.isNaN(x.getTime()) ? String(d).slice(0, 10) : x.toISOString().slice(0, 10);
}

function fmtAge(d: unknown) {
  if (!d) return "-";
  const birth = new Date(d as string);
  if (Number.isNaN(birth.getTime())) return "-";
  const now = new Date();
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (months < 1) {
    const days = Math.max(0, Math.floor((now.getTime() - birth.getTime()) / 86400000));
    return `${days}d`;
  }
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return remMonths === 0 ? `${years}y` : `${years}y ${remMonths}mo`;
}

function fmtWeight(value: unknown) {
  if (!value) return "-";
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? "-" : `${parsed.toFixed(1)} kg`;
}

function fmtMoney(value: unknown) {
  if (!value) return "-";
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? "-" : `${parsed.toFixed(2)} EGP`;
}

function isActiveReference(record: any) {
  return record?.isActive !== false && record?.isActive !== 0;
}

function asAnimal(row: any) {
  return row?.animal ?? row ?? {};
}

function animalLabel(row: any) {
  const animal = asAnimal(row);
  return animal.animalId ?? animal.id ?? "-";
}

function animalValue(row: any) {
  const animal = asAnimal(row);
  return animal.id == null ? "" : String(animal.id);
}

function PromotionStatus({
  record,
  onOpenAnimal,
}: {
  record: any;
  onOpenAnimal: (id: number) => void;
}) {
  const { t } = useTranslation();
  const animalCode = record.promotedAnimalCode ?? null;

  if (!record.isPromoted) {
    return <StatusBadge tone="warning">{t("common.pending", "Pending")}</StatusBadge>;
  }

  if (record.promotedAnimalPurgedAt) {
    return (
      <div className="space-y-1">
        <StatusBadge tone="neutral">{t("breeding.promotedAnimalPurged", "Promoted animal purged")}</StatusBadge>
        {animalCode ? <p className="font-mono text-xs text-muted-foreground">{animalCode}</p> : null}
      </div>
    );
  }

  if (record.promotedAnimalDeletedAt || !record.promotedHeadId) {
    return (
      <div className="space-y-1">
        <StatusBadge tone="warning">{t("breeding.promotedAnimalDeleted", "Promoted animal in recycle bin")}</StatusBadge>
        {animalCode ? <p className="font-mono text-xs text-muted-foreground">{animalCode}</p> : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 text-left text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onOpenAnimal(Number(record.promotedHeadId))}
    >
      <StatusBadge tone="success">{t("breeding.promoted", "Promoted")}</StatusBadge>
      {animalCode ? <span className="font-mono text-xs">{animalCode}</span> : null}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

export default function NewBreeding({ initialTab = "breeding" }: { initialTab?: WorkspaceTab }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { ownerParam } = useOwnerFilter();
  const perms = usePermissions();
  const canViewBreeding = perms.can("breeding", "view");
  const canViewPregnancy = perms.can("pregnancy", "view");
  const canCreate = perms.can("breeding", "create");
  const canUpdate = perms.can("breeding", "update");
  const canDelete = perms.can("breeding", "delete");
  const canPromote = canUpdate && perms.can("animals", "create");
  const utils = trpc.useUtils();

  const [filter, setFilter] = useState<LambingFilter>("pending");
  const { data: lambs, isLoading } = trpc.breeding.listLambing.useQuery({
    ...(filter === "all" ? {} : { isPromoted: filter === "promoted" }),
    ownerId: ownerParam,
  });
  const { data: summary } = trpc.breeding.summary.useQuery();
  const { data: species } = trpc.config.getSpecies.useQuery();
  const { data: categories } = trpc.config.getCategories.useQuery();
  const { data: groups } = trpc.config.getGroups.useQuery();
  const { data: birthTypes } = trpc.config.getBirthTypes.useQuery();
  const { data: females } = trpc.animals.lookup.useQuery({ isActive: true, sex: "female" });
  const { data: males } = trpc.animals.lookup.useQuery({ isActive: true, sex: "male" });
  const { data: statuses } = trpc.config.getStatuses.useQuery();

  const blankBirth = {
    speciesId: "",
    categoryId: "",
    birthTypeId: "",
    sex: "female",
    birthDate: today(),
    damId: "",
    sireId: "",
    groupId: "",
    birthWeightKg: "",
    valueUsed: "",
    lambIdNumber: "",
    notes: "",
    count: "1",
  };
  const blankPromote = {
    speciesId: "",
    categoryId: "",
    groupId: "",
    statusId: "",
    acquisitionDate: today(),
    animalIdNumber: "",
  };
  const blankEdit = {
    lambIdNumber: "",
    birthDate: "",
    sex: "female",
    birthTypeId: "",
    birthWeightKg: "",
    valueUsed: "",
    damId: "none",
    sireId: "none",
    groupId: "",
    notes: "",
  };

  const [birthOpen, setBirthOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>(initialTab);
  const [birth, setBirth] = useState(blankBirth);
  const [promote, setPromote] = useState<any | null>(null);
  const [promoteForm, setPromoteForm] = useState(blankPromote);
  const [edit, setEdit] = useState<any | null>(null);
  const [editForm, setEditForm] = useState(blankEdit);
  const [deleteRow, setDeleteRow] = useState<any | null>(null);

  const categoryRows = ((categories as any[]) ?? []).filter(isActiveReference);
  const groupRows = ((groups as any[]) ?? []).filter(isActiveReference);
  const birthTypeRows = ((birthTypes as any[]) ?? []).filter(isActiveReference);
  const speciesRows = ((species as any[]) ?? []).filter(isActiveReference);
  const statusRows = ((statuses as any[]) ?? []).filter((item: any) => isActiveReference(item) && !item.isExitStatus);
  const femaleRows = ((females as any[]) ?? []).filter((row: any) => animalValue(row));
  const maleRows = ((males as any[]) ?? []).filter((row: any) => animalValue(row));

  const selectedBirthCategory = categoryRows.find((category: any) => String(category.id) === birth.categoryId);
  const selectedPromoteCategory = categoryRows.find((category: any) => String(category.id) === promoteForm.categoryId);
  const selectedEditCategory = categoryRows.find((category: any) => Number(category.id) === Number(edit?.categoryId));

  useEffect(() => {
    setWorkspaceTab(initialTab);
  }, [initialTab]);

  const activeWorkspaceTab =
    workspaceTab === "pregnancy" && canViewPregnancy
      ? "pregnancy"
      : canViewBreeding
        ? "breeding"
        : "pregnancy";

  const birthCategories = categoryRows.filter((category: any) => !birth.speciesId || String(category.speciesId) === birth.speciesId);
  const birthGroups = groupRows.filter((group: any) =>
    (!group.speciesId || String(group.speciesId) === birth.speciesId) &&
    (!group.categoryId || String(group.categoryId) === birth.categoryId)
  );
  const promoteCategories = categoryRows.filter((category: any) => !promoteForm.speciesId || String(category.speciesId) === promoteForm.speciesId);
  const promoteGroups = groupRows.filter((group: any) =>
    (!group.speciesId || String(group.speciesId) === promoteForm.speciesId) &&
    (!group.categoryId || String(group.categoryId) === promoteForm.categoryId)
  );
  const editGroups = groupRows.filter((group: any) =>
    (!group.speciesId || Number(group.speciesId) === Number(edit?.speciesId)) &&
    (!group.categoryId || Number(group.categoryId) === Number(edit?.categoryId))
  );

  const invalidate = () => {
    utils.breeding.listLambing.invalidate();
    utils.breeding.summary.invalidate();
  };

  const recordBirth = trpc.breeding.recordBirth.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("breeding.birthRecorded", "Birth recorded"));
    },
    onError: e => toast.error(e.message),
  });
  const updateLambing = trpc.breeding.updateLambing.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("common.saved", "Saved"));
      setEdit(null);
    },
    onError: e => toast.error(e.message),
  });
  const deleteLambingLog = trpc.recycleBin.deleteLambingLog.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("breeding.birthMovedToBin", "Birth moved to recycle bin"));
      setDeleteRow(null);
    },
    onError: e => toast.error(e.message),
  });
  const promoteLamb = trpc.breeding.promoteLamb.useMutation({
    onSuccess: data => {
      invalidate();
      utils.animals.list.invalidate();
      utils.dashboard.getKPIs.invalidate();
      utils.dashboard.getHeadCountByCategory.invalidate();
      toast.success(t("breeding.lambPromotedAs", { id: data.animalId, defaultValue: "Lamb promoted" }));
      setPromote(null);
    },
    onError: e => toast.error(e.message),
  });

  const rows = ((lambs as any[]) ?? []);
  const summaryTiles = [
    { id: "all" as const, label: t("common.all", "All"), count: summary?.total ?? rows.length, tone: "text-info-soft-foreground" },
    { id: "pending" as const, label: t("common.pending", "Pending"), count: summary?.pending ?? rows.filter(l => !l.isPromoted).length, tone: "text-warning-soft-foreground" },
    { id: "promoted" as const, label: t("breeding.promoted", "Promoted"), count: summary?.promoted ?? rows.filter(l => l.isPromoted).length, tone: "text-success-soft-foreground" },
  ];

  const startBirth = () => {
    setBirth({ ...blankBirth });
    setBirthOpen(true);
  };

  const startEdit = (record: any) => {
    const category = categoryRows.find((item: any) => Number(item.id) === Number(record.categoryId));
    setEditForm({
      lambIdNumber: extractAnimalIdNumber(record.lambId ?? "", category?.idPrefix ?? ""),
      birthDate: fmtDateInput(record.birthDate),
      sex: record.sex ?? "female",
      birthTypeId: record.birthTypeId ? String(record.birthTypeId) : "",
      birthWeightKg: record.birthWeightKg ? String(record.birthWeightKg) : "",
      valueUsed: record.valueUsed ? String(record.valueUsed) : "",
      damId: record.damId ? String(record.damId) : "none",
      sireId: record.sireId ? String(record.sireId) : "none",
      groupId: record.groupId ? String(record.groupId) : "",
      notes: record.notes ?? "",
    });
    setEdit(record);
  };

  const startPromote = (record: any) => {
    setPromoteForm({
      ...blankPromote,
      speciesId: record.speciesId ? String(record.speciesId) : "",
      categoryId: record.categoryId ? String(record.categoryId) : "",
      groupId: record.groupId ? String(record.groupId) : "",
    });
    setPromote(record);
  };

  const submitBirth = (again: boolean) => {
    if (!birth.speciesId || !birth.categoryId || !birth.birthTypeId || !birth.birthDate) {
      toast.error(t("breeding.fillRequired", "Species, category, birth date and birth type are required"));
      return;
    }
    recordBirth.mutate(
      {
        speciesId: Number(birth.speciesId),
        categoryId: Number(birth.categoryId),
        birthTypeId: Number(birth.birthTypeId),
        sex: birth.sex as "male" | "female",
        birthDate: birth.birthDate,
        damId: birth.damId ? Number(birth.damId) : undefined,
        sireId: birth.sireId ? Number(birth.sireId) : undefined,
        groupId: birth.groupId ? Number(birth.groupId) : undefined,
        birthWeightKg: birth.birthWeightKg || undefined,
        valueUsed: birth.valueUsed || undefined,
        lambIdNumber: birth.lambIdNumber || undefined,
        notes: birth.notes || undefined,
        count: Number(birth.count) || 1,
      },
      { onSuccess: () => (again ? setBirth({ ...blankBirth }) : setBirthOpen(false)) }
    );
  };

  const submitEdit = () => {
    if (!edit) return;
    updateLambing.mutate({
      id: edit.id,
      lambIdNumber: editForm.lambIdNumber || undefined,
      birthDate: editForm.birthDate || undefined,
      sex: editForm.sex as "male" | "female",
      birthTypeId: editForm.birthTypeId ? Number(editForm.birthTypeId) : undefined,
      birthWeightKg: editForm.birthWeightKg || undefined,
      valueUsed: editForm.valueUsed || undefined,
      groupId: editForm.groupId ? Number(editForm.groupId) : undefined,
      notes: editForm.notes || undefined,
      damId: editForm.damId !== "none" ? Number(editForm.damId) : null,
      sireId: editForm.sireId !== "none" ? Number(editForm.sireId) : null,
    });
  };

  const submitPromote = () => {
    if (!promote || !promoteForm.speciesId || !promoteForm.categoryId || !promoteForm.groupId || !promoteForm.statusId || !promoteForm.acquisitionDate) {
      toast.error(t("breeding.promotionFieldsRequired", "Species, category, group, status and acquisition date are required"));
      return;
    }
    promoteLamb.mutate({
      lambingLogId: promote.id,
      speciesId: Number(promoteForm.speciesId),
      categoryId: Number(promoteForm.categoryId),
      groupId: Number(promoteForm.groupId),
      statusId: Number(promoteForm.statusId),
      acquisitionDate: promoteForm.acquisitionDate,
      animalIdNumber: promoteForm.animalIdNumber || undefined,
    });
  };

  const columns: Column<any>[] = [
    {
      id: "lamb",
      header: t("breeding.lambId", "Lamb ID"),
      cell: l => <span className="font-mono font-semibold text-primary">{l.lambId ?? "-"}</span>,
      sortValue: l => l.lambId,
      primary: true,
      mobileLabel: t("breeding.lambId", "Lamb ID"),
    },
    { id: "birth", header: t("breeding.birthDate", "Birth date"), cell: l => fmtDate(l.birthDate), sortValue: l => l.birthDate, hideable: true, mobileLabel: t("breeding.birthDate", "Birth date") },
    { id: "age", header: t("breeding.age", "Age"), cell: l => <span className="text-muted-foreground">{fmtAge(l.birthDate)}</span>, sortValue: l => new Date(l.birthDate).getTime(), hideable: true, mobileLabel: t("breeding.age", "Age") },
    { id: "sex", header: t("animals.sex", "Sex"), cell: l => String(t(`animals.${l.sex}`, l.sex ?? "-")), sortValue: l => l.sex, hideable: true, mobileLabel: t("animals.sex", "Sex") },
    { id: "category", header: t("animals.category", "Category"), cell: l => l.categoryName ?? "-", sortValue: l => l.categoryName, hideable: true, defaultHidden: true, mobileLabel: t("animals.category", "Category") },
    { id: "group", header: t("animals.group", "Group"), cell: l => l.groupCode ?? "-", sortValue: l => l.groupCode, hideable: true, defaultHidden: true, mobileLabel: t("animals.group", "Group") },
    { id: "type", header: t("breeding.birthType", "Birth type"), cell: l => l.birthTypeName ?? "-", sortValue: l => l.birthTypeName, hideable: true, mobileLabel: t("breeding.birthType", "Birth type") },
    { id: "weight", header: t("breeding.birthWeight", "Birth weight"), cell: l => fmtWeight(l.birthWeightKg), sortValue: l => Number.parseFloat(l.birthWeightKg ?? ""), hideable: true, mobileLabel: t("breeding.birthWeight", "Birth weight") },
    { id: "value", header: t("breeding.valueUsed", "Value used"), cell: l => fmtMoney(l.valueUsed), sortValue: l => Number.parseFloat(l.valueUsed ?? ""), hideable: true, mobileLabel: t("breeding.valueUsed", "Value used") },
    {
      id: "dam",
      header: t("breeding.dam", "Dam"),
      cell: l => l.damAnimalId ? (
        <button type="button" onClick={() => setLocation(`/animals/${l.effectiveDamId ?? l.damId}`)} className="font-mono text-xs text-primary hover:underline">
          {l.damAnimalId}
        </button>
      ) : "-",
      sortValue: l => l.damAnimalId,
      hideable: true,
      mobileLabel: t("breeding.dam", "Dam"),
    },
    {
      id: "sire",
      header: t("breeding.sire", "Sire"),
      cell: l => l.sireAnimalId ? (
        <button type="button" onClick={() => setLocation(`/animals/${l.effectiveSireId ?? l.sireId}`)} className="font-mono text-xs text-primary hover:underline">
          {l.sireAnimalId}
        </button>
      ) : "-",
      sortValue: l => l.sireAnimalId,
      hideable: true,
      mobileLabel: t("breeding.sire", "Sire"),
    },
    {
      id: "status",
      header: t("common.status", "Status"),
      cell: l => <PromotionStatus record={l} onOpenAnimal={id => setLocation(`/animals/${id}`)} />,
      sortValue: l => (l.isPromoted ? "promoted" : "pending"),
      mobileLabel: t("common.status", "Status"),
    },
    { id: "notes", header: t("common.notes", "Notes"), cell: l => l.notes ?? "-", hideable: true, defaultHidden: true, mobileLabel: t("common.notes", "Notes") },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("nav.breedingPregnancy", "Breeding & Pregnancy")}
        subtitle={
          activeWorkspaceTab === "breeding" && summary
            ? t("breeding.recordsSummary", { total: summary.total, pending: summary.pending, defaultValue: `${summary.total} records, ${summary.pending} pending` })
            : t("pregnancy.subtitle", "Track active pregnancies, due dates and outcomes")
        }
        crumbs={[{ label: t("nav.dashboard", "Dashboard"), href: "/" }, { label: t("nav.breedingPregnancy", "Breeding & Pregnancy") }]}
        actions={
          activeWorkspaceTab === "breeding" && canCreate ? (
            <button type="button" onClick={startBirth} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" />
              {t("breeding.recordBirth", "Record birth")}
            </button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-1">
        {canViewBreeding && (
          <button
            type="button"
            onClick={() => setWorkspaceTab("breeding")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeWorkspaceTab === "breeding" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface hover:text-foreground"
            }`}
          >
            {t("breeding.title", "Breeding & Lambing")}
          </button>
        )}
        {canViewPregnancy && (
          <button
            type="button"
            onClick={() => setWorkspaceTab("pregnancy")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeWorkspaceTab === "pregnancy" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface hover:text-foreground"
            }`}
          >
            {t("pregnancy.title", "Pregnancy Tracking")}
          </button>
        )}
      </div>

      {activeWorkspaceTab === "pregnancy" ? (
        <PregnancyPanel embedded />
      ) : (
        <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summaryTiles.map(tile => (
          <button
            key={tile.id}
            type="button"
            onClick={() => setFilter(tile.id)}
            className={`rounded-lg border px-4 py-3 text-left transition-colors hover:bg-surface ${
              filter === tile.id ? "border-primary bg-primary-soft ring-2 ring-primary/15" : "border-border bg-card"
            }`}
          >
            <span className="block text-xs font-medium text-muted-foreground">{tile.label}</span>
            <span className={`mt-1 block text-2xl font-semibold tabular-nums ${tile.tone}`}>{tile.count}</span>
          </button>
        ))}
      </div>

      <DataTable
        data={rows}
        columns={columns}
        rowKey={l => l.id}
        loading={isLoading}
        storageKey="breeding"
        rowActions={(canUpdate || canPromote || canDelete) ? l => !l.isPromoted ? (
          <div className="flex items-center justify-end gap-1">
            {canUpdate && (
              <button type="button" onClick={() => startEdit(l)} title={t("common.edit", "Edit")} className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-surface">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {canPromote && (
              <button type="button" onClick={() => startPromote(l)} title={t("breeding.promote", "Promote")} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-primary hover:bg-surface">
                <Sparkles className="h-3.5 w-3.5" />
                {t("breeding.promote", "Promote")}
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={() => setDeleteRow(l)} title={t("common.moveToBin", "Move to bin")} className="grid h-8 w-8 place-items-center rounded-md border border-border text-danger-soft-foreground hover:bg-danger-soft">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : null : undefined}
        empty={<EmptyState icon={Egg} title={t("breeding.noBirthRecords", "No birth records")} />}
      />

      <Dialog open={birthOpen} onOpenChange={setBirthOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{t("breeding.recordBirth", "Record birth")}</DialogTitle></DialogHeader>
          <FormSection>
            <FormField label={t("animals.species", "Species")} htmlFor="birth-species" required>
              <Select value={birth.speciesId} onValueChange={v => setBirth(f => ({ ...f, speciesId: v, categoryId: "", groupId: "", lambIdNumber: "" }))}>
                <SelectTrigger id="birth-species"><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>{speciesRows.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t("animals.category", "Category")} htmlFor="birth-category" required>
              <Select value={birth.categoryId} onValueChange={v => setBirth(f => ({ ...f, categoryId: v, groupId: "", lambIdNumber: "" }))} disabled={!birth.speciesId}>
                <SelectTrigger id="birth-category"><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>{birthCategories.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <AnimalIdNumberField
              inputId="birth-lamb-id-number"
              label={t("breeding.lambIdNumber", "Lamb ID number")}
              hint={t("breeding.lambIdNumberHint", "Optional. Leave blank to auto-generate.")}
              placeholder={t("breeding.lambIdNumberPlaceholder", "0001")}
              prefix={selectedBirthCategory?.idPrefix ?? ""}
              value={birth.lambIdNumber}
              onChange={lambIdNumber => setBirth(f => ({ ...f, lambIdNumber }))}
              className="sm:col-span-2"
            />
            <FormField label={t("breeding.birthType", "Birth type")} htmlFor="birth-type" required>
              <Select value={birth.birthTypeId} onValueChange={v => setBirth(f => ({ ...f, birthTypeId: v }))}>
                <SelectTrigger id="birth-type"><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>{birthTypeRows.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t("animals.sex", "Sex")} htmlFor="birth-sex" required>
              <Select value={birth.sex} onValueChange={v => setBirth(f => ({ ...f, sex: v }))}>
                <SelectTrigger id="birth-sex"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">{t("animals.female", "Female")}</SelectItem>
                  <SelectItem value="male">{t("animals.male", "Male")}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("breeding.birthDate", "Birth date")} htmlFor="birth-date" required>
              <Input id="birth-date" name="birthDate" type="date" value={birth.birthDate} onChange={e => setBirth(f => ({ ...f, birthDate: e.target.value }))} />
            </FormField>
            <FormField label={t("breeding.birthWeight", "Birth weight")} htmlFor="birth-weight">
              <Input id="birth-weight" name="birthWeightKg" type="number" inputMode="decimal" placeholder="0.0" value={birth.birthWeightKg} onChange={e => setBirth(f => ({ ...f, birthWeightKg: e.target.value }))} />
            </FormField>
            <FormField label={t("breeding.valueUsed", "Value used")} htmlFor="birth-value">
              <Input id="birth-value" name="valueUsed" type="number" inputMode="decimal" placeholder="0.00" value={birth.valueUsed} onChange={e => setBirth(f => ({ ...f, valueUsed: e.target.value }))} />
            </FormField>
            <FormField label={t("breeding.dam", "Dam")} htmlFor="birth-dam">
              <Select value={birth.damId || "none"} onValueChange={v => setBirth(f => ({ ...f, damId: v === "none" ? "" : v }))}>
                <SelectTrigger id="birth-dam"><SelectValue placeholder={t("common.optional", "Optional")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("common.unknown", "Unknown")}</SelectItem>
                  {femaleRows.map((a: any) => <SelectItem key={animalValue(a)} value={animalValue(a)}>{animalLabel(a)}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("breeding.sire", "Sire")} htmlFor="birth-sire">
              <Select value={birth.sireId || "none"} onValueChange={v => setBirth(f => ({ ...f, sireId: v === "none" ? "" : v }))}>
                <SelectTrigger id="birth-sire"><SelectValue placeholder={t("common.optional", "Optional")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("common.unknown", "Unknown")}</SelectItem>
                  {maleRows.map((a: any) => <SelectItem key={animalValue(a)} value={animalValue(a)}>{animalLabel(a)}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("animals.group", "Group")} htmlFor="birth-group">
              <Select value={birth.groupId} onValueChange={v => setBirth(f => ({ ...f, groupId: v }))} disabled={!birth.categoryId}>
                <SelectTrigger id="birth-group"><SelectValue placeholder={t("common.optional", "Optional")} /></SelectTrigger>
                <SelectContent>{birthGroups.map((g: any) => <SelectItem key={g.id} value={String(g.id)}>{g.name ?? g.groupCode}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t("breeding.count", "How many")} htmlFor="birth-count">
              <Input id="birth-count" name="count" type="number" min={1} max={10} value={birth.count} onChange={e => setBirth(f => ({ ...f, count: e.target.value }))} />
            </FormField>
            <FormField label={t("common.notes", "Notes")} htmlFor="birth-notes" full>
              <Textarea id="birth-notes" name="notes" rows={2} value={birth.notes} onChange={e => setBirth(f => ({ ...f, notes: e.target.value }))} />
            </FormField>
          </FormSection>
          <FormFooter>
            <button type="button" onClick={() => setBirthOpen(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button type="button" disabled={recordBirth.isPending} onClick={() => submitBirth(true)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface disabled:opacity-50">{t("common.saveAddAnother", "Save & add another")}</button>
            <button type="button" disabled={recordBirth.isPending} onClick={() => submitBirth(false)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{t("common.save", "Save")}</button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={edit !== null} onOpenChange={open => !open && setEdit(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{t("common.edit", "Edit")} {edit?.lambId}</DialogTitle></DialogHeader>
          <FormSection>
            <AnimalIdNumberField
              inputId="edit-lamb-id-number"
              label={t("breeding.lambIdNumber", "Lamb ID number")}
              hint={t("breeding.lambIdNumberEditHint", "Changing this updates the lamb ID.")}
              placeholder={t("breeding.lambIdNumberPlaceholder", "0001")}
              prefix={selectedEditCategory?.idPrefix ?? ""}
              value={editForm.lambIdNumber}
              onChange={lambIdNumber => setEditForm(f => ({ ...f, lambIdNumber }))}
              className="sm:col-span-2"
            />
            <FormField label={t("breeding.birthDate", "Birth date")} htmlFor="edit-birth-date">
              <Input id="edit-birth-date" name="birthDate" type="date" value={editForm.birthDate} onChange={e => setEditForm(f => ({ ...f, birthDate: e.target.value }))} />
            </FormField>
            <FormField label={t("animals.sex", "Sex")} htmlFor="edit-sex">
              <Select value={editForm.sex} onValueChange={v => setEditForm(f => ({ ...f, sex: v }))}>
                <SelectTrigger id="edit-sex"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">{t("animals.female", "Female")}</SelectItem>
                  <SelectItem value="male">{t("animals.male", "Male")}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("breeding.birthType", "Birth type")} htmlFor="edit-birth-type">
              <Select value={editForm.birthTypeId} onValueChange={v => setEditForm(f => ({ ...f, birthTypeId: v }))}>
                <SelectTrigger id="edit-birth-type"><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>{birthTypeRows.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t("breeding.birthWeight", "Birth weight")} htmlFor="edit-weight">
              <Input id="edit-weight" name="birthWeightKg" type="number" inputMode="decimal" placeholder="0.0" value={editForm.birthWeightKg} onChange={e => setEditForm(f => ({ ...f, birthWeightKg: e.target.value }))} />
            </FormField>
            <FormField label={t("breeding.valueUsed", "Value used")} htmlFor="edit-value">
              <Input id="edit-value" name="valueUsed" type="number" inputMode="decimal" placeholder="0.00" value={editForm.valueUsed} onChange={e => setEditForm(f => ({ ...f, valueUsed: e.target.value }))} />
            </FormField>
            <FormField label={t("breeding.dam", "Dam")} htmlFor="edit-dam">
              <Select value={editForm.damId} onValueChange={v => setEditForm(f => ({ ...f, damId: v }))}>
                <SelectTrigger id="edit-dam"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("common.unknown", "Unknown")}</SelectItem>
                  {femaleRows.map((a: any) => <SelectItem key={animalValue(a)} value={animalValue(a)}>{animalLabel(a)}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("breeding.sire", "Sire")} htmlFor="edit-sire">
              <Select value={editForm.sireId} onValueChange={v => setEditForm(f => ({ ...f, sireId: v }))}>
                <SelectTrigger id="edit-sire"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("common.unknown", "Unknown")}</SelectItem>
                  {maleRows.map((a: any) => <SelectItem key={animalValue(a)} value={animalValue(a)}>{animalLabel(a)}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("animals.group", "Group")} htmlFor="edit-group">
              <Select value={editForm.groupId} onValueChange={v => setEditForm(f => ({ ...f, groupId: v }))}>
                <SelectTrigger id="edit-group"><SelectValue placeholder={t("common.optional", "Optional")} /></SelectTrigger>
                <SelectContent>{editGroups.map((g: any) => <SelectItem key={g.id} value={String(g.id)}>{g.name ?? g.groupCode}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t("common.notes", "Notes")} htmlFor="edit-notes" full>
              <Textarea id="edit-notes" name="notes" rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </FormField>
          </FormSection>
          <FormFooter>
            <button type="button" onClick={() => setEdit(null)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button type="button" disabled={updateLambing.isPending} onClick={submitEdit} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{t("common.save", "Save")}</button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={promote !== null} onOpenChange={open => !open && setPromote(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("breeding.promoteLambToRegistry", "Promote lamb to animal registry")}</DialogTitle></DialogHeader>
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
            <Baby className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>{t("breeding.promoteConsequence", "This creates a full animal record from the lamb and keeps the birth history linked.")}</span>
          </div>
          <FormSection>
            <FormField label={t("animals.species", "Species")} htmlFor="promote-species" required>
              <Select value={promoteForm.speciesId} onValueChange={v => setPromoteForm(f => ({ ...f, speciesId: v, categoryId: "", groupId: "", animalIdNumber: "" }))}>
                <SelectTrigger id="promote-species"><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>{speciesRows.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t("animals.category", "Category")} htmlFor="promote-category" required>
              <Select value={promoteForm.categoryId} onValueChange={v => setPromoteForm(f => ({ ...f, categoryId: v, groupId: "", animalIdNumber: "" }))} disabled={!promoteForm.speciesId}>
                <SelectTrigger id="promote-category"><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>{promoteCategories.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <AnimalIdNumberField
              inputId="promote-animal-id-number"
              label={t("animals.animalIdNumber", "Animal ID number")}
              hint={t("animals.animalIdNumberHint", "Optional. Leave blank to auto-generate.")}
              placeholder={t("animals.animalIdNumberPlaceholder", "0001")}
              prefix={selectedPromoteCategory?.idPrefix ?? ""}
              value={promoteForm.animalIdNumber}
              onChange={animalIdNumber => setPromoteForm(f => ({ ...f, animalIdNumber }))}
              className="sm:col-span-2"
            />
            <FormField label={t("animals.group", "Group")} htmlFor="promote-group" required>
              <Select value={promoteForm.groupId} onValueChange={v => setPromoteForm(f => ({ ...f, groupId: v }))} disabled={!promoteForm.categoryId}>
                <SelectTrigger id="promote-group"><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>{promoteGroups.map((g: any) => <SelectItem key={g.id} value={String(g.id)}>{g.name ?? g.groupCode}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t("animals.status", "Status")} htmlFor="promote-status" required>
              <Select value={promoteForm.statusId} onValueChange={v => setPromoteForm(f => ({ ...f, statusId: v }))}>
                <SelectTrigger id="promote-status"><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>{statusRows.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t("animals.acquisitionDate", "Acquisition date")} htmlFor="promote-acquisition-date" required>
              <Input id="promote-acquisition-date" name="acquisitionDate" type="date" value={promoteForm.acquisitionDate} onChange={e => setPromoteForm(f => ({ ...f, acquisitionDate: e.target.value }))} />
            </FormField>
          </FormSection>
          <FormFooter>
            <button type="button" onClick={() => setPromote(null)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button type="button" disabled={promoteLamb.isPending} onClick={submitPromote} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{t("breeding.promote", "Promote")}</button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      <ConsequenceConfirm
        open={deleteRow !== null}
        onOpenChange={open => !open && setDeleteRow(null)}
        title={t("breeding.deleteBirthRecord", "Move birth record to recycle bin?")}
        description={deleteRow ? `${deleteRow.lambId}` : ""}
        consequences={[{ text: t("breeding.deleteBirthRecordDescription", { id: deleteRow?.lambId ?? "", defaultValue: "This birth record will be soft-deleted and recoverable from the Recycle Bin." }), tone: "warning" }]}
        confirmLabel={t("common.moveToBin", "Move to bin")}
        destructive
        loading={deleteLambingLog.isPending}
        onConfirm={() => deleteRow && deleteLambingLog.mutate({ id: deleteRow.id })}
      />
        </>
      )}
    </div>
  );
}
