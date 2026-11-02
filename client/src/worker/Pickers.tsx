import { BLOCKED_REASONS, type BlockedReason } from "@shared/tasks";
import { cn } from "@/lib/utils";
import { Boxes, Clock, HelpCircle, Stethoscope } from "lucide-react";
import { useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { BigButton } from "./BigButton";
import { WorkerScreen } from "./TaskDetail";
import type { TabletWorker } from "./types";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

/** The worker's photo, or their initials when there's none or it won't load, such as offline. */
export function WorkerFace({ worker, className }: { worker: TabletWorker; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (worker.photoUrl && !failed) {
    return <img src={worker.photoUrl} alt="" draggable={false} onError={() => setFailed(true)} className={cn("rounded-full object-cover", className)} />;
  }
  return (
    <span aria-hidden="true" className={cn("grid place-items-center rounded-full bg-secondary font-bold text-secondary-foreground", className)}>
      {initials(worker.name)}
    </span>
  );
}

/** The tablet's first screen: nothing happens here until someone says who they are. */
export function PickWorker({ workers, onPick }: { workers: readonly TabletWorker[]; onPick: (worker: TabletWorker) => void }) {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <h2 className="text-4xl font-bold text-foreground">{t("worker.whoAreYou", "Who are you?")}</h2>
      {workers.length === 0 ? (
        <p className="text-2xl text-muted-foreground">{t("worker.noWorkers", "No names yet. Ask the farm owner to add them.")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {workers.map(worker => (
            <button
              key={worker.id}
              type="button"
              onClick={() => onPick(worker)}
              className="flex min-h-[176px] touch-manipulation flex-col items-center justify-center gap-3 rounded-2xl border-2 border-border bg-card p-4 text-center text-2xl font-bold text-foreground active:bg-accent focus-visible:outline-4 focus-visible:outline-ring"
            >
              <WorkerFace worker={worker} className="h-24 w-24 text-3xl" />
              <span className="min-w-0 max-w-full break-words">{worker.name}</span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

const REASON_ICONS: Record<BlockedReason, ComponentType<{ className?: string }>> = {
  no_supplies: Boxes,
  animal_problem: Stethoscope,
  no_time: Clock,
  other: HelpCircle,
};

export function WhyNot({ onBack, onPick }: { onBack: () => void; onPick: (reason: BlockedReason) => void }) {
  const { t } = useTranslation();
  return (
    <WorkerScreen title={t("worker.whyNot", "Why not?")} onBack={onBack}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {BLOCKED_REASONS.map(reason => (
          <BigButton key={reason} tone="plain" icon={REASON_ICONS[reason]} onClick={() => onPick(reason)} className="min-h-[136px]">
            {t(`worker.reason.${reason}`)}
          </BigButton>
        ))}
      </div>
    </WorkerScreen>
  );
}
