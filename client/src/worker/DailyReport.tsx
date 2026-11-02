import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  normalizeDigits,
  parseReportAmount,
  PURCHASE_KINDS,
  STOCK_KINDS,
  type AnimalReport,
  type PurchaseKind,
  type StockKind,
  type YesNoReport,
} from "@shared/tasks";
import { Activity, ArrowRight, Check, HeartOff, Package, Pill, ShoppingCart, Syringe, Wheat, X } from "lucide-react";
import { useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { BigButton } from "./BigButton";
import { onlyWorker, WhoAreYou } from "./Pickers";
import { WorkerScreen } from "./TaskDetail";
import { stockNeeds } from "./taskText";
import type { TabletDay, TabletReport, TabletWorker } from "./types";

export type ReportDraft =
  | { type: "doctor_visit"; answer: boolean }
  | { type: "stock_needed"; answer: false }
  | { type: "stock_needed"; answer: true; stockKinds: StockKind[]; itemName: string | null }
  | { type: AnimalReport; animalTag: string }
  | { type: "purchase"; purchaseKind: PurchaseKind; itemName: string | null; amount: number };

type Step =
  | { name: "home" }
  | { name: "animal"; type: AnimalReport }
  | { name: "purchase" }
  | { name: "stock" }
  | { name: "who"; draft: ReportDraft };

const TILE = "min-h-[136px] flex-col gap-2 text-2xl";

const KIND_ICONS: Record<StockKind, ComponentType<{ className?: string }>> = {
  feed: Wheat,
  vaccine: Syringe,
  medicine: Pill,
  other: Package,
};

const FIELD = "h-20 rounded-2xl border-2 px-5 text-3xl sm:h-20 md:text-3xl";

/** One line per report, without the amount: the tablet is a shared screen. */
function reportLine(t: (key: string, options?: Record<string, unknown>) => string, report: TabletReport): string {
  switch (report.type) {
    case "animal_dead":
      return t("worker.report.deadLine", { tag: report.animalTag });
    case "animal_sick":
      return t("worker.report.sickLine", { tag: report.animalTag });
    default: {
      const kind = t(`worker.report.kind.${report.purchaseKind}`);
      return t("worker.report.boughtLine", { item: report.itemName ? `${kind}: ${report.itemName}` : kind });
    }
  }
}

function YesNoQuestion({
  question,
  answer,
  onAnswer,
  detail,
}: {
  question: string;
  answer: TabletReport | undefined;
  onAnswer: (answer: boolean) => void;
  detail?: string | null;
}) {
  const { t } = useTranslation();
  const choice = (value: boolean, label: string) => {
    const chosen = answer?.answer === value;
    return (
      <BigButton
        tone={chosen ? "start" : "plain"}
        icon={value ? Check : X}
        aria-pressed={chosen}
        onClick={() => onAnswer(value)}
        className="min-h-[80px] flex-1"
      >
        {label}
      </BigButton>
    );
  };
  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 className="text-2xl font-bold text-foreground sm:text-3xl">{question}</h3>
        {answer && <p className="text-xl text-muted-foreground">{t("worker.report.answeredBy", { name: answer.workerName })}</p>}
      </div>
      {detail && <p className="break-words text-2xl text-foreground">{detail}</p>}
      <div className="flex gap-3">
        {choice(true, t("worker.report.yes"))}
        {choice(false, t("worker.report.no"))}
      </div>
    </section>
  );
}

function AnimalForm({ type, onBack, onNext }: { type: AnimalReport; onBack: () => void; onNext: (tag: string) => void }) {
  const { t } = useTranslation();
  const [tag, setTag] = useState("");
  const clean = normalizeDigits(tag).trim();
  return (
    <WorkerScreen title={t(type === "animal_dead" ? "worker.report.deadTitle" : "worker.report.sickTitle")} onBack={onBack}>
      <form
        className="flex flex-col gap-6"
        onSubmit={event => {
          event.preventDefault();
          if (clean) onNext(clean);
        }}
      >
        <label className="flex flex-col gap-3 text-2xl font-semibold text-foreground">
          {t("worker.report.animalNumber")}
          <Input autoFocus dir="ltr" maxLength={40} autoComplete="off" value={tag} onChange={event => setTag(event.target.value)} className={cn(FIELD, "text-start")} />
        </label>
        <BigButton type="submit" tone="start" icon={ArrowRight} disabled={!clean} className="disabled:opacity-40 rtl:[&_svg]:rotate-180">
          {t("worker.report.next")}
        </BigButton>
      </form>
    </WorkerScreen>
  );
}

function PurchaseForm({ onBack, onNext }: { onBack: () => void; onNext: (draft: ReportDraft) => void }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<PurchaseKind | null>(null);
  const [item, setItem] = useState("");
  const [price, setPrice] = useState("");
  const amount = parseReportAmount(price);
  const itemName = item.trim() || null;
  const ready = kind !== null && amount !== null && (kind !== "other" || itemName !== null);
  return (
    <WorkerScreen title={t("worker.report.boughtTitle")} onBack={onBack}>
      <form
        className="flex flex-col gap-6"
        onSubmit={event => {
          event.preventDefault();
          if (ready) onNext({ type: "purchase", purchaseKind: kind, itemName, amount });
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PURCHASE_KINDS.map(option => (
            <BigButton
              key={option}
              tone={kind === option ? "start" : "plain"}
              icon={KIND_ICONS[option]}
              aria-pressed={kind === option}
              onClick={() => setKind(option)}
            >
              {t(`worker.report.kind.${option}`)}
            </BigButton>
          ))}
        </div>
        <label className="flex flex-col gap-3 text-2xl font-semibold text-foreground">
          {t(kind === "other" ? "worker.report.whatBought" : "worker.report.whatBoughtOptional")}
          <Input maxLength={120} autoComplete="off" value={item} onChange={event => setItem(event.target.value)} className={FIELD} />
        </label>
        <label className="flex flex-col gap-3 text-2xl font-semibold text-foreground">
          {t("worker.report.price")}
          <Input dir="ltr" inputMode="decimal" autoComplete="off" value={price} onChange={event => setPrice(event.target.value)} className={cn(FIELD, "text-start")} />
        </label>
        <BigButton type="submit" tone="start" icon={ArrowRight} disabled={!ready} className="disabled:opacity-40 rtl:[&_svg]:rotate-180">
          {t("worker.report.next")}
        </BigButton>
      </form>
    </WorkerScreen>
  );
}

function StockForm({
  current,
  onBack,
  onNext,
}: {
  current: TabletReport | undefined;
  onBack: () => void;
  onNext: (draft: ReportDraft) => void;
}) {
  const { t } = useTranslation();
  const [kinds, setKinds] = useState<readonly StockKind[]>(current?.stockKinds ?? []);
  const [note, setNote] = useState(current?.itemName ?? "");
  const itemName = note.trim() || null;
  const needsNote = kinds.includes("other");
  const ready = kinds.length > 0 && (!needsNote || itemName !== null);
  const toggle = (kind: StockKind) =>
    setKinds(chosen => chosen.includes(kind) ? chosen.filter(other => other !== kind) : [...chosen, kind]);
  return (
    <WorkerScreen title={t("worker.report.stockTitle")} onBack={onBack}>
      <form
        className="flex flex-col gap-6"
        onSubmit={event => {
          event.preventDefault();
          if (ready) onNext({ type: "stock_needed", answer: true, stockKinds: [...kinds], itemName });
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {STOCK_KINDS.map(kind => (
            <BigButton
              key={kind}
              tone={kinds.includes(kind) ? "start" : "plain"}
              icon={KIND_ICONS[kind]}
              aria-pressed={kinds.includes(kind)}
              onClick={() => toggle(kind)}
            >
              {t(`worker.report.kind.${kind}`)}
            </BigButton>
          ))}
        </div>
        <label className="flex flex-col gap-3 text-2xl font-semibold text-foreground">
          {t(needsNote ? "worker.report.whatStock" : "worker.report.whatStockOptional")}
          <Input maxLength={120} autoComplete="off" value={note} onChange={event => setNote(event.target.value)} className={FIELD} />
        </label>
        <BigButton type="submit" tone="start" icon={ArrowRight} disabled={!ready} className="disabled:opacity-40 rtl:[&_svg]:rotate-180">
          {t("worker.report.next")}
        </BigButton>
      </form>
    </WorkerScreen>
  );
}

/**
 * What the worker tells the owner at the end of the day: the doctor, animals,
 * stock and purchases. Every report says who's reporting, like a task does, and
 * goes to the owner without changing any farm record.
 */
export function DailyReport({
  day,
  onBack,
  onSubmit,
}: {
  day: TabletDay;
  onBack: () => void;
  onSubmit: (draft: ReportDraft, worker: TabletWorker) => void;
}) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<Step>({ name: "home" });
  const home = () => setStep({ name: "home" });
  const only = onlyWorker(day.workers);
  const ask = (draft: ReportDraft) => {
    if (!only) return setStep({ name: "who", draft });
    onSubmit(draft, only);
    home();
  };

  if (step.name === "animal") {
    return <AnimalForm type={step.type} onBack={home} onNext={animalTag => ask({ type: step.type, animalTag })} />;
  }
  if (step.name === "purchase") return <PurchaseForm onBack={home} onNext={ask} />;
  if (step.name === "stock") return <StockForm current={day.reports.find(report => report.type === "stock_needed")} onBack={home} onNext={ask} />;
  if (step.name === "who") {
    return (
      <WhoAreYou
        workers={day.workers}
        onBack={home}
        onPick={worker => {
          onSubmit(step.draft, worker);
          home();
        }}
      />
    );
  }

  const answerTo = (type: YesNoReport) => day.reports.find(report => report.type === type);
  const stock = answerTo("stock_needed");
  // The yes/no answers already show on their own questions.
  const others = day.reports.filter(report => report.answer === null);
  return (
    <WorkerScreen title={t("worker.report.title")} onBack={onBack}>
      <YesNoQuestion
        question={t("worker.report.doctorQuestion")}
        answer={answerTo("doctor_visit")}
        onAnswer={answer => ask({ type: "doctor_visit", answer })}
      />
      <YesNoQuestion
        question={t("worker.report.stockQuestion")}
        answer={stock}
        detail={stock?.stockKinds?.length ? stockNeeds(t, stock, i18n.language) : null}
        onAnswer={answer => answer ? setStep({ name: "stock" }) : ask({ type: "stock_needed", answer: false })}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <BigButton tone="plain" icon={HeartOff} onClick={() => setStep({ name: "animal", type: "animal_dead" })} className={TILE}>
          {t("worker.report.dead")}
        </BigButton>
        <BigButton tone="plain" icon={Activity} onClick={() => setStep({ name: "animal", type: "animal_sick" })} className={TILE}>
          {t("worker.report.sick")}
        </BigButton>
        <BigButton tone="plain" icon={ShoppingCart} onClick={() => setStep({ name: "purchase" })} className={TILE}>
          {t("worker.report.bought")}
        </BigButton>
      </div>
      {others.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-2xl font-bold text-foreground">{t("worker.report.sentToday")}</h3>
          <ul className="flex flex-col gap-2">
            {others.map(report => (
              <li key={report.id} className="flex flex-wrap items-baseline justify-between gap-x-4 rounded-2xl bg-muted px-5 py-4 text-2xl text-foreground">
                <span className="min-w-0 break-words">{reportLine(t, report)}</span>
                <span className="text-xl text-muted-foreground">{report.workerName}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </WorkerScreen>
  );
}
