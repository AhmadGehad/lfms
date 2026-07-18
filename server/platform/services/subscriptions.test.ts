import { describe, expect, it } from "vitest";
import { assignSubscription } from "./subscriptions";

const actor = {
  platformAdminId: 1,
  userId: 2,
  permissions: new Set(["subscriptions.write"]),
  sessionId: 3,
  authenticationLevel: "mfa" as const,
  requestId: "subscription-service-test",
};

const base = {
  companyPublicId: "01J00000000000000000000001",
  planPublicId: "01J00000000000000000000002",
  periodStart: new Date("2026-07-01T00:00:00Z"),
  periodEnd: new Date("2026-08-01T00:00:00Z"),
  expectedCompanyVersion: 1,
  idempotencyKey: "subscription-test-key",
};

describe("subscription lifecycle validation", () => {
  it("requires a bounded explicit trial end", async () => {
    await expect(assignSubscription({
      ...base,
      status: "trialing",
      trialEndsAt: null,
    }, actor)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    await expect(assignSubscription({
      ...base,
      status: "trialing",
      trialEndsAt: new Date("2026-09-01T00:00:00Z"),
    }, actor)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("requires a grace end after the paid period", async () => {
    await expect(assignSubscription({
      ...base,
      status: "past_due",
      graceEndsAt: null,
    }, actor)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    await expect(assignSubscription({
      ...base,
      status: "past_due",
      graceEndsAt: base.periodEnd,
    }, actor)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
