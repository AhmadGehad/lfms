import { taskNotificationText, type NotificationParams } from "../../shared/notificationText";
import { logger } from "../observability/logger";
import { notifyOperationalAlertByEmail } from "./emailFanout";
import { notifyOperationalAlertByPush } from "./pushFanout";

type OperationalAlert = {
  companyId: number;
  alertType: string;
  title: string;
  message: string;
  priority: "low" | "medium" | "high" | "critical";
};

/** Sends an alert everywhere beyond the app itself. Never throws: the record is already saved. */
export function notifyOperationalAlert(alert: OperationalAlert): void {
  notifyOperationalAlertByEmail(alert).catch(error => logger.error("notification.email_failed", { error }));
  notifyOperationalAlertByPush({
    ...alert,
    contentFor: () => ({ title: alert.title, body: alert.message }),
  }).catch(error => logger.error("notification.push_failed", { error }));
}

export type TaskAlert = {
  companyId: number;
  alertType: string;
  relatedEntityType: string;
  priority: "low" | "medium" | "high";
  params: NotificationParams;
  recipientUserIds: number[];
};

/**
 * The email and push for a task or report, sent after its transaction commits so
 * nothing goes out for work that rolled back. Each one is a separate event, so the
 * usual repeat-alert cooldown doesn't apply.
 */
export function sendTaskAlert(alert: TaskAlert): void {
  const text = (language: "en" | "ar") => taskNotificationText(alert.alertType, alert.params, language)!;
  const english = text("en");
  notifyOperationalAlertByEmail({
    companyId: alert.companyId,
    alertType: alert.alertType,
    title: english.title,
    // The reader's language isn't known per email address, so both are sent.
    message: `${english.message} — ${text("ar").message}`,
    priority: alert.priority,
    recipientUserIds: alert.recipientUserIds,
    distinctEvent: true,
  }).catch(error => logger.error("notification.email_failed", { error }));
  notifyOperationalAlertByPush({
    companyId: alert.companyId,
    alertType: alert.alertType,
    relatedEntityType: alert.relatedEntityType,
    priority: alert.priority,
    recipientUserIds: alert.recipientUserIds,
    distinctEvent: true,
    contentFor: language => {
      const { title, message } = text(language);
      return { title, body: message };
    },
  }).catch(error => logger.error("notification.push_failed", { error }));
}
