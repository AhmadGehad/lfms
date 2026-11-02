import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn(async () => undefined));
const email = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("./pushFanout", () => ({ notifyOperationalAlertByPush: push }));
vi.mock("./emailFanout", () => ({ notifyOperationalAlertByEmail: email }));

import { sendTaskAlert } from "./fanout";

describe("sendTaskAlert", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["task_started", "low"],
    ["task_done", "medium"],
    ["task_report_doctor_visit", "low"],
    ["task_report_animal_dead", "high"],
  ] as const)("pushes %s at %s priority, as its own event", (alertType, priority) => {
    sendTaskAlert({
      companyId: 1,
      alertType,
      relatedEntityType: "task",
      priority,
      params: { worker: "Ali", task: "Feed", answer: "yes" } as never,
      recipientUserIds: [7],
    });
    expect(push).toHaveBeenCalledWith(expect.objectContaining({
      alertType, priority, everyPriority: true, distinctEvent: true, recipientUserIds: [7],
    }));
  });
});
