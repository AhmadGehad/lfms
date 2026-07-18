import { describe, expect, it } from "vitest";
import { setHtmlDocumentHeaders } from "./htmlResponse";

describe("HTML document responses", () => {
  it("renders in the browser and bypasses stale document caches", () => {
    const headers = new Map<string, string>();

    setHtmlDocumentHeaders({
      setHeader(name, value) {
        headers.set(name, value);
      },
    });

    expect(Object.fromEntries(headers)).toEqual({
      "Cache-Control": "no-store",
      "Content-Disposition": "inline",
      "Content-Type": "text/html; charset=utf-8",
    });
  });
});
