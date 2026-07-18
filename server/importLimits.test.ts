import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { assertSafeWorkbook, assertSafeXlsxArchive } from "./routers/import";

describe("Excel import resource limits", () => {
  it("accepts a normal XLSX archive", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Animals").addRow(["Animal ID"]);
    const bytes = await workbook.xlsx.writeBuffer();
    expect(() => assertSafeXlsxArchive(Buffer.from(bytes))).not.toThrow();
    expect(() => assertSafeWorkbook(workbook)).not.toThrow();
  });

  it("rejects non-ZIP and oversized worksheet dimensions", () => {
    expect(() => assertSafeXlsxArchive(Buffer.from("not-a-zip"))).toThrow("Invalid Excel archive");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Oversized");
    worksheet.getCell(100_001, 1).value = "x";
    expect(() => assertSafeWorkbook(workbook)).toThrow("worksheet exceeds import limits");
  });
});
