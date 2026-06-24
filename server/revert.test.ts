import { describe, expect, it } from "vitest";
import { getRevertPlan } from "./revert";

// Minimal audit-row factory (only the fields getRevertPlan reads).
const entry = (over: Partial<any> = {}): any => ({
  id: 1,
  userId: 1,
  action: "create",
  entityType: "expense",
  entityId: "10",
  oldValues: null,
  newValues: null,
  ipAddress: null,
  createdAt: new Date(),
  revertedAt: null,
  revertedByUserId: null,
  revertOfAuditId: null,
  ...over,
});

describe("getRevertPlan", () => {
  it("a soft-entity create is revertable (soft_create)", () => {
    expect(getRevertPlan(entry({ action: "create", entityType: "expense" }))).toEqual({ revertable: true, kind: "soft_create" });
  });

  it("an update is revertable only when prior values were captured", () => {
    expect(getRevertPlan(entry({ action: "update", oldValues: { amount: "5" } })))
      .toEqual({ revertable: true, kind: "update" });
    expect(getRevertPlan(entry({ action: "update", oldValues: null })))
      .toEqual({ revertable: false, reason: "no_old_values" });
  });

  it("a soft delete reverts to a restore, and a restore reverts to a re-delete", () => {
    expect(getRevertPlan(entry({ action: "SOFT_DELETE" }))).toEqual({ revertable: true, kind: "soft_delete" });
    expect(getRevertPlan(entry({ action: "delete" }))).toEqual({ revertable: true, kind: "soft_delete" });
    expect(getRevertPlan(entry({ action: "RESTORE" }))).toEqual({ revertable: true, kind: "soft_restore" });
  });

  it("an already-reverted entry is not revertable", () => {
    expect(getRevertPlan(entry({ revertedAt: new Date() })))
      .toEqual({ revertable: false, reason: "already_reverted" });
  });

  it("inherently irreversible actions/entities are blocked", () => {
    expect(getRevertPlan(entry({ action: "import", entityType: "bulk" })).revertable).toBe(false);
    expect(getRevertPlan(entry({ action: "purge" })).revertable).toBe(false);
    expect(getRevertPlan(entry({ action: "restore", entityType: "backup" })).revertable).toBe(false);
    expect(getRevertPlan(entry({ action: "revert" })).revertable).toBe(false);
  });

  it("compound actions map to dedicated handlers", () => {
    expect(getRevertPlan(entry({ entityType: "animal", action: "exit" }))).toEqual({ revertable: true, kind: "animal_exit" });
    expect(getRevertPlan(entry({ entityType: "animal", action: "promote" }))).toEqual({ revertable: true, kind: "animal_promote" });
    expect(getRevertPlan(entry({ entityType: "lambing_log", action: "create" }))).toEqual({ revertable: true, kind: "record_birth" });
  });

  it("covers the entities added for full coverage (vaccine, sub-category, setting, weight)", () => {
    expect(getRevertPlan(entry({ entityType: "vaccine", action: "create" }))).toEqual({ revertable: true, kind: "soft_create" });
    expect(getRevertPlan(entry({ entityType: "expenseSubCategory", action: "create" }))).toEqual({ revertable: true, kind: "hard_create" });
    expect(getRevertPlan(entry({ entityType: "weightLog", action: "create" }))).toEqual({ revertable: true, kind: "weight_create" });
    expect(getRevertPlan(entry({ entityType: "setting", action: "update", entityId: "farmMapImageKey", oldValues: { settingValue: "x" } })))
      .toEqual({ revertable: true, kind: "setting_update" });
    expect(getRevertPlan(entry({ entityType: "setting", action: "update", oldValues: null })))
      .toEqual({ revertable: false, reason: "no_old_values" });
  });

  it("hard-deleted entities need a snapshot to revert a delete", () => {
    expect(getRevertPlan(entry({ entityType: "feedItemPrice", action: "delete", oldValues: { feedItemId: 1, pricePerUnit: "2" } })))
      .toEqual({ revertable: true, kind: "hard_delete" });
    expect(getRevertPlan(entry({ entityType: "feedItemPrice", action: "delete", oldValues: null })))
      .toEqual({ revertable: false, reason: "no_snapshot" });
    expect(getRevertPlan(entry({ entityType: "feedItemPrice", action: "create" })))
      .toEqual({ revertable: true, kind: "hard_create" });
  });
});
