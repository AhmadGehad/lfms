// MySQL's ON UPDATE CURRENT_TIMESTAMP has no column-level equivalent in
// Postgres. Without these triggers `updatedAt` silently freezes at insert time
// across 38 tables and nothing in the test suite notices.
//
// The trigger reproduces MySQL's semantics exactly, which a naive
// `NEW."updatedAt" := now()` does not:
//   1. MySQL does not bump the timestamp when an UPDATE changes nothing.
//   2. MySQL respects an explicitly supplied updatedAt, and the codebase
//      writes one in 22 places.

import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("drizzle/schema.mysql.ts", "utf8");

// Table boundaries, so each .onUpdateNow() can be attributed to its table.
const tables = [...src.matchAll(/mysqlTable\(\s*"([^"]+)"/g)].map((m) => ({
  index: m.index!,
  name: m[1],
}));

const hits = [...src.matchAll(/(\w+):\s*timestamp\("(\w+)"\)[^,]*?\.onUpdateNow\(\)/g)];

const targets: { table: string; column: string }[] = [];
for (const h of hits) {
  let table = "unknown";
  for (const t of tables) {
    if (t.index <= h.index!) table = t.name;
    else break;
  }
  targets.push({ table, column: h[2] });
}

if (targets.length === 0) throw new Error("no .onUpdateNow() columns found - check the pattern");

const lines: string[] = [];
lines.push("-- Reproduces MySQL ON UPDATE CURRENT_TIMESTAMP for " + targets.length + " columns.");
lines.push("-- Bumps only when the row actually changed and the caller did not set the");
lines.push("-- column itself, matching MySQL rather than a naive always-overwrite trigger.");
lines.push("");
lines.push(`CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$`);
lines.push("BEGIN");
// Whole-row comparison via to_jsonb: Postgres defines no equality operator for
// the `json` type, so a bare `NEW IS DISTINCT FROM OLD` raises 42883 on every
// table that has a json column - which would break UPDATEs across the schema.
lines.push("  IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)");
lines.push(`     AND NEW."updatedAt" IS NOT DISTINCT FROM OLD."updatedAt" THEN`);
// Plain now(): the column is timestamp(0), which ROUNDS to the nearest second,
// whereas date_trunc floors. Mixing the two lets an insert and a later update
// land on the same stored second and makes updatedAt look frozen.
lines.push(`    NEW."updatedAt" := now();`);
lines.push("  END IF;");
lines.push("  RETURN NEW;");
lines.push("END;");
lines.push("$$ LANGUAGE plpgsql;");
lines.push("--> statement-breakpoint");

for (const t of targets) {
  if (t.column !== "updatedAt") {
    throw new Error(`unexpected onUpdateNow column ${t.table}.${t.column} - function assumes "updatedAt"`);
  }
  lines.push(`CREATE TRIGGER "${t.table}_set_updated_at" BEFORE UPDATE ON "${t.table}" FOR EACH ROW EXECUTE FUNCTION set_updated_at();`);
  lines.push("--> statement-breakpoint");
}

while (lines[lines.length - 1] === "--> statement-breakpoint") lines.pop();

writeFileSync("drizzle/pg/migrations/0001_updated_at_triggers.sql", lines.join("\n") + "\n");

console.log(`wrote drizzle/pg/migrations/0001_updated_at_triggers.sql`);
console.log(`triggers: ${targets.length}`);
const perTable = new Set(targets.map((t) => t.table));
console.log(`tables:   ${perTable.size}`);
if (perTable.size !== targets.length) console.log("WARNING: a table has more than one onUpdateNow column");
