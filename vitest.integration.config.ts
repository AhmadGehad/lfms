import { defineConfig } from "vitest/config";

// Separate from the unit suite: these tests need a real Postgres, so they run
// only when PG_TEST_DATABASE_URL is set. Everything else uses server/testing/fakeDb.ts.
export default defineConfig({
  test: {
    include: ["server/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
