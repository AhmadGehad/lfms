import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { rethrowPlatformWriteError } from "./errors";

describe("platform write errors", () => {
  it("does not expose driver query text", () => {
    expect(() => rethrowPlatformWriteError(new Error("Failed query: select secret_value from table")))
      .toThrow("The request could not be completed. No changes were saved.");
  });

  it("preserves known conflict semantics", () => {
    expect(() => rethrowPlatformWriteError({ code: "ER_DUP_ENTRY" }))
      .toThrow("A record with these unique values already exists");
  });

  it("preserves deliberate application errors", () => {
    const error = new TRPCError({ code: "FORBIDDEN", message: "Denied" });
    expect(() => rethrowPlatformWriteError(error)).toThrow(error);
  });
});
