import { z } from "zod";
import type { CursorPage } from "./tenancy";

export type { CursorPage } from "./tenancy";

export const DEFAULT_PLATFORM_PAGE_SIZE = 25;
export const MAX_PLATFORM_PAGE_SIZE = 100;

export const cursorPageInputSchema = z.object({
  cursor: z.string().max(512).nullish(),
  limit: z.number().int().min(1).max(MAX_PLATFORM_PAGE_SIZE).default(DEFAULT_PLATFORM_PAGE_SIZE),
  search: z.string().trim().max(200).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export type CursorPageInput = z.infer<typeof cursorPageInputSchema>;

export type PlatformSortDirection = CursorPageInput["sortDirection"];

export function encodeCursor(value: Record<string, string | number | null>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor<T extends Record<string, unknown>>(
  cursor: string | null | undefined,
): T | null {
  if (!cursor) return null;

  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as T;
  } catch {
    return null;
  }
}

export function toCursorPage<T>(
  rows: T[],
  limit: number,
  cursorFor: (row: T) => Record<string, string | number | null>,
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(cursorFor(last)) : null,
  };
}
