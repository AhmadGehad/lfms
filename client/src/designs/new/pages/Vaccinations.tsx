import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Plus, Syringe, Trash2, Users } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { ConsequenceConfirm } from "../components/ConsequenceConfirm";
import { FormSection, FormField, FormFooter } from "../components/FormLayout";

const MS_DAY = 86400000;
function fmtDate(d: unknown) {
  if (!d) return "—";
  const x = new Date(d as string);
  return Number.isNaN(x.getTime()) ? "—" : x.toLocaleDateString();
}
function dayDiff(d: unknown): number | null {
  if (!d) return null;
  const x = new Date(d as string);
  if (Number.isNaN(x.getTime())) return null;
  x.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.ceil((x.getTime() - t.getTime()) / MS_DAY);
}
const today = () => new Date().toISOString().slice(0, 10);

/** Due-date badge with color+text (overdue / due within lead days / ok). */
function DueBadge({ date, leadDays = 7 }: { date: unknown; leadDays?: number }) {
  const { t } = useTranslation();
  const d = dayDiff(date);
  if (d == null) return <span className="text-muted-foreground">—</span>;
  if (d < 0) return <StatusBadge tone="danger">{t("dashboard.overdue", "Overdue")} {-d}d</StatusBadge>;
  if (d <= leadDays) return <StatusBadge tone="warning">{fmtDate(date)}</StatusBadge>;
  return <span className="text-foreground">{fmtDate(date)}</span>;
}

/** Overall record status: completed / overdue / due soon / upcoming. */
function RecordStatusBadge({ record }: { record: any }) {
  const { t } = useTranslation();
  if (record.isCompleted) return <StatusBadge tone="success">{t("vaccine.completed", "Completed")}</StatusBadge>;
  const d = dayDiff(record.nextDueDate);
  if (d == null) return <span className="text-muted-foreground">—</span>;
  if (d < 0) return <StatusBadge tone="danger">{t("vaccine.overdue", "Overdue")}</StatusBadge>;
  if (d <= (record.notifyBeforeNext ?? 7)) return <StatusBadge tone="warning">{t("vaccine.due", "Due")}</StatusBadge>;
  return <StatusBadge tone="info">{t("vaccine.upcoming", "Upcoming")}</StatusBadge>;
}

type BulkType = "animals" | "category" | "categories";

/** Bulk-apply dialog: one vaccine to many animals, one category, or many categories. */
function BulkApplyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [bulkType, setBulkType] = useState<BulkType>("animals");
  const blank = {
    animalIds: [] as string[],
    categoryId: "",
    categoryIds: [] as string[],
    vaccineId: "",
    vaccinationDate: today(),
    batchNumber: "",
    veterinarian: "",
    notes: "",
  };
  const [form, setForm] = useState(blank);

  const { data: animals } = trpc.animals.lookup.useQuery();
  const { data: categories } = trpc.config.getCategories.useQuery();
  const { data: vaccines } = trpc.config.getVaccines.useQuery();

  const onDone = {
    onSuccess: () => {
      toast.success(t("vaccine.bulkVaccinationApplied", "Bulk vaccination applied"));
      utils.vaccination.getVaccinationRecords.invalidate();
      setForm({ ...blank });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  };
  const toAnimals = trpc.vaccination.bulkApplyToAnimals.useMutation(onDone);
  const toCategory = trpc.vaccination.bulkApplyToCategory.useMutation(onDone);
  const toCategories = trpc.vaccination.bulkApplyToCategories.useMutation(onDone);
  const isPending = toAnimals.isPending || toCategory.isPending || toCategories.isPending;

  const submit = () => {
    if (!form.vaccineId) { toast.error(t("vaccine.vaccineRequired", "Pick a vaccine")); return; }
    if (!form.vaccinationDate) { toast.error(t("vaccine.dateRequired", "Pick a date")); return; }
    const shared = {
      vaccineId: Number(form.vaccineId),
      vaccinationDate: form.vaccinationDate,
      batchNumber: form.batchNumber || undefined,
      veterinarian: form.veterinarian || undefined,
      notes: form.notes || undefined,
    };
    if (bulkType === "animals") {
      if (form.animalIds.length === 0) { toast.error(t("vaccine.animalRequired", "Pick at least one animal")); return; }
      toAnimals.mutate({ animalIds: form.animalIds.map(Number), ...shared });
    } else if (bulkType === "category") {
      if (!form.categoryId) { toast.error(t("vaccine.categoryRequired", "Pick a category")); return; }
      toCategory.mutate({ categoryId: Number(form.categoryId), ...shared });
    } else {
      if (form.categoryIds.length === 0) { toast.error(t("vaccine.categoryRequired", "Pick a category")); return; }
      toCategories.mutate({ categoryIds: form.categoryIds.map(Number), ...shared });
    }
  };

  const toggleId = (key: "animalIds" | "categoryIds", id: string) =>
    setForm(f => ({
      ...f,
      [key]: f[key].includes(id) ? f[key].filter(x => x !== id) : [...f[key], id],
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{t("vaccine.bulkApply", "Bulk apply")}</DialogTitle></DialogHeader>
        <FormSection>
          <FormField label={t("vaccine.applyTo", "Apply to")} required full>
            <Select value={bulkType} onValueChange={v => setBulkType(v as BulkType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="animals">{t("vaccine.multipleAnimals", "Multiple animals")}</SelectItem>
                <SelectItem value="category">{t("vaccine.singleCategory", "One category")}</SelectItem>
                <SelectItem value="categories">{t("vaccine.multipleCategories", "Multiple categories")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          {bulkType === "animals" && (
            <FormField label={t("vaccine.selectAnimals", "Select animals")} required full>
              <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
                {((animals as any[]) ?? []).map(a => (
                  <label key={a.animal.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--primary)]"
                      checked={form.animalIds.includes(String(a.animal.id))}
                      onChange={() => toggleId("animalIds", String(a.animal.id))}
                    />
                    {a.animal.animalId}
                  </label>
                ))}
              </div>
            </FormField>
          )}
          {bulkType === "category" && (
            <FormField label={t("vaccine.selectCategory", "Select category")} required full>
              <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>
                  {((categories as any[]) ?? []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          )}
          {bulkType === "categories" && (
            <FormField label={t("vaccine.selectCategories", "Select categories")} required full>
              <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
                {((categories as any[]) ?? []).map(c => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--primary)]"
                      checked={form.categoryIds.includes(String(c.id))}
                      onChange={() => toggleId("categoryIds", String(c.id))}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </FormField>
          )}

          <FormField label={t("vaccine.vaccine", "Vaccine")} required>
            <Select value={form.vaccineId} onValueChange={v => setForm(f => ({ ...f, vaccineId: v }))}>
              <SelectTrigger><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
              <SelectContent>
                {((vaccines as any[]) ?? []).map(v => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("vaccine.date", "Date")} required>
            <Input type="date" value={form.vaccinationDate} onChange={e => setForm(f => ({ ...f, vaccinationDate: e.target.value }))} />
          </FormField>
          <FormField label={t("vaccine.batch", "Batch number")}>
            <Input value={form.batchNumber} onChange={e => setForm(f => ({ ...f, batchNumber: e.target.value }))} />
          </FormField>
          <FormField label={t("vaccine.vet", "Veterinarian")}>
            <Input value={form.veterinarian} onChange={e => setForm(f => ({ ...f, veterinarian: e.target.value }))} />
          </FormField>
          <FormField label={t("vaccine.notes", "Notes")} full>
            <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </FormField>
        </FormSection>
        <FormFooter>
          <button onClick={() => onOpenChange(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
          <button disabled={isPending} onClick={submit} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {isPending ? t("common.saving", "Saving...") : t("common.apply", "Apply")}
          </button>
        </FormFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * New Vaccinations (daily Staff task). DataTable of records with overdue/due-soon
 * badges + record/edit/delete/bulk-apply flows. Same tRPC + permissions as Old.
 */
export default function NewVaccinations() {
  const { t } = useTranslation();
  const { ownerParam } = useOwnerFilter();
  const perms = usePermissions();
  const canCreate = perms.can("vaccinations", "create");
  const canUpdate = perms.can("vaccinations", "update");
  const canDelete = perms.can("vaccinations", "delete");
  const utils = trpc.useUtils();

  const { data: records, isLoading } = trpc.vaccination.getVaccinationRecords.useQuery({ ownerId: ownerParam });
  const { data: animals } = trpc.animals.lookup.useQuery({ isActive: true });
  const { data: vaccines } = trpc.config.getVaccines.useQuery();

  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const blank = {
    animalId: "", vaccineId: "", vaccinationDate: today(), batchNumber: "", veterinarian: "", notes: "",
    notifyBeforeNext: "7", notifyBeforeBooster: "7",
  };
  const [form, setForm] = useState(blank);
  const [editRow, setEditRow] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ vaccinationDate: today(), batchNumber: "", veterinarian: "", notes: "", isCompleted: false });
  const [deleteRow, setDeleteRow] = useState<any | null>(null);

  const add = trpc.vaccination.addVaccinationRecord.useMutation({
    onSuccess: () => { utils.vaccination.getVaccinationRecords.invalidate(); toast.success(t("vaccine.recorded", "Vaccination recorded")); },
    onError: e => toast.error(e.message),
  });
  const update = trpc.vaccination.updateVaccinationRecord.useMutation({
    onSuccess: () => { utils.vaccination.getVaccinationRecords.invalidate(); toast.success(t("vaccine.vaccinationSaved", "Vaccination saved")); setEditRow(null); },
    onError: e => toast.error(e.message),
  });
  const remove = trpc.vaccination.deleteVaccinationRecord.useMutation({
    onSuccess: () => { utils.vaccination.getVaccinationRecords.invalidate(); toast.success(t("vaccine.vaccinationDeleted", "Vaccination deleted")); setDeleteRow(null); },
    onError: e => toast.error(e.message),
  });

  const selectedVaccine = ((vaccines as any[]) ?? []).find(v => String(v.id) === form.vaccineId);

  const submit = (again: boolean) => {
    if (!form.animalId || !form.vaccineId) { toast.error(t("vaccine.pickAnimalVaccine", "Pick an animal and a vaccine")); return; }
    add.mutate(
      {
        animalId: Number(form.animalId),
        vaccineId: Number(form.vaccineId),
        vaccinationDate: form.vaccinationDate,
        batchNumber: form.batchNumber || undefined,
        veterinarian: form.veterinarian || undefined,
        notes: form.notes || undefined,
        notifyBeforeNext: form.notifyBeforeNext ? Number(form.notifyBeforeNext) : undefined,
        notifyBeforeBooster: form.notifyBeforeBooster ? Number(form.notifyBeforeBooster) : undefined,
      },
      { onSuccess: () => (again ? setForm({ ...blank }) : setOpen(false)) }
    );
  };

  const startEdit = (r: any) => {
    setEditForm({
      vaccinationDate: r.vaccinationDate ? new Date(r.vaccinationDate).toISOString().slice(0, 10) : today(),
      batchNumber: r.batchNumber ?? "",
      veterinarian: r.veterinarian ?? "",
      notes: r.notes ?? "",
      isCompleted: !!r.isCompleted,
    });
    setEditRow(r);
  };
  const submitEdit = () => {
    if (!editRow) return;
    update.mutate({
      id: editRow.id,
      vaccinationDate: editForm.vaccinationDate,
      batchNumber: editForm.batchNumber || undefined,
      veterinarian: editForm.veterinarian || undefined,
      notes: editForm.notes || undefined,
      isCompleted: editForm.isCompleted,
    });
  };

  const rows = (records as any[]) ?? [];
  const columns: Column<any>[] = [
    { id: "animal", header: t("animals.animalId", "Animal"), cell: r => <span className="font-medium">{r.animalIdStr ?? r.animalId}</span>, sortValue: r => r.animalIdStr, primary: true, mobileLabel: t("animals.animalId", "Animal") },
    { id: "vaccine", header: t("vaccine.vaccine", "Vaccine"), cell: r => r.vaccineName ?? "—", sortValue: r => r.vaccineName, mobileLabel: t("vaccine.vaccine", "Vaccine") },
    { id: "date", header: t("vaccine.date", "Date"), cell: r => fmtDate(r.vaccinationDate), sortValue: r => r.vaccinationDate, mobileLabel: t("vaccine.date", "Date") },
    { id: "next", header: t("vaccine.nextDue", "Next due"), cell: r => <DueBadge date={r.nextDueDate} leadDays={r.notifyBeforeNext ?? 7} />, sortValue: r => r.nextDueDate, mobileLabel: t("vaccine.nextDue", "Next due") },
    { id: "booster", header: t("vaccine.booster", "Booster"), cell: r => <DueBadge date={r.boosterDueDate} leadDays={r.notifyBeforeBooster ?? 7} />, hideable: true, mobileLabel: t("vaccine.booster", "Booster") },
    { id: "status", header: t("vaccine.status", "Status"), cell: r => <RecordStatusBadge record={r} />, sortValue: r => (r.isCompleted ? 1 : 0), mobileLabel: t("vaccine.status", "Status") },
    { id: "batch", header: t("vaccine.batch", "Batch"), cell: r => r.batchNumber ?? "—", hideable: true, defaultHidden: true, mobileLabel: t("vaccine.batch", "Batch") },
    { id: "vet", header: t("vaccine.vet", "Vet"), cell: r => r.veterinarian ?? "—", hideable: true, defaultHidden: true, mobileLabel: t("vaccine.vet", "Vet") },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("vaccine.title", "Vaccinations")}
        subtitle={`${rows.length} ${t("vaccine.records", "records")}`}
        crumbs={[{ label: t("nav.dashboard", "Dashboard"), href: "/" }, { label: t("vaccine.title", "Vaccinations") }]}
        actions={
          canCreate ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setBulkOpen(true)} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface">
                <Users className="h-4 w-4" />
                {t("vaccine.bulkApply", "Bulk apply")}
              </button>
              <button onClick={() => { setForm({ ...blank }); setOpen(true); }} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
                <Plus className="h-4 w-4" />
                {t("vaccine.record", "Record vaccination")}
              </button>
            </div>
          ) : undefined
        }
      />

      <DataTable
        data={rows}
        columns={columns}
        rowKey={r => r.id}
        loading={isLoading}
        storageKey="vaccinations"
        rowActions={(canUpdate || canDelete) ? r => (
          <div className="flex items-center justify-end gap-1">
            {canUpdate && (
              <button
                onClick={() => startEdit(r)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"
                aria-label={t("vaccine.editVaccination", "Edit vaccination")}
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => setDeleteRow(r)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger-soft-foreground"
                aria-label={t("vaccine.deleteVaccination", "Delete vaccination")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : undefined}
        empty={<EmptyState icon={Syringe} title={t("vaccine.none", "No vaccination records yet")} />}
      />

      {/* Record */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("vaccine.record", "Record vaccination")}</DialogTitle></DialogHeader>
          <FormSection>
            <FormField label={t("animals.animalId", "Animal")} required>
              <Select value={form.animalId} onValueChange={v => setForm(f => ({ ...f, animalId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>
                  {((animals as any[]) ?? []).map(a => <SelectItem key={a.animal?.id ?? a.id} value={String(a.animal?.id ?? a.id)}>{a.animal?.animalId ?? a.animalId ?? a.label ?? a.id}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("vaccine.vaccine", "Vaccine")} required>
              <Select value={form.vaccineId} onValueChange={v => setForm(f => ({ ...f, vaccineId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                <SelectContent>
                  {((vaccines as any[]) ?? []).map(v => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("vaccine.date", "Date")} required>
              <Input type="date" value={form.vaccinationDate} onChange={e => setForm(f => ({ ...f, vaccinationDate: e.target.value }))} />
            </FormField>
            <FormField label={t("vaccine.batch", "Batch number")}>
              <Input value={form.batchNumber} onChange={e => setForm(f => ({ ...f, batchNumber: e.target.value }))} />
            </FormField>
            <FormField label={t("vaccine.vet", "Veterinarian")}>
              <Input value={form.veterinarian} onChange={e => setForm(f => ({ ...f, veterinarian: e.target.value }))} />
            </FormField>
            <FormField label={t("vaccine.notifyBeforeNext", "Remind before next dose (days)")} hint={t("vaccine.notifyBeforeHint", "Days before the due date to raise a reminder.")}>
              <Input type="number" min={0} max={365} value={form.notifyBeforeNext} onChange={e => setForm(f => ({ ...f, notifyBeforeNext: e.target.value }))} />
            </FormField>
            {selectedVaccine?.boosterRequired && (
              <FormField label={t("vaccine.notifyBeforeBooster", "Remind before booster (days)")} hint={t("vaccine.notifyBeforeHint", "Days before the due date to raise a reminder.")}>
                <Input type="number" min={0} max={365} value={form.notifyBeforeBooster} onChange={e => setForm(f => ({ ...f, notifyBeforeBooster: e.target.value }))} />
              </FormField>
            )}
            <FormField label={t("vaccine.notes", "Notes")} full>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </FormField>
          </FormSection>
          <FormFooter>
            <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button disabled={add.isPending} onClick={() => submit(true)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface disabled:opacity-50">{t("common.saveAddAnother", "Save & add another")}</button>
            <button disabled={add.isPending} onClick={() => submit(false)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{t("common.save", "Save")}</button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      {/* Edit (animal + vaccine locked, same as Old) */}
      <Dialog open={editRow !== null} onOpenChange={o => !o && setEditRow(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("vaccine.editVaccination", "Edit vaccination")} · {editRow?.animalIdStr ?? ""} · {editRow?.vaccineName ?? ""}</DialogTitle>
          </DialogHeader>
          <FormSection>
            <FormField label={t("vaccine.date", "Date")} required>
              <Input type="date" value={editForm.vaccinationDate} onChange={e => setEditForm(f => ({ ...f, vaccinationDate: e.target.value }))} />
            </FormField>
            <FormField label={t("vaccine.batch", "Batch number")}>
              <Input value={editForm.batchNumber} onChange={e => setEditForm(f => ({ ...f, batchNumber: e.target.value }))} />
            </FormField>
            <FormField label={t("vaccine.vet", "Veterinarian")}>
              <Input value={editForm.veterinarian} onChange={e => setEditForm(f => ({ ...f, veterinarian: e.target.value }))} />
            </FormField>
            <FormField label={t("vaccine.notes", "Notes")} full>
              <Textarea rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </FormField>
            <FormField label={t("vaccine.status", "Status")} full>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={editForm.isCompleted}
                  onChange={e => setEditForm(f => ({ ...f, isCompleted: e.target.checked }))}
                />
                {t("vaccine.isCompleted", "Mark as completed")}
              </label>
            </FormField>
          </FormSection>
          <FormFooter>
            <button onClick={() => setEditRow(null)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button disabled={update.isPending} onClick={submitEdit} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {update.isPending ? t("common.saving", "Saving...") : t("common.save", "Save")}
            </button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <ConsequenceConfirm
        open={deleteRow !== null}
        onOpenChange={o => !o && setDeleteRow(null)}
        title={t("vaccine.deleteVaccination", "Delete vaccination")}
        description={t("vaccine.deleteVaccinationConfirm", "Delete the {{vaccine}} record for {{animal}}? This cannot be undone.", {
          animal: deleteRow?.animalIdStr ?? "",
          vaccine: deleteRow?.vaccineName ?? "",
        })}
        consequences={[
          { text: t("vaccine.deletePermanentHint", "This record is removed permanently — it does not go to the Recycle Bin."), tone: "danger" },
          { text: t("vaccine.deleteReminderHint", "Its due-date reminders are removed too."), tone: "warning" },
        ]}
        confirmLabel={t("common.delete", "Delete")}
        cancelLabel={t("common.cancel", "Cancel")}
        destructive
        loading={remove.isPending}
        onConfirm={() => deleteRow && remove.mutate({ id: deleteRow.id })}
      />

      <BulkApplyDialog open={bulkOpen} onOpenChange={setBulkOpen} />
    </div>
  );
}
