const HTML_DOCUMENT_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Disposition": "inline",
  "Content-Type": "text/html; charset=utf-8",
} as const;

export function setHtmlDocumentHeaders(response: {
  setHeader(name: string, value: string): unknown;
}) {
  for (const [name, value] of Object.entries(HTML_DOCUMENT_HEADERS)) {
    response.setHeader(name, value);
  }
}
