import { describe, expect, it } from "vitest";
import { legacyCapitalUnavailable } from "./capital";

describe("legacy capital tenant fence", () => {
  it("fails closed before any legacy capital access", () => {
    try {
      legacyCapitalUnavailable();
    } catch (error) {
      expect(error).toMatchObject({
        code: "PRECONDITION_FAILED",
        message: expect.stringContaining("tenant-isolated"),
      });
      return;
    }
    throw new Error("Expected legacy capital fence to throw");
  });
});
