import type { DbOrTx } from "../../db";
import { getDb } from "../../db";
import { encodeCursor } from "../../../shared/platformApi";

export type PlatformDb = DbOrTx;
export type PlatformRootDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function requirePlatformDb(): Promise<PlatformRootDb> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

export function affectedRows(result: unknown) {
  if (!result || typeof result !== "object") return 0;
  return Number((result as { affectedRows?: number }).affectedRows ?? 0);
}

export function publicCursorPage<T extends { cursorId: number }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const selected = hasMore ? rows.slice(0, limit) : rows;
  const last = selected.at(-1);
  return {
    items: selected.map(({ cursorId: _cursorId, ...item }) => item),
    nextCursor: hasMore && last ? encodeCursor({ id: last.cursorId }) : null,
  };
}
