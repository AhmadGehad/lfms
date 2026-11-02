import { ALL_WEEKDAYS, isFinished } from "@shared/tasks";
import type { inferRouterOutputs } from "@trpc/server";
import { useTranslation } from "react-i18next";
import type { AppRouter } from "../../../../../../server/routers";
import { StatusBadge, type StatusTone } from "../StatusBadge";
import { fmtDateTime } from "../../lib/format";

type Outputs = inferRouterOutputs<AppRouter>["tasks"];
export type TaskRow = Outputs["overview"]["tasks"][number];
export type TemplateRow = Outputs["listTemplates"][number];
export type WorkerRow = Outputs["listWorkers"][number];
export type DayRow = Outputs["dayReports"][number];
export type DayDetail = Outputs["dayReport"];
export type ReportRow = DayDetail["reports"][number];

export const PRIMARY_BUTTON = "rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50";
export const PLAIN_BUTTON = "rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface disabled:opacity-50";
export const ICON_BUTTON = "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

export function useErrorText() {
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
function isMissed(task: Pick<TaskRow, "source" | "dueDate" | "status">, today: string) {
  return task.source === "template" && task.dueDate < today && !isFinished(task.status);
}

/** Status, with the reason underneath when a worker couldn't do it. */
export function TaskStatus({ task, today }: { task: TaskRow; today: string }) {
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
export function WhoAndWhen({ task }: { task: TaskRow }) {
  const name = task.finishedByName ?? task.startedByName;
  const when = task.finishedByName ? task.finishedAt : task.startedAt;
  if (!name) return null;
  return (
    <div className="flex flex-col text-sm">
      <span className="text-foreground">{name}</span>
      <span className="self-start text-xs tabular-nums text-muted-foreground" dir="ltr">{fmtDateTime(when)}</span>
    </div>
  );
}

/** Sunday-first in storage, shown in the visitor's language. */
export function weekdayName(day: number, language: string, width: "short" | "long" = "short") {
  // 2023-01-01 was a Sunday.
  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-GB", { weekday: width, timeZone: "UTC" })
    .format(new Date(Date.UTC(2023, 0, 1 + day)));
}

export function describeWeekdays(mask: number, language: string, everyDay: string) {
  if (mask === ALL_WEEKDAYS) return everyDay;
  return [0, 1, 2, 3, 4, 5, 6].filter(day => mask & (1 << day)).map(day => weekdayName(day, language)).join(language === "ar" ? "، " : ", ");
}
