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
});
