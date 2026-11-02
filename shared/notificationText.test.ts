import { describe, expect, it } from "vitest";
import { taskNotificationText } from "./notificationText";

describe("taskNotificationText", () => {
  it("leaves older alert types to their stored text", () => {
    expect(taskNotificationText("low_stock", { worker: "Ali" }, "ar")).toBeNull();
    expect(taskNotificationText("task_done", null, "ar")).toBeNull();
  });

  it("writes the same event in either language", () => {
    const params = { worker: "Ali", tag: "142" };
    expect(taskNotificationText("task_report_animal_dead", params, "en")?.message)
      .toBe("Ali: animal 142 died. Confirm it in Reports.");
    expect(taskNotificationText("task_report_animal_dead", params, "ar")?.message).toContain("142");
    expect(taskNotificationText("task_report_animal_dead", params, "ar")?.title).toBe("حيوان مات");
  });

  it("names what stock is needed", () => {
    const params = { worker: "Ali", answer: true, kinds: ["feed", "other"] as const, item: "Straw" };
    expect(taskNotificationText("task_report_stock_needed", params, "en")?.message)
      .toBe("Ali: stock is needed: feed, Straw");
  });

  it("says what a missing report left unanswered, and on which day", () => {
    const params = { date: "2026-11-02", missing: ["doctor_visit", "stock_needed"] as const };
    expect(taskNotificationText("task_report_missing", params, "en")).toEqual({
      title: "Daily report missing",
      message: "The worker didn't send the report for 02/11/2026: doctor visit, stock",
    });
    expect(taskNotificationText("task_report_missing", { ...params, worker: "Ali" }, "ar")?.message)
      .toBe("Ali لم يرسل تقرير يوم 02/11/2026: زيارة الدكتور، المخزون");
  });
});
