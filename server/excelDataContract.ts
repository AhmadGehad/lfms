import ExcelJS from "exceljs";
import { getTableColumns } from "drizzle-orm";
import {
  animalCategories,
  animalStatusHistory,
  animalStatuses,
  animals,
  auditLog,
  birthTypes,
  expenseCategories,
  pregnancyRecords,
  expenseSubCategories,
  expenses,
  feedItemPriceHistory,
  feedItems,
  feedStockLedger,
  groups,
  lambingLog,
  notifications,
  owners,
  rationPlans,
  rolePermissions,
  sales,
  species,
  systemSettings,
  users,
  vaccines,
  vaccinationRecords,
  weightLog,
} from "../drizzle/schema";

export const EXCEL_DATA_FORMAT_VERSION = 6;
export const SUPPORTED_EXCEL_DATA_FORMAT_VERSIONS = [3, 4, 5, 6] as const;
export const EXCEL_MANIFEST_SHEET = "LFMS Manifest";
const VERSION_3_MISSING_COLUMNS = new Set([
  "animal_categories.lambIdSequence",
  "lambing_log.speciesId",
  "lambing_log.categoryId",
  "lambing_log.promotedAnimalCode",
  "lambing_log.promotedAnimalPurgedAt",
  "vaccination_records.notifyBeforeNext",
  "vaccination_records.notifyBeforeBooster",
]);
// Columns introduced in v5 — tolerated as missing when importing an older
// (v3/v4) workbook that predates them.
const VERSION_4_MISSING_COLUMNS = new Set([
  "species.gestationDays",
]);
// Whole tables introduced in v5 — their sheet/array may be absent in v3/v4 files.
const NEW_IN_VERSION_5_TABLES = new Set(["pregnancy_records"]);
// Columns introduced in v6 — tolerated as missing when importing a pre-v6 file.
const VERSION_5_MISSING_COLUMNS = new Set([
  "audit_log.revertedAt",
  "audit_log.revertedByUserId",
  "audit_log.revertOfAuditId",
]);

export type CanonicalTableSpec = {
  key: string;
  sheetName: string;
  table: any;
};

export const CANONICAL_TABLES: CanonicalTableSpec[] = [
  { key: "users", sheetName: "Data - Users", table: users },
  {
    key: "role_permissions",
    sheetName: "Data - Role Permissions",
    table: rolePermissions,
  },
  { key: "species", sheetName: "Data - Species", table: species },
  {
    key: "animal_statuses",
    sheetName: "Data - Animal Statuses",
    table: animalStatuses,
  },
  { key: "birth_types", sheetName: "Data - Birth Types", table: birthTypes },
  { key: "feed_items", sheetName: "Data - Feed Items", table: feedItems },
  {
    key: "expense_categories",
    sheetName: "Data - Expense Categories",
    table: expenseCategories,
  },
  {
    key: "system_settings",
    sheetName: "Data - System Settings",
    table: systemSettings,
  },
  {
    key: "animal_categories",
    sheetName: "Data - Animal Categories",
    table: animalCategories,
  },
  { key: "groups", sheetName: "Data - Groups", table: groups },
  { key: "owners", sheetName: "Data - Owners", table: owners },
  {
    key: "expense_sub_categories",
    sheetName: "Data - Expense Subcats",
    table: expenseSubCategories,
  },
  { key: "animals", sheetName: "Data - Animals", table: animals },
  {
    key: "animal_status_history",
    sheetName: "Data - Status History",
    table: animalStatusHistory,
  },
  { key: "sales", sheetName: "Data - Sales", table: sales },
  { key: "lambing_log", sheetName: "Data - Lambing Log", table: lambingLog },
  { key: "weight_log", sheetName: "Data - Weight Log", table: weightLog },
  {
    key: "feed_item_price_history",
    sheetName: "Data - Feed Price History",
    table: feedItemPriceHistory,
  },
  { key: "ration_plans", sheetName: "Data - Ration Plans", table: rationPlans },
  {
    key: "feed_stock_ledger",
    sheetName: "Data - Feed Stock Ledger",
    table: feedStockLedger,
  },
  { key: "expenses", sheetName: "Data - Expenses", table: expenses },
  {
    key: "notifications",
    sheetName: "Data - Notifications",
    table: notifications,
  },
  { key: "audit_log", sheetName: "Data - Audit Log", table: auditLog },
  { key: "vaccines", sheetName: "Data - Vaccines", table: vaccines },
  {
    key: "vaccination_records",
    sheetName: "Data - Vaccination Records",
    table: vaccinationRecords,
  },
  {
    key: "pregnancy_records",
    sheetName: "Data - Pregnancies",
    table: pregnancyRecords,
  },
];

export type CanonicalWorkbookData = Map<string, Record<string, unknown>[]>;
const OMIT_VALUE = Symbol("omit-value");

function isLegacyMissingColumnAllowed(
  version: number,
  tableKey: string,
  columnName: string,
) {
  if (version <= 3 && VERSION_3_MISSING_COLUMNS.has(`${tableKey}.${columnName}`)) return true;
  // Anything new in v5 (a new column, or any column of a new table) is allowed
  // to be missing when importing a pre-v5 (v3/v4) file.
  if (version <= 4 && (VERSION_4_MISSING_COLUMNS.has(`${tableKey}.${columnName}`) || NEW_IN_VERSION_5_TABLES.has(tableKey))) return true;
  // Columns new in v6, missing in any pre-v6 file.
  if (version <= 5 && VERSION_5_MISSING_COLUMNS.has(`${tableKey}.${columnName}`)) return true;
  return false;
}

// A whole sheet/table introduced in v5 may be absent in a pre-v5 file.
function isLegacyMissingTableAllowed(version: number, tableKey: string) {
  return version <= 4 && NEW_IN_VERSION_5_TABLES.has(tableKey);
}

function dateOnly(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const isoDate = /^\d{4}-\d{2}-\d{2}/.exec(text)?.[0];
  if (isoDate) return isoDate;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10);
}

function timestamp(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function rawCellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value && typeof value === "object") {
    if ("result" in value) return value.result;
    if ("text" in value) return value.text;
    if ("richText" in value)
      return value.richText.map(part => part.text).join("");
  }
  return value;
}

function exportValue(value: unknown, column: any): ExcelJS.CellValue {
  if (value === null || value === undefined) return null;
  if (column.dataType === "json") return JSON.stringify(value);
  if (column.columnType === "MySqlDate") return dateOnly(value);
  if (column.columnType === "MySqlTimestamp") return timestamp(value);
  if (column.dataType === "boolean") return Boolean(value);
  if (column.columnType === "MySqlDecimal") return String(value);
  return value as ExcelJS.CellValue;
}

function parseBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return null;
}

function parseValue(
  value: unknown,
  column: any,
  location: string
): unknown | typeof OMIT_VALUE {
  const empty = value === null || value === undefined || value === "";
  if (empty) {
    if (column.primary || (column.notNull && !column.hasDefault)) {
      throw new Error(`${location}: ${column.name} is required`);
    }
    if (column.notNull && column.hasDefault) return OMIT_VALUE;
    return null;
  }

  if (column.dataType === "json") {
    if (typeof value === "object") return value;
    try {
      return JSON.parse(String(value));
    } catch {
      throw new Error(`${location}: ${column.name} must contain valid JSON`);
    }
  }

  if (column.columnType === "MySqlDate") {
    const parsed = dateOnly(value);
    if (!parsed)
      throw new Error(`${location}: ${column.name} must be a valid date`);
    return parsed;
  }

  if (column.columnType === "MySqlTimestamp") {
    const parsed = timestamp(value);
    if (!parsed)
      throw new Error(`${location}: ${column.name} must be a valid timestamp`);
    return parsed;
  }

  if (column.dataType === "boolean") {
    const parsed = parseBoolean(value);
    if (parsed === null)
      throw new Error(
        `${location}: ${column.name} must be true/false or YES/no`
      );
    return parsed;
  }

  if (column.dataType === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      throw new Error(`${location}: ${column.name} must be an integer`);
    }
    return parsed;
  }

  if (column.columnType === "MySqlDecimal") {
    const text = String(value).replaceAll(",", "").trim();
    if (text === "" || !Number.isFinite(Number(text))) {
      throw new Error(`${location}: ${column.name} must be a number`);
    }
    return text;
  }

  const text = String(value);
  if (column.enumValues?.length && !column.enumValues.includes(text)) {
    throw new Error(
      `${location}: ${column.name} must be one of ${column.enumValues.join(", ")}`
    );
  }
  return text;
}

export function addCanonicalSheets(
  workbook: ExcelJS.Workbook,
  rowsByTable: CanonicalWorkbookData,
  generatedAt = new Date()
) {
  const manifest = workbook.addWorksheet(EXCEL_MANIFEST_SHEET, {
    properties: { tabColor: { argb: "FF17324D" } },
  });
  manifest.columns = [{ width: 28 }, { width: 70 }];
  manifest.addRows([
    ["formatVersion", EXCEL_DATA_FORMAT_VERSION],
    ["generatedAt", generatedAt.toISOString()],
    ["mode", "canonical-round-trip"],
    ["tableCount", CANONICAL_TABLES.length],
    [
      "instructions",
      "Do not rename Data - sheets or column headers. Import is header-based, validated, transactional, and supports Append or full-system Replace.",
    ],
  ]);
  manifest.getRow(1).font = { bold: true };

  for (const spec of CANONICAL_TABLES) {
    const columns = Object.entries(getTableColumns(spec.table)) as Array<
      [string, any]
    >;
    const sheet = workbook.addWorksheet(spec.sheetName, {
      properties: { tabColor: { argb: "FF17324D" } },
    });
    sheet.columns = columns.map(([name, column]) => ({
      header: name,
      key: name,
      width: Math.min(36, Math.max(12, name.length + 3)),
      style:
        column.columnType === "MySqlDate"
          ? { numFmt: "yyyy-mm-dd" }
          : column.columnType === "MySqlTimestamp"
            ? { numFmt: "yyyy-mm-dd hh:mm:ss" }
            : undefined,
    }));
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF17324D" },
    };
    header.alignment = { vertical: "middle", horizontal: "left" };
    header.height = 22;

    for (const source of rowsByTable.get(spec.key) ?? []) {
      const row: Record<string, ExcelJS.CellValue> = {};
      for (const [name, column] of columns)
        row[name] = exportValue(source[name], column);
      sheet.addRow(row);
    }
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: Math.max(1, columns.length) },
    };
  }
}

export function isCanonicalWorkbook(workbook: ExcelJS.Workbook): boolean {
  const manifest = workbook.getWorksheet(EXCEL_MANIFEST_SHEET);
  const version = manifest
    ? Number(rawCellValue(manifest.getCell("B1")))
    : NaN;
  return SUPPORTED_EXCEL_DATA_FORMAT_VERSIONS.includes(version as 3 | 4 | 5 | 6);
}

export function readCanonicalWorkbook(
  workbook: ExcelJS.Workbook
): CanonicalWorkbookData {
  const manifest = workbook.getWorksheet(EXCEL_MANIFEST_SHEET);
  const version = manifest ? Number(rawCellValue(manifest.getCell("B1"))) : NaN;
  if (!SUPPORTED_EXCEL_DATA_FORMAT_VERSIONS.includes(version as 3 | 4 | 5 | 6)) {
    throw new Error(
      `Unsupported or missing LFMS Excel data format version. Supported versions: ${SUPPORTED_EXCEL_DATA_FORMAT_VERSIONS.join(", ")}.`
    );
  }

  const result: CanonicalWorkbookData = new Map();
  const errors: string[] = [];

  for (const spec of CANONICAL_TABLES) {
    const sheet = workbook.getWorksheet(spec.sheetName);
    if (!sheet) {
      if (isLegacyMissingTableAllowed(version, spec.key)) {
        result.set(spec.key, []);
        continue;
      }
      errors.push(`Missing required canonical sheet: ${spec.sheetName}`);
      continue;
    }
    const columns = getTableColumns(spec.table) as Record<string, any>;
    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      headers.set(String(rawCellValue(cell)).trim(), columnNumber);
    });

    const missing = Object.entries(columns)
      .filter(([name]) =>
        !headers.has(name) &&
        !isLegacyMissingColumnAllowed(version, spec.key, name))
      .map(([name]) => name);
    if (missing.length) {
      errors.push(`${spec.sheetName}: missing columns ${missing.join(", ")}`);
      continue;
    }

    const rows: Record<string, unknown>[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const excelRow = sheet.getRow(rowNumber);
      const hasValue = Array.from(headers.values()).some(columnNumber => {
        const value = rawCellValue(excelRow.getCell(columnNumber));
        return value !== null && value !== undefined && value !== "";
      });
      if (!hasValue) continue;

      const row: Record<string, unknown> = {};
      for (const [name, column] of Object.entries(columns)) {
        if (!headers.has(name)) continue;
        try {
          const value = parseValue(
            rawCellValue(excelRow.getCell(headers.get(name)!)),
            column,
            `${spec.sheetName} row ${rowNumber}`
          );
          if (value !== OMIT_VALUE) row[name] = value;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      rows.push(row);
    }
    result.set(spec.key, rows);
  }

  if (errors.length) {
    const shown = errors.slice(0, 50);
    const suffix =
      errors.length > shown.length
        ? `\n...and ${errors.length - shown.length} more errors`
        : "";
    throw new Error(`Excel validation failed:\n${shown.join("\n")}${suffix}`);
  }
  return result;
}

export function validateCanonicalDataObject(
  value: unknown,
  sourceVersion = EXCEL_DATA_FORMAT_VERSION,
): CanonicalWorkbookData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Canonical tables must be a JSON object");
  }
  const source = value as Record<string, unknown>;
  const result: CanonicalWorkbookData = new Map();
  const errors: string[] = [];

  for (const spec of CANONICAL_TABLES) {
    const rawRows = source[spec.key];
    if (!Array.isArray(rawRows)) {
      if (isLegacyMissingTableAllowed(sourceVersion, spec.key)) {
        result.set(spec.key, []);
        continue;
      }
      errors.push(`Missing required table array: ${spec.key}`);
      continue;
    }
    const columns = getTableColumns(spec.table) as Record<string, any>;
    const rows: Record<string, unknown>[] = [];
    rawRows.forEach((rawRow, index) => {
      if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
        errors.push(`${spec.key} row ${index + 1}: must be an object`);
        return;
      }
      const sourceRow = rawRow as Record<string, unknown>;
      const row: Record<string, unknown> = {};
      for (const [name, column] of Object.entries(columns)) {
        if (!(name in sourceRow)) {
          if (!isLegacyMissingColumnAllowed(
            sourceVersion,
            spec.key,
            name,
          )) {
            errors.push(`${spec.key} row ${index + 1}: missing field ${name}`);
          }
          continue;
        }
        try {
          const parsed = parseValue(sourceRow[name], column, `${spec.key} row ${index + 1}`);
          if (parsed !== OMIT_VALUE) row[name] = parsed;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      rows.push(row);
    });
    result.set(spec.key, rows);
  }

  if (errors.length) {
    const shown = errors.slice(0, 50);
    const suffix = errors.length > shown.length ? `\n...and ${errors.length - shown.length} more errors` : "";
    throw new Error(`Canonical data validation failed:\n${shown.join("\n")}${suffix}`);
  }
  return result;
}
