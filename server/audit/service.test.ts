import { describe, expect, it } from "vitest";
import { AuditService, redactAuditValue, type PersistedAuditEvent } from "./service";

describe("audit service", () => {
  it("redacts nested credentials before persistence", () => {
    expect(redactAuditValue({
      email: "staff@example.test",
      password: "not-for-logs",
      nested: { accessToken: "not-for-logs", value: 7 },
    })).toEqual({
      email: "staff@example.test",
      password: "[REDACTED]",
      nested: { accessToken: "[REDACTED]", value: 7 },
    });
  });

  it("appends immutable context and a deterministic payload hash", async () => {
    const rows: PersistedAuditEvent[] = [];
    const service = new AuditService(
      { append: async event => { rows.push(event); } },
      () => new Date("2026-07-11T10:00:00.000Z"),
    );
    const event = await service.record({
      companyId: 1,
      actor: { type: "tenant_user", userId: 2, membershipId: 3 },
      action: "animal.updated",
      category: "business",
      targetType: "animal",
      targetPublicId: "01J00000000000000000000000",
      outcome: "succeeded",
      before: { weight: 10 },
      after: { weight: 12 },
      requestId: "request-1",
      sessionId: 8,
      transaction: "tx",
    });
    expect(rows).toHaveLength(1);
    expect(event.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(event.occurredAt.toISOString()).toBe("2026-07-11T10:00:00.000Z");
  });
});
