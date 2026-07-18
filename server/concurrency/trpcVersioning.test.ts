import { describe, expect, it } from "vitest";
import { VersionConflictError } from "./versioning";
import { rethrowVersionedWriteError } from "./trpcVersioning";

describe("tRPC optimistic concurrency mapping", () => {
  it("maps a stale version to CONFLICT", () => {
    expect(() => rethrowVersionedWriteError(new VersionConflictError(), "Expense"))
      .toThrowError(expect.objectContaining({ code: "CONFLICT" }));
  });

  it("does not hide unrelated database errors", () => {
    const error = new Error("database unavailable");
    expect(() => rethrowVersionedWriteError(error, "Expense")).toThrow(error);
  });
});
