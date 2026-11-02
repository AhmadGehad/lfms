import { keepPreviousData } from "@tanstack/react-query";
import { ALL_WEEKDAYS, isFinished, isYesNoReport } from "@shared/tasks";
import { ClipboardList, ListChecks, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCurrency } from "@/hooks/useCurrency";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";
import { sortTasks } from "@/worker/TaskList";
import { stockNeeds, taskTitle } from "@/worker/taskText";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../../server/routers";
import { ConsequenceConfirm } from "../components/ConsequenceConfirm";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { FormField, FormFooter, FormValidation } from "../components/FormLayout";
import { PageHeader } from "../components/PageHeader";
import { PageTabsList, PageTabsTrigger } from "../components/PageTabs";
import { StatusBadge, type StatusTone } from "../components/StatusBadge";
import { fmtDate, fmtDateTime } from "../lib/format";
import { useOneShotParams } from "../lib/useOneShotParams";

type Outputs = inferRouterOutputs<AppRouter>["tasks"];
type TaskRow = Outputs["overview"]["tasks"][number];
type TemplateRow = Outputs["listTemplates"][number];
type WorkerRow = Outputs["listWorkers"][number];
type ReportRow = Outputs["listReports"][number];

const NO_ANIMAL = "none";
const PRIMARY_BUTTON = "rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50";
const PLAIN_BUTTON = "rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface";
const ICON_BUTTON = "grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

type TabProps = { creating: boolean; onCreatingChange: (creating: boolean) => void };

function useOverview() {
  return trpc.tasks.overview.useQuery(undefined, { refetchInterval: 60_000, placeholderData: keepPreviousData });
}

function useErrorText() {
  const { t } = useTranslation();
  return (message: string) => {
    if (message === "WORKER_NAME_TAKEN") return t("tasks.nameTaken", "A worker with this name already exists.");
    if (message === "FARM_SELECTION_REQUIRED") return t("tasks.chooseFarm", "Choose a farm first, from the switcher at the top.");
    if (message === "ANIMAL_NOT_MATCHED") return t("tasks.reportNoMatch", "No animal with this number");
    if (message === "REPORT_BEFORE_ANIMAL") return t("tasks.reportBeforeAnimal", "This animal arrived after the report's date, so it can't be the same one. Use the Animals page if it died.");
    if (message === "ANIMAL_MATCH_CHANGED") return t("tasks.reportMatchChanged", "That number now matches a different animal. Check it and try again.");
    if (message === "ANIMAL_ALREADY_OUT") return t("tasks.reportAlreadyOut", "Already out of the herd");
    if (message === "DEAD_STATUS_NOT_EXIT") return t("tasks.deadStatusNotExit", "Your \"Dead\" status isn't marked as an exit status. Change it in Configuration.");
    return message;
  };
}

/** Missed: a repeating chore whose day passed unfinished. It won't come back, so say so. */
function isMissed(task: TaskRow, today: string) {
  return task.source === "template" && task.dueDate < today && !isFinished(task.status);
}

/** Status, with the reason underneath when a worker couldn't do it. */
function TaskStatus({ task, today }: { task: TaskRow; today: string }) {
  const { t } = useTranslation();
  if (isMissed(task, today)) return <StatusBadge tone="danger">{t("tasks.missed", "Missed")}</StatusBadge>;
  const tone: Record<TaskRow["status"], StatusTone> = { todo: "neutral", started: "info", done: "success", blocked: "warning" };
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge tone={tone[task.status]}>{t(`worker.status.${task.status}`)}</StatusBadge>
      {task.blockedReason && <span className="text-xs text-muted-foreground">{t(`worker.reason.${task.blockedReason}`)}</span>}
    </div>
  );
}

/** Name over time, on two lines: a Latin date beside an Arabic name reorders badly on one. */
function WhoAndWhen({ task }: { task: TaskRow }) {
  const name = task.finishedByName ?? task.startedByName;
  const when = task.finishedByName ? task.finishedAt : task.startedAt;
  if (!name) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col">
      <span className="text-foreground">{name}</span>
      <span className="self-start text-xs tabular-nums text-muted-foreground" dir="ltr">{fmtDateTime(when)}</span>
    </div>
  );
}

type TaskForm = { title: string; notes: string; animalId: string; dueDate: string };

function TaskDialog({
  open,
  onOpenChange,
  editing,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: TaskRow | null;
  today: string;
}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const errorText = useErrorText();
  const animals = trpc.animals.list.useQuery({ isActive: true }, { enabled: open, staleTime: 60_000 });
  const blank: TaskForm = { title: "", notes: "", animalId: NO_ANIMAL, dueDate: today };
  const [form, setForm] = useState<TaskForm>(blank);
  const [attempt, setAttempt] = useState(0);
  // Reseed when the dialog opens, without an effect.
  const seedKey = open ? `open:${editing?.id ?? "new"}` : "closed";
  const [seededFor, setSeededFor] = useState(seedKey);
  if (seededFor !== seedKey) {
    setSeededFor(seedKey);
    setAttempt(0);
    setForm(editing
      ? { title: editing.title, notes: editing.notes ?? "", animalId: editing.animalId ? String(editing.animalId) : NO_ANIMAL, dueDate: editing.dueDate }
      : blank);
  }

  const onSuccess = () => {
    void utils.tasks.overview.invalidate();
    onOpenChange(false);
    toast.success(t("tasks.saved", "Saved"));
  };
  const onError = (error: { message: string }) => toast.error(errorText(error.message));
  const create = trpc.tasks.create.useMutation({ onSuccess, onError });
  const update = trpc.tasks.update.useMutation({ onSuccess, onError });
  const saving = create.isPending || update.isPending;

  const submit = () => {
    if (!form.title.trim() || !form.dueDate) {
      setAttempt(count => count + 1);
      return;
    }
    const payload = {
      title: form.title,
      notes: form.notes.trim() || null,
      animalId: form.animalId === NO_ANIMAL ? null : Number(form.animalId),
      dueDate: form.dueDate,
    };
    if (editing) update.mutate({ ...payload, id: editing.id, expectedVersion: editing.version });
    else create.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto pb-0 sm:max-w-lg">
        <DialogHeader><DialogTitle>{editing ? t("tasks.edit", "Edit task") : t("tasks.add", "Add task")}</DialogTitle></DialogHeader>
        <FormValidation attempt={attempt} className="flex flex-col gap-4">
          <FormField label={t("tasks.taskTitle", "What needs doing?")} required>
            <Input value={form.title} maxLength={200} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </FormField>
          <FormField label={t("tasks.note", "Note for the worker")}>
            <Textarea value={form.notes} maxLength={2000} rows={3} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </FormField>
          <FormField label={t("tasks.animal", "Animal")}>
            <Select value={form.animalId} onValueChange={animalId => setForm(f => ({ ...f, animalId }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ANIMAL}>{t("tasks.noAnimal", "No specific animal")}</SelectItem>
                {((animals.data as Array<{ animal: { id: number; animalId: string } }>) ?? []).map(({ animal }) => (
                  <SelectItem key={animal.id} value={String(animal.id)}>{animal.animalId}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("tasks.date", "Date")} required>
            <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
          </FormField>
        </FormValidation>
        <FormFooter>
          <button onClick={() => onOpenChange(false)} className={PLAIN_BUTTON}>{t("common.cancel", "Cancel")}</button>
          <button disabled={saving} onClick={submit} className={PRIMARY_BUTTON}>{t("common.save", "Save")}</button>
        </FormFooter>
      </DialogContent>
    </Dialog>
  );
}

function TodayTab({ creating, onCreatingChange }: TabProps) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const perms = usePermissions("tasks");
  const overview = useOverview();
  const today = overview.data?.date ?? "";
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [deleting, setDeleting] = useState<TaskRow | null>(null);

  const remove = trpc.tasks.delete.useMutation({
    onSuccess: () => { void utils.tasks.overview.invalidate(); setDeleting(null); toast.success(t("tasks.deleted", "Deleted")); },
    onError: error => toast.error(error.message),
  });

  const columns: Column<TaskRow>[] = [
    { id: "title", header: t("tasks.task", "Task"), primary: true, cell: task => (
      <span className="font-medium text-foreground">{taskTitle(t, task)}</span>
    ) },
    { id: "status", header: t("tasks.status", "Status"), mobileLabel: t("tasks.status", "Status"), cell: task => <TaskStatus task={task} today={today} /> },
    { id: "who", header: t("tasks.who", "Who and when"), mobileLabel: t("tasks.who", "Who and when"), cell: task => <WhoAndWhen task={task} /> },
    { id: "date", header: t("tasks.date", "Date"), mobileLabel: t("tasks.date", "Date"), sortValue: task => task.dueDate, cell: task => <span className="tabular-nums">{fmtDate(task.dueDate)}</span> },
  ];

  return (
    <>
      <DataTable
        data={sortTasks(overview.data?.tasks ?? [])}
        columns={columns}
        rowKey={task => task.id}
        loading={overview.isLoading}
        storageKey="tasks-today"
        rowActions={task => (
          <div className="flex justify-end gap-1">
            {perms.canUpdate && task.source === "manual" && (
              <button onClick={() => setEditing(task)} className={ICON_BUTTON} aria-label={t("tasks.edit", "Edit task")} title={t("tasks.edit", "Edit task")}>
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {perms.canDelete && (
              <button onClick={() => setDeleting(task)} className={ICON_BUTTON} aria-label={t("tasks.delete", "Delete task")} title={t("tasks.delete", "Delete task")}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        empty={<EmptyState icon={ListChecks} title={t("tasks.none", "No tasks today")} description={t("tasks.noneHint", "Add a task, or a repeating one for daily chores. Vaccinations that fall due appear here by themselves.")} />}
      />
      <TaskDialog open={creating || editing !== null} onOpenChange={open => { if (!open) { onCreatingChange(false); setEditing(null); } }} editing={editing} today={today} />
      <ConsequenceConfirm
        open={deleting !== null}
        onOpenChange={open => { if (!open) setDeleting(null); }}
        title={t("tasks.deleteTitle", "Delete this task?")}
        description={deleting ? taskTitle(t, deleting) : undefined}
        consequences={[{ text: t("tasks.deleteConsequence", "It disappears from the tablet straight away."), tone: "warning" }]}
        confirmLabel={t("tasks.deleteConfirm", "Delete")}
        destructive
        loading={remove.isPending}
        onConfirm={() => { if (deleting) remove.mutate({ id: deleting.id, expectedVersion: deleting.version }); }}
      />
    </>
  );
}

/** Sunday-first in storage, shown in the visitor's language. */
function weekdayName(day: number, language: string, width: "short" | "long" = "short") {
  // 2023-01-01 was a Sunday.
  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-GB", { weekday: width, timeZone: "UTC" })
    .format(new Date(Date.UTC(2023, 0, 1 + day)));
}

function describeWeekdays(mask: number, language: string, everyDay: string) {
  if (mask === ALL_WEEKDAYS) return everyDay;
  return [0, 1, 2, 3, 4, 5, 6].filter(day => mask & (1 << day)).map(day => weekdayName(day, language)).join(language === "ar" ? "، " : ", ");
}

function WeekdayPicker({ value, onChange }: { value: number; onChange: (mask: number) => void }) {
  const { i18n } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5">
      {[0, 1, 2, 3, 4, 5, 6].map(day => {
        const on = (value & (1 << day)) !== 0;
        return (
          <button
            key={day}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(value ^ (1 << day))}
            className={`min-h-11 min-w-14 rounded-lg border px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring sm:min-h-9 ${on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-surface"}`}
          >
            {weekdayName(day, i18n.language)}
          </button>
        );
      })}
    </div>
  );
}

function TemplateDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (open: boolean) => void; editing: TemplateRow | null }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const errorText = useErrorText();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [weekdays, setWeekdays] = useState(ALL_WEEKDAYS);
  const [attempt, setAttempt] = useState(0);
  const seedKey = open ? `open:${editing?.id ?? "new"}` : "closed";
  const [seededFor, setSeededFor] = useState(seedKey);
  if (seededFor !== seedKey) {
    setSeededFor(seedKey);
    setAttempt(0);
    setTitle(editing?.title ?? "");
    setNotes(editing?.notes ?? "");
    setWeekdays(editing?.weekdays ?? ALL_WEEKDAYS);
  }
  const onSuccess = () => {
    void utils.tasks.listTemplates.invalidate();
    void utils.tasks.overview.invalidate();
    onOpenChange(false);
    toast.success(t("tasks.saved", "Saved"));
  };
  const onError = (error: { message: string }) => toast.error(errorText(error.message));
  const create = trpc.tasks.createTemplate.useMutation({ onSuccess, onError });
  const update = trpc.tasks.updateTemplate.useMutation({ onSuccess, onError });

  const submit = () => {
    if (!title.trim() || weekdays === 0) {
      setAttempt(count => count + 1);
      return;
    }
    const payload = { title, notes: notes.trim() || null, weekdays };
    if (editing) update.mutate({ ...payload, id: editing.id, expectedVersion: editing.version, isActive: editing.isActive });
    else create.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto pb-0 sm:max-w-lg">
        <DialogHeader><DialogTitle>{editing ? t("tasks.editRepeating", "Edit repeating task") : t("tasks.addRepeating", "Add repeating task")}</DialogTitle></DialogHeader>
        <FormValidation attempt={attempt} className="flex flex-col gap-4">
          <FormField label={t("tasks.taskTitle", "What needs doing?")} required>
            <Input value={title} maxLength={200} onChange={e => setTitle(e.target.value)} />
          </FormField>
          <FormField label={t("tasks.note", "Note for the worker")}>
            <Textarea value={notes} maxLength={2000} rows={3} onChange={e => setNotes(e.target.value)} />
          </FormField>
          <FormField
            label={t("tasks.onDays", "On which days?")}
            error={attempt > 0 && weekdays === 0 ? t("tasks.pickDay", "Pick at least one day.") : undefined}
          >
            <WeekdayPicker value={weekdays} onChange={setWeekdays} />
          </FormField>
        </FormValidation>
        <FormFooter>
          <button onClick={() => onOpenChange(false)} className={PLAIN_BUTTON}>{t("common.cancel", "Cancel")}</button>
          <button disabled={create.isPending || update.isPending} onClick={submit} className={PRIMARY_BUTTON}>{t("common.save", "Save")}</button>
        </FormFooter>
      </DialogContent>
    </Dialog>
  );
}

function RepeatingTab({ creating, onCreatingChange }: TabProps) {
  const { t, i18n } = useTranslation();
  const { canUpdate, canDelete } = usePermissions("tasks");
  const utils = trpc.useUtils();
  const templates = trpc.tasks.listTemplates.useQuery();
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [deleting, setDeleting] = useState<TemplateRow | null>(null);
  const refresh = () => { void utils.tasks.listTemplates.invalidate(); void utils.tasks.overview.invalidate(); };
  const toggle = trpc.tasks.updateTemplate.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const remove = trpc.tasks.deleteTemplate.useMutation({
    onSuccess: () => { refresh(); setDeleting(null); toast.success(t("tasks.deleted", "Deleted")); },
    onError: error => toast.error(error.message),
  });

  const columns: Column<TemplateRow>[] = [
    { id: "title", header: t("tasks.task", "Task"), primary: true, cell: row => <span className="font-medium text-foreground">{row.title}</span> },
    { id: "days", header: t("tasks.days", "Days"), mobileLabel: t("tasks.days", "Days"), cell: row => describeWeekdays(row.weekdays, i18n.language, t("tasks.everyDay", "Every day")) },
    { id: "active", header: t("tasks.active", "Active"), mobileLabel: t("tasks.active", "Active"), cell: row => (
      <Switch
        checked={row.isActive}
        disabled={!canUpdate || toggle.isPending}
        aria-label={t("tasks.active", "Active")}
        onCheckedChange={isActive => toggle.mutate({ id: row.id, expectedVersion: row.version, title: row.title, notes: row.notes, weekdays: row.weekdays, isActive })}
      />
    ) },
  ];

  return (
    <>
      <DataTable
        data={templates.data ?? []}
        columns={columns}
        rowKey={row => row.id}
        loading={templates.isLoading}
        storageKey="tasks-repeating"
        rowActions={row => (
          <div className="flex justify-end gap-1">
            {canUpdate && (
              <button onClick={() => setEditing(row)} className={ICON_BUTTON} aria-label={t("tasks.editRepeating", "Edit repeating task")} title={t("tasks.editRepeating", "Edit repeating task")}>
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {canDelete && (
              <button onClick={() => setDeleting(row)} className={ICON_BUTTON} aria-label={t("tasks.delete", "Delete task")} title={t("tasks.delete", "Delete task")}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        empty={<EmptyState icon={ListChecks} title={t("tasks.noRepeating", "No repeating tasks")} description={t("tasks.noRepeatingHint", "Daily chores like feeding go here, so you only add them once.")} />}
      />
      <TemplateDialog open={creating || editing !== null} onOpenChange={open => { if (!open) { onCreatingChange(false); setEditing(null); } }} editing={editing} />
      <ConsequenceConfirm
        open={deleting !== null}
        onOpenChange={open => { if (!open) setDeleting(null); }}
        title={t("tasks.deleteRepeatingTitle", "Delete this repeating task?")}
        description={deleting?.title}
        consequences={[{ text: t("tasks.deleteRepeatingConsequence", "It stops appearing from tomorrow. Today's task stays on the tablet."), tone: "warning" }]}
        confirmLabel={t("tasks.deleteConfirm", "Delete")}
        destructive
        loading={remove.isPending}
        onConfirm={() => { if (deleting) remove.mutate({ id: deleting.id, expectedVersion: deleting.version }); }}
      />
    </>
  );
}

function WorkerDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (open: boolean) => void; editing: WorkerRow | null }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const errorText = useErrorText();
  const [name, setName] = useState("");
  const [attempt, setAttempt] = useState(0);
  const seedKey = open ? `open:${editing?.id ?? "new"}` : "closed";
  const [seededFor, setSeededFor] = useState(seedKey);
  if (seededFor !== seedKey) {
    setSeededFor(seedKey);
    setAttempt(0);
    setName(editing?.name ?? "");
  }
  const onSuccess = () => {
    void utils.tasks.listWorkers.invalidate();
    onOpenChange(false);
    toast.success(t("tasks.saved", "Saved"));
  };
  const onError = (error: { message: string }) => toast.error(errorText(error.message));
  const create = trpc.tasks.createWorker.useMutation({ onSuccess, onError });
  const update = trpc.tasks.updateWorker.useMutation({ onSuccess, onError });

  const submit = () => {
    if (!name.trim()) {
      setAttempt(count => count + 1);
      return;
    }
    if (editing) update.mutate({ id: editing.id, expectedVersion: editing.version, name, isActive: editing.isActive });
    else create.mutate({ name });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="pb-0 sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? t("tasks.renameWorker", "Rename worker") : t("tasks.addWorker", "Add worker")}</DialogTitle></DialogHeader>
        <FormValidation attempt={attempt} className="flex flex-col gap-4">
          <FormField label={t("tasks.name", "Name")} required>
            <Input value={name} maxLength={80} onChange={e => setName(e.target.value)} />
          </FormField>
        </FormValidation>
        <FormFooter>
          <button onClick={() => onOpenChange(false)} className={PLAIN_BUTTON}>{t("common.cancel", "Cancel")}</button>
          <button disabled={create.isPending || update.isPending} onClick={submit} className={PRIMARY_BUTTON}>{t("common.save", "Save")}</button>
        </FormFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkersTab({ creating, onCreatingChange }: TabProps) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const errorText = useErrorText();
  const { canUpdate } = usePermissions("tasks");
  const workers = trpc.tasks.listWorkers.useQuery();
  const [editing, setEditing] = useState<WorkerRow | null>(null);
  const toggle = trpc.tasks.updateWorker.useMutation({
    onSuccess: () => void utils.tasks.listWorkers.invalidate(),
    onError: error => toast.error(errorText(error.message)),
  });

  const columns: Column<WorkerRow>[] = [
    { id: "name", header: t("tasks.name", "Name"), primary: true, cell: row => <span className="font-medium text-foreground">{row.name}</span> },
    { id: "active", header: t("tasks.onTablet", "On the tablet"), mobileLabel: t("tasks.onTablet", "On the tablet"), cell: row => (
      <Switch
        checked={row.isActive}
        disabled={!canUpdate || toggle.isPending}
        aria-label={`${t("tasks.onTablet", "On the tablet")}: ${row.name}`}
        onCheckedChange={isActive => toggle.mutate({ id: row.id, expectedVersion: row.version, name: row.name, isActive })}
      />
    ) },
  ];

  return (
    <>
      <DataTable
        data={workers.data ?? []}
        columns={columns}
        rowKey={row => row.id}
        loading={workers.isLoading}
        storageKey="tasks-workers"
        rowActions={canUpdate ? row => (
          <div className="flex justify-end">
            <button onClick={() => setEditing(row)} className={ICON_BUTTON} aria-label={t("tasks.renameWorker", "Rename worker")} title={t("tasks.renameWorker", "Rename worker")}>
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        ) : undefined}
        empty={<EmptyState icon={UserRound} title={t("tasks.noWorkers", "No workers yet")} description={t("tasks.noWorkersHint", "Add each worker's name. They pick it on the tablet when they start a task. No password needed.")} />}
      />
      <WorkerDialog open={creating || editing !== null} onOpenChange={open => { if (!open) { onCreatingChange(false); setEditing(null); } }} editing={editing} />
    </>
  );
}

const REPORT_TONES: Record<ReportRow["type"], StatusTone> = {
  animal_dead: "danger",
  animal_sick: "warning",
  stock_needed: "warning",
  doctor_visit: "info",
  purchase: "neutral",
};

/** What the worker said. The tag is as typed, linked only when it matches an animal. */
function ReportDetail({ report }: { report: ReportRow }) {
  const { t, i18n } = useTranslation();
  if (report.stockKinds?.length) return <span className="text-foreground">{stockNeeds(t, report, i18n.language)}</span>;
  if (report.answer !== null) {
    return <span className="text-foreground">{t(report.answer ? "worker.report.yes" : "worker.report.no")}</span>;
  }
  if (report.animalTag) {
    const note = report.confirmedAt
      // Reverted from the audit log: the animal is back, so the report no longer stands.
      ? report.matchedAnimalActive
        ? t("tasks.reportUndone", "Confirmed, then undone")
        : t("tasks.reportConfirmed", { defaultValue: "Confirmed {{date}}", date: fmtDate(report.confirmedAt) })
      : !report.matchedAnimalId
        ? t("tasks.reportNoMatch", "No animal with this number")
        : !report.matchedAnimalActive && report.type === "animal_dead"
          ? t("tasks.reportAlreadyOut", "Already out of the herd")
          : null;
    return (
      <span className="flex flex-col items-start">
        {report.matchedAnimalId ? (
          <Link href={`/animals/${report.matchedAnimalId}`} className="font-medium text-primary underline-offset-2 hover:underline" dir="ltr">
            {report.matchedAnimalTag}
          </Link>
        ) : (
          <span className="font-medium text-foreground" dir="ltr">{report.animalTag}</span>
        )}
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </span>
    );
  }
  const kind = t(`worker.report.kind.${report.purchaseKind}`);
  return <span className="text-foreground">{report.itemName ? `${kind}: ${report.itemName}` : kind}</span>;
}

/** What workers reported from the tablet. Only confirming a death changes a farm record. */
function ReportsTab() {
  const { t, i18n } = useTranslation();
  const utils = trpc.useUtils();
  const { fmt } = useCurrency();
  const { canDelete, canUpdate } = usePermissions("tasks");
  const { canCreate: canExit } = usePermissions("sales");
  const errorText = useErrorText();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const reports = trpc.tasks.listReports.useQuery(
    { from: from || undefined, to: to || undefined },
    { refetchInterval: 60_000, placeholderData: keepPreviousData },
  );
  const status = trpc.tasks.reportStatus.useQuery(undefined, { refetchInterval: 60_000 });
  const [deleting, setDeleting] = useState<ReportRow | null>(null);
  const [confirming, setConfirming] = useState<ReportRow | null>(null);
  const confirm = trpc.tasks.confirmDeath.useMutation({
    onSuccess: () => {
      void utils.tasks.invalidate();
      void utils.animals.invalidate();
      void utils.dashboard.invalidate();
      setConfirming(null);
      toast.success(t("tasks.deathConfirmed", "Marked as dead"));
    },
    onError: error => toast.error(errorText(error.message)),
  });
  const canConfirm = (row: ReportRow) =>
    canUpdate && canExit && row.type === "animal_dead" && !row.confirmedAt && row.matchedAnimalActive;
  const remove = trpc.tasks.deleteReport.useMutation({
    onSuccess: () => {
      void utils.tasks.invalidate();
      setDeleting(null);
      toast.success(t("tasks.deleted", "Deleted"));
    },
    onError: error => toast.error(error.message),
  });

  const columns: Column<ReportRow>[] = [
    { id: "day", header: t("tasks.date", "Date"), mobileLabel: t("tasks.date", "Date"), sortValue: row => row.reportDate, cell: row => <span className="tabular-nums text-foreground" dir="ltr">{fmtDate(row.reportDate)}</span> },
    { id: "type", header: t("tasks.reportType", "Report"), primary: true, cell: row => <StatusBadge tone={REPORT_TONES[row.type]}>{t(`tasks.reportTypes.${row.type}`)}</StatusBadge> },
    { id: "detail", header: t("tasks.reportDetail", "Details"), mobileLabel: t("tasks.reportDetail", "Details"), cell: row => <ReportDetail report={row} /> },
    { id: "amount", header: t("tasks.reportPrice", "Price"), mobileLabel: t("tasks.reportPrice", "Price"), cell: row => row.amount ? <span className="tabular-nums text-foreground">{fmt(Number(row.amount))}</span> : <span className="text-muted-foreground">—</span> },
    { id: "who", header: t("tasks.who", "Who and when"), mobileLabel: t("tasks.who", "Who and when"), cell: row => (
      <div className="flex flex-col">
        <span className="text-foreground">{row.workerName}</span>
        <span className="self-start text-xs tabular-nums text-muted-foreground" dir="ltr">{fmtDateTime(row.createdAt)}</span>
      </div>
    ) },
  ];

  const askedAgain = deleting !== null && deleting.reportDate === status.data?.date && isYesNoReport(deleting.type);

  return (
    <>
      {status.data && (
        <p className={`mb-3 rounded-lg border px-3 py-2 text-sm ${status.data.missing.length > 0 ? "border-warning bg-warning-soft text-warning-soft-foreground" : "border-border bg-card text-foreground"}`} role="status">
          {status.data.missing.length > 0
            ? t("tasks.reportWaiting", {
                defaultValue: "Today's report is still waiting for: {{items}}",
                items: status.data.missing.map(type => t(`tasks.reportTypes.${type}`)).join(i18n.language === "ar" ? "، " : ", "),
              })
            : t("tasks.reportComplete", "Today's report is complete")}
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="reports-from" className="text-xs font-medium text-muted-foreground">{t("tasks.reportFrom", "From")}</label>
          <Input id="reports-from" type="date" dir="ltr" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="reports-to" className="text-xs font-medium text-muted-foreground">{t("tasks.reportTo", "To")}</label>
          <Input id="reports-to" type="date" dir="ltr" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className="w-40" />
        </div>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }} className="h-9 rounded-lg px-3 text-sm font-medium text-primary hover:bg-accent">
            {t("tasks.reportLast30", "Last 30 days")}
          </button>
        )}
      </div>
      <DataTable
        data={reports.data ?? []}
        columns={columns}
        rowKey={row => row.id}
        loading={reports.isLoading}
        storageKey="tasks-reports"
        rowActions={row => (
          <div className="flex items-center justify-end gap-1">
            {canConfirm(row) && (
              <button onClick={() => setConfirming(row)} className={`${PRIMARY_BUTTON} whitespace-nowrap`}>{t("tasks.confirmDeath", "Confirm dead")}</button>
            )}
            {canDelete && !row.confirmedAt && (
              <button onClick={() => setDeleting(row)} className={ICON_BUTTON} aria-label={t("tasks.deleteConfirm", "Delete")} title={t("tasks.deleteConfirm", "Delete")}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        empty={<EmptyState icon={ClipboardList} title={t("tasks.noReports", "No reports yet")} description={t("tasks.noReportsHint", "Reports the workers send from the tablet appear here. They change nothing by themselves. Confirm a death here to take the animal out of the herd.")} />}
      />
      <ConsequenceConfirm
        open={confirming !== null}
        onOpenChange={open => { if (!open) setConfirming(null); }}
        title={t("tasks.confirmDeathTitle", { defaultValue: "Mark {{tag}} as dead?", tag: confirming?.matchedAnimalTag ?? "" })}
        description={confirming ? t("tasks.confirmDeathBy", { defaultValue: "Reported by {{name}} on {{date}}", name: confirming.workerName, date: fmtDate(confirming.reportDate) }) : undefined}
        consequences={[{ text: t("tasks.confirmDeathConsequence", "It leaves the active herd and its open tasks are removed. You can undo the exit from the audit log; the tasks stay removed."), tone: "warning" }]}
        confirmLabel={t("tasks.confirmDeathButton", "Confirm")}
        destructive
        loading={confirm.isPending}
        onConfirm={() => { if (confirming?.matchedAnimalId) confirm.mutate({ id: confirming.id, animalId: confirming.matchedAnimalId, idempotencyKey: crypto.randomUUID() }); }}
      />
      <ConsequenceConfirm
        open={deleting !== null}
        onOpenChange={open => { if (!open) setDeleting(null); }}
        title={t("tasks.deleteReportTitle", "Delete this report?")}
        consequences={[{
          text: askedAgain
            ? t("tasks.deleteReportAgain", "The tablet will ask the worker this question again today.")
            : t("tasks.deleteReportConsequence", "It's removed from the saved reports. Use this for a report sent by mistake."),
          tone: "warning",
        }]}
        confirmLabel={t("tasks.deleteConfirm", "Delete")}
        loading={remove.isPending}
        onConfirm={() => { if (deleting) remove.mutate({ id: deleting.id, expectedVersion: deleting.version }); }}
      />
    </>
  );
}

const TABS = ["today", "reports", "repeating", "workers"] as const;
type TabId = (typeof TABS)[number];

/** Owner side of worker mode: what's happening today, the repeating chores, and the names on the tablet. */
export default function Tasks() {
  const { t } = useTranslation();
  const perms = usePermissions("tasks");
  const overview = useOverview();
  const [tab, setTab] = useState<TabId>("today");
  const [creating, setCreating] = useState(false);
  useOneShotParams(["new", "tab"], params => {
    const linked = TABS.find(id => id === params.get("tab"));
    if (linked) setTab(linked);
    if (params.get("new") === "1" && perms.canCreate) setCreating(true);
  }, !perms.loading);

  const changeTab = (value: string) => {
    setCreating(false);
    setTab(value as TabId);
  };
  const addLabel: Record<Exclude<TabId, "reports">, string> = {
    today: t("tasks.add", "Add task"),
    repeating: t("tasks.addRepeating", "Add repeating task"),
    workers: t("tasks.addWorker", "Add worker"),
  };
  const dueToday = (overview.data?.tasks ?? []).filter(task => task.dueDate === overview.data?.date);
  const tabProps = { creating, onCreatingChange: setCreating };

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("nav.tasks", "Tasks")}
        subtitle={overview.data
          ? t("tasks.summary", {
              defaultValue: "{{done}} of {{total}} finished today",
              done: dueToday.filter(task => isFinished(task.status)).length,
              total: dueToday.length,
            })
          : t("tasks.subtitle", "What the workers see on the farm tablet")}
        crumbs={[{ label: t("nav.dashboard", "Dashboard"), href: "/" }, { label: t("nav.tasks", "Tasks") }]}
        actions={perms.canCreate && tab !== "reports" ? (
          <button onClick={() => setCreating(true)} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" />
            {addLabel[tab]}
          </button>
        ) : undefined}
      />
      <Tabs value={tab} onValueChange={changeTab}>
        <PageTabsList>
          <PageTabsTrigger value="today">{t("tasks.today", "Today")}</PageTabsTrigger>
          <PageTabsTrigger value="reports">{t("tasks.reports", "Reports")}</PageTabsTrigger>
          <PageTabsTrigger value="repeating">{t("tasks.repeating", "Repeating")}</PageTabsTrigger>
          <PageTabsTrigger value="workers">{t("tasks.workers", "Workers")}</PageTabsTrigger>
        </PageTabsList>
        <TabsContent value="today" className="pt-4"><TodayTab {...tabProps} /></TabsContent>
        <TabsContent value="reports" className="pt-4"><ReportsTab /></TabsContent>
        <TabsContent value="repeating" className="pt-4"><RepeatingTab {...tabProps} /></TabsContent>
        <TabsContent value="workers" className="pt-4"><WorkersTab {...tabProps} /></TabsContent>
      </Tabs>
    </div>
  );
}
