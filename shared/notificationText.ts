/**
 * Task and report notifications, in the reader's language. The row stores the
 * details rather than a finished sentence, so the same notification reads right
 * in the app, in a push and in an email. Older alert types keep their stored
 * English text and return null here.
 */
import type { BlockedReason, PurchaseKind, StockKind, YesNoReport } from "./tasks";

export type NotificationLanguage = "en" | "ar";

export type NotificationParams = {
  worker?: string;
  task?: string;
  vaccine?: string;
  animal?: string;
  reason?: BlockedReason | null;
  answer?: boolean;
  tag?: string;
  kinds?: readonly StockKind[] | null;
  item?: string | null;
  purchaseKind?: PurchaseKind | null;
  amount?: string | null;
  /** The day a report never came for, and which questions went unanswered. */
  date?: string;
  missing?: readonly YesNoReport[];
};

const REASONS: Record<NotificationLanguage, Record<BlockedReason, string>> = {
  en: { no_supplies: "no supplies", animal_problem: "animal problem", no_time: "no time", other: "other reason" },
  ar: { no_supplies: "لا توجد مستلزمات", animal_problem: "مشكلة في الحيوان", no_time: "لا يوجد وقت", other: "سبب آخر" },
};

const KINDS: Record<NotificationLanguage, Record<StockKind, string>> = {
  en: { feed: "feed", vaccine: "vaccine", medicine: "medicine", other: "other" },
  ar: { feed: "علف", vaccine: "لقاح", medicine: "دواء", other: "شيء آخر" },
};

const QUESTIONS: Record<NotificationLanguage, Record<YesNoReport, string>> = {
  en: { doctor_visit: "doctor visit", stock_needed: "stock" },
  ar: { doctor_visit: "زيارة الدكتور", stock_needed: "المخزون" },
};

const COMMA: Record<NotificationLanguage, string> = { en: ", ", ar: "، " };

function taskLabel(params: NotificationParams, language: NotificationLanguage): string {
  if (params.vaccine) {
    const animal = params.animal ?? (language === "ar" ? "حيوان" : "animal");
    return language === "ar" ? `تحصين ${animal} (${params.vaccine})` : `Vaccinate ${animal} (${params.vaccine})`;
  }
  return params.animal ? `${params.task} (${params.animal})` : params.task ?? "";
}

function stockList(params: NotificationParams, language: NotificationLanguage): string {
  const named = (params.kinds ?? []).filter(kind => kind !== "other").map(kind => KINDS[language][kind]);
  return [...named, params.item?.trim()].filter(Boolean).join(COMMA[language]);
}

/** The title and message for a task or report alert, or null for any other kind. */
export function taskNotificationText(
  alertType: string | null | undefined,
  params: NotificationParams | null | undefined,
  language: NotificationLanguage,
): { title: string; message: string } | null {
  if (!params) return null;
  const ar = language === "ar";
  const worker = params.worker ?? (ar ? "عامل" : "A worker");
  const task = taskLabel(params, language);
  switch (alertType) {
    case "task_started":
      return ar
        ? { title: "بدأت مهمة", message: `${worker} بدأ: ${task}` }
        : { title: "Task started", message: `${worker} started ${task}` };
    case "task_done":
      return ar
        ? { title: "تمت مهمة", message: `${worker} أنهى: ${task}` }
        : { title: "Task done", message: `${worker} finished ${task}` };
    case "task_blocked": {
      const reason = params.reason ? REASONS[language][params.reason] : null;
      return ar
        ? { title: "تعذرت مهمة", message: `${worker} لم يتمكن من: ${task}${reason ? ` (${reason})` : ""}` }
        : { title: "Task can't be done", message: `${worker} can't do ${task}${reason ? `: ${reason}` : ""}` };
    }
    case "task_undone":
      return ar
        ? { title: "تم التراجع عن مهمة", message: `${worker} تراجع عن: ${task}` }
        : { title: "Task undone", message: `${worker} undid ${task}` };
    case "task_report_doctor_visit":
      if (params.answer) {
        return ar
          ? { title: "زيارة الدكتور", message: `${worker}: حضر الدكتور اليوم` }
          : { title: "Doctor visit", message: `${worker}: the doctor came today` };
      }
      return ar
        ? { title: "زيارة الدكتور", message: `${worker}: لم يحضر الدكتور اليوم` }
        : { title: "Doctor visit", message: `${worker}: the doctor did not come today` };
    case "task_report_stock_needed":
      if (params.answer) {
        const needs = stockList(params, language);
        return ar
          ? { title: "مطلوب مخزون", message: `${worker}: نحتاج مخزون: ${needs}` }
          : { title: "Stock needed", message: `${worker}: stock is needed: ${needs}` };
      }
      return ar
        ? { title: "المخزون", message: `${worker}: لا نحتاج مخزون` }
        : { title: "Stock", message: `${worker}: no stock is needed` };
    case "task_report_animal_dead":
      return ar
        ? { title: "حيوان مات", message: `${worker}: الحيوان ${params.tag} مات. أكّد ذلك من التقارير.` }
        : { title: "Animal died", message: `${worker}: animal ${params.tag} died. Confirm it in Reports.` };
    case "task_report_animal_sick":
      return ar
        ? { title: "حيوان تعبان", message: `${worker}: الحيوان ${params.tag} تعبان` }
        : { title: "Animal is tired", message: `${worker}: animal ${params.tag} is tired` };
    case "task_report_purchase": {
      const kind = params.purchaseKind ? KINDS[language][params.purchaseKind] : "";
      const item = params.item?.trim() || kind;
      return ar
        ? { title: "شراء", message: `${worker} اشترى ${item} بسعر ${params.amount}` }
        : { title: "Purchase", message: `${worker} bought ${item} for ${params.amount}` };
    }
    case "task_report_missing": {
      const missing = (params.missing ?? []).map(type => QUESTIONS[language][type]).join(COMMA[language]);
      const day = (params.date ?? "").split("-").reverse().join("/");
      return ar
        ? { title: "لم يصل التقرير اليومي", message: `${params.worker ?? "العامل"} لم يرسل تقرير يوم ${day}: ${missing}` }
        : { title: "Daily report missing", message: `${params.worker ?? "The worker"} didn't send the report for ${day}: ${missing}` };
    }
    default:
      return null;
  }
}
