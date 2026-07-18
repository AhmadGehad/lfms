export function csvCell(value: unknown) {
  let text = value instanceof Date ? value.toISOString() : value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function csvDocument(header: string[], rows: unknown[][]) {
  return `\uFEFF${[
    header.map(csvCell).join(","),
    ...rows.map(row => row.map(csvCell).join(",")),
  ].join("\r\n")}\r\n`;
}
