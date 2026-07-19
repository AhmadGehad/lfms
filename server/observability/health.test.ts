import { describe, expect, it } from "vitest";
import { publicReadiness, type HealthSnapshot } from "./health";

describe("public readiness", () => {
  it("does not disclose dependency names or failure messages", () => {
    const snapshot: HealthSnapshot = {
      status: "unavailable",
      checkedAt: "2026-07-19T00:00:00.000Z",
      uptimeSeconds: 42,
      checks: {
        database: {
          status: "unavailable",
          message: "connect ECONNREFUSED internal-db:3306",
          latencyMs: 3,
        },
      },
    };

    expect(publicReadiness(snapshot)).toEqual({
      status: "unavailable",
      checkedAt: "2026-07-19T00:00:00.000Z",
    });
  });
});
