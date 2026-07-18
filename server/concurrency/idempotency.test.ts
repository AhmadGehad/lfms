import { describe, expect, it, vi } from "vitest";
import {
  IdempotencyError,
  IdempotencyService,
  hashIdempotencyRequest,
  type IdempotencyStore,
} from "./idempotency";

describe("idempotency service", () => {
  it("uses stable hashes regardless of object key order", () => {
    expect(hashIdempotencyRequest({ a: 1, b: 2 }))
      .toBe(hashIdempotencyRequest({ b: 2, a: 1 }));
  });

  it("replays a completed result without executing the action", async () => {
    const store: IdempotencyStore<{ id: string }> = {
      begin: async () => ({ state: "completed", result: { id: "existing" } }),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    const action = vi.fn(async () => ({ id: "new" }));
    const result = await new IdempotencyService(store).execute(
      { companyId: 1, actorId: "1", operation: "farm.create", key: "key-1" },
      { name: "Farm" },
      action,
    );
    expect(result).toEqual({ id: "existing" });
    expect(action).not.toHaveBeenCalled();
  });

  it("rejects key reuse with a different request", async () => {
    const store: IdempotencyStore<unknown> = {
      begin: async () => ({ state: "conflict" }),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    await expect(new IdempotencyService(store).execute(
      { companyId: 1, actorId: "1", operation: "farm.create", key: "key-1" },
      { name: "Other Farm" },
      async () => ({}),
    )).rejects.toBeInstanceOf(IdempotencyError);
  });

  it("records failures so a lease/retry policy can decide the next attempt", async () => {
    const fail = vi.fn(async () => undefined);
    const store: IdempotencyStore<unknown> = {
      begin: async () => ({ state: "started", recordId: 4 }),
      complete: vi.fn(),
      fail,
    };
    await expect(new IdempotencyService(store).execute(
      { companyId: 1, actorId: "1", operation: "export.create", key: "key-1" },
      {},
      async () => { throw Object.assign(new Error("no"), { code: "EXPORT_FAILED" }); },
    )).rejects.toThrow("no");
    expect(fail).toHaveBeenCalledWith(4, "EXPORT_FAILED", undefined);
  });
});
