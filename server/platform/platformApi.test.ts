import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, toCursorPage } from "../../shared/platformApi";

describe("platform cursor API", () => {
  it("round trips an opaque cursor", () => {
    const cursor = encodeCursor({ id: 42, createdAt: "2026-07-11T00:00:00.000Z" });
    expect(decodeCursor(cursor)).toEqual({ id: 42, createdAt: "2026-07-11T00:00:00.000Z" });
    expect(decodeCursor("invalid")).toBeNull();
  });

  it("returns one extra row as a next-page signal", () => {
    const page = toCursorPage([{ id: 3 }, { id: 2 }, { id: 1 }], 2, row => ({ id: row.id }));
    expect(page.items).toEqual([{ id: 3 }, { id: 2 }]);
    expect(decodeCursor(page.nextCursor)).toEqual({ id: 2 });
  });
});
