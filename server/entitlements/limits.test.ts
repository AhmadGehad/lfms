import { describe, expect, it } from "vitest";
import { assertWithinLimit } from "./limits";

describe("resource limits", () => {
  it("rejects only increments beyond a finite limit", () => {
    expect(() => assertWithinLimit(2, 1, 3, "farms")).not.toThrow();
    expect(() => assertWithinLimit(3, 1, 3, "farms")).toThrow("QUOTA_EXCEEDED");
    expect(() => assertWithinLimit(100, 1, null, "farms")).not.toThrow();
  });
});
