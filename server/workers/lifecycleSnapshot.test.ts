import { describe, expect, it } from "vitest";
import { CANONICAL_TABLES } from "../excelDataContract";
import {
  createLifecycleSnapshot,
  isNewerSeparateCheckpoint,
  parseLifecycleSnapshot,
  serializeLifecycleSnapshot,
} from "./lifecycleSnapshot";

const companyPublicId = "01J00000000000000000000000";
const exportPublicId = "01J00000000000000000000001";

function emptyTables() {
  return Object.fromEntries(CANONICAL_TABLES.map(spec => [spec.key, []]));
}

describe("lifecycle snapshot", () => {
  it("serializes deterministically and validates tenant/count manifest", () => {
    const snapshot = createLifecycleSnapshot({
      companyPublicId,
      exportPublicId,
      generatedAt: new Date("2026-07-13T00:00:00.000Z"),
      tables: emptyTables(),
    });
    const first = serializeLifecycleSnapshot(snapshot);
    const second = serializeLifecycleSnapshot(snapshot);
    expect(first.equals(second)).toBe(true);
    expect(parseLifecycleSnapshot(first, { companyId: 7, companyPublicId }).snapshot.totalRows).toBe(0);
  });

  it("rejects cross-tenant manifest", () => {
    const bytes = serializeLifecycleSnapshot(createLifecycleSnapshot({
      companyPublicId,
      exportPublicId,
      generatedAt: new Date(),
      tables: emptyTables(),
    }));
    expect(() => parseLifecycleSnapshot(bytes, {
      companyId: 7,
      companyPublicId: "01J00000000000000000000009",
    })).toThrow("RESTORE_SNAPSHOT_TENANT_MISMATCH");
  });

  it("rejects row-count tampering", () => {
    const snapshot = createLifecycleSnapshot({
      companyPublicId,
      exportPublicId,
      generatedAt: new Date(),
      tables: emptyTables(),
    });
    const tampered = { ...snapshot, totalRows: 1 };
    expect(() => parseLifecycleSnapshot(
      serializeLifecycleSnapshot(tampered),
      { companyId: 7, companyPublicId },
    )).toThrow("RESTORE_SNAPSHOT_ROW_COUNT_MISMATCH");
  });

  it("rejects identity data even when its count is valid", () => {
    const tables = emptyTables();
    tables.users = [{ id: 1, openId: "secret" }];
    const snapshot = createLifecycleSnapshot({ companyPublicId, exportPublicId, generatedAt: new Date(), tables });
    expect(() => parseLifecycleSnapshot(
      serializeLifecycleSnapshot(snapshot),
      { companyId: 7, companyPublicId },
    )).toThrow("RESTORE_SNAPSHOT_FORBIDDEN_IDENTITY_DATA");
  });

  it("requires a distinct checkpoint ordered after the restore source", () => {
    const completedAt = new Date("2026-07-13T00:00:00.000Z");
    expect(isNewerSeparateCheckpoint(
      { id: 10, completedAt },
      { id: 11, completedAt },
    )).toBe(true);
    expect(isNewerSeparateCheckpoint(
      { id: 10, completedAt },
      { id: 10, completedAt: new Date(completedAt.getTime() + 1) },
    )).toBe(false);
    expect(isNewerSeparateCheckpoint(
      { id: 10, completedAt },
      { id: 9, completedAt },
    )).toBe(false);
  });
});
