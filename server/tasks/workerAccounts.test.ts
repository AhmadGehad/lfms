import { describe, expect, it } from "vitest";
import { planWorkerSync } from "./workerAccounts";

const row = (id: number, name: string, userId: number | null = null, isActive = true) =>
  ({ id, name, userId, isActive, loginGone: false });

describe("planWorkerSync", () => {
  it("adds a new worker login under its name", () => {
    expect(planWorkerSync([{ userId: 5, name: " Ali ", email: "ali@farm.test" }], []).create)
      .toEqual([{ userId: 5, name: "Ali" }]);
  });

  it("falls back to the email, then a number, when the login has no name", () => {
    expect(planWorkerSync([
      { userId: 5, name: null, email: "omar@farm.test" },
      { userId: 6, name: "  ", email: null },
    ], []).create.map(worker => worker.name)).toEqual(["omar", "Worker 6"]);
  });

  it("links a name the owner already typed instead of repeating it", () => {
    const plan = planWorkerSync([{ userId: 5, name: "ali", email: null }], [row(1, "Ali")]);
    expect(plan.link).toEqual([{ id: 1, userId: 5 }]);
    expect(plan.create).toEqual([]);
  });

  it("tells apart two logins with the same name", () => {
    const plan = planWorkerSync([
      { userId: 5, name: "Ali", email: "ali.a@farm.test" },
      { userId: 6, name: "Ali", email: "ali.b@farm.test" },
    ], []);
    expect(plan.create.map(worker => worker.name)).toEqual(["Ali", "Ali (ali.b)"]);
  });

  it("keeps a long name within the column once told apart", () => {
    const long = "A".repeat(100);
    const plan = planWorkerSync([
      { userId: 5, name: long, email: null },
      { userId: 6, name: long, email: null },
    ], []);
    expect(plan.create.every(worker => worker.name.length <= 80)).toBe(true);
    expect(new Set(plan.create.map(worker => worker.name)).size).toBe(2);
  });

  it("changes nothing once in step, and leaves a switched-off worker off", () => {
    const plan = planWorkerSync([{ userId: 5, name: "Ali", email: null }], [row(1, "Ali", 5, false), row(2, "Omar")]);
    expect(plan).toEqual({ link: [], create: [], retire: [], restore: [] });
  });

  it("switches off a worker whose login is gone, but never a typed name", () => {
    const plan = planWorkerSync([], [row(1, "Ali", 5), row(2, "Omar")]);
    expect(plan.retire.map(worker => worker.id)).toEqual([1]);
  });

  it("brings a worker back with their login, but not one the owner switched off", () => {
    const plan = planWorkerSync([{ userId: 5, name: "Ali", email: null }, { userId: 6, name: "Omar", email: null }], [
      { ...row(1, "Ali", 5, false), loginGone: true },
      row(2, "Omar", 6, false),
    ]);
    expect(plan.restore.map(worker => worker.id)).toEqual([1]);
  });
});
