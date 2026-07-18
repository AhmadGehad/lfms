import { describe, expect, it } from "vitest";
import { PAGE_FEATURES } from "./sqlStore";
import { PERMISSION_PAGES } from "../../shared/permissions";

describe("permission feature coverage", () => {
  it("maps every tenant permission page to a backend feature", () => {
    expect(Object.keys(PAGE_FEATURES).sort()).toEqual(
      PERMISSION_PAGES.map(page => page.id).sort(),
    );
  });
});
