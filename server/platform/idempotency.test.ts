import { describe, expect, it, vi } from "vitest";
import { executeIdempotent, hashIdempotencyRequest } from "./idempotency";

describe("platform idempotency request fingerprint", () => {
  it("is stable across object key order and Date representation", () => {
    const first = hashIdempotencyRequest({
      key: "request-key-123",
      operation: "companies.create",
      body: { nested: { b: 2, a: 1 }, at: new Date("2026-07-12T00:00:00Z") },
    });
    const second = hashIdempotencyRequest({
      key: "request-key-123",
      operation: "companies.create",
      body: { at: "2026-07-12T00:00:00.000Z", nested: { a: 1, b: 2 } },
    });
    expect(first).toEqual(second);
  });

  it("separates keys, operations, and request bodies without retaining raw keys", () => {
    const base = hashIdempotencyRequest({ key: "secret-retry-key", operation: "farms.create", body: { code: "A" } });
    expect(base.keyHash).not.toContain("secret-retry-key");
    expect(hashIdempotencyRequest({ key: "other-retry-key", operation: "farms.create", body: { code: "A" } }).keyHash).not.toBe(base.keyHash);
    expect(hashIdempotencyRequest({ key: "secret-retry-key", operation: "memberships.create", body: { code: "A" } }).requestPathHash).not.toBe(base.requestPathHash);
    expect(hashIdempotencyRequest({ key: "secret-retry-key", operation: "farms.create", body: { code: "B" } }).requestBodyHash).not.toBe(base.requestBodyHash);
  });
});

function fakeTransaction() {
  let record: Record<string, any> | null = null;
  const tx = {
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        if (record) throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
        record = { id: 1, responseBody: null, responseStatus: null, ...values };
        return [{ insertId: 1 }];
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            for: async () => record ? [{ ...record }] : [],
          }),
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (record) record = { ...record, ...values };
          return [{ affectedRows: record ? 1 : 0 }];
        },
      }),
    }),
  };
  return { tx: tx as never, read: () => record };
}

describe("platform idempotency execution", () => {
  it("stores one response and replays it without running the operation twice", async () => {
    const database = fakeTransaction();
    const operation = vi.fn(async () => ({ publicId: "01J00000000000000000000000" }));
    const input = {
      companyId: null,
      userId: 7,
      key: "retry-key-12345",
      operation: "platform.companies.create",
      body: { slug: "example" },
    };

    const first = await executeIdempotent(database.tx, input, operation);
    const replay = await executeIdempotent(database.tx, input, operation);

    expect(first).toEqual(replay);
    expect(operation).toHaveBeenCalledOnce();
    expect(database.read()).toMatchObject({ status: "completed", responseStatus: 200 });
  });

  it("rejects reuse of a key with different input", async () => {
    const database = fakeTransaction();
    const input = {
      companyId: 10,
      userId: 7,
      key: "retry-key-12345",
      operation: "platform.farms.create",
      body: { code: "A" },
    };
    await executeIdempotent(database.tx, input, async () => ({ publicId: "farm-a" }));

    await expect(executeIdempotent(
      database.tx,
      { ...input, body: { code: "B" } },
      async () => ({ publicId: "farm-b" }),
    )).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
