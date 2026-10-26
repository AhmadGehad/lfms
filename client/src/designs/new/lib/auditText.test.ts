import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { auditSentence, humanizeIdentifier } from "./auditText";

// Stand-in for i18next that only knows default values (no translations loaded).
const t = ((_key: string, opts: Record<string, string>) =>
  opts.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k) => opts[k] ?? "")) as unknown as TFunction;

describe("humanizeIdentifier", () => {
  it("turns machine names into words", () => {
    expect(humanizeIdentifier("weightLog")).toBe("Weight log");
    expect(humanizeIdentifier("lambing_log")).toBe("Lambing log");
    expect(humanizeIdentifier("statusId")).toBe("Status");
  });
});

describe("auditSentence", () => {
  it("reads as a short sentence", () => {
    expect(auditSentence(t, { action: "update", entityType: "animal", entityId: "EW-0142" })).toBe("Animal EW-0142 updated");
    expect(auditSentence(t, { action: "create", entityType: "sale", entityId: "11" })).toBe("Sale #11 added");
    expect(auditSentence(t, { action: "update", entityType: "setting" })).toBe("Setting updated");
  });
});
