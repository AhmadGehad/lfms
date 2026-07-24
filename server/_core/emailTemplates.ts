const BRAND_GREEN = "#182619";
const BRAND_ACCENT = "#3f6b3f";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#b91c1c",
  high: "#c2410c",
  medium: "#1d4ed8",
  low: "#4b5563",
};

type LayoutInput = {
  previewText: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

function renderButton(label: string, url: string) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td style="border-radius: 6px; background-color: ${BRAND_GREEN};">
          <a href="${escapeHtml(url)}" style="display: inline-block; padding: 12px 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`;
}

function renderEmailLayout({ previewText, heading, bodyHtml, ctaLabel, ctaUrl }: LayoutInput) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(previewText)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
            <tr>
              <td style="background-color: ${BRAND_GREEN}; padding: 20px 32px;">
                <span style="font-size: 18px; font-weight: 700; color: #ffffff; letter-spacing: 0.5px;">LFMS</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 32px;">
                <h1 style="margin: 0 0 16px; font-size: 20px; color: #111827;">${escapeHtml(heading)}</h1>
                <div style="font-size: 15px; line-height: 1.6; color: #374151;">${bodyHtml}</div>
                ${ctaLabel && ctaUrl ? renderButton(ctaLabel, ctaUrl) : ""}
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 32px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #9ca3af;">
                Questions? Reply to this email or contact <a href="mailto:support@l-fms.com" style="color: ${BRAND_ACCENT};">support@l-fms.com</a>.
                <br />This is a transactional message related to your LFMS account.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

type EmailContent = { subject: string; text: string; html: string };

export function passwordResetEmail(input: { resetUrl: string; expiresInMinutes?: number; triggeredByAdmin?: boolean }): EmailContent {
  const expires = input.expiresInMinutes ?? 60;
  const subject = "Reset your LFMS password";
  const intro = input.triggeredByAdmin
    ? "An administrator triggered a password reset for your LFMS account."
    : "We received a request to reset your LFMS password.";
  const text = `${intro}\n\nSet a new password: ${input.resetUrl}\n\nThis link expires in ${expires} minutes. If you didn't expect this, contact your administrator.`;
  const html = renderEmailLayout({
    previewText: "Reset your LFMS password",
    heading: "Reset your password",
    bodyHtml: `<p>${intro} Click the button below to choose a new one.</p><p>This link expires in ${expires} minutes. If you didn't expect this, contact your administrator.</p>`,
    ctaLabel: "Reset password",
    ctaUrl: input.resetUrl,
  });
  return { subject, text, html };
}

export function platformPasswordResetEmail(input: { resetUrl: string; expiresInMinutes?: number; triggeredByAdmin?: boolean }): EmailContent {
  const expires = input.expiresInMinutes ?? 60;
  const subject = "Reset your LFMS platform admin password";
  const intro = input.triggeredByAdmin
    ? "An administrator triggered a password reset for your platform admin account."
    : "We received a request to reset your LFMS platform administrator password.";
  const text = `${intro}\n\nSet a new password: ${input.resetUrl}\n\nThis link expires in ${expires} minutes. If you didn't expect this, contact your administrator.`;
  const html = renderEmailLayout({
    previewText: "Reset your LFMS platform admin password",
    heading: "Reset your platform admin password",
    bodyHtml: `<p>${intro} Click the button below to choose a new one.</p><p>This link expires in ${expires} minutes. If you didn't expect this, contact your administrator.</p>`,
    ctaLabel: "Reset password",
    ctaUrl: input.resetUrl,
  });
  return { subject, text, html };
}

export function passwordChangedEmail(): EmailContent {
  const subject = "Your LFMS password was changed";
  const text = "Your LFMS password was just changed. If this wasn't you, contact support@l-fms.com immediately.";
  const html = renderEmailLayout({
    previewText: "Your LFMS password was changed",
    heading: "Your password was changed",
    bodyHtml: `<p>This confirms your LFMS password was just changed.</p><p>If you didn't make this change, contact <a href="mailto:support@l-fms.com" style="color: ${BRAND_ACCENT};">support@l-fms.com</a> immediately.</p>`,
  });
  return { subject, text, html };
}

export function platformPasswordChangedEmail(): EmailContent {
  const subject = "Your LFMS platform admin password was changed";
  const text = "Your LFMS platform administrator password was just changed. If this wasn't you, contact support@l-fms.com immediately.";
  const html = renderEmailLayout({
    previewText: "Your LFMS platform admin password was changed",
    heading: "Your platform admin password was changed",
    bodyHtml: `<p>This confirms your LFMS platform administrator password was just changed.</p><p>If you didn't make this change, contact <a href="mailto:support@l-fms.com" style="color: ${BRAND_ACCENT};">support@l-fms.com</a> immediately.</p>`,
  });
  return { subject, text, html };
}

export function membershipInvitationEmail(input: { companyName: string; acceptUrl: string; expiresInDays?: number }): EmailContent {
  const expires = input.expiresInDays ?? 7;
  const company = escapeHtml(input.companyName);
  const subject = `You've been invited to join ${input.companyName} on LFMS`;
  const text = `You've been invited to join ${input.companyName} on LFMS.\n\nAccept your invitation: ${input.acceptUrl}\n\nThis invitation expires in ${expires} days.`;
  const html = renderEmailLayout({
    previewText: `You've been invited to join ${input.companyName} on LFMS`,
    heading: "You've been invited",
    bodyHtml: `<p>You've been invited to join <strong>${company}</strong> on LFMS, a livestock farm management platform.</p><p>This invitation expires in ${expires} days.</p>`,
    ctaLabel: "Accept invitation",
    ctaUrl: input.acceptUrl,
  });
  return { subject, text, html };
}

export function ownerInvitationEmail(input: { companyName: string; acceptUrl: string; expiresInDays?: number }): EmailContent {
  const expires = input.expiresInDays ?? 7;
  const company = escapeHtml(input.companyName);
  const subject = `Welcome to LFMS — set up your account for ${input.companyName}`;
  const text = `Your LFMS account for ${input.companyName} is ready.\n\nSet up your account: ${input.acceptUrl}\n\nThis link expires in ${expires} days.`;
  const html = renderEmailLayout({
    previewText: `Set up your account for ${input.companyName}`,
    heading: "Welcome to LFMS",
    bodyHtml: `<p>Your LFMS workspace for <strong>${company}</strong> is ready. Set a password to get started managing your farm.</p><p>This link expires in ${expires} days.</p>`,
    ctaLabel: "Set up your account",
    ctaUrl: input.acceptUrl,
  });
  return { subject, text, html };
}

export function welcomeEmail(input: { companyName: string; dashboardUrl: string }): EmailContent {
  const company = escapeHtml(input.companyName);
  const subject = "You're all set on LFMS";
  const text = `You're all set! Your LFMS account for ${input.companyName} is ready.\n\nGo to your dashboard: ${input.dashboardUrl}`;
  const html = renderEmailLayout({
    previewText: "You're all set on LFMS",
    heading: "You're all set",
    bodyHtml: `<p>Your account for <strong>${company}</strong> is active. You can now log in and start managing your farm.</p>`,
    ctaLabel: "Go to dashboard",
    ctaUrl: input.dashboardUrl,
  });
  return { subject, text, html };
}

export function companySuspendedEmail(input: { companyName: string; reason?: string | null }): EmailContent {
  const company = escapeHtml(input.companyName);
  const reasonText = input.reason ? ` Reason: ${input.reason}` : "";
  const subject = `Your LFMS account for ${input.companyName} has been suspended`;
  const text = `Your LFMS account for ${input.companyName} has been suspended.${reasonText}\n\nContact support@l-fms.com for assistance.`;
  const html = renderEmailLayout({
    previewText: `Your LFMS account for ${input.companyName} has been suspended`,
    heading: "Your account has been suspended",
    bodyHtml: `<p>Access to <strong>${company}</strong> on LFMS has been suspended.${input.reason ? ` <strong>Reason:</strong> ${escapeHtml(input.reason)}` : ""}</p><p>Contact <a href="mailto:support@l-fms.com" style="color: ${BRAND_ACCENT};">support@l-fms.com</a> if you have questions.</p>`,
  });
  return { subject, text, html };
}

export function companyReactivatedEmail(input: { companyName: string; dashboardUrl: string }): EmailContent {
  const company = escapeHtml(input.companyName);
  const subject = `Your LFMS account for ${input.companyName} is active again`;
  const text = `Your LFMS account for ${input.companyName} has been reactivated.\n\nGo to your dashboard: ${input.dashboardUrl}`;
  const html = renderEmailLayout({
    previewText: `Your LFMS account for ${input.companyName} is active again`,
    heading: "Your account is active again",
    bodyHtml: `<p>Access to <strong>${company}</strong> on LFMS has been restored. You can log back in now.</p>`,
    ctaLabel: "Go to dashboard",
    ctaUrl: input.dashboardUrl,
  });
  return { subject, text, html };
}

export function subscriptionTrialEndingEmail(input: { companyName: string; daysRemaining: number; dashboardUrl: string }): EmailContent {
  const company = escapeHtml(input.companyName);
  const subject = `Your LFMS trial for ${input.companyName} ends in ${input.daysRemaining} days`;
  const text = `Your LFMS trial for ${input.companyName} ends in ${input.daysRemaining} days.\n\nContact support@l-fms.com to choose a plan and keep uninterrupted access.\n\nYour dashboard: ${input.dashboardUrl}`;
  const html = renderEmailLayout({
    previewText: `Your trial ends in ${input.daysRemaining} days`,
    heading: "Your trial is ending soon",
    bodyHtml: `<p>Your LFMS trial for <strong>${company}</strong> ends in <strong>${input.daysRemaining} days</strong>. Contact <a href="mailto:support@l-fms.com" style="color: ${BRAND_ACCENT};">support@l-fms.com</a> to choose a plan and keep uninterrupted access.</p>`,
    ctaLabel: "Go to dashboard",
    ctaUrl: input.dashboardUrl,
  });
  return { subject, text, html };
}

export function subscriptionExpiredEmail(input: { companyName: string; dashboardUrl: string }): EmailContent {
  const company = escapeHtml(input.companyName);
  const subject = `Your LFMS subscription for ${input.companyName} has expired`;
  const text = `Your LFMS subscription for ${input.companyName} has expired.\n\nContact support@l-fms.com to renew and restore full access.\n\nYour dashboard: ${input.dashboardUrl}`;
  const html = renderEmailLayout({
    previewText: `Your subscription for ${input.companyName} has expired`,
    heading: "Your subscription has expired",
    bodyHtml: `<p>Your LFMS subscription for <strong>${company}</strong> has expired. Contact <a href="mailto:support@l-fms.com" style="color: ${BRAND_ACCENT};">support@l-fms.com</a> to renew and restore full access.</p>`,
    ctaLabel: "Go to dashboard",
    ctaUrl: input.dashboardUrl,
  });
  return { subject, text, html };
}

export function planChangedEmail(input: { companyName: string; planName: string; dashboardUrl: string }): EmailContent {
  const company = escapeHtml(input.companyName);
  const plan = escapeHtml(input.planName);
  const subject = `Your LFMS plan for ${input.companyName} has changed`;
  const text = `Your LFMS plan for ${input.companyName} is now ${input.planName}.\n\nYour dashboard: ${input.dashboardUrl}`;
  const html = renderEmailLayout({
    previewText: `Your plan is now ${input.planName}`,
    heading: "Your plan has changed",
    bodyHtml: `<p>Your LFMS plan for <strong>${company}</strong> is now <strong>${plan}</strong>.</p>`,
    ctaLabel: "Go to dashboard",
    ctaUrl: input.dashboardUrl,
  });
  return { subject, text, html };
}

export function deletionRequestedEmail(input: { companyName: string; gracePeriodEndsAt: Date; supportUrl: string }): EmailContent {
  const company = escapeHtml(input.companyName);
  const until = input.gracePeriodEndsAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const subject = `Deletion requested for ${input.companyName} on LFMS`;
  const text = `A deletion request has been made for ${input.companyName}. Your data will be permanently removed on ${until} unless canceled.\n\nContact support: ${input.supportUrl}`;
  const html = renderEmailLayout({
    previewText: `Your data will be removed on ${until} unless canceled`,
    heading: "Account deletion requested",
    bodyHtml: `<p>A deletion request has been made for <strong>${company}</strong>. Unless canceled, your data will be permanently removed on <strong>${until}</strong>.</p>`,
    ctaLabel: "Contact support",
    ctaUrl: input.supportUrl,
  });
  return { subject, text, html };
}

export function deletionCanceledEmail(input: { companyName: string; supportUrl: string }): EmailContent {
  const company = escapeHtml(input.companyName);
  const subject = `Deletion canceled for ${input.companyName} on LFMS`;
  const text = `The deletion request for ${input.companyName} has been canceled and your data is safe. Your account is suspended pending review; contact support to restore full access.\n\nContact support: ${input.supportUrl}`;
  const html = renderEmailLayout({
    previewText: `Deletion canceled for ${input.companyName}`,
    heading: "Account deletion canceled",
    bodyHtml: `<p>The deletion request for <strong>${company}</strong> has been canceled and your data is safe. Your account is currently suspended pending review — contact support to restore full access.</p>`,
    ctaLabel: "Contact support",
    ctaUrl: input.supportUrl,
  });
  return { subject, text, html };
}

export function operationalAlertEmail(input: {
  title: string;
  message: string;
  priority: "low" | "medium" | "high" | "critical";
  ctaUrl: string;
}): EmailContent {
  const color = PRIORITY_COLORS[input.priority] ?? PRIORITY_COLORS.medium;
  const message = escapeHtml(input.message);
  const text = `${input.message}\n\nView in LFMS: ${input.ctaUrl}`;
  const html = renderEmailLayout({
    previewText: input.title,
    heading: input.title,
    bodyHtml: `<p><span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background-color: ${color}; color: #ffffff; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(input.priority)}</span></p><p>${message}</p>`,
    ctaLabel: "View in LFMS",
    ctaUrl: input.ctaUrl,
  });
  return { subject: input.title, text, html };
}
