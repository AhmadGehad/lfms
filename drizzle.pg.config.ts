import { defineConfig } from "drizzle-kit";

// Separate from drizzle.config.ts, which throws by design to protect the
// legacy MySQL production tables (see docs/LEGACY_IMMUTABILITY.md). That guard
// stays in place; this config targets only the new Postgres database.
// `casing` is omitted deliberately: every column name is given explicitly.
export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle/pg/migrations",
  dbCredentials: {
    url: process.env.PG_DATABASE_URL ?? "",
  },
});
