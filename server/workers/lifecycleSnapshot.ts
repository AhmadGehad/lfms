import {
  CANONICAL_TABLES,
  EXCEL_DATA_FORMAT_VERSION,
  SUPPORTED_EXCEL_DATA_FORMAT_VERSIONS,
  validateCanonicalDataObject,
  type CanonicalWorkbookData,
} from "../excelDataContract";

export const LIFECYCLE_SNAPSHOT_FORMAT = "lfms-tenant-canonical-json";
export const LIFECYCLE_SNAPSHOT_VERSION = 1;
export const LIFECYCLE_EXCLUDED_TABLES = new Set(["users", "role_permissions", "audit_log"]);

export function isNewerSeparateCheckpoint(
  source: { id: number; completedAt: Date },
  checkpoint: { id: number; completedAt: Date },
) {
  return checkpoint.id !== source.id && (
    checkpoint.completedAt > source.completedAt ||
    (checkpoint.completedAt.getTime() === source.completedAt.getTime() && checkpoint.id > source.id)
  );
}

export type LifecycleSnapshot = Readonly<{
  format: typeof LIFECYCLE_SNAPSHOT_FORMAT;
  formatVersion: typeof LIFECYCLE_SNAPSHOT_VERSION;
  dataContractVersion: number;
  companyPublicId: string;
  exportPublicId: string;
  generatedAt: string;
  tableCounts: Record<string, number>;
  totalRows: number;
  tables: Record<string, Record<string, unknown>[]>;
}>;

function stableValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function createLifecycleSnapshot(input: {
  companyPublicId: string;
  exportPublicId: string;
  generatedAt: Date;
  tables: Record<string, Record<string, unknown>[]>;
}): LifecycleSnapshot {
  const tableCounts = Object.fromEntries(
    CANONICAL_TABLES.map(spec => [spec.key, input.tables[spec.key]?.length ?? 0]),
  );
  return {
    format: LIFECYCLE_SNAPSHOT_FORMAT,
    formatVersion: LIFECYCLE_SNAPSHOT_VERSION,
    dataContractVersion: EXCEL_DATA_FORMAT_VERSION,
    companyPublicId: input.companyPublicId,
    exportPublicId: input.exportPublicId,
    generatedAt: input.generatedAt.toISOString(),
    tableCounts,
    totalRows: Object.values(tableCounts).reduce((total, count) => total + count, 0),
    tables: input.tables,
  };
}

export function serializeLifecycleSnapshot(snapshot: LifecycleSnapshot) {
  return Buffer.from(JSON.stringify(stableValue(snapshot)), "utf8");
}

function publicId(value: unknown) {
  return typeof value === "string" && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
}

export function parseLifecycleSnapshot(
  bytes: Buffer,
  expected: { companyId: number; companyPublicId: string },
): { snapshot: LifecycleSnapshot; rows: CanonicalWorkbookData } {
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("RESTORE_SNAPSHOT_INVALID_JSON");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("RESTORE_SNAPSHOT_INVALID_FORMAT");
  }
  const snapshot = raw as Partial<LifecycleSnapshot>;
  if (
    snapshot.format !== LIFECYCLE_SNAPSHOT_FORMAT ||
    snapshot.formatVersion !== LIFECYCLE_SNAPSHOT_VERSION ||
    !SUPPORTED_EXCEL_DATA_FORMAT_VERSIONS.includes(
      snapshot.dataContractVersion as (typeof SUPPORTED_EXCEL_DATA_FORMAT_VERSIONS)[number],
    ) ||
    !publicId(snapshot.companyPublicId) ||
    !publicId(snapshot.exportPublicId) ||
    !snapshot.generatedAt ||
    !Number.isFinite(Date.parse(snapshot.generatedAt)) ||
    !snapshot.tables ||
    typeof snapshot.tables !== "object" ||
    Array.isArray(snapshot.tables) ||
    !snapshot.tableCounts ||
    typeof snapshot.tableCounts !== "object" ||
    Array.isArray(snapshot.tableCounts) ||
    !Number.isSafeInteger(snapshot.totalRows) ||
    Number(snapshot.totalRows) < 0
  ) {
    throw new Error("RESTORE_SNAPSHOT_INVALID_FORMAT");
  }
  if (snapshot.companyPublicId !== expected.companyPublicId) {
    throw new Error("RESTORE_SNAPSHOT_TENANT_MISMATCH");
  }

  const knownTables = new Set(CANONICAL_TABLES.map(spec => spec.key));
  const unknownTables = Object.keys(snapshot.tables).filter(key => !knownTables.has(key));
  const unknownCounts = Object.keys(snapshot.tableCounts).filter(key => !knownTables.has(key));
  if (unknownTables.length || unknownCounts.length) throw new Error("RESTORE_SNAPSHOT_UNKNOWN_TABLE");

  let totalRows = 0;
  for (const spec of CANONICAL_TABLES) {
    const rows = snapshot.tables[spec.key];
    const expectedCount = snapshot.tableCounts[spec.key];
    if (!Array.isArray(rows) || !Number.isSafeInteger(expectedCount) || expectedCount !== rows.length) {
      throw new Error("RESTORE_SNAPSHOT_ROW_COUNT_MISMATCH");
    }
    if (LIFECYCLE_EXCLUDED_TABLES.has(spec.key) && rows.length !== 0) {
      throw new Error("RESTORE_SNAPSHOT_FORBIDDEN_IDENTITY_DATA");
    }
    if (!LIFECYCLE_EXCLUDED_TABLES.has(spec.key)) {
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row) || Number(row.companyId) !== expected.companyId) {
          throw new Error("RESTORE_SNAPSHOT_TENANT_MISMATCH");
        }
      }
    }
    totalRows += rows.length;
  }
  if (totalRows !== snapshot.totalRows) throw new Error("RESTORE_SNAPSHOT_ROW_COUNT_MISMATCH");

  return {
    snapshot: snapshot as LifecycleSnapshot,
    rows: validateCanonicalDataObject(snapshot.tables, snapshot.dataContractVersion),
  };
}
