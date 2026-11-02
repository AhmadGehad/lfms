import { isFinished, type TaskStatus } from "@shared/tasks";
import { cn } from "@/lib/utils";
import { Ban, Check, Circle, PartyPopper, Play } from "lucide-react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { taskTitle } from "./taskText";
import type { TabletTask } from "./types";

const STATUS_LOOK: Record<TaskStatus, { icon: ComponentType<{ className?: string }>; badge: string }> = {
  todo: { icon: Circle, badge: "bg-secondary text-secondary-foreground" },
  started: { icon: Play, badge: "bg-info-soft text-info-soft-foreground" },
  done: { icon: Check, badge: "bg-success-soft text-success-soft-foreground" },
  blocked: { icon: Ban, badge: "bg-warning-soft text-warning-soft-foreground" },
};

/** Started work first (someone's on it), then what's left, then what's finished. */
const STATUS_ORDER: Record<TaskStatus, number> = { started: 0, todo: 1, blocked: 2, done: 3 };

export function sortTasks<T extends { id: number; status: TaskStatus }>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.id - b.id);
}

/** "Started: Ali", "Done: Omar", or "from yesterday" for a carried-over task. */
export function useTaskCaption() {
  const { t } = useTranslation();
  return (task: TabletTask, date: string): string | null => {
    if (task.status === "started") return t("worker.startedBy", { defaultValue: "Started: {{name}}", name: task.startedByName ?? "" });
    if (task.status === "done") return t("worker.doneBy", { defaultValue: "Done: {{name}}", name: task.finishedByName ?? "" });
    if (task.status === "blocked") return t("worker.blockedBy", { defaultValue: "Can't do: {{name}}", name: task.finishedByName ?? "" });
    return task.dueDate < date ? t("worker.fromEarlier", "From an earlier day") : null;
  };
}

function TaskCard({ task, date, onOpen }: { task: TabletTask; date: string; onOpen: () => void }) {
  const { t } = useTranslation();
  const caption = useTaskCaption()(task, date);
  const look = STATUS_LOOK[task.status];
  const Icon = look.icon;
  const finished = isFinished(task.status);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex min-h-[96px] w-full touch-manipulation select-none items-center gap-5 rounded-2xl border-2 px-5 py-4 text-start transition-opacity active:opacity-70 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ring",
          finished ? "border-transparent bg-muted" : "border-border bg-card",
        )}
      >
        <span className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-full", look.badge)}>
          <Icon aria-hidden="true" className="h-8 w-8" />
          <span className="sr-only">{t(`worker.status.${task.status}`)}</span>
        </span>
        <span className="min-w-0 flex-1 break-words text-2xl font-semibold text-foreground sm:text-3xl">{taskTitle(t, task)}</span>
        {caption && <span className="shrink-0 text-end text-xl text-muted-foreground">{caption}</span>}
      </button>
    </li>
  );
}

export function TaskList({ tasks, date, onOpen }: { tasks: readonly TabletTask[]; date: string; onOpen: (task: TabletTask) => void }) {
  const { t } = useTranslation();
  if (tasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
        <PartyPopper aria-hidden="true" className="h-20 w-20 text-primary" />
        <p className="text-3xl font-bold text-foreground">{t("worker.noTasks", "No tasks today")}</p>
      </div>
    );
  }
  return (
    <ul className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4 sm:p-6">
      {sortTasks(tasks).map(task => (
        <TaskCard key={task.id} task={task} date={date} onOpen={() => onOpen(task)} />
      ))}
    </ul>
  );
}
