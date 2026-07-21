import nodemailer, { type Transporter } from "nodemailer";
import { ENV } from "./env";

let transporter: Transporter | null = null;

function hasSmtpConfiguration() {
  return Boolean(ENV.smtpHost && ENV.smtpUser && ENV.smtpPassword && ENV.smtpFrom);
}

function hasCloudflareEmailBridge() {
  return Boolean(ENV.internalApiSecret && ENV.smtpFrom && ENV.baseDomain);
}

export function isEmailConfigured() {
  return hasCloudflareEmailBridge() || hasSmtpConfiguration();
}

function getTransporter() {
  if (transporter) return transporter;
  if (!hasSmtpConfiguration()) throw new Error("SMTP is not configured");
  transporter = nodemailer.createTransport({
    host: ENV.smtpHost,
    port: ENV.smtpPort,
    secure: ENV.smtpSecure,
    auth: { user: ENV.smtpUser, pass: ENV.smtpPassword },
  });
  return transporter;
}

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

async function sendViaCloudflareBridge(input: SendEmailInput) {
  const response = await fetch(`https://${ENV.baseDomain}/__internal/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.internalApiSecret}`,
    },
    body: JSON.stringify({
      from: ENV.smtpFrom,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });
  if (!response.ok) {
    throw new Error(`Cloudflare email bridge failed (${response.status})`);
  }
}

async function sendViaSmtp(input: SendEmailInput) {
  const client = getTransporter();
  await client.sendMail({
    from: ENV.smtpFrom,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

export async function sendEmail(input: SendEmailInput) {
  if (hasCloudflareEmailBridge()) {
    await sendViaCloudflareBridge(input);
    return;
  }
  await sendViaSmtp(input);
}
