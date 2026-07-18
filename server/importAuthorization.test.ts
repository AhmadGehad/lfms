import { describe, expect, it } from "vitest";
import { assertImportModeAuthorized } from "./routers/import";

describe("canonical import authorization", () => {
  it("allows append but rejects direct tenant replacement", () => {
    expect(() => assertImportModeAuthorized("admin", {}, "append")).not.toThrow();
    expect(() => assertImportModeAuthorized("admin", {}, "replace"))
      .toThrow(/platform restore lifecycle/i);
  });

  it("routes owner replacement through the guarded platform lifecycle", () => {
    expect(() => assertImportModeAuthorized("owner", {}, "replace"))
      .toThrow(/platform restore lifecycle/i);
  });
});
