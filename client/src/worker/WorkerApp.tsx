import { useQueryClient } from "@tanstack/react-query";
import { undoOptimisticWrite, type OptimisticSnapshot } from "@/lib/offline/optimistic";
import { useQueuedSubmit } from "@/lib/offline/queuedSubmit";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { farmToday, isFinished, missingDailyReports, WORKER_NOT_ALLOWED, type BlockedReason, type TaskAction } from "@shared/tasks";
import { ClipboardList, RefreshCw, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BigButton } from "./BigButton";
import { DailyReport, type ReportDraft } from "./DailyReport";
import { takeCheckinPhoto } from "./checkinPhoto";
import { PickWorker, WhyNot, WorkerFace } from "./Pickers";
import { BackButton, TaskDetail } from "./TaskDetail";
import { TaskList } from "./TaskList";
import { useWakeLock } from "./useWakeLock";
import { WorkerHeader } from "./WorkerHeader";
import type { TabletTask, TabletWorker } from "./types";

const REFRESH_MS = 60_000;
/** Whoever walked away shouldn't have the next person's work credited to them. */
const IDLE_RESET_MS = 15_000;

type Screen =
  | { name: "list" }
  | { name: "report" }
  | { name: "task"; taskId: number }
  | { name: "why"; taskId: number };

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
 * The whole app for the shared farm tablet: pick your name, then today's tasks and
 * nothing else. No routes, because a worker sees this on every URL, and no
 * navigation out of it. Left alone, it goes back to the names.
 */
export default function WorkerApp({ takePhoto = takeCheckinPhoto }: { takePhoto?: () => Promise<string | null> }) {
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
  const checkIn = trpc.tasks.checkIn.useMutation({ onError: refused("tasks.checkIn") });
  const submit = useQueuedSubmit();
  const [screen, setScreen] = useState<Screen>({ name: "list" });
  const [workerId, setWorkerId] = useState<number | null>(null);
  const showList = useCallback(() => setScreen({ name: "list" }), []);
  const showNames = useCallback(() => {
    setWorkerId(null);
    setScreen({ name: "list" });
  }, []);

  useWakeLock();
  useResetWhenIdle(workerId !== null, showNames);
  useEffect(() => {
    document.documentElement.dir = i18n.language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  const workers = day.data?.workers ?? [];
  // Switched off by the owner while picked: back to the names.
  const worker = workers.find(other => other.id === workerId) ?? null;
  // A task for someone since switched off would otherwise be nobody's.
  const tasks = (day.data?.tasks ?? []).filter(task =>
    task.assignedWorkerId === null
    || task.assignedWorkerId === workerId
    || !workers.some(other => other.id === task.assignedWorkerId));
  const doneCount = tasks.filter(task => isFinished(task.status)).length;
  const current = "taskId" in screen ? tasks.find(task => task.id === screen.taskId) : undefined;
  // Today by the farm's clock: an offline tablet's last loaded day may be yesterday's.
  const reportDate = day.data ? farmToday(day.data.timeZone) : null;

  const pick = (picked: TabletWorker) => {
    setWorkerId(picked.id);
    const takenAt = new Date().toISOString();
    // In the background: nobody should wait on the camera to start work.
    void takePhoto().then(photo => {
      submit(checkIn, { workerId: picked.id, photo, takenAt, reportDate, idempotencyKey: crypto.randomUUID() });
      if (photo) toast(t("worker.photoTaken", "Photo taken for today's report"), { className: "text-xl!" });
    });
  };

  const act = (task: TabletTask, action: TaskAction, reason?: BlockedReason) => {
    submit(record, { taskId: task.id, action, workerId: action === "undo" ? null : workerId, reason: reason ?? null, tappedAt: new Date().toISOString(), idempotencyKey: crypto.randomUUID() });
    showList();
  };

  const sendReport = (draft: ReportDraft) => {
    if (workerId === null) return;
    submit(report, { ...draft, workerId, reportDate, tappedAt: new Date().toISOString(), idempotencyKey: crypto.randomUUID() }, {
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
    if (!worker) return <PickWorker workers={workers} onPick={pick} />;
    const date = day.data.date;
    if (screen.name === "report") {
      return <DailyReport day={day.data} onBack={showList} onSubmit={sendReport} />;
    }
    if (screen.name === "list" || !current) {
      return (
        <>
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-4 sm:px-6 sm:pt-6">
            <div className="flex items-center gap-4">
              <BackButton onClick={showNames} />
              <WorkerFace worker={worker} className="ms-auto h-16 w-16 shrink-0 text-2xl" />
              <p className="min-w-0 break-words text-3xl font-bold text-foreground">{worker.name}</p>
            </div>
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
      return (
        <TaskDetail
          task={current}
          date={date}
          onBack={showList}
          onStart={() => act(current, "start")}
          onDone={() => act(current, "done")}
          onBlocked={() => setScreen({ name: "why", taskId: current.id })}
          onUndo={() => act(current, "undo")}
        />
      );
    }
    const { taskId } = screen;
    return (
      <WhyNot
        onBack={() => setScreen({ name: "task", taskId })}
        onPick={reason => act(current, "blocked", reason)}
      />
    );
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background" data-testid="worker-app">
      <WorkerHeader date={day.data?.date} doneCount={doneCount} total={worker ? tasks.length : 0} />
      {body()}
    </div>
  );
}
