import { describe, expect, it } from "vitest";
import { pregnancyCandidates, vaccinationCandidates } from "./decisions";

const now = new Date("2026-07-12T12:00:00.000Z");

describe("notification decisions", () => {
  it("honors record-level vaccination and booster windows", () => {
    const next = vaccinationCandidates([{
      id: 1,
      animalIdStr: "A1",
      vaccineName: "V1",
      nextDueDate: "2026-07-20",
      notifyBeforeNext: 7,
    }], [{
      id: 2,
      animalIdStr: "A2",
      vaccineName: "V2",
      boosterDueDate: "2026-07-19",
      notifyBeforeBooster: 7,
    }], now);
    expect(next.map(candidate => candidate.alertType)).toEqual(["booster_due"]);
  });

  it("uses each pregnancy record's own due and checkup windows", () => {
    const candidates = pregnancyCandidates([{
      id: 1,
      animalIdStr: "E1",
      expectedDueDate: "2026-07-20",
      notifyBeforeDue: 7,
    }], [{
      id: 1,
      animalIdStr: "E1",
      checkupDate: "2026-07-15",
      notifyBeforeCheckup: 3,
    }], now);
    expect(candidates.map(candidate => candidate.alertType)).toEqual(["pregnancy_checkup_due"]);
  });
});
