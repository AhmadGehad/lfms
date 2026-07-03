import ExcelJS from "exceljs";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import {
  addCanonicalSheets,
  CANONICAL_TABLES,
  EXCEL_DATA_FORMAT_VERSION,
  EXCEL_MANIFEST_SHEET,
  isCanonicalWorkbook,
  readCanonicalWorkbook,
  validateCanonicalDataObject,
  type CanonicalWorkbookData,
} from "./excelDataContract";

async function serialize(workbook: ExcelJS.Workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  return loaded;
}

describe("canonical Excel data contract", () => {
  it("creates a versioned sheet for every schema table", () => {
    const workbook = new ExcelJS.Workbook();
    addCanonicalSheets(workbook, new Map());

    expect(
      workbook.getWorksheet(EXCEL_MANIFEST_SHEET)?.getCell("B1").value
    ).toBe(EXCEL_DATA_FORMAT_VERSION);
    expect(CANONICAL_TABLES).toHaveLength(27);
    expect(CANONICAL_TABLES.map(spec => getTableName(spec.table)).sort()).toEqual(
      Object.values(schema).map(table => getTableName(table)).sort()
    );
    for (const spec of CANONICAL_TABLES) {
      const sheet = workbook.getWorksheet(spec.sheetName);
      expect(sheet, spec.sheetName).toBeDefined();
      expect(sheet!.getRow(1).values.slice(1)).toEqual(
        Object.keys(getTableColumns(spec.table))
      );
    }
  });

  it("round-trips required animal fields, relationships, soft-delete metadata, zero decimals, and JSON", async () => {
    const rows: CanonicalWorkbookData = new Map([
      [
        "animals",
        [
          {
            id: 10,
            animalId: "EWE-010",
            speciesId: 1,
            categoryId: 2,
            groupId: 3,
            statusId: 4,
            sex: "female",
            acquisitionType: "born",
            acquisitionDate: "2026-01-02",
            birthDate: "2025-12-31",
            damId: 8,
            sireId: 9,
            purchaseCost: null,
            weightAtAcquisition: "4.20",
            exitDate: null,
            exitReason: null,
            notes: "round trip",
            isActive: true,
            createdAt: new Date("2026-01-02T10:00:00Z"),
            updatedAt: new Date("2026-01-03T10:00:00Z"),
            createdBy: 1,
            deletedAt: new Date("2026-06-01T10:00:00Z"),
            deletedBy: 2,
          },
        ],
      ],
      [
        "audit_log",
        [
          {
            id: 5,
            userId: 1,
            action: "update",
            entityType: "animal",
            entityId: "10",
            oldValues: { statusId: 1 },
            newValues: { statusId: 4 },
            ipAddress: "127.0.0.1",
            createdAt: new Date("2026-01-03T10:00:00Z"),
          },
        ],
      ],
    ]);
    const workbook = new ExcelJS.Workbook();
    addCanonicalSheets(workbook, rows);

    const loaded = await serialize(workbook);
    expect(isCanonicalWorkbook(loaded)).toBe(true);
    const parsed = readCanonicalWorkbook(loaded);
    expect(parsed.get("animals")?.[0]).toMatchObject({
      id: 10,
      animalId: "EWE-010",
      birthDate: "2025-12-31",
      damId: 8,
      sireId: 9,
      purchaseCost: null,
      isActive: true,
      deletedBy: 2,
    });
    expect(parsed.get("audit_log")?.[0]?.newValues).toEqual({ statusId: 4 });
  });

  it("uses headers rather than fixed column positions", () => {
    const workbook = new ExcelJS.Workbook();
    addCanonicalSheets(workbook, new Map());
    const sheet = workbook.getWorksheet("Data - Feed Items")!;
    sheet.spliceColumns(1, 1);
    sheet.spliceColumns(3, 0, ["id"]);
    sheet.getCell("C2").value = 7;
    sheet.getCell("A2").value = "Hay";
    sheet.getCell("B2").value = "kg";
    sheet.getCell("D2").value = true;

    const row = readCanonicalWorkbook(workbook).get("feed_items")?.[0];
    expect(row).toMatchObject({
      id: 7,
      name: "Hay",
      unit: "kg",
      isActive: true,
    });
  });

  it("rejects missing columns and invalid enum values before database writes", () => {
    const workbook = new ExcelJS.Workbook();
    addCanonicalSheets(workbook, new Map());
    const sheet = workbook.getWorksheet("Data - Animals")!;
    sheet.getCell("A2").value = 1;
    const sexColumn = sheet
      .getRow(1)
      .values.findIndex(value => value === "sex");
    sheet.getCell(2, sexColumn).value = "unknown";

    expect(() => readCanonicalWorkbook(workbook)).toThrow(
      /must be one of male, female/
    );

    const validWorkbook = new ExcelJS.Workbook();
    addCanonicalSheets(validWorkbook, new Map());
    validWorkbook.getWorksheet("Data - Sales")!.spliceColumns(1, 1);
    expect(() => readCanonicalWorkbook(validWorkbook)).toThrow(
      /missing columns id/
    );
  });

  it("validates complete JSON-style canonical table objects", () => {
    const complete = Object.fromEntries(CANONICAL_TABLES.map(spec => [spec.key, []]));

    const parsed = validateCanonicalDataObject(complete);
    expect([...parsed.keys()]).toEqual(CANONICAL_TABLES.map(spec => spec.key));

    expect(() => validateCanonicalDataObject({ feed_items: [] })).toThrow(
      /Missing required table array: users/
    );

    expect(() =>
      validateCanonicalDataObject({
        ...complete,
        feed_items: [{ id: 1 }],
      })
    ).toThrow(/feed_items row 1: missing field name/);
  });

  it("accepts version 3 snapshots without the new birth-integrity fields", () => {
    const complete = Object.fromEntries(
      CANONICAL_TABLES.map(spec => [spec.key, []]),
    );
    complete.animal_categories = [{
      id: 1,
      name: "Lamb",
      speciesId: 1,
      idPrefix: "LMB",
      idSequence: 12,
      targetWeightKg: null,
      expectedCycleDays: null,
      autoStageWeightKg: null,
      autoStageTargetCategoryId: null,
      isExitStatus: false,
      isActive: true,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      createdBy: null,
      deletedAt: null,
      deletedBy: null,
    }];
    complete.lambing_log = [{
      id: 1,
      lambId: "LMB0010",
      birthDate: "2026-01-01",
      damId: null,
      sireId: null,
      sex: "female",
      birthTypeId: 1,
      birthWeightKg: "4.00",
      valueUsed: null,
      groupId: null,
      notes: null,
      isPromoted: false,
      promotedHeadId: null,
      createdAt: new Date("2026-01-01"),
      createdBy: null,
      deletedAt: null,
      deletedBy: null,
    }];

    const parsed = validateCanonicalDataObject(complete, 3);

    expect(parsed.get("animal_categories")?.[0])
      .not.toHaveProperty("lambIdSequence");
    expect(parsed.get("lambing_log")?.[0]).not.toHaveProperty("speciesId");
    expect(parsed.get("lambing_log")?.[0]).not.toHaveProperty("categoryId");
  });

  it("reads a version 3 workbook without version 4 columns", () => {
    const workbook = new ExcelJS.Workbook();
    addCanonicalSheets(workbook, new Map());
    workbook.getWorksheet(EXCEL_MANIFEST_SHEET)!.getCell("B1").value = 3;

    const removeColumns = (sheetName: string, names: string[]) => {
      const sheet = workbook.getWorksheet(sheetName)!;
      for (const name of names) {
        const column = sheet.getRow(1).values.findIndex(value => value === name);
        if (column > 0) sheet.spliceColumns(column, 1);
      }
    };
    removeColumns("Data - Animal Categories", ["lambIdSequence"]);
    removeColumns("Data - Lambing Log", [
      "speciesId",
      "categoryId",
      "promotedAnimalCode",
      "promotedAnimalPurgedAt",
    ]);
    removeColumns("Data - Vaccination Records", [
      "notifyBeforeNext",
      "notifyBeforeBooster",
    ]);

    expect(isCanonicalWorkbook(workbook)).toBe(true);
    expect(() => readCanonicalWorkbook(workbook)).not.toThrow();
  });
});
