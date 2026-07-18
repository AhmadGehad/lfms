import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkDatabase, countJobTotals } from "../repositories/operations";
import { getPlatformHealth } from "./health";

vi.mock("../repositories/operations", () => ({
  checkDatabase: vi.fn(),
  countJobTotals: vi.fn(),
}));

describe("platform health", () => {
  beforeEach(() => {
    vi.mocked(checkDatabase).mockResolvedValue(undefined);
    vi.mocked(countJobTotals).mockResolvedValue({ pending: 0, processing: 0, failed: 0 });
  });

  it("fails readiness when the required job queue is unavailable", async () => {
    vi.mocked(countJobTotals).mockRejectedValue(new Error("queue offline"));

    const snapshot = await getPlatformHealth();

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.checks.database.status).toBe("ok");
    expect(snapshot.checks.job_queue.status).toBe("unavailable");
  });

  it("keeps a reachable queue with failed jobs degraded", async () => {
    vi.mocked(countJobTotals).mockResolvedValue({ pending: 0, processing: 0, failed: 2 });

    const snapshot = await getPlatformHealth();

    expect(snapshot.status).toBe("degraded");
    expect(snapshot.checks.job_queue).toMatchObject({
      status: "degraded",
      message: "2 jobs need attention",
    });
  });
});
