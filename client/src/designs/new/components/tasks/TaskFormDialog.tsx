import { ALL_WEEKDAYS } from "@shared/tasks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { taskTitle } from "@/worker/taskText";
import { FormField, FormFooter, FormValidation } from "../FormLayout";
import { PLAIN_BUTTON, PRIMARY_BUTTON, useErrorText, weekdayName, type TaskRow, type TemplateRow } from "./shared";

const NO_ANIMAL = "none";
const ANYONE = "anyone";

type Kind = "once" | "repeating";

export type TaskEditing = { kind: "task"; task: TaskRow } | { kind: "template"; template: TemplateRow } | null;

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

function KindPicker({ value, onChange }: { value: Kind; onChange: (kind: Kind) => void }) {
  const { t } = useTranslation();
  const options: Array<[Kind, string]> = [
    ["once", t("tasks.oneTime", "One time")],
    ["repeating", t("tasks.recurring", "Recurring")],
  ];
  return (
    <div role="group" aria-label={t("tasks.howOften", "How often?")} className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
      {options.map(([kind, label]) => (
        <button
          key={kind}
          type="button"
          aria-pressed={value === kind}
          onClick={() => onChange(kind)}
          className={`min-h-11 rounded-md text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring sm:min-h-9 ${value === kind ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** One form for every task. A generated task's text isn't the owner's, so only who does it can change. */
export function TaskFormDialog({
  open,
  onOpenChange,
  editing,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: TaskEditing;
  today: string;
}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const errorText = useErrorText();
  const animals = trpc.animals.list.useQuery({ isActive: true }, { enabled: open, staleTime: 60_000 });
  const workers = trpc.tasks.listWorkers.useQuery(undefined, { enabled: open, staleTime: 60_000 });
  const [kind, setKind] = useState<Kind>("once");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [animalId, setAnimalId] = useState(NO_ANIMAL);
  const [dueDate, setDueDate] = useState(today);
  const [weekdays, setWeekdays] = useState(ALL_WEEKDAYS);
  const [assignee, setAssignee] = useState(ANYONE);
  const [attempt, setAttempt] = useState(0);

  const task = editing?.kind === "task" ? editing.task : null;
  const template = editing?.kind === "template" ? editing.template : null;
  const assignOnly = task !== null && task.source !== "manual";

  // Reseed when the dialog opens, without an effect.
  const seedKey = open ? `open:${editing?.kind ?? "new"}:${task?.id ?? template?.id ?? ""}` : "closed";
  const [seededFor, setSeededFor] = useState(seedKey);
  if (seededFor !== seedKey) {
    const row = task ?? template;
    setSeededFor(seedKey);
    setAttempt(0);
    setKind(template ? "repeating" : "once");
    setTitle(row?.title ?? "");
    setNotes(row?.notes ?? "");
    setAnimalId(task?.animalId ? String(task.animalId) : NO_ANIMAL);
    setDueDate(task?.dueDate ?? today);
    setWeekdays(template?.weekdays ?? ALL_WEEKDAYS);
    setAssignee(row?.assignedWorkerId ? String(row.assignedWorkerId) : ANYONE);
  }

  const onSuccess = () => {
    void utils.tasks.invalidate();
    onOpenChange(false);
    toast.success(t("tasks.saved", "Saved"));
  };
  const onError = (error: { message: string }) => toast.error(errorText(error.message));
  const create = trpc.tasks.create.useMutation({ onSuccess, onError });
  const update = trpc.tasks.update.useMutation({ onSuccess, onError });
  const assign = trpc.tasks.assign.useMutation({ onSuccess, onError });
  const createTemplate = trpc.tasks.createTemplate.useMutation({ onSuccess, onError });
  const updateTemplate = trpc.tasks.updateTemplate.useMutation({ onSuccess, onError });
  const saving = create.isPending || update.isPending || assign.isPending || createTemplate.isPending || updateTemplate.isPending;

  const assignedWorkerId = assignee === ANYONE ? null : Number(assignee);

  const submit = () => {
    if (task && assignOnly) {
      assign.mutate({ id: task.id, expectedVersion: task.version, assignedWorkerId });
      return;
    }
    if (!title.trim() || (kind === "once" ? !dueDate : weekdays === 0)) {
      setAttempt(count => count + 1);
      return;
    }
    const shared = { title, notes: notes.trim() || null, assignedWorkerId };
    if (kind === "repeating") {
      if (template) updateTemplate.mutate({ ...shared, weekdays, id: template.id, expectedVersion: template.version, isActive: template.isActive });
      else createTemplate.mutate({ ...shared, weekdays });
      return;
    }
    const once = { ...shared, animalId: animalId === NO_ANIMAL ? null : Number(animalId), dueDate };
    if (task) update.mutate({ ...once, id: task.id, expectedVersion: task.version });
    else create.mutate(once);
  };

  // Someone switched off can't be given new work, but stays shown on what they already have.
  const assignable = (workers.data ?? []).filter(worker => worker.isActive || String(worker.id) === assignee);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto pb-0 sm:max-w-lg">
        <DialogHeader><DialogTitle>{editing ? t("tasks.edit", "Edit task") : t("tasks.add", "Add task")}</DialogTitle></DialogHeader>
        <FormValidation attempt={attempt} className="flex flex-col gap-4">
          {!editing && <KindPicker value={kind} onChange={setKind} />}
          {task && assignOnly ? (
            <p className="font-medium text-foreground">{taskTitle(t, task)}</p>
          ) : (
            <>
              <FormField label={t("tasks.taskTitle", "What needs doing?")} required>
                <Input value={title} maxLength={200} onChange={e => setTitle(e.target.value)} />
              </FormField>
              <FormField label={t("tasks.note", "Note for the worker")}>
                <Textarea value={notes} maxLength={2000} rows={3} onChange={e => setNotes(e.target.value)} />
              </FormField>
            </>
          )}
          <FormField label={t("tasks.assignTo", "Who does it?")}>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANYONE}>{t("tasks.anyone", "Anyone")}</SelectItem>
                {assignable.map(worker => <SelectItem key={worker.id} value={String(worker.id)}>{worker.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          {!assignOnly && (kind === "once" ? (
            <>
              <FormField label={t("tasks.animal", "Animal")}>
                <Select value={animalId} onValueChange={setAnimalId}>
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
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </FormField>
            </>
          ) : (
            <FormField
              label={t("tasks.onDays", "On which days?")}
              error={attempt > 0 && weekdays === 0 ? t("tasks.pickDay", "Pick at least one day.") : undefined}
            >
              <WeekdayPicker value={weekdays} onChange={setWeekdays} />
            </FormField>
          ))}
        </FormValidation>
        <FormFooter>
          <button onClick={() => onOpenChange(false)} className={PLAIN_BUTTON}>{t("common.cancel", "Cancel")}</button>
          <button disabled={saving} onClick={submit} className={PRIMARY_BUTTON}>{t("common.save", "Save")}</button>
        </FormFooter>
      </DialogContent>
    </Dialog>
  );
}
