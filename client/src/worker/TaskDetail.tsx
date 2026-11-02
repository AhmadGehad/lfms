import { canUndo, isFinished, UNDO_WINDOW_MS } from "@shared/tasks";
import { ArrowLeft, ArrowRight, Ban, Check, Play, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BigButton } from "./BigButton";
import { useTaskCaption } from "./TaskList";
import { taskTitle } from "./taskText";
import type { TabletTask } from "./types";

export function BackButton({ onClick }: { onClick: () => void }) {
  const { t, i18n } = useTranslation();
  const Icon = i18n.language === "ar" ? ArrowRight : ArrowLeft;
  return (
    <BigButton tone="plain" icon={Icon} onClick={onClick} className="min-h-[72px] self-start text-2xl">
      {t("worker.back", "Back")}
    </BigButton>
  );
}

export function WorkerScreen({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <BackButton onClick={onBack} />
      <h2 className="break-words text-4xl font-bold text-foreground">{title}</h2>
      {children}
    </main>
  );
}

/** Re-renders when the undo window closes, so the button can't outlive it. */
function useUndoAvailable(task: TabletTask) {
  const [, expire] = useState(0);
  const available = canUndo(task);
  useEffect(() => {
    if (!available || !task.finishedAt) return;
    const closesIn = new Date(task.finishedAt).getTime() + UNDO_WINDOW_MS - Date.now();
    const timer = window.setTimeout(() => expire(tick => tick + 1), Math.max(closesIn, 0) + 50);
    return () => window.clearTimeout(timer);
  }, [available, task.finishedAt]);
  return available;
}

export function TaskDetail({
  task,
  date,
  finishLockedTo,
  undoLocked,
  onBack,
  onStart,
  onDone,
  onBlocked,
  onUndo,
}: {
  task: TabletTask;
  date: string;
  /** Who started it, when that's someone else: only they can finish it. */
  finishLockedTo: string | null;
  undoLocked: boolean;
  onBack: () => void;
  onStart: () => void;
  onDone: () => void;
  onBlocked: () => void;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const caption = useTaskCaption()(task, date);
  const undoAvailable = useUndoAvailable(task);
  const reason = task.status === "blocked" && task.blockedReason ? t(`worker.reason.${task.blockedReason}`) : null;

  return (
    <WorkerScreen title={taskTitle(t, task)} onBack={onBack}>
      {task.notes && <p className="whitespace-pre-wrap break-words text-2xl text-foreground">{task.notes}</p>}
      {caption && <p className="text-2xl font-semibold text-muted-foreground">{caption}</p>}
      {reason && <p className="text-2xl text-muted-foreground">{reason}</p>}

      {isFinished(task.status) ? (
        undoAvailable && !undoLocked && (
          <BigButton tone="plain" icon={Undo2} onClick={onUndo} className="sm:max-w-md">
            {t("worker.undo", "Undo")}
          </BigButton>
        )
      ) : finishLockedTo ? (
        <p className="text-2xl font-semibold text-foreground">
          {t("worker.onlyStarter", { defaultValue: "Only {{name}} can finish this", name: finishLockedTo })}
        </p>
      ) : (
        <div className="mt-auto grid gap-4 pb-2 sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
          {task.status === "todo" && (
            <BigButton tone="start" icon={Play} onClick={onStart} className="min-h-[136px]">
              {t("worker.start", "Start")}
            </BigButton>
          )}
          <BigButton tone="done" icon={Check} onClick={onDone} className="min-h-[136px]">
            {t("worker.done", "Done")}
          </BigButton>
          <BigButton tone="blocked" icon={Ban} onClick={onBlocked} className="min-h-[136px]">
            {t("worker.cantDo", "Can't do it")}
          </BigButton>
        </div>
      )}
    </WorkerScreen>
  );
}
