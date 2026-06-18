import { getTableColumns } from "drizzle-orm";
import type { DbOrTx } from "./db";
import { CANONICAL_TABLES, type CanonicalWorkbookData } from "./excelDataContract";

export type ImportMode = "append" | "replace";

export type TransferStat = {
  table: string;
  applied: number;
  skipped: number;
};

type ApplyCanonicalDataOptions = {
  excludedTables?: ReadonlySet<string>;
};

function comparable(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

function rowsMatch(imported: Record<string, unknown>, existing: Record<string, unknown>, columnNames: string[]) {
  return columnNames.every(name => comparable(imported[name]) === comparable(existing[name]));
}

export async function readAllCanonicalTables(db: DbOrTx): Promise<CanonicalWorkbookData> {
  const rows: CanonicalWorkbookData = new Map();
  for (const spec of CANONICAL_TABLES) {
    rows.set(spec.key, await db.select().from(spec.table));
  }
  return rows;
}

export function canonicalDataToObject(data: CanonicalWorkbookData) {
  return Object.fromEntries(CANONICAL_TABLES.map(spec => [spec.key, data.get(spec.key) ?? []]));
}

export async function applyCanonicalData(
  tx: DbOrTx,
  rowsByTable: CanonicalWorkbookData,
  mode: ImportMode,
  options: ApplyCanonicalDataOptions = {},
): Promise<TransferStat[]> {
  const stats: TransferStat[] = [];
  const excludedTables = options.excludedTables ?? new Set<string>();

  if (mode === "replace") {
    for (const spec of [...CANONICAL_TABLES].reverse()) {
      if (excludedTables.has(spec.key)) continue;
      await tx.delete(spec.table);
    }
  }

  for (const spec of CANONICAL_TABLES) {
    if (excludedTables.has(spec.key)) continue;
    const importedRows = rowsByTable.get(spec.key) ?? [];
    const stat: TransferStat = { table: spec.key, applied: 0, skipped: 0 };

    if (mode === "replace") {
      for (const row of importedRows) {
        await tx.insert(spec.table).values(row as any);
        stat.applied++;
      }
      stats.push(stat);
      continue;
    }

    const columns = getTableColumns(spec.table) as Record<string, any>;
    const columnNames = Object.keys(columns);
    const existingRows = await tx.select().from(spec.table) as Record<string, unknown>[];
    const existingById = new Map(existingRows.map(row => [row.id, row]));
    const uniqueColumns = Object.entries(columns)
      .filter(([, column]) => column.isUnique)
      .map(([name]) => name);
    const existingByUnique = new Map(
      uniqueColumns.map(name => [
        name,
        new Map(
          existingRows
            .filter(row => row[name] !== null && row[name] !== undefined)
            .map(row => [String(row[name]), row]),
        ),
      ]),
    );

    for (const row of importedRows) {
      const sameId = existingById.get(row.id);
      if (sameId) {
        if (!rowsMatch(row, sameId, columnNames)) {
          throw new Error(
            `${spec.key}: ID ${String(row.id)} already exists with different data. Append aborted; use Replace to overwrite the system.`,
          );
        }
        stat.skipped++;
        continue;
      }

      for (const uniqueColumn of uniqueColumns) {
        const value = row[uniqueColumn];
        if (value === null || value === undefined) continue;
        const conflicting = existingByUnique.get(uniqueColumn)?.get(String(value));
        if (conflicting) {
          throw new Error(
            `${spec.key}: ${uniqueColumn}=${String(value)} already belongs to ID ${String(conflicting.id)}. Append aborted to protect relationships.`,
          );
        }
      }

      await tx.insert(spec.table).values(row as any);
      existingById.set(row.id, row);
      for (const uniqueColumn of uniqueColumns) {
        const value = row[uniqueColumn];
        if (value !== null && value !== undefined) {
          existingByUnique.get(uniqueColumn)?.set(String(value), row);
        }
      }
      stat.applied++;
    }
    stats.push(stat);
  }

  return stats;
}
