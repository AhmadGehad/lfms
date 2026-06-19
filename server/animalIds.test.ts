import { describe, expect, it } from "vitest";
import {
  composeAnimalId,
  extractAnimalIdNumber,
  MAX_ANIMAL_ID_NUMBER,
  normalizeAnimalIdNumber,
} from "../shared/animalIds";
import { isDuplicateEntryError } from "./_core/databaseErrors";

describe("animal ID helpers", () => {
  it("composes a category prefix with a controlled numeric part", () => {
    expect(composeAnimalId("LMB", "00123")).toBe("LMB00123");
    expect(extractAnimalIdNumber("LMB00123", "LMB")).toBe("00123");
  });

  it("normalizes input and respects the full ID length", () => {
    expect(normalizeAnimalIdNumber(" 00A123 ", "LONGPREFIX")).toBe("00123");
    expect(normalizeAnimalIdNumber("123456789012345", "PREFIX1234"))
      .toBe("1234567890");
  });

  it("detects nested MySQL duplicate errors", () => {
    expect(isDuplicateEntryError({
      cause: {
        cause: { code: "ER_DUP_ENTRY", errno: 1062 },
      },
    })).toBe(true);
  });

  it("caps normalized values below sequence overflow", () => {
    expect(normalizeAnimalIdNumber(
      `${MAX_ANIMAL_ID_NUMBER}999`,
      "LMB",
    )).toBe(String(MAX_ANIMAL_ID_NUMBER));
  });
});
