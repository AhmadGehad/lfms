import { describe, expect, it } from "vitest";
import {
  categoryForAlertType,
  getChannelPreference,
  NOTIFICATION_CATEGORIES,
  parseNotificationPreferences,
} from "./preferences";

describe("categoryForAlertType", () => {
  it("maps every known alert type to its category", () => {
    expect(categoryForAlertType("low_feed_stock")).toBe("feed_stock");
    expect(categoryForAlertType("vaccination_due")).toBe("vaccination");
    expect(categoryForAlertType("vaccination_overdue")).toBe("vaccination");
    expect(categoryForAlertType("booster_due")).toBe("vaccination");
    expect(categoryForAlertType("pregnancy_due")).toBe("pregnancy");
    expect(categoryForAlertType("pregnancy_checkup_overdue")).toBe("pregnancy");
    expect(categoryForAlertType("target_weight_reached")).toBe("growth");
    expect(categoryForAlertType("ready_to_sell")).toBe("growth");
  });

  it("returns null for an unknown or manually-created alert type", () => {
    expect(categoryForAlertType("some_custom_admin_alert")).toBeNull();
  });
});

describe("parseNotificationPreferences", () => {
  it("returns an empty object for null/undefined/malformed input", () => {
    expect(parseNotificationPreferences(null)).toEqual({});
    expect(parseNotificationPreferences(undefined)).toEqual({});
    expect(parseNotificationPreferences("not an object")).toEqual({});
    expect(parseNotificationPreferences(42)).toEqual({});
  });

  it("parses well-formed per-category preferences", () => {
    const parsed = parseNotificationPreferences({
      feed_stock: { inApp: true, email: false },
      vaccination: { inApp: false, email: false },
    });
    expect(parsed.feed_stock).toEqual({ inApp: true, email: false });
    expect(parsed.vaccination).toEqual({ inApp: false, email: false });
    expect(parsed.pregnancy).toBeUndefined();
  });

  it("defaults missing/non-boolean channel fields to true rather than dropping the category", () => {
    const parsed = parseNotificationPreferences({ growth: { inApp: false } });
    expect(parsed.growth).toEqual({ inApp: false, email: true });
  });

  it("ignores unknown categories", () => {
    const parsed = parseNotificationPreferences({ not_a_real_category: { inApp: false, email: false } });
    expect(parsed).toEqual({});
  });
});

describe("getChannelPreference", () => {
  it("defaults to both channels enabled when a category has no stored preference", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(getChannelPreference({}, category)).toEqual({ inApp: true, email: true });
    }
  });

  it("returns the stored preference when present", () => {
    const preferences = { feed_stock: { inApp: true, email: false } };
    expect(getChannelPreference(preferences, "feed_stock")).toEqual({ inApp: true, email: false });
  });
});
