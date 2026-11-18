/** The Animals list's pregnancy filter and columns, worked out from every pregnancy and every animal with a known parent. */

export const PREGNANCY_FILTERS = ["pregnant", "was_pregnant", "has_offspring", "never_pregnant"] as const;
export type PregnancyFilter = (typeof PREGNANCY_FILTERS)[number];

export type ReproductionData = {
  pregnancies: ReadonlyArray<{ animalId: number; status: string; expectedDueDate: string }>;
  offspring: ReadonlyArray<Offspring>;
};

export type Offspring = {
  id: number;
  tag: string;
  damId: number | null;
  sireId: number | null;
  sex: string;
  birthDate: string;
  isActive: boolean;
};

export type Reproduction = {
  /** Set while pregnant. */
  dueDate: string | null;
  /** Pregnancies that have ended, however they ended. */
  pastPregnancies: number;
  /** Has an offspring recorded as its dam, with or without a pregnancy record. */
  gaveBirth: boolean;
  /** As dam or sire, youngest first. */
  offspring: Offspring[];
};

const empty = (): Reproduction => ({ dueDate: null, pastPregnancies: 0, gaveBirth: false, offspring: [] });

export function summarizeReproduction(data: ReproductionData): Map<number, Reproduction> {
  const byAnimal = new Map<number, Reproduction>();
  const of = (id: number) => {
    let found = byAnimal.get(id);
    if (!found) byAnimal.set(id, found = empty());
    return found;
  };
  for (const pregnancy of data.pregnancies) {
    const summary = of(pregnancy.animalId);
    if (pregnancy.status === "active") summary.dueDate = pregnancy.expectedDueDate;
    else summary.pastPregnancies += 1;
  }
  for (const child of data.offspring) {
    if (child.damId !== null) {
      const dam = of(child.damId);
      dam.gaveBirth = true;
      dam.offspring.push(child);
    }
    if (child.sireId !== null && child.sireId !== child.damId) of(child.sireId).offspring.push(child);
  }
  for (const summary of byAnimal.values()) {
    summary.offspring.sort((a, b) => b.birthDate.localeCompare(a.birthDate) || a.tag.localeCompare(b.tag));
  }
  return byAnimal;
}

export function matchesPregnancyFilter(
  summary: Reproduction | undefined,
  sex: string | undefined,
  filter: PregnancyFilter | "all",
): boolean {
  const pregnant = Boolean(summary?.dueDate);
  const before = Boolean(summary && (summary.pastPregnancies > 0 || summary.gaveBirth));
  switch (filter) {
    case "all": return true;
    case "pregnant": return pregnant;
    case "was_pregnant": return !pregnant && before;
    case "has_offspring": return (summary?.offspring.length ?? 0) > 0;
    case "never_pregnant": return sex === "female" && !pregnant && !before;
  }
}
