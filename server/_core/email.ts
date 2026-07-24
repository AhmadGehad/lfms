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

/** Presence-only booleans for diagnostics — never logs actual secret values. */
export function getEmailConfigurationStatus() {
  return {
    hasInternalApiSecret: Boolean(ENV.internalApiSecret),
    hasSmtpFrom: Boolean(ENV.smtpFrom),
    hasBaseDomain: Boolean(ENV.baseDomain),
    hasSmtpHost: Boolean(ENV.smtpHost),
    hasSmtpUser: Boolean(ENV.smtpUser),
    hasSmtpPassword: Boolean(ENV.smtpPassword),
    cloudflareBridgeReady: hasCloudflareEmailBridge(),
    smtpReady: hasSmtpConfiguration(),
  };
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
  replyTo?: string;
};

function formatFromHeader() {
  return `LFMS <${ENV.smtpFrom}>`;
}

async function sendViaCloudflareBridge(input: SendEmailInput) {
  const response = await fetch(`https://${ENV.baseDomain}/__internal/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.internalApiSecret}`,
    },
    body: JSON.stringify({
      from: ENV.smtpFrom,
      fromName: "LFMS",
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo ?? ENV.supportEmail,
    }),
  });
  if (!response.ok) {
    throw new Error(`Cloudflare email bridge failed (${response.status})`);
  }
}

async function sendViaSmtp(input: SendEmailInput) {
  const client = getTransporter();
  await client.sendMail({
    from: formatFromHeader(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo ?? ENV.supportEmail,
  });
}

export async function sendEmail(input: SendEmailInput) {
  if (hasCloudflareEmailBridge()) {
    await sendViaCloudflareBridge(input);
    return;
  }
  await sendViaSmtp(input);
}
