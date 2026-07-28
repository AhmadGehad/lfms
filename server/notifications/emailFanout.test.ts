import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "../testing/fakeDb";
import { emailLog } from "../../drizzle/schema";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  isEmailConfigured: vi.fn(),
  sendTemplatedEmail: vi.fn(),
  getCompanyOwner: vi.fn(),
  getCompanyAdmins: vi.fn(),
  getUserEmailPreferenceForCompany: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("../_core/email", () => ({ isEmailConfigured: mocks.isEmailConfigured }));
vi.mock("../_core/sendTemplatedEmail", () => ({ sendTemplatedEmail: mocks.sendTemplatedEmail }));
vi.mock("../platform/repositories/companies", () => ({
  getCompanyOwner: mocks.getCompanyOwner,
  getCompanyAdmins: mocks.getCompanyAdmins,
}));
vi.mock("./preferences", async importOriginal => {
  const original = await importOriginal<typeof import("./preferences")>();
  return { ...original, getUserEmailPreferenceForCompany: mocks.getUserEmailPreferenceForCompany };
});

import { notifyOperationalAlertByEmail } from "./emailFanout";

const owner = { userId: 1, email: "owner@azal-farms.test", companySlug: "azal-farms" };
const alert = {
  companyId: 210001,
  alertType: "low_feed_stock",
  title: "Corn is low",
  message: "Corn stock is critically low",
  priority: "critical" as const,
};

let fake: FakeDb;

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeDb();
  mocks.getDb.mockResolvedValue(fake.db);
  mocks.isEmailConfigured.mockReturnValue(true);
  mocks.sendTemplatedEmail.mockResolvedValue(undefined);
  mocks.getCompanyOwner.mockResolvedValue(owner);
  mocks.getCompanyAdmins.mockResolvedValue([]);
  mocks.getUserEmailPreferenceForCompany.mockResolvedValue(true);
});

describe("notifyOperationalAlertByEmail", () => {
  it("emails the owner alone when the company has no admins", async () => {
    await notifyOperationalAlertByEmail(alert);

    expect(mocks.sendTemplatedEmail).toHaveBeenCalledOnce();
    expect(mocks.sendTemplatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@azal-farms.test" }),
    );
  });

  it("also emails every active admin, each checked against their own preference", async () => {
    mocks.getCompanyAdmins.mockResolvedValue([
      { userId: 2, email: "admin-a@azal-farms.test" },
      { userId: 3, email: "admin-b@azal-farms.test" },
    ]);
    // Admin B has opted out of this category; owner and admin A have not.
    mocks.getUserEmailPreferenceForCompany.mockImplementation(async (userId: number) => userId !== 3);

    await notifyOperationalAlertByEmail(alert);

    const sentTo = mocks.sendTemplatedEmail.mock.calls.map(call => call[0].to);
    expect(sentTo).toEqual(["owner@azal-farms.test", "admin-a@azal-farms.test"]);
    expect(mocks.getUserEmailPreferenceForCompany).toHaveBeenCalledWith(1, alert.companyId, "feed_stock");
    expect(mocks.getUserEmailPreferenceForCompany).toHaveBeenCalledWith(2, alert.companyId, "feed_stock");
    expect(mocks.getUserEmailPreferenceForCompany).toHaveBeenCalledWith(3, alert.companyId, "feed_stock");
  });

  it("skips every recipient when the cooldown window is still active", async () => {
    fake.queue(emailLog, [{ id: 999 }]);
    mocks.getCompanyAdmins.mockResolvedValue([{ userId: 2, email: "admin-a@azal-farms.test" }]);

    await notifyOperationalAlertByEmail(alert);

    // The cooldown check happens before recipients are even resolved.
    expect(mocks.getCompanyOwner).not.toHaveBeenCalled();
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("does not double-send if an admin row and the owner were somehow the same user", async () => {
    mocks.getCompanyAdmins.mockResolvedValue([{ userId: owner.userId, email: owner.email }]);

    await notifyOperationalAlertByEmail(alert);

    expect(mocks.sendTemplatedEmail).toHaveBeenCalledOnce();
  });

  it("sends nothing when there is no active owner at all", async () => {
    mocks.getCompanyOwner.mockResolvedValue(null);
    mocks.getCompanyAdmins.mockResolvedValue([{ userId: 2, email: "admin-a@azal-farms.test" }]);

    await notifyOperationalAlertByEmail(alert);

    // No owner means no companySlug to build the CTA URL from, and this alert
    // type has never required an owner-less send path.
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("does nothing for a medium-priority alert", async () => {
    await notifyOperationalAlertByEmail({ ...alert, priority: "medium" });
    expect(mocks.getCompanyOwner).not.toHaveBeenCalled();
  });

  it("does nothing when email is not configured", async () => {
    mocks.isEmailConfigured.mockReturnValue(false);
    await notifyOperationalAlertByEmail(alert);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
