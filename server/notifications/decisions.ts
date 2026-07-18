export type NotificationPriority = "low" | "medium" | "high" | "critical";

export type NotificationCandidate = Readonly<{
  alertType: string;
  title: string;
  message: string;
  relatedEntityType: string;
  relatedEntityId: string;
  priority: NotificationPriority;
}>;

export type LowStockRow = Readonly<{
  feedItemId: number;
  feedItemName: string;
  unit: string;
  stockOnHand: number;
  daysRemaining: number;
  status: string;
}>;

export type VaccinationDueRow = Readonly<{
  id: number;
  animalIdStr: string;
  vaccineName: string;
  nextDueDate: Date | string | null;
  notifyBeforeNext?: number | null;
}>;

export type BoosterDueRow = Readonly<{
  id: number;
  animalIdStr: string;
  vaccineName: string;
  boosterDueDate: Date | string | null;
  notifyBeforeBooster?: number | null;
}>;

export type PregnancyDueRow = Readonly<{
  id: number;
  animalIdStr: string;
  expectedDueDate: Date | string | null;
  notifyBeforeDue?: number | null;
}>;

export type PregnancyCheckupRow = Readonly<{
  id: number;
  animalIdStr: string;
  checkupDate: Date | string | null;
  notifyBeforeCheckup?: number | null;
}>;

function localDay(value: Date | string) {
  const date = new Date(value instanceof Date ? value.toISOString() : value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysFrom(now: Date, value: Date | string) {
  return Math.ceil((localDay(value).getTime() - localDay(now).getTime()) / 86_400_000);
}

export function notificationDayBucket(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function lowStockCandidates(rows: readonly LowStockRow[]): NotificationCandidate[] {
  return rows.flatMap(item => {
    if (item.status !== "critical" && item.status !== "low") return [];
    const critical = item.status === "critical";
    return [{
      alertType: "low_feed_stock",
      title: critical ? "Critical Feed Stock" : "Low Feed Stock",
      message: critical
        ? `${item.feedItemName} stock is critically low - only ${item.daysRemaining} days remaining (${item.stockOnHand.toFixed(0)} ${item.unit})`
        : `${item.feedItemName} stock is running low - ${item.daysRemaining} days remaining (${item.stockOnHand.toFixed(0)} ${item.unit})`,
      relatedEntityType: "feed_item",
      relatedEntityId: String(item.feedItemId),
      priority: critical ? "critical" : "high",
    }];
  });
}

export function vaccinationCandidates(
  nextRows: readonly VaccinationDueRow[],
  boosterRows: readonly BoosterDueRow[],
  now = new Date(),
): NotificationCandidate[] {
  const candidates: NotificationCandidate[] = [];
  for (const record of nextRows) {
    if (!record.nextDueDate) continue;
    const dueDate = localDay(record.nextDueDate);
    const diffDays = daysFrom(now, record.nextDueDate);
    if (diffDays < 0) {
      candidates.push({
        alertType: "vaccination_overdue",
        title: "Vaccination Overdue",
        message: `${record.animalIdStr} is overdue for ${record.vaccineName} vaccination (was due on ${dueDate.toLocaleDateString()})`,
        relatedEntityType: "vaccination_record",
        relatedEntityId: String(record.id),
        priority: "critical",
      });
    } else if (diffDays <= (record.notifyBeforeNext ?? 7)) {
      candidates.push({
        alertType: "vaccination_due",
        title: "Vaccination Due Soon",
        message: `${record.animalIdStr} is due for ${record.vaccineName} vaccination on ${dueDate.toLocaleDateString()}`,
        relatedEntityType: "vaccination_record",
        relatedEntityId: String(record.id),
        priority: "high",
      });
    }
  }

  for (const record of boosterRows) {
    if (!record.boosterDueDate) continue;
    const dueDate = localDay(record.boosterDueDate);
    const diffDays = daysFrom(now, record.boosterDueDate);
    if (diffDays < 0) {
      candidates.push({
        alertType: "booster_overdue",
        title: "Booster Vaccination Overdue",
        message: `${record.animalIdStr} is overdue for ${record.vaccineName} booster (was due on ${dueDate.toLocaleDateString()})`,
        relatedEntityType: "vaccination_record",
        relatedEntityId: String(record.id),
        priority: "critical",
      });
    } else if (diffDays <= (record.notifyBeforeBooster ?? 7)) {
      candidates.push({
        alertType: "booster_due",
        title: "Booster Vaccination Due Soon",
        message: `${record.animalIdStr} is due for ${record.vaccineName} booster on ${dueDate.toLocaleDateString()}`,
        relatedEntityType: "vaccination_record",
        relatedEntityId: String(record.id),
        priority: "high",
      });
    }
  }
  return candidates;
}

export function pregnancyCandidates(
  dueRows: readonly PregnancyDueRow[],
  checkupRows: readonly PregnancyCheckupRow[],
  now = new Date(),
): NotificationCandidate[] {
  const candidates: NotificationCandidate[] = [];
  for (const record of dueRows) {
    if (!record.expectedDueDate) continue;
    const dueDate = localDay(record.expectedDueDate);
    const diffDays = daysFrom(now, record.expectedDueDate);
    if (diffDays < 0) {
      candidates.push({
        alertType: "pregnancy_overdue",
        title: "Delivery Overdue",
        message: `${record.animalIdStr} is overdue to give birth (expected ${dueDate.toLocaleDateString()})`,
        relatedEntityType: "pregnancy_record",
        relatedEntityId: String(record.id),
        priority: "critical",
      });
    } else if (diffDays <= (record.notifyBeforeDue ?? 7)) {
      candidates.push({
        alertType: "pregnancy_due",
        title: "Delivery Due Soon",
        message: `${record.animalIdStr} is expected to give birth on ${dueDate.toLocaleDateString()} (${diffDays} day(s))`,
        relatedEntityType: "pregnancy_record",
        relatedEntityId: String(record.id),
        priority: "high",
      });
    }
  }

  for (const record of checkupRows) {
    if (!record.checkupDate) continue;
    const checkupDate = localDay(record.checkupDate);
    const diffDays = daysFrom(now, record.checkupDate);
    if (diffDays < 0) {
      candidates.push({
        alertType: "pregnancy_checkup_overdue",
        title: "Pregnancy Checkup Overdue",
        message: `${record.animalIdStr} missed a pregnancy checkup (was due ${checkupDate.toLocaleDateString()})`,
        relatedEntityType: "pregnancy_record",
        relatedEntityId: String(record.id),
        priority: "high",
      });
    } else if (diffDays <= (record.notifyBeforeCheckup ?? 3)) {
      candidates.push({
        alertType: "pregnancy_checkup_due",
        title: "Pregnancy Checkup Due Soon",
        message: `${record.animalIdStr} has a pregnancy checkup on ${checkupDate.toLocaleDateString()}`,
        relatedEntityType: "pregnancy_record",
        relatedEntityId: String(record.id),
        priority: "medium",
      });
    }
  }
  return candidates;
}
