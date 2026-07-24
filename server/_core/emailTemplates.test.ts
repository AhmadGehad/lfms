import { describe, expect, it } from "vitest";
import {
  companySuspendedEmail,
  deletionCanceledEmail,
  deletionRequestedEmail,
  membershipInvitationEmail,
  operationalAlertEmail,
  ownerInvitationEmail,
  passwordChangedEmail,
  passwordResetEmail,
  planChangedEmail,
  subscriptionExpiredEmail,
  subscriptionTrialEndingEmail,
  welcomeEmail,
} from "./emailTemplates";

function assertWellFormed(email: { subject: string; text: string; html: string }) {
  expect(email.subject.length).toBeGreaterThan(0);
  expect(email.text.length).toBeGreaterThan(0);
  expect(email.html).toContain("<!doctype html>");
  expect(email.html).toContain("LFMS");
}

describe("emailTemplates", () => {
  it("passwordResetEmail includes the reset link and expiry", () => {
    const email = passwordResetEmail({ resetUrl: "https://azal-farms.l-fms.com/reset-password?token=abc", expiresInMinutes: 60 });
    assertWellFormed(email);
    expect(email.text).toContain("https://azal-farms.l-fms.com/reset-password?token=abc");
    expect(email.html).toContain("https://azal-farms.l-fms.com/reset-password?token=abc");
    expect(email.text).toContain("60 minutes");
  });

  it("passwordResetEmail changes copy when triggered by an admin", () => {
    const selfService = passwordResetEmail({ resetUrl: "https://x/reset", triggeredByAdmin: false });
    const adminTriggered = passwordResetEmail({ resetUrl: "https://x/reset", triggeredByAdmin: true });
    expect(selfService.text).not.toContain("administrator triggered");
    expect(adminTriggered.text).toContain("administrator triggered");
  });

  it("passwordChangedEmail is a security notice with no reset link", () => {
    const email = passwordChangedEmail();
    assertWellFormed(email);
    expect(email.text.toLowerCase()).toContain("changed");
    expect(email.text.toLowerCase()).toContain("support@l-fms.com");
  });

  it("membershipInvitationEmail includes the company name and accept link", () => {
    const email = membershipInvitationEmail({
      companyName: "Azal Farms",
      acceptUrl: "https://azal-farms.l-fms.com/accept-invitation#token=xyz",
      expiresInDays: 7,
    });
    assertWellFormed(email);
    expect(email.subject).toContain("Azal Farms");
    expect(email.html).toContain("Azal Farms");
    expect(email.html).toContain("#token=xyz");
    expect(email.text).toContain("7 days");
  });

  it("membershipInvitationEmail escapes HTML in a hostile company name", () => {
    const email = membershipInvitationEmail({
      companyName: "<script>alert(1)</script>",
      acceptUrl: "https://x/accept",
    });
    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("ownerInvitationEmail welcomes the new company owner", () => {
    const email = ownerInvitationEmail({ companyName: "Azal Farms", acceptUrl: "https://x/accept#token=abc" });
    assertWellFormed(email);
    expect(email.subject.toLowerCase()).toContain("azal farms");
  });

  it("welcomeEmail links to the tenant dashboard", () => {
    const email = welcomeEmail({ companyName: "Azal Farms", dashboardUrl: "https://azal-farms.l-fms.com/" });
    assertWellFormed(email);
    expect(email.html).toContain("https://azal-farms.l-fms.com/");
  });

  it("companySuspendedEmail includes the suspension reason when given", () => {
    const withReason = companySuspendedEmail({ companyName: "Azal Farms", reason: "Payment failed" });
    const withoutReason = companySuspendedEmail({ companyName: "Azal Farms", reason: null });
    expect(withReason.html).toContain("Payment failed");
    expect(withoutReason.html).not.toContain("Reason:");
  });

  it("deletionRequestedEmail includes the grace period end date", () => {
    const email = deletionRequestedEmail({
      companyName: "Azal Farms",
      gracePeriodEndsAt: new Date("2026-08-01T00:00:00.000Z"),
      supportUrl: "mailto:support@l-fms.com",
    });
    assertWellFormed(email);
    expect(email.html).toContain("2026");
  });

  it("deletionCanceledEmail correctly says the account is suspended, not active", () => {
    const email = deletionCanceledEmail({ companyName: "Azal Farms", supportUrl: "mailto:support@l-fms.com" });
    assertWellFormed(email);
    expect(email.text.toLowerCase()).toContain("suspended");
    expect(email.text.toLowerCase()).not.toContain("remains active");
  });

  it("subscriptionTrialEndingEmail includes days remaining and points to support, not a billing UI", () => {
    const email = subscriptionTrialEndingEmail({ companyName: "Azal Farms", daysRemaining: 3, dashboardUrl: "https://azal-farms.l-fms.com/" });
    assertWellFormed(email);
    expect(email.subject).toContain("3 days");
    expect(email.text).toContain("support@l-fms.com");
  });

  it("subscriptionExpiredEmail points to support to renew", () => {
    const email = subscriptionExpiredEmail({ companyName: "Azal Farms", dashboardUrl: "https://azal-farms.l-fms.com/" });
    assertWellFormed(email);
    expect(email.text).toContain("support@l-fms.com");
  });

  it("planChangedEmail includes the new plan name", () => {
    const email = planChangedEmail({ companyName: "Azal Farms", planName: "Pro", dashboardUrl: "https://azal-farms.l-fms.com/" });
    assertWellFormed(email);
    expect(email.html).toContain("Pro");
  });

  it("operationalAlertEmail uses the raw title as the subject (not HTML-escaped)", () => {
    const email = operationalAlertEmail({
      title: "Critical Feed Stock — Corn & Barley",
      message: "Corn stock is critically low",
      priority: "critical",
      ctaUrl: "https://azal-farms.l-fms.com/notifications",
    });
    assertWellFormed(email);
    expect(email.subject).toBe("Critical Feed Stock — Corn & Barley");
    expect(email.html).toContain(">critical<");
    expect(email.html).toContain("text-transform: uppercase");
  });
});
