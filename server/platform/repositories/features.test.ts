import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { activeOverrideCountSql, activePlanCountSql } from "./features";

describe("feature usage count SQL", () => {
  it("correlates plan and override counts to the outer feature row", () => {
    const dialect = new PgDialect();
    for (const statement of [activePlanCountSql, activeOverrideCountSql]) {
      expect(dialect.sqlToQuery(statement).sql).toContain(
        '"saas_feature_catalog"."id"' 
      );
    }
  });
});
