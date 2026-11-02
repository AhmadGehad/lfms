import { keepPreviousData } from "@tanstack/react-query";
import { Camera, ClipboardList, ListChecks, Pencil, Plus, Repeat, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";
import { sortTasks } from "@/worker/TaskList";
import { taskTitle } from "@/worker/taskText";
import { ConsequenceConfirm } from "../components/ConsequenceConfirm";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { DayReportSheet } from "../components/tasks/DayReportSheet";
import { describeWeekdays, ICON_BUTTON, TaskStatus, useErrorText, WhoAndWhen, type DayRow, type TaskRow, type TemplateRow } from "../components/tasks/shared";
import { TaskFormDialog, type TaskEditing } from "../components/tasks/TaskFormDialog";
import { WorkersDialog } from "../components/tasks/WorkersDialog";
import { fmtDate } from "../lib/format";
import { useOneShotParams } from "../lib/useOneShotParams";

/** What the tablet is doing right now, so a copy saved from an earlier visit won't do. */
const LIVE = { refetchInterval: 30_000, staleTime: 0, placeholderData: keepPreviousData };

function RowsSkeleton({ rows, height = "h-16" }: { rows: number; height?: string }) {
  return (
    <div className="space-y-2 p-3" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => <Skeleton key={index} className={`${height} w-full rounded-lg`} />)}
    </div>
  );
}

/** Today at a glance beside the reports: what's done, what isn't, and by whom. */
function TodayPanel({ onEdit }: { onEdit: (editing: TaskEditing) => void }) {
  const { t } = useTranslation();
  const perms = usePermissions("tasks");
  const overview = trpc.tasks.overview.useQuery(undefined, LIVE);
  const today = overview.data?.date ?? "";
  const tasks = sortTasks(overview.data?.tasks ?? []);
  const [deleting, setDeleting] = useState<TaskRow | null>(null);
  const remove = trpc.tasks.delete.useMutation({
    onSuccess: () => toast.success(t("tasks.deleted", "Deleted")),
    onError: error => toast.error(error.message),
  });

  return (
    <section className="rounded-xl border border-border bg-card" aria-labelledby="today-tasks">
      <h2 id="today-tasks" className="flex items-center gap-2 border-b border-border p-3 text-sm font-semibold text-foreground">
        <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {t("tasks.todayTasks", "Today's tasks")}
      </h2>
      {overview.isLoading ? (
        <RowsSkeleton rows={4} />
      ) : tasks.length === 0 ? (
        <EmptyState icon={ListChecks} title={t("tasks.none", "No tasks today")} description={t("tasks.noneHint", "Add a task, or a recurring one for daily chores. Vaccinations that fall due appear here by themselves.")} />
      ) : (
        <ul className="divide-y divide-border">
          {tasks.map(task => (
            <li key={task.id} className="flex items-start gap-2 p-3" data-testid="today-task">
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="break-words text-sm font-medium text-foreground">{taskTitle(t, task)}</p>
                {task.assignedName && <p className="text-xs text-muted-foreground">{t("tasks.forWorker", { defaultValue: "For {{name}}", name: task.assignedName })}</p>}
                <TaskStatus task={task} today={today} />
                <WhoAndWhen task={task} />
              </div>
              {perms.canUpdate && (
                <button onClick={() => onEdit({ kind: "task", task })} className={ICON_BUTTON} aria-label={t("tasks.edit", "Edit task")} title={t("tasks.edit", "Edit task")}>
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {perms.canDelete && (
                <button onClick={() => setDeleting(task)} className={ICON_BUTTON} aria-label={t("tasks.delete", "Delete task")} title={t("tasks.delete", "Delete task")}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConsequenceConfirm
        open={deleting !== null}
        onOpenChange={open => { if (!open) setDeleting(null); }}
        title={t("tasks.deleteTitle", "Delete this task?")}
        description={deleting ? taskTitle(t, deleting) : undefined}
        consequences={[{ text: t("tasks.deleteConsequence", "It disappears from the tablet straight away."), tone: "warning" }]}
        confirmLabel={t("tasks.deleteConfirm", "Delete")}
        destructive
        onConfirm={() => { if (deleting) { remove.mutate({ id: deleting.id, expectedVersion: deleting.version }); setDeleting(null); } }}
      />
    </section>
  );
}

function RepeatingPanel({ onEdit }: { onEdit: (editing: TaskEditing) => void }) {
  const { t, i18n } = useTranslation();
  const { canUpdate, canDelete } = usePermissions("tasks");
  const utils = trpc.useUtils();
  const templates = trpc.tasks.listTemplates.useQuery();
  const workers = trpc.tasks.listWorkers.useQuery(undefined, { staleTime: 60_000 });
  const [deleting, setDeleting] = useState<TemplateRow | null>(null);
  const toggle = trpc.tasks.updateTemplate.useMutation({
    onSuccess: () => void utils.tasks.invalidate(),
    onError: error => toast.error(error.message),
  });
  const remove = trpc.tasks.deleteTemplate.useMutation({
    onSuccess: () => { void utils.tasks.overview.invalidate(); toast.success(t("tasks.deleted", "Deleted")); },
    onError: error => toast.error(error.message),
  });
  const rows = templates.data ?? [];

  return (
    <section className="rounded-xl border border-border bg-card" aria-labelledby="recurring-tasks">
      <h2 id="recurring-tasks" className="flex items-center gap-2 border-b border-border p-3 text-sm font-semibold text-foreground">
        <Repeat className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {t("tasks.recurringTasks", "Recurring tasks")}
      </h2>
      {templates.isLoading ? (
        <RowsSkeleton rows={2} height="h-12" />
      ) : rows.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">{t("tasks.noRepeatingHint", "Daily chores like feeding go here, so you only add them once.")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map(row => {
            const assigned = workers.data?.find(worker => worker.id === row.assignedWorkerId)?.name;
            return (
              <li key={row.id} className="flex items-start gap-2 p-3" data-testid="recurring-task">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-foreground">{row.title}</p>
                  <p className="text-xs text-muted-foreground">{describeWeekdays(row.weekdays, i18n.language, t("tasks.everyDay", "Every day"))}</p>
                  {assigned && <p className="text-xs text-muted-foreground">{t("tasks.forWorker", { defaultValue: "For {{name}}", name: assigned })}</p>}
                </div>
                <Switch
                  checked={row.isActive}
                  disabled={!canUpdate || toggle.isPending}
                  className="mt-2"
                  aria-label={`${t("tasks.active", "Active")}: ${row.title}`}
                  title={t("tasks.active", "Active")}
                  onCheckedChange={isActive => toggle.mutate({ id: row.id, expectedVersion: row.version, title: row.title, notes: row.notes, weekdays: row.weekdays, assignedWorkerId: row.assignedWorkerId, isActive })}
                />
                {canUpdate && (
                  <button onClick={() => onEdit({ kind: "template", template: row })} className={ICON_BUTTON} aria-label={t("tasks.edit", "Edit task")} title={t("tasks.edit", "Edit task")}>
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => setDeleting(row)} className={ICON_BUTTON} aria-label={t("tasks.delete", "Delete task")} title={t("tasks.delete", "Delete task")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConsequenceConfirm
        open={deleting !== null}
        onOpenChange={open => { if (!open) setDeleting(null); }}
        title={t("tasks.deleteRepeatingTitle", "Delete this repeating task?")}
        description={deleting?.title}
        consequences={[{ text: t("tasks.deleteRepeatingNow", "It stops appearing, starting today unless someone has already started it."), tone: "warning" }]}
        confirmLabel={t("tasks.deleteConfirm", "Delete")}
        destructive
        onConfirm={() => { if (deleting) { remove.mutate({ id: deleting.id, expectedVersion: deleting.version }); setDeleting(null); } }}
      />
    </section>
  );
}

function DayLine({ day, canDelete, onOpen, onDelete }: { day: DayRow; canDelete: boolean; onOpen: () => void; onDelete: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <li className="flex items-center gap-2 pe-2 hover:bg-surface" data-testid="day-report">
      <button onClick={onOpen} className="min-w-0 flex-1 space-y-1.5 p-3 text-start focus-visible:outline-2 focus-visible:outline-ring">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold tabular-nums text-foreground" dir="ltr">{fmtDate(day.date)}</span>
          {day.isToday && <StatusBadge tone="info">{t("tasks.today", "Today")}</StatusBadge>}
          {day.needsAttention && <StatusBadge tone="warning">{t("tasks.needsAttention", "Needs attention")}</StatusBadge>}
        </span>
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5 tabular-nums">
            <ListChecks className="h-4 w-4" aria-hidden="true" />
            {t("tasks.dayTaskCount", { defaultValue: "{{done}} of {{total}} tasks finished", done: day.tasksDone, total: day.tasksTotal })}
          </span>
          <span className="flex items-center gap-1.5 tabular-nums">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            {t("tasks.dayAnswerCount", { defaultValue: "{{count}} answers", count: day.answerCount })}
          </span>
          {day.photoCount > 0 && (
            <span className="flex items-center gap-1.5 tabular-nums">
              <Camera className="h-4 w-4" aria-hidden="true" />
              {t("tasks.dayPhotoCount", { defaultValue: "{{count}} photos", count: day.photoCount })}
            </span>
          )}
        </span>
        {day.missing.length > 0 && (
          <span className="block text-sm text-warning-soft-foreground">
            {t("tasks.notAnswered", {
              defaultValue: "Not answered: {{items}}",
              items: day.missing.map(type => t(`tasks.reportTypes.${type}`)).join(i18n.language === "ar" ? "، " : ", "),
            })}
          </span>
        )}
        {day.workerNames.length > 0 && <span className="block text-sm text-muted-foreground">{day.workerNames.join(i18n.language === "ar" ? "، " : ", ")}</span>}
      </button>
      {canDelete && (
        <button onClick={onDelete} className={ICON_BUTTON} aria-label={t("tasks.deleteDay", "Delete this day's report")} title={t("tasks.deleteDay", "Delete this day's report")}>
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

/** One report per day. It's worked out from the day's tasks and answers, so it's never out of date. */
function DayReports({ today }: { today: string }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const { canDelete } = usePermissions("tasks");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [deletingDay, setDeletingDay] = useState<string | null>(null);
  const days = trpc.tasks.dayReports.useQuery(
    { from: from || undefined, to: to || undefined },
    LIVE,
  );
  const remove = trpc.tasks.deleteDayReport.useMutation({
    onSuccess: () => toast.success(t("tasks.dayDeleted", "Report deleted. The tablet will ask again.")),
    onError: error => toast.error(errorText(error.message)),
  });

  return (
    <section className="rounded-xl border border-border bg-card" aria-labelledby="day-reports">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-3">
        <h2 id="day-reports" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("tasks.dailyReports", "Daily reports")}
        </h2>
        <div className="flex flex-wrap items-end gap-2">
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
      </div>
      {days.isLoading ? (
        <RowsSkeleton rows={5} height="h-20" />
      ) : (days.data ?? []).length === 0 ? (
        <EmptyState icon={ClipboardList} title={t("tasks.noReports", "No reports yet")} description={t("tasks.noReportsHint", "Reports the workers send from the tablet appear here. They change nothing by themselves. Confirm a death here to take the animal out of the herd.")} />
      ) : (
        <ul className="divide-y divide-border">
          {days.data!.map(day => (
            <DayLine key={day.date} day={day} canDelete={canDelete} onOpen={() => setOpenDay(day.date)} onDelete={() => setDeletingDay(day.date)} />
          ))}
        </ul>
      )}
      <DayReportSheet date={openDay} today={today} onClose={() => setOpenDay(null)} onDelete={setDeletingDay} />
      <ConsequenceConfirm
        open={deletingDay !== null}
        onOpenChange={open => { if (!open) setDeletingDay(null); }}
        title={t("tasks.deleteDayTitle", { defaultValue: "Delete the report for {{date}}?", date: deletingDay ? fmtDate(deletingDay) : "" })}
        consequences={[
          { text: t("tasks.deleteDayTasks", "That day's tasks go back to not started, so they can be done again."), tone: "warning" },
          { text: t("tasks.deleteDayAnswers", "The answers and photos are removed, and the tablet asks the questions again."), tone: "warning" },
          { text: t("tasks.deleteDayDeaths", "A death you already confirmed stays recorded."), tone: "info" },
        ]}
        confirmLabel={t("tasks.deleteConfirm", "Delete")}
        destructive
        onConfirm={() => {
          if (!deletingDay) return;
          remove.mutate({ date: deletingDay });
          setDeletingDay(null);
          setOpenDay(null);
        }}
      />
    </section>
  );
}

/** Owner side of worker mode: a report for each day, with today's and the recurring tasks beside it. */
export default function Tasks() {
  const { t } = useTranslation();
  const perms = usePermissions("tasks");
  const overview = trpc.tasks.overview.useQuery(undefined, LIVE);
  const today = overview.data?.date ?? "";
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TaskEditing>(null);
  const [workersOpen, setWorkersOpen] = useState(false);
  useOneShotParams(["new", "tab"], params => {
    if (params.get("new") === "1" && perms.canCreate) setAdding(true);
  }, !perms.loading);

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("nav.tasks", "Tasks")}
        subtitle={t("tasks.subtitle", "What the workers see on the farm tablet")}
        crumbs={[{ label: t("nav.dashboard", "Dashboard"), href: "/" }, { label: t("nav.tasks", "Tasks") }]}
        actions={
          <div className="flex gap-2">
            <button onClick={() => setWorkersOpen(true)} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface">
              <Users className="h-4 w-4" aria-hidden="true" />
              {t("tasks.workers", "Workers")}
            </button>
            {perms.canCreate && (
              <button onClick={() => setAdding(true)} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("tasks.add", "Add task")}
              </button>
            )}
          </div>
        }
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 lg:order-1"><DayReports today={today} /></div>
        <aside className="order-first flex min-w-0 flex-col gap-4 lg:order-2">
          <TodayPanel onEdit={setEditing} />
          <RepeatingPanel onEdit={setEditing} />
        </aside>
      </div>
      <TaskFormDialog
        open={adding || editing !== null}
        onOpenChange={open => { if (!open) { setAdding(false); setEditing(null); } }}
        editing={editing}
        today={today}
      />
      <WorkersDialog open={workersOpen} onOpenChange={setWorkersOpen} />
    </div>
  );
}
