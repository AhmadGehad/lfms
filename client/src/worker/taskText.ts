import type { TFunction } from "i18next";

/** A vaccination task stores only the vaccine; the sentence follows the screen's language. */
export function taskTitle(
  t: TFunction,
  task: { title: string; source: string; animalTag: string | null },
): string {
  if (task.source === "vaccination") {
    return t("worker.vaccinate", {
      defaultValue: "Vaccinate {{animal}} ({{vaccine}})",
      animal: task.animalTag ?? "",
      vaccine: task.title,
    });
  }
  return task.animalTag ? `${task.title} (${task.animalTag})` : task.title;
}

/** The stock a worker asked for: the chosen kinds, then what they typed. */
export function stockNeeds(t: TFunction, report: { stockKinds: readonly string[] | null; itemName: string | null }, language: string): string {
  const named = (report.stockKinds ?? []).filter(kind => kind !== "other").map(kind => t(`worker.report.kind.${kind}`));
  return [...named, report.itemName].filter(Boolean).join(language === "ar" ? "، " : ", ");
}
