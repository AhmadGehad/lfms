import { and, eq, gt, inArray } from "drizzle-orm";
import { emailLog, users } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { isEmailConfigured } from "../_core/email";
import { operationalAlertEmail } from "../_core/emailTemplates";
import { sendTemplatedEmail } from "../_core/sendTemplatedEmail";
import { getDb } from "../db";
import { getCompanyAdmins, getCompanyOwner } from "../platform/repositories/companies";
import { categoryForAlertType, getUserEmailPreferenceForCompany } from "./preferences";

const EMAILABLE_PRIORITIES = new Set(["critical", "high"]);
const COOLDOWN_MS = 4 * 60 * 60 * 1_000;

/**
 * Fans an operational alert out to email. All current alert-generating call
 * sites create broadcast notifications (no assigned userId), so recipients
 * are the company's active owner plus its active admins — day-to-day alerts
 * (vaccination/stock/pregnancy/growth) are exactly what an admin, not just the
 * owner, needs to see. Each recipient's own per-company email preference is
 * checked independently, so an admin who opted out of a category is skipped
 * without affecting the owner (or other admins).
 *
 * Some call sites (e.g. feed stock entry) have no dedup on the underlying
 * notification row, so a per-company/alertType cooldown prevents repeated
 * mutations within a short window from spamming the same email — this stays
 * a single company-wide cooldown, not one per recipient, since it's throttling
 * the alert event, not each person's inbox.
 */
export async function notifyOperationalAlertByEmail(input: {
  companyId: number;
  alertType: string;
  title: string;
  message: string;
  priority: "low" | "medium" | "high" | "critical";
  /** Instead of owner and admins, for alerts already addressed to named people. */
  recipientUserIds?: readonly number[];
  /** Each one is its own event, so a recent email of this type doesn't hold it back. */
  distinctEvent?: boolean;
}): Promise<void> {
  if (!EMAILABLE_PRIORITIES.has(input.priority)) return;
  if (!isEmailConfigured()) return;
  const category = categoryForAlertType(input.alertType);
  if (!category) return;
  const template = `operational_alert.${input.alertType}`;
  const db = await getDb();
  if (!db) return;
  if (!input.distinctEvent) {
    const [recent] = await db.select({ id: emailLog.id }).from(emailLog)
      .where(and(
        eq(emailLog.companyId, input.companyId),
        eq(emailLog.template, template),
        gt(emailLog.createdAt, new Date(Date.now() - COOLDOWN_MS)),
      ))
      .limit(1);
    if (recent) return;
  }
  const owner = await getCompanyOwner(input.companyId);
  if (!owner) return;
  const admins = await getCompanyAdmins(input.companyId);
  const recipients: Array<{ userId: number; email: string | null }> = input.recipientUserIds
    ? await db.select({ userId: users.id, email: users.email }).from(users)
      .where(inArray(users.id, [...input.recipientUserIds]))
    : [
        { userId: owner.userId, email: owner.email },
        ...admins.filter(admin => admin.userId !== owner.userId),
      ];
  const email = operationalAlertEmail({
    title: input.title,
    message: input.message,
    priority: input.priority,
    ctaUrl: `https://${owner.companySlug}.${ENV.baseDomain}/notifications`,
  });
  for (const recipient of recipients) {
    if (!recipient.email) continue;
    const wantsEmail = await getUserEmailPreferenceForCompany(recipient.userId, input.companyId, category);
    if (!wantsEmail) continue;
    await sendTemplatedEmail({
      template,
      to: recipient.email,
      companyId: input.companyId,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  }
}
