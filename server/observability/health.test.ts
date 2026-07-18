import { describe, expect, it } from "vitest";
import { HealthRegistry } from "./health";

describe("health registry", () => {
  it("fails readiness for a critical dependency", async () => {
    const registry = new HealthRegistry();
    registry.register("database", async () => { throw new Error("offline"); });
    const snapshot = await registry.readiness();
    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.checks.database.status).toBe("unavailable");
  });

  it("reports optional dependency failures as degraded", async () => {
    const registry = new HealthRegistry();
    registry.register("mailer", async () => { throw new Error("offline"); }, { critical: false });
    expect((await registry.readiness()).status).toBe("degraded");
  });
});
