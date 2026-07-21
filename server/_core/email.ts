import nodemailer, { type Transporter } from "nodemailer";
import { ENV } from "./env";

let transporter: Transporter | null = null;

export function isEmailConfigured() {
  return Boolean(ENV.smtpHost && ENV.smtpUser && ENV.smtpPassword && ENV.smtpFrom);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isEmailConfigured()) throw new Error("SMTP is not configured");
  transporter = nodemailer.createTransport({
    host: ENV.smtpHost,
    port: ENV.smtpPort,
    secure: ENV.smtpSecure,
    auth: { user: ENV.smtpUser, pass: ENV.smtpPassword },
  });
  return transporter;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const client = getTransporter();
  await client.sendMail({
    from: ENV.smtpFrom,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
