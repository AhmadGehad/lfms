// drizzle-kit emits ALTER TABLE ... ADD FOREIGN KEY before CREATE UNIQUE INDEX.
// 78 of the foreign keys reference composite (companyId, id) targets, and
// Postgres requires the matching unique index to already exist, so the
// generated file fails on the first composite FK. Reordering is sufficient;
// the statements themselves are correct.
//
// Run after every `drizzle-kit generate --config=drizzle.pg.config.ts`.

import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: fix-ddl-order.mts <migration.sql>");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const statements = sql
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

const rank = (s: string): number => {
  if (/^CREATE TYPE/i.test(s)) return 0;
  if (/^CREATE TABLE/i.test(s)) return 1;
  if (/^CREATE UNIQUE INDEX/i.test(s)) return 2;
  if (/^CREATE INDEX/i.test(s)) return 3;
  if (/ADD CONSTRAINT .* FOREIGN KEY/i.test(s)) return 4;
  return 3; // anything else lands before the foreign keys
};

// Stable sort keeps drizzle's ordering within each rank.
const ordered = statements
  .map((s, i) => ({ s, i, r: rank(s) }))
  .sort((a, b) => a.r - b.r || a.i - b.i)
  .map((x) => x.s);

writeFileSync(file, ordered.join(";\n--> statement-breakpoint\n") + ";\n");

const counts = ordered.reduce<Record<number, number>>((acc, s) => {
  const r = rank(s);
  acc[r] = (acc[r] ?? 0) + 1;
  return acc;
}, {});
const labels = ["types", "tables", "unique indexes", "indexes/other", "foreign keys"];
console.log(`reordered ${ordered.length} statements in ${file}`);
for (const [r, n] of Object.entries(counts)) console.log(`  ${labels[Number(r)]}: ${n}`);
