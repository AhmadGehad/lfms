import { describe, expect, it } from "vitest";
import {
  applyCanonicalData,
  canonicalDataToObject,
  readAllCanonicalTables,
} from "./canonicalTransfer";
import {
  CANONICAL_TABLES,
  type CanonicalWorkbookData,
} from "./excelDataContract";

const tableKeyByTable = new Map(CANONICAL_TABLES.map(spec => [spec.table, spec.key]));

function emptyCanonicalData(): CanonicalWorkbookData {
  return new Map(CANONICAL_TABLES.map(spec => [spec.key, []]));
}

function createTx(initial: Record<string, Record<string, unknown>[]> = {}) {
  const store = new Map(
    CANONICAL_TABLES.map(spec => [
      spec.table,
      (initial[spec.key] ?? []).map(row => ({ ...row })),
    ]),
  );
  const deleted: string[] = [];
  const tx = {
    select: () => ({
      from: async (table: unknown) => (store.get(table) ?? []).map(row => ({ ...row })),
    }),
    delete: async (table: unknown) => {
      deleted.push(tableKeyByTable.get(table) ?? "unknown");
      store.set(table, []);
    },
    insert: (table: unknown) => ({
      values: async (row: Record<string, unknown>) => {
        store.get(table)?.push({ ...row });
      },
    }),
  };
  return { tx, store, deleted };
}

const feedItem = {
  id: 1,
  name: "Hay",
  unit: "kg",
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  createdBy: null,
  deletedAt: null,
  deletedBy: null,
};

describe("canonical transfer modes", () => {
  it("reads and serializes every canonical table", async () => {
    const { tx } = createTx({ feed_items: [feedItem] });

    const data = await readAllCanonicalTables(tx as any);
    const obj = canonicalDataToObject(data);

    expect(Object.keys(obj)).toEqual(CANONICAL_TABLES.map(spec => spec.key));
    expect(obj.feed_items).toEqual([feedItem]);
  });

  it("append inserts missing rows and skips identical existing rows", async () => {
    const insertedFeedItem = { ...feedItem, id: 2, name: "Concentrate" };
    const rows = emptyCanonicalData();
    rows.set("feed_items", [{ ...feedItem }, insertedFeedItem]);
    const { tx, store } = createTx({ feed_items: [feedItem] });

    const stats = await applyCanonicalData(tx as any, rows, "append");

    expect(stats.find(stat => stat.table === "feed_items")).toEqual({
      table: "feed_items",
      applied: 1,
      skipped: 1,
    });
    const feedSpec = CANONICAL_TABLES.find(spec => spec.key === "feed_items")!;
    expect(store.get(feedSpec.table)).toHaveLength(2);
    expect(store.get(feedSpec.table)?.[1]).toMatchObject({ id: 2, name: "Concentrate" });
  });

  it("append aborts when an existing ID contains different data", async () => {
    const rows = emptyCanonicalData();
    rows.set("feed_items", [{ ...feedItem, unit: "bale" }]);
    const { tx } = createTx({ feed_items: [feedItem] });

    await expect(applyCanonicalData(tx as any, rows, "append")).rejects.toThrow(
      /already exists with different data/,
    );
  });

  it("append aborts when a unique key belongs to another row", async () => {
    const rows = emptyCanonicalData();
    rows.set("feed_items", [{ ...feedItem, id: 2 }]);
    const { tx } = createTx({ feed_items: [feedItem] });

    await expect(applyCanonicalData(tx as any, rows, "append")).rejects.toThrow(
      /name=Hay already belongs to ID 1/,
    );
  });

  it("replace clears every table before restoring the complete snapshot", async () => {
    const replacementFeedItem = { ...feedItem, id: 3, name: "Silage" };
    const rows = emptyCanonicalData();
    rows.set("feed_items", [replacementFeedItem]);
    const { tx, store, deleted } = createTx({ feed_items: [feedItem] });

    const stats = await applyCanonicalData(tx as any, rows, "replace");

    expect(deleted).toEqual([...CANONICAL_TABLES].reverse().map(spec => spec.key));
    expect(stats.find(stat => stat.table === "feed_items")).toEqual({
      table: "feed_items",
      applied: 1,
      skipped: 0,
    });
    const feedSpec = CANONICAL_TABLES.find(spec => spec.key === "feed_items")!;
    expect(store.get(feedSpec.table)).toEqual([replacementFeedItem]);
  });

  it("can exclude security tables from normal replace imports", async () => {
    const rows = emptyCanonicalData();
    rows.set("users", []);
    rows.set("role_permissions", []);
    rows.set("audit_log", []);
    const existingUser = { id: 1, openId: "owner", role: "owner" };
    const existingPermission = {
      id: 1,
      role: "staff",
      page: "animals",
      action: "view",
      allowed: true,
    };
    const existingAudit = { id: 1, action: "login" };
    const { tx, store, deleted } = createTx({
      users: [existingUser],
      role_permissions: [existingPermission],
      audit_log: [existingAudit],
    });

    await applyCanonicalData(tx as any, rows, "replace", {
      excludedTables: new Set(["users", "role_permissions", "audit_log"]),
    });

    expect(deleted).not.toContain("users");
    expect(deleted).not.toContain("role_permissions");
    expect(deleted).not.toContain("audit_log");
    for (const key of ["users", "role_permissions", "audit_log"]) {
      const spec = CANONICAL_TABLES.find(item => item.key === key)!;
      expect(store.get(spec.table)).toHaveLength(1);
    }
  });

  it("derives the independent birth sequence from existing lamb IDs", async () => {
    const rows = emptyCanonicalData();
    rows.set("animal_categories", [{
      id: 1,
      name: "Lamb",
      speciesId: 1,
      idPrefix: "LMB",
      idSequence: 900,
    }]);
    rows.set("lambing_log", [{
      id: 1,
      lambId: "LMB0042",
      birthDate: "2026-01-01",
      sex: "female",
      birthTypeId: 1,
      isPromoted: false,
    }]);
    const { tx, store } = createTx();

    await applyCanonicalData(tx as any, rows, "replace");

    const categorySpec = CANONICAL_TABLES.find(
      spec => spec.key === "animal_categories",
    )!;
    expect(store.get(categorySpec.table)?.[0]).toMatchObject({
      idSequence: 900,
      lambIdSequence: 42,
    });
  });

  it("repairs an orphaned promoted link as preserved purge history", async () => {
    const rows = emptyCanonicalData();
    rows.set("lambing_log", [{
      id: 4,
      lambId: "LMB0004",
      birthDate: "2026-01-01",
      sex: "male",
      birthTypeId: 1,
      isPromoted: true,
      promotedHeadId: 999,
      promotedAnimalCode: "RAM0999",
      deletedAt: new Date("2026-02-01"),
      deletedBy: 2,
    }]);
    const { tx, store } = createTx();

    await applyCanonicalData(tx as any, rows, "replace");

    const birthSpec = CANONICAL_TABLES.find(spec => spec.key === "lambing_log")!;
    expect(store.get(birthSpec.table)?.[0]).toMatchObject({
      isPromoted: true,
      promotedHeadId: null,
      promotedAnimalCode: "RAM0999",
      deletedAt: null,
      deletedBy: null,
    });
    expect(store.get(birthSpec.table)?.[0]?.promotedAnimalPurgedAt)
      .toBeInstanceOf(Date);
  });

  it("rejects two birth records linked to one promoted animal", async () => {
    const rows = emptyCanonicalData();
    rows.set("animals", [{
      id: 20,
      animalId: "RAM0020",
      speciesId: 1,
      categoryId: 2,
      damId: null,
      sireId: null,
    }]);
    rows.set("lambing_log", [
      {
        id: 1,
        lambId: "LMB0001",
        birthDate: "2026-01-01",
        sex: "male",
        birthTypeId: 1,
        isPromoted: true,
        promotedHeadId: 20,
      },
      {
        id: 2,
        lambId: "LMB0002",
        birthDate: "2026-01-02",
        sex: "male",
        birthTypeId: 1,
        isPromoted: true,
        promotedHeadId: 20,
      },
    ]);
    const { tx } = createTx();

    await expect(applyCanonicalData(tx as any, rows, "replace"))
      .rejects.toThrow(/linked to multiple birth records/);
  });

  it("does not invent a birth category when prefixes are ambiguous", async () => {
    const rows = emptyCanonicalData();
    rows.set("animal_categories", [
      { id: 1, speciesId: 1, idPrefix: "LMB", idSequence: 0 },
      { id: 2, speciesId: 2, idPrefix: "LMB", idSequence: 0 },
    ]);
    rows.set("lambing_log", [{
      id: 1,
      lambId: "LMB0001",
      birthDate: "2026-01-01",
      sex: "female",
      birthTypeId: 1,
      isPromoted: false,
    }]);
    const { tx, store } = createTx();

    await applyCanonicalData(tx as any, rows, "replace");

    const birthSpec = CANONICAL_TABLES.find(spec => spec.key === "lambing_log")!;
    expect(store.get(birthSpec.table)?.[0]).toMatchObject({
      categoryId: null,
      speciesId: null,
    });
  });

  it("preserves the current birth sequence during a version 3 append", async () => {
    const existingCategory = {
      id: 1,
      speciesId: 1,
      idPrefix: "LMB",
      idSequence: 900,
      lambIdSequence: 75,
    };
    const rows = emptyCanonicalData();
    const { lambIdSequence: _legacyMissing, ...version3Category } =
      existingCategory;
    rows.set("animal_categories", [version3Category]);
    const { tx } = createTx({
      animal_categories: [existingCategory],
    });

    const stats = await applyCanonicalData(tx as any, rows, "append");

    expect(stats.find(stat => stat.table === "animal_categories")).toEqual({
      table: "animal_categories",
      applied: 0,
      skipped: 1,
    });
  });

  it("matches a version 3 birth to its existing normalized record on append", async () => {
    const existingCategory = {
      id: 1,
      speciesId: 1,
      idPrefix: "LMB",
      idSequence: 900,
      lambIdSequence: 75,
    };
    const existingBirth = {
      id: 10,
      lambId: "LMB0042",
      speciesId: 1,
      categoryId: 1,
      birthDate: "2026-01-01",
      damId: null,
      sireId: null,
      sex: "female",
      birthTypeId: 1,
      isPromoted: false,
      promotedHeadId: null,
      promotedAnimalCode: null,
      promotedAnimalPurgedAt: null,
      deletedAt: null,
      deletedBy: null,
    };
    const rows = emptyCanonicalData();
    const { lambIdSequence: _legacySequence, ...version3Category } =
      existingCategory;
    const {
      speciesId: _legacySpecies,
      categoryId: _legacyCategory,
      promotedAnimalCode: _legacyCode,
      promotedAnimalPurgedAt: _legacyPurge,
      ...version3Birth
    } = existingBirth;
    rows.set("animal_categories", [version3Category]);
    rows.set("lambing_log", [version3Birth]);
    const { tx } = createTx({
      animal_categories: [existingCategory],
      lambing_log: [existingBirth],
    });

    const stats = await applyCanonicalData(tx as any, rows, "append");

    expect(stats.find(stat => stat.table === "lambing_log")).toEqual({
      table: "lambing_log",
      applied: 0,
      skipped: 1,
    });
  });
});
