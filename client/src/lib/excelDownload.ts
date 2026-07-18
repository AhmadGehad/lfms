type WorkbookSheet = {
  name: string;
  rows: readonly (readonly unknown[])[];
  widths?: readonly number[];
};

export async function downloadExcelWorkbook(
  filename: string,
  sheets: readonly WorkbookSheet[],
) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LFMS";
  workbook.created = new Date();

  for (const definition of sheets) {
    const sheet = workbook.addWorksheet(definition.name);
    sheet.addRows(definition.rows.map(row => [...row]));
    if (definition.widths) {
      sheet.columns = definition.widths.map(width => ({ width }));
    }
    const firstRow = sheet.getRow(1);
    firstRow.font = { bold: true };
    firstRow.alignment = { vertical: "middle" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
