import { describe, expect, it } from "vitest";
import { redactLogFields, StructuredLogger, withLogContext } from "./logger";

describe("structured logger", () => {
  it("redacts secrets recursively", () => {
    expect(redactLogFields({
      authorization: "Bearer abc",
      nested: { password: "unsafe", safe: "visible" },
      access_token: "unsafe",
      accessToken: "unsafe",
      clientSecret: "unsafe",
    })).toEqual({
      authorization: "[REDACTED]",
      nested: { password: "[REDACTED]", safe: "visible" },
      access_token: "[REDACTED]",
      accessToken: "[REDACTED]",
      clientSecret: "[REDACTED]",
    });
  });

  it("redacts credentials embedded in generic error messages", () => {
    const credentialedDatabaseUrl = ["mysql://user", ":pass@db.internal/lfms"].join("");
    expect(redactLogFields({
      error: new Error(`request failed: authorization=Bearer abc.def and ${credentialedDatabaseUrl}`),
    })).toMatchObject({
      error: {
        message: "request failed: authorization=[REDACTED] [REDACTED] and mysql://[REDACTED]@db.internal/lfms",
      },
    });
  });

  it("adds request context without exposing secret bindings", () => {
    const records: Array<Record<string, unknown>> = [];
    const logger = new StructuredLogger("test", { apiKey: "unsafe" }, record => records.push(record));
    withLogContext({ requestId: "request-1", companyId: 7 }, () => logger.info("done"));
    expect(records[0]).toMatchObject({
      service: "test",
      message: "done",
      requestId: "request-1",
      companyId: 7,
      apiKey: "[REDACTED]",
    });
  });
});
