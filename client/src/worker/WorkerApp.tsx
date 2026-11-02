import { useQueryClient } from "@tanstack/react-query";
import { undoOptimisticWrite, type OptimisticSnapshot } from "@/lib/offline/optimistic";
import { useQueuedSubmit } from "@/lib/offline/queuedSubmit";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { farmToday, isFinished, missingDailyReports, WORKER_NOT_ALLOWED, type BlockedReason, type TaskAction } from "@shared/tasks";
import { Ban, ClipboardList, RefreshCw, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BigButton } from "./BigButton";
import { DailyReport, type ReportDraft } from "./DailyReport";
import { onlyWorker, WhoAreYou, WhyNot } from "./Pickers";
import { TaskDetail } from "./TaskDetail";
import { TaskList } from "./TaskList";
import { useWakeLock } from "./useWakeLock";
import { WorkerHeader } from "./WorkerHeader";
import type { TabletTask, TabletWorker } from "./types";

const REFRESH_MS = 60_000;
/** A task left open by someone who walked away goes back to the list for the next person. */
const IDLE_RESET_MS = 2 * 60_000;

type Screen =
  | { name: "list" }
  | { name: "report" }
  | { name: "task"; taskId: number }
  | { name: "who"; taskId: number; action: "start" | "done" | "blocked" }
  | { name: "why"; taskId: number; workerId: number };

function useResetWhenIdle(active: boolean, reset: () => void) {
  useEffect(() => {
    if (!active) return;
    let timer = window.setTimeout(reset, IDLE_RESET_MS);
    const restart = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(reset, IDLE_RESET_MS);
    };
    window.addEventListener("pointerdown", restart, { passive: true });
    // Typing a price doesn't touch the page, only the on-screen keyboard.
    window.addEventListener("input", restart, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", restart);
      window.removeEventListener("input", restart);
    };
  }, [active, reset]);
}

function MessageScreen({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <p className="text-3xl font-bold text-foreground">{children}</p>
      {action}
    </div>
  );
}

/**
 * The whole app for the shared farm tablet: today's tasks and nothing else. No
 * routes, because a worker sees this on every URL, and no navigation out of it.
 */
export default function WorkerApp() {
  const { t, i18n } = useTranslation();
  const day = trpc.tasks.today.useQuery(undefined, {
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const queryClient = useQueryClient();
  const refused = (path: string) => (error: { message: string }, input: unknown, snapshot: unknown) => {
    undoOptimisticWrite(queryClient, path, input, snapshot as OptimisticSnapshot | undefined);
    toast.error(error.message === WORKER_NOT_ALLOWED
      ? t("worker.nameNotAllowed", "This name isn't allowed to do tasks. Ask the farm owner.")
      : t("worker.actionFailed", "That didn't save. Please try again."));
  };
  // Replaces the registered default, so it has to undo the optimistic tap too.
  const record = trpc.tasks.recordAction.useMutation({ onError: refused("tasks.recordAction") });
  const report = trpc.tasks.submitReport.useMutation({ onError: refused("tasks.submitReport") });
  const submit = useQueuedSubmit();
  const [screen, setScreen] = useState<Screen>({ name: "list" });
  const showList = useCallback(() => setScreen({ name: "list" }), []);

  useWakeLock();
  useResetWhenIdle(screen.name !== "list", showList);
  useEffect(() => {
    document.documentElement.dir = i18n.language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  const tasks = day.data?.tasks ?? [];
  const workers = day.data?.workers ?? [];
  const doneCount = tasks.filter(task => isFinished(task.status)).length;
  const current = "taskId" in screen ? tasks.find(task => task.id === screen.taskId) : undefined;

  const act = (task: TabletTask, action: TaskAction, workerId?: number | null, reason?: BlockedReason) => {
    submit(record, { taskId: task.id, action, workerId: workerId ?? null, reason: reason ?? null, tappedAt: new Date().toISOString(), idempotencyKey: crypto.randomUUID() });
    showList();
  };

  const sendReport = (draft: ReportDraft, worker: TabletWorker) => {
    // Today by the farm's clock: an offline tablet's last loaded day may be yesterday's.
    const reportDate = day.data ? farmToday(day.data.timeZone) : null;
    submit(report, { ...draft, workerId: worker.id, reportDate, tappedAt: new Date().toISOString(), idempotencyKey: crypto.randomUUID() }, {
      onOnlineSuccess: () => toast.success(t("worker.report.sent", "Sent to the owner"), { className: "text-xl!" }),
    });
  };

  const body = () => {
    if (day.isLoading) {
      return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4 sm:p-6" aria-busy="true">
          {[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-24 w-full rounded-2xl" />)}
        </div>
      );
    }
    if (!day.data) {
      return (
        <MessageScreen
          action={
            <BigButton tone="plain" icon={RefreshCw} onClick={() => void day.refetch()}>
              {t("worker.tryAgain", "Try again")}
            </BigButton>
          }
        >
          <WifiOff aria-hidden="true" className="mx-auto mb-5 h-16 w-16 text-muted-foreground" />
          {t("worker.loadFailed", "Can't load the tasks. Check the internet.")}
        </MessageScreen>
      );
    }
    if (!day.data.farmSelected) {
      return <MessageScreen>{t("worker.noFarm", "This tablet isn't linked to one farm. Ask the farm owner.")}</MessageScreen>;
    }
    if (day.data.notAllowed) {
      return (
        <MessageScreen>
          <Ban aria-hidden="true" className="mx-auto mb-5 h-16 w-16 text-muted-foreground" />
          {t("worker.notAllowed", "You aren't allowed to do tasks right now. Ask the farm owner.")}
        </MessageScreen>
      );
    }
    const date = day.data.date;
    if (screen.name === "report") {
      return <DailyReport day={day.data} onBack={showList} onSubmit={sendReport} />;
    }
    if (screen.name === "list" || !current) {
      return (
        <>
          <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6 sm:pt-6">
            <BigButton
              tone={missingDailyReports(day.data.reports).length > 0 ? "blocked" : "plain"}
              icon={ClipboardList}
              onClick={() => setScreen({ name: "report" })}
              className="w-full"
            >
              {t("worker.report.title", "Daily report")}
              {missingDailyReports(day.data.reports).length > 0 && (
                <span className="block text-xl font-medium">{t("worker.report.notSent", "Not sent yet today")}</span>
              )}
            </BigButton>
          </div>
          <TaskList tasks={tasks} date={date} onOpen={task => setScreen({ name: "task", taskId: task.id })} />
        </>
      );
    }
    if (screen.name === "task") {
      const only = onlyWorker(workers);
      return (
        <TaskDetail
          task={current}
          date={date}
          onBack={showList}
          onStart={() => only
            ? act(current, "start", only.id)
            : setScreen({ name: "who", taskId: current.id, action: "start" })}
          // Whoever started it is finishing it, unless they've since been switched off.
          onDone={() => current.status === "started" && workers.some(worker => worker.id === current.startedByWorkerId)
            ? act(current, "done", current.startedByWorkerId)
            : only
              ? act(current, "done", only.id)
              : setScreen({ name: "who", taskId: current.id, action: "done" })}
          onBlocked={() => only
            ? setScreen({ name: "why", taskId: current.id, workerId: only.id })
            : setScreen({ name: "who", taskId: current.id, action: "blocked" })}
          onUndo={() => act(current, "undo")}
        />
      );
    }
    if (screen.name === "who") {
      const { action, taskId } = screen;
      return (
        <WhoAreYou
          workers={workers}
          onBack={() => setScreen({ name: "task", taskId })}
          onPick={worker => action === "blocked"
            ? setScreen({ name: "why", taskId, workerId: worker.id })
            : act(current, action, worker.id)}
        />
      );
    }
    const { workerId, taskId } = screen;
    return (
      <WhyNot
        onBack={() => setScreen(onlyWorker(workers)
          ? { name: "task", taskId }
          : { name: "who", taskId, action: "blocked" })}
        onPick={reason => act(current, "blocked", workerId, reason)}
      />
    );
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background" data-testid="worker-app">
      <WorkerHeader date={day.data?.date} doneCount={doneCount} total={tasks.length} />
      {body()}
    </div>
  );
}
