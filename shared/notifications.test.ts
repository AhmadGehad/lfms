import { describe, expect, it } from "vitest";
import { NOTIFICATION_PRIORITIES, formatAlertType, notificationCategory, notificationLink, priorityTone } from "./notifications";

describe("priorityTone", () => {
  it("escalates urgency from low through critical", () => {
    expect(priorityTone("critical")).toBe("danger");
    expect(priorityTone("high")).toBe("warning");
    expect(priorityTone("medium")).toBe("info");
    expect(priorityTone("low")).toBe("neutral");
  });

  it("gives every schema priority a distinct tone", () => {
    const tones = NOTIFICATION_PRIORITIES.map(priorityTone);
    expect(new Set(tones).size).toBe(NOTIFICATION_PRIORITIES.length);
  });

  // Regression: both Notifications pages used to read a non-existent field
  // (`severity` / `type`), so every badge silently fell back to one tone.
  it("does not collapse critical alerts into the neutral fallback", () => {
    expect(priorityTone("critical")).not.toBe(priorityTone(undefined));
    expect(priorityTone(null)).toBe("info");
    expect(priorityTone("not-a-priority")).toBe("info");
  });
});

describe("formatAlertType", () => {
  it("humanises snake_case alert types", () => {
    expect(formatAlertType("low_feed_stock")).toBe("low feed stock");
    expect(formatAlertType("vaccination_overdue")).toBe("vaccination overdue");
  });

  it("falls back for a missing alert type", () => {
    expect(formatAlertType(undefined)).toBe("Alert");
    expect(formatAlertType("")).toBe("Alert");
  });
});

describe("notificationCategory", () => {
  it("groups raw alert types by farm area", () => {
    expect(notificationCategory("booster_overdue")).toBe("health");
    expect(notificationCategory("vaccination")).toBe("health");
    expect(notificationCategory("pregnancy_checkup_due")).toBe("pregnancy");
    expect(notificationCategory("low_feed_stock")).toBe("feed");
    expect(notificationCategory("target_weight_reached")).toBe("growth");
    expect(notificationCategory("ready_to_sell")).toBe("growth");
    expect(notificationCategory("something_else")).toBe("other");
    expect(notificationCategory(null)).toBe("other");
  });
});

describe("notificationLink", () => {
  it("opens the animal when the alert names one", () => {
    expect(notificationLink({ alertType: "target_weight_reached", relatedEntityType: "animal", relatedEntityId: "42" })).toBe("/animals/42");
  });

  it("falls back to the page that owns the alert's area", () => {
    expect(notificationLink({ alertType: "vaccination_overdue", relatedEntityType: "vaccinationRecord", relatedEntityId: "7" })).toBe("/vaccinations");
    expect(notificationLink({ alertType: "low_feed_stock", relatedEntityType: "feed_item", relatedEntityId: "3" })).toBe("/feed");
    expect(notificationLink({ alertType: "pregnancy_due" })).toBe("/pregnancy");
    expect(notificationLink({ alertType: "unknown" })).toBeNull();
  });
});
