import { describe, expect, it } from "vitest";
import { matchesPregnancyFilter, summarizeReproduction, type Offspring } from "./reproduction";

const child = (id: number, damId: number | null, sireId: number | null, birthDate: string): Offspring =>
  ({ id, tag: `K-${id}`, damId, sireId, sex: "female", birthDate, isActive: true });

describe("summarizeReproduction", () => {
  const summary = summarizeReproduction({
    pregnancies: [
      { animalId: 1, status: "active", expectedDueDate: "2026-12-01" },
      { animalId: 1, status: "delivered", expectedDueDate: "2025-12-01" },
      { animalId: 2, status: "aborted", expectedDueDate: "2026-01-01" },
    ],
    offspring: [child(10, 1, 5, "2025-12-02"), child(11, 1, 5, "2026-03-01"), child(12, 3, null, "2026-01-01")],
  });

  it("knows who is pregnant, who was, and their offspring as dam or sire, youngest first", () => {
    expect(summary.get(1)).toMatchObject({ dueDate: "2026-12-01", pastPregnancies: 1, gaveBirth: true });
    expect(summary.get(1)!.offspring.map(kid => kid.id)).toEqual([11, 10]);
    expect(summary.get(2)).toMatchObject({ dueDate: null, pastPregnancies: 1, gaveBirth: false, offspring: [] });
    expect(summary.get(3)).toMatchObject({ dueDate: null, pastPregnancies: 0, gaveBirth: true });
    expect(summary.get(5)!.offspring).toHaveLength(2);
    expect(summary.get(5)!.gaveBirth).toBe(false);
  });

  it("filters", () => {
    const pick = (filter: Parameters<typeof matchesPregnancyFilter>[2]) =>
      [[1, "female"], [2, "female"], [3, "female"], [4, "female"], [5, "male"]]
        .filter(([id, sex]) => matchesPregnancyFilter(summary.get(id as number), sex as string, filter))
        .map(([id]) => id);
    expect(pick("all")).toEqual([1, 2, 3, 4, 5]);
    expect(pick("pregnant")).toEqual([1]);
    // A birth on record counts, even with no pregnancy record behind it.
    expect(pick("was_pregnant")).toEqual([2, 3]);
    expect(pick("has_offspring")).toEqual([1, 3, 5]);
    expect(pick("never_pregnant")).toEqual([4]);
  });
});
