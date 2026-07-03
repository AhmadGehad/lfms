import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";
import { Baby, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge, type StatusTone } from "../components/StatusBadge";
import { ConsequenceConfirm } from "../components/ConsequenceConfirm";
import { FormSection, FormField, FormFooter } from "../components/FormLayout";

type PregnancyStatusFilter = "all" | "active" | "delivered" | "aborted" | "lost";
type PregnancyStatus = Exclude<PregnancyStatusFilter, "all">;

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

function statusTone(displayStatus?: string, recordStatus?: string): StatusTone {
  const value = (displayStatus || recordStatus || "").toLowerCase();
  if (value === "delivered") return "success";
  if (value === "due") return "warning";
  if (value === "overdue") return "danger";
  if (value === "aborted" || value === "lost") return "neutral";
  return "info";
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

export function PregnancyPanel({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const { ownerParam } = useOwnerFilter();
  const perms = usePermissions();
  const canCreate = perms.can("pregnancy", "create");
  const canUpdate = perms.can("pregnancy", "update");
  const canDelete = perms.can("pregnancy", "delete");
  const utils = trpc.useUtils();

  const [filterStatus, setFilterStatus] = useState<PregnancyStatusFilter>("all");
  const { data: pregnancies, isLoading } = trpc.pregnancy.list.useQuery({
    ownerId: ownerParam,
    status: filterStatus === "all" ? undefined : filterStatus,
  });
  const { data: summary } = trpc.pregnancy.summary.useQuery({ ownerId: ownerParam });
  const { data: females } = trpc.animals.lookup.useQuery({ isActive: true, sex: "female" });
  const { data: males } = trpc.animals.lookup.useQuery({ isActive: true, sex: "male" });

  const blank = {
    animalId: "",
    sireId: "none",
    confirmationDate: today(),
    notifyBeforeDue: "7",
    checkupDate: "",
    notifyBeforeCheckup: "3",
    notes: "",
  };
  const blankEdit = {
    confirmationDate: "",
    sireId: "none",
    status: "active" as PregnancyStatus,
    notifyBeforeDue: "7",
    checkupDate: "",
    notifyBeforeCheckup: "3",
    notes: "",
  };

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [editRow, setEditRow] = useState<any | null>(null);
  const [editForm, setEditForm] = useState(blankEdit);
  const [delRow, setDelRow] = useState<any | null>(null);

  const femaleRows = ((females as any[]) ?? []).filter((row: any) => animalValue(row));
  const maleRows = ((males as any[]) ?? []).filter((row: any) => animalValue(row));
  const rows = (pregnancies as any[]) ?? [];

  const invalidate = () => {
    utils.pregnancy.list.invalidate();
    utils.pregnancy.summary.invalidate();
  };

  const create = trpc.pregnancy.create.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("pregnancy.confirmed", "Pregnancy confirmed"));
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const update = trpc.pregnancy.update.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("pregnancy.updated", "Pregnancy updated"));
      setEditRow(null);
    },
    onError: e => toast.error(e.message),
  });
  const del = trpc.pregnancy.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("pregnancy.deleted", "Record removed"));
      setDelRow(null);
    },
    onError: e => {
      toast.error(e.message);
      setDelRow(null);
    },
  });

  const startCreate = () => {
    setForm({ ...blank });
    setOpen(true);
  };

  const startEdit = (row: any) => {
    const record = row.record ?? row;
    setEditForm({
      confirmationDate: fmtDateInput(record.confirmationDate),
      sireId: record.sireId ? String(record.sireId) : "none",
      status: (record.status ?? "active") as PregnancyStatus,
      notifyBeforeDue: String(record.notifyBeforeDue ?? 7),
      checkupDate: fmtDateInput(record.checkupDate),
      notifyBeforeCheckup: String(record.notifyBeforeCheckup ?? 3),
      notes: record.notes ?? "",
    });
    setEditRow(row);
  };

  const submit = () => {
    if (!form.animalId || !form.confirmationDate) {
      toast.error(t("pregnancy.pickAnimal", "Pick the dam and confirmation date"));
      return;
    }
    create.mutate({
      animalId: Number(form.animalId),
      confirmationDate: form.confirmationDate,
      sireId: form.sireId !== "none" ? Number(form.sireId) : undefined,
      notifyBeforeDue: form.notifyBeforeDue ? Number(form.notifyBeforeDue) : undefined,
      checkupDate: form.checkupDate || undefined,
      notifyBeforeCheckup: form.notifyBeforeCheckup ? Number(form.notifyBeforeCheckup) : undefined,
      notes: form.notes || undefined,
    });
  };

  const submitEdit = () => {
    if (!editRow) return;
    const record = editRow.record ?? editRow;
    update.mutate({
      id: record.id,
      confirmationDate: editForm.confirmationDate || undefined,
      sireId: editForm.sireId !== "none" ? Number(editForm.sireId) : null,
      status: editForm.status,
      notifyBeforeDue: editForm.notifyBeforeDue ? Number(editForm.notifyBeforeDue) : undefined,
      checkupDate: editForm.checkupDate || null,
      notifyBeforeCheckup: editForm.notifyBeforeCheckup ? Number(editForm.notifyBeforeCheckup) : undefined,
      notes: editForm.notes,
      completedDate: editForm.status !== "active" && record.status === "active" ? today() : undefined,
    });
  };

  const markDelivered = (row: any) => {
    const record = row.record ?? row;
    update.mutate({ id: record.id, status: "delivered", completedDate: today() });
  };

  const summaryCards = [
    { label: t("pregnancy.summaryActive", "Active"), value: summary?.active ?? rows.filter(p => p.record?.status === "active").length, className: "text-info-soft-foreground" },
    { label: t("pregnancy.summaryDueSoon", "Due soon"), value: summary?.dueSoon ?? rows.filter(p => p.displayStatus === "due").length, className: "text-warning-soft-foreground" },
    { label: t("pregnancy.summaryOverdue", "Overdue"), value: summary?.overdue ?? rows.filter(p => p.displayStatus === "overdue").length, className: "text-danger-soft-foreground" },
    { label: t("pregnancy.summaryDelivered", "Delivered"), value: summary?.delivered ?? rows.filter(p => p.record?.status === "delivered").length, className: "text-success-soft-foreground" },
  ];

  const columns: Column<any>[] = [
    {
      id: "animal",
      header: t("pregnancy.animal", "Animal"),
      cell: p => (
        <span>
          <span className="block font-mono font-semibold text-primary">{p.animalCode}</span>
          {p.ownerName ? <span className="block text-xs text-muted-foreground">{p.ownerName}</span> : null}
        </span>
      ),
      sortValue: p => p.animalCode,
      primary: true,
      mobileLabel: t("pregnancy.animal", "Animal"),
    },
    { id: "confirmed", header: t("pregnancy.confirmationDate", "Confirmation date"), cell: p => fmtDate(p.record?.confirmationDate), sortValue: p => p.record?.confirmationDate, hideable: true, mobileLabel: t("pregnancy.confirmationDate", "Confirmation date") },
    { id: "due", header: t("pregnancy.dueDate", "Due date"), cell: p => <span className="font-medium">{fmtDate(p.record?.expectedDueDate)}</span>, sortValue: p => p.record?.expectedDueDate, mobileLabel: t("pregnancy.dueDate", "Due date") },
    { id: "daysPregnant", header: t("pregnancy.daysPregnant", "Days pregnant"), cell: p => p.daysPregnant ?? "-", sortValue: p => p.daysPregnant, hideable: true, align: "end", mobileLabel: t("pregnancy.daysPregnant", "Days pregnant") },
    {
      id: "remaining",
      header: t("pregnancy.daysRemaining", "Days remaining"),
      cell: p => p.record?.status === "active" ? (
        <span className={p.daysRemaining < 0 ? "font-medium text-danger-soft-foreground" : ""}>{p.daysRemaining ?? "-"}</span>
      ) : "-",
      sortValue: p => p.daysRemaining,
      hideable: true,
      align: "end",
      mobileLabel: t("pregnancy.daysRemaining", "Days remaining"),
    },
    {
      id: "progress",
      header: t("pregnancy.progress", "Progress"),
      cell: p => p.record?.status === "active" ? (
        <div className="flex min-w-32 items-center gap-2">
          <Progress value={Math.min(100, p.progressPct ?? 0)} className="h-1.5 flex-1" />
          <span className="w-9 text-xs tabular-nums text-muted-foreground">{p.progressPct ?? 0}%</span>
        </div>
      ) : <span className="text-muted-foreground">-</span>,
      hideable: true,
      mobileLabel: t("pregnancy.progress", "Progress"),
    },
    {
      id: "status",
      header: t("pregnancy.status", "Status"),
      cell: p => {
        const status = p.displayStatus ?? p.record?.status ?? "-";
        return <StatusBadge tone={statusTone(p.displayStatus, p.record?.status)}>{String(t(`pregnancy.${status}`, status))}</StatusBadge>;
      },
      sortValue: p => p.displayStatus ?? p.record?.status,
      mobileLabel: t("pregnancy.status", "Status"),
    },
    { id: "owner", header: t("animals.owner", "Owner"), cell: p => p.ownerName ?? "-", sortValue: p => p.ownerName, hideable: true, defaultHidden: true, mobileLabel: t("animals.owner", "Owner") },
    { id: "species", header: t("animals.species", "Species"), cell: p => p.speciesName ?? "-", sortValue: p => p.speciesName, hideable: true, defaultHidden: true, mobileLabel: t("animals.species", "Species") },
    { id: "checkup", header: t("pregnancy.checkupDate", "Checkup date"), cell: p => fmtDate(p.record?.checkupDate), sortValue: p => p.record?.checkupDate, hideable: true, defaultHidden: true, mobileLabel: t("pregnancy.checkupDate", "Checkup date") },
    { id: "notes", header: t("pregnancy.notes", "Notes"), cell: p => p.record?.notes ?? "-", hideable: true, defaultHidden: true, mobileLabel: t("pregnancy.notes", "Notes") },
  ];

  const createButton = canCreate ? (
    <button type="button" onClick={startCreate} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
      <Plus className="h-4 w-4" />
      {t("pregnancy.confirm", "Confirm pregnancy")}
    </button>
  ) : null;

  return (
    <div className={embedded ? "" : "p-4 md:p-6"}>
      {!embedded && (
        <PageHeader
          title={t("pregnancy.title", "Pregnancy Tracking")}
          subtitle={t("pregnancy.subtitle", "Track active pregnancies, due dates and outcomes")}
          crumbs={[{ label: t("nav.dashboard", "Dashboard"), href: "/" }, { label: t("pregnancy.title", "Pregnancy Tracking") }]}
          actions={createButton}
        />
      )}

      {embedded && createButton && <div className="mb-4 flex justify-end">{createButton}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {summaryCards.map(card => (
          <div key={card.label} className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${card.className}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <DataTable
        data={rows}
        columns={columns}
        rowKey={p => p.record?.id}
        loading={isLoading}
        storageKey="pregnancy"
        toolbar={
          <Select value={filterStatus} onValueChange={value => setFilterStatus(value as PregnancyStatusFilter)}>
            <SelectTrigger className="h-9 w-48"><SelectValue placeholder={t("pregnancy.status", "Status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("pregnancy.allStatuses", "All statuses")}</SelectItem>
              <SelectItem value="active">{t("pregnancy.active", "Active")}</SelectItem>
              <SelectItem value="delivered">{t("pregnancy.delivered", "Delivered")}</SelectItem>
              <SelectItem value="aborted">{t("pregnancy.aborted", "Aborted")}</SelectItem>
              <SelectItem value="lost">{t("pregnancy.lost", "Lost")}</SelectItem>
            </SelectContent>
          </Select>
        }
        rowActions={(canUpdate || canDelete) ? p => (
          <div className="flex items-center justify-end gap-1">
            {canUpdate && p.record?.status === "active" && (
              <button type="button" onClick={() => markDelivered(p)} title={t("pregnancy.markDelivered", "Mark delivered")} className="grid h-8 w-8 place-items-center rounded-md border border-border text-success-soft-foreground hover:bg-success-soft">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
            )}
            {canUpdate && (
              <button type="button" onClick={() => startEdit(p)} title={t("common.edit", "Edit")} className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-surface">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={() => setDelRow(p)} title={t("common.delete", "Delete")} className="grid h-8 w-8 place-items-center rounded-md border border-border text-danger-soft-foreground hover:bg-danger-soft">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : undefined}
        empty={<EmptyState icon={Baby} title={t("pregnancy.noRecords", "No pregnancy records yet")} />}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("pregnancy.confirm", "Confirm pregnancy")}</DialogTitle></DialogHeader>
          <FormSection>
            <FormField label={t("pregnancy.animal", "Dam")} htmlFor="pregnancy-animal" required>
              <Select value={form.animalId} onValueChange={v => setForm(f => ({ ...f, animalId: v }))}>
                <SelectTrigger id="pregnancy-animal"><SelectValue placeholder={t("pregnancy.selectFemale", "Select female")} /></SelectTrigger>
                <SelectContent>{femaleRows.map((a: any) => <SelectItem key={animalValue(a)} value={animalValue(a)}>{animalLabel(a)}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t("pregnancy.sire", "Sire")} htmlFor="pregnancy-sire">
              <Select value={form.sireId} onValueChange={v => setForm(f => ({ ...f, sireId: v }))}>
                <SelectTrigger id="pregnancy-sire"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("common.unknown", "Unknown")}</SelectItem>
                  {maleRows.map((a: any) => <SelectItem key={animalValue(a)} value={animalValue(a)}>{animalLabel(a)}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("pregnancy.confirmationDate", "Confirmation date")} htmlFor="pregnancy-confirmation-date" required hint={t("pregnancy.dueHint", "Due date uses species gestation settings.")}>
              <Input id="pregnancy-confirmation-date" name="confirmationDate" type="date" value={form.confirmationDate} onChange={e => setForm(f => ({ ...f, confirmationDate: e.target.value }))} />
            </FormField>
            <FormField label={t("pregnancy.notifyBeforeDue", "Notify before due")} htmlFor="pregnancy-notify-due">
              <Input id="pregnancy-notify-due" name="notifyBeforeDue" type="number" min={0} max={365} value={form.notifyBeforeDue} onChange={e => setForm(f => ({ ...f, notifyBeforeDue: e.target.value }))} />
            </FormField>
            <FormField label={t("pregnancy.checkupDate", "Checkup date")} htmlFor="pregnancy-checkup-date">
              <Input id="pregnancy-checkup-date" name="checkupDate" type="date" value={form.checkupDate} onChange={e => setForm(f => ({ ...f, checkupDate: e.target.value }))} />
            </FormField>
            <FormField label={t("pregnancy.notifyBeforeCheckup", "Notify before checkup")} htmlFor="pregnancy-notify-checkup">
              <Input id="pregnancy-notify-checkup" name="notifyBeforeCheckup" type="number" min={0} max={365} value={form.notifyBeforeCheckup} onChange={e => setForm(f => ({ ...f, notifyBeforeCheckup: e.target.value }))} />
            </FormField>
            <FormField label={t("pregnancy.notes", "Notes")} htmlFor="pregnancy-notes" full>
              <Textarea id="pregnancy-notes" name="notes" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </FormField>
          </FormSection>
          <FormFooter>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button type="button" disabled={create.isPending} onClick={submit} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{t("common.save", "Save")}</button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editRow !== null} onOpenChange={open => !open && setEditRow(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("pregnancy.edit", "Edit pregnancy")}</DialogTitle></DialogHeader>
          <FormSection>
            <FormField label={t("pregnancy.confirmationDate", "Confirmation date")} htmlFor="edit-pregnancy-confirmation-date">
              <Input id="edit-pregnancy-confirmation-date" name="confirmationDate" type="date" value={editForm.confirmationDate} onChange={e => setEditForm(f => ({ ...f, confirmationDate: e.target.value }))} />
            </FormField>
            <FormField label={t("pregnancy.status", "Status")} htmlFor="edit-pregnancy-status">
              <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v as PregnancyStatus }))}>
                <SelectTrigger id="edit-pregnancy-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t("pregnancy.active", "Active")}</SelectItem>
                  <SelectItem value="delivered">{t("pregnancy.delivered", "Delivered")}</SelectItem>
                  <SelectItem value="aborted">{t("pregnancy.aborted", "Aborted")}</SelectItem>
                  <SelectItem value="lost">{t("pregnancy.lost", "Lost")}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("pregnancy.sire", "Sire")} htmlFor="edit-pregnancy-sire">
              <Select value={editForm.sireId} onValueChange={v => setEditForm(f => ({ ...f, sireId: v }))}>
                <SelectTrigger id="edit-pregnancy-sire"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("common.unknown", "Unknown")}</SelectItem>
                  {maleRows.map((a: any) => <SelectItem key={animalValue(a)} value={animalValue(a)}>{animalLabel(a)}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("pregnancy.notifyBeforeDue", "Notify before due")} htmlFor="edit-pregnancy-notify-due">
              <Input id="edit-pregnancy-notify-due" name="notifyBeforeDue" type="number" min={0} max={365} value={editForm.notifyBeforeDue} onChange={e => setEditForm(f => ({ ...f, notifyBeforeDue: e.target.value }))} />
            </FormField>
            <FormField label={t("pregnancy.checkupDate", "Checkup date")} htmlFor="edit-pregnancy-checkup-date">
              <Input id="edit-pregnancy-checkup-date" name="checkupDate" type="date" value={editForm.checkupDate} onChange={e => setEditForm(f => ({ ...f, checkupDate: e.target.value }))} />
            </FormField>
            <FormField label={t("pregnancy.notifyBeforeCheckup", "Notify before checkup")} htmlFor="edit-pregnancy-notify-checkup">
              <Input id="edit-pregnancy-notify-checkup" name="notifyBeforeCheckup" type="number" min={0} max={365} value={editForm.notifyBeforeCheckup} onChange={e => setEditForm(f => ({ ...f, notifyBeforeCheckup: e.target.value }))} />
            </FormField>
            <FormField label={t("pregnancy.notes", "Notes")} htmlFor="edit-pregnancy-notes" full>
              <Textarea id="edit-pregnancy-notes" name="notes" rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </FormField>
          </FormSection>
          <FormFooter>
            <button type="button" onClick={() => setEditRow(null)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button type="button" disabled={update.isPending} onClick={submitEdit} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{t("common.save", "Save")}</button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      <ConsequenceConfirm
        open={delRow !== null}
        onOpenChange={open => !open && setDelRow(null)}
        title={t("pregnancy.deleteTitle", "Remove this pregnancy record?")}
        description={delRow ? `${delRow.animalCode}` : ""}
        consequences={[{ text: t("pregnancy.deleteConsequence", "Soft-deleted and recoverable from the Recycle Bin."), tone: "warning" }]}
        confirmLabel={t("common.delete", "Delete")}
        destructive
        loading={del.isPending}
        onConfirm={() => delRow && del.mutate({ id: delRow.record.id })}
      />
    </div>
  );
}

export default function NewPregnancy() {
  return <PregnancyPanel />;
}
