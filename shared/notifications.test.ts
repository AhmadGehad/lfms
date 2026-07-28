import { describe, expect, it } from "vitest";
import { NOTIFICATION_PRIORITIES, formatAlertType, priorityTone } from "./notifications";

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
