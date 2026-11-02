import { BLOCKED_REASONS, type BlockedReason } from "@shared/tasks";
import { Boxes, Clock, HelpCircle, Stethoscope, UserRound } from "lucide-react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { BigButton } from "./BigButton";
import { WorkerScreen } from "./TaskDetail";
import type { TabletWorker } from "./types";

/** With one name on the tablet there's nobody to tell apart, so nothing to ask. */
export function onlyWorker(workers: readonly TabletWorker[]): TabletWorker | null {
  return workers.length === 1 ? workers[0] : null;
}

export function WhoAreYou({
  workers,
  onBack,
  onPick,
}: {
  workers: readonly TabletWorker[];
  onBack: () => void;
  onPick: (worker: TabletWorker) => void;
}) {
  const { t } = useTranslation();
  return (
    <WorkerScreen title={t("worker.whoAreYou", "Who are you?")} onBack={onBack}>
      {workers.length === 0 ? (
        <p className="text-2xl text-muted-foreground">{t("worker.noWorkers", "No names yet. Ask the farm owner to add them.")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workers.map(worker => (
            <BigButton key={worker.id} tone="plain" icon={UserRound} onClick={() => onPick(worker)}>
              {worker.name}
            </BigButton>
          ))}
        </div>
      )}
    </WorkerScreen>
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
