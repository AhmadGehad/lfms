import { emailLog } from "../../drizzle/schema";
import { getDb } from "../db";
import { logger } from "../observability/logger";
import { isEmailConfigured, sendEmail } from "./email";

type TemplatedEmailInput = {
  template: string;
  to: string;
  companyId?: number;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
};

async function logEmailAttempt(
  input: TemplatedEmailInput & { status: "sent" | "failed" | "skipped_unconfigured"; errorMessage?: string },
) {
  try {
    const database = await getDb();
    if (!database) return;
    await database.insert(emailLog).values({
      template: input.template,
      recipientEmail: input.to,
      companyId: input.companyId ?? null,
      status: input.status,
      errorMessage: input.errorMessage ?? null,
    });
  } catch (error) {
    logger.error("email.log_write_failed", { template: input.template, error });
  }
}

/** Sends a templated email and always records an emailLog row, regardless of outcome. */
export async function sendTemplatedEmail(input: TemplatedEmailInput): Promise<boolean> {
  if (!isEmailConfigured()) {
    await logEmailAttempt({ ...input, status: "skipped_unconfigured" });
    return false;
  }
  try {
    await sendEmail({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
    });
    await logEmailAttempt({ ...input, status: "sent" });
    return true;
  } catch (error) {
    await logEmailAttempt({
      ...input,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    logger.error("email.send_failed", { template: input.template, error });
    return false;
  }
}
