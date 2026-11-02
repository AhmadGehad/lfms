import { isYesNoReport } from "@shared/tasks";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Link } from "wouter";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/useCurrency";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";
import { sortTasks } from "@/worker/TaskList";
import { stockNeeds, taskTitle } from "@/worker/taskText";
import { ConsequenceConfirm } from "../ConsequenceConfirm";
import { StatusBadge, type StatusTone } from "../StatusBadge";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { ICON_BUTTON, PLAIN_BUTTON, PRIMARY_BUTTON, TaskStatus, useErrorText, WhoAndWhen, type ReportRow } from "./shared";

const REPORT_TONES: Record<ReportRow["type"], StatusTone> = {
  animal_dead: "danger",
  animal_sick: "warning",
  stock_needed: "warning",
  doctor_visit: "info",
  purchase: "neutral",
};

/** What the worker said. The tag is as typed, linked only when it matches an animal. */
function ReportAnswer({ report }: { report: ReportRow }) {
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** The day's report, worked out fresh on every poll, so it follows along as the tablet is used. */
export function DayReportSheet({
  date,
  today,
  onClose,
  onDelete,
}: {
  date: string | null;
  today: string;
  onClose: () => void;
  onDelete: (date: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const utils = trpc.useUtils();
  const { fmt } = useCurrency();
  const errorText = useErrorText();
  const { canDelete, canUpdate } = usePermissions("tasks");
  const { canCreate: canExit } = usePermissions("sales");
  const detail = trpc.tasks.dayReport.useQuery({ date: date ?? "" }, { enabled: date !== null, refetchInterval: 30_000, staleTime: 0 });
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
  const remove = trpc.tasks.deleteReport.useMutation({
    onSuccess: () => { void utils.tasks.invalidate(); toast.success(t("tasks.deleted", "Deleted")); },
    onError: error => toast.error(error.message),
  });
  const canConfirm = (row: ReportRow) =>
    canUpdate && canExit && row.type === "animal_dead" && !row.confirmedAt && row.matchedAnimalActive;
  const day = detail.data;
  const askedAgain = deleting !== null && deleting.reportDate === today && isYesNoReport(deleting.type);

  return (
    <Sheet open={date !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side={i18n.language === "ar" ? "left" : "right"} className="block w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle dir="ltr" className="text-start rtl:text-end">{date ? fmtDate(date) : ""}</SheetTitle>
          <SheetDescription>{t("tasks.dayReportHint", "This report keeps updating as the tablet is used.")}</SheetDescription>
        </SheetHeader>
        {!day ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-6 p-4">
            {day.missing.length > 0 && (
              <p className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground" role="status">
                {t("tasks.notAnswered", {
                  defaultValue: "Not answered: {{items}}",
                  items: day.missing.map(type => t(`tasks.reportTypes.${type}`)).join(i18n.language === "ar" ? "، " : ", "),
                })}
              </p>
            )}

            <Section title={t("tasks.dayTasks", "Tasks")}>
              {day.tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("tasks.none", "No tasks today")}</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {sortTasks(day.tasks).map(task => (
                    <li key={task.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 p-3">
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="break-words font-medium text-foreground">{taskTitle(t, task)}</p>
                        {task.assignedName && <p className="text-xs text-muted-foreground">{t("tasks.forWorker", { defaultValue: "For {{name}}", name: task.assignedName })}</p>}
                      </div>
                      <TaskStatus task={task} today={today} />
                      <WhoAndWhen task={task} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={t("tasks.dayAnswers", "Questions answered")}>
              {day.reports.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("tasks.noReports", "No reports yet")}</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {day.reports.map(report => (
                    <li key={report.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                      <div className="min-w-0 flex-1 basis-48 space-y-1">
                        <StatusBadge tone={REPORT_TONES[report.type]}>{t(`tasks.reportTypes.${report.type}`)}</StatusBadge>
                        <div className="text-sm"><ReportAnswer report={report} /></div>
                        {report.amount && <p className="text-sm tabular-nums text-foreground">{fmt(Number(report.amount))}</p>}
                        <p className="text-xs text-muted-foreground">
                          {report.workerName} · <span dir="ltr" className="tabular-nums">{fmtDateTime(report.createdAt)}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {canConfirm(report) && (
                          <button onClick={() => setConfirming(report)} className={`${PRIMARY_BUTTON} whitespace-nowrap`}>{t("tasks.confirmDeath", "Confirm dead")}</button>
                        )}
                        {canDelete && !report.confirmedAt && (
                          <button onClick={() => setDeleting(report)} className={ICON_BUTTON} aria-label={t("tasks.deleteConfirm", "Delete")} title={t("tasks.deleteConfirm", "Delete")}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={t("tasks.dayPhotos", "Who used the tablet")}>
              {day.checkins.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("tasks.noCheckins", "Nobody yet")}</p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {day.checkins.map(checkin => (
                    <li key={checkin.id} className="overflow-hidden rounded-lg border border-border">
                      {checkin.photoUrl ? (
                        <a href={checkin.photoUrl} target="_blank" rel="noreferrer">
                          <img src={checkin.photoUrl} alt={checkin.workerName} loading="lazy" className="aspect-[4/3] w-full bg-surface object-cover" />
                        </a>
                      ) : (
                        <div className="grid aspect-[4/3] place-items-center bg-surface text-xs text-muted-foreground">{t("tasks.noPhoto", "No photo")}</div>
                      )}
                      <div className="p-2 text-xs">
                        <p className="break-words font-medium text-foreground">{checkin.workerName}</p>
                        <p className="tabular-nums text-muted-foreground" dir="ltr">{fmtDateTime(checkin.takenAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {canDelete && date && (
              <button onClick={() => onDelete(date)} className={`${PLAIN_BUTTON} flex w-full items-center justify-center gap-2 text-destructive`}>
                <Trash2 className="h-4 w-4" />
                {t("tasks.deleteDay", "Delete this day's report")}
              </button>
            )}
          </div>
        )}
      </SheetContent>
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
        onConfirm={() => { if (deleting) { remove.mutate({ id: deleting.id, expectedVersion: deleting.version }); setDeleting(null); } }}
      />
    </Sheet>
  );
}
