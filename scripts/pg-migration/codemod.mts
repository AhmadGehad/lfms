// Ports drizzle/schema.mysql.ts (the frozen MySQL original) into drizzle/schema.ts
// as Postgres, so the ~83 existing import sites keep working unchanged.
// Re-runnable: rerun after any schema.mysql.ts change; never hand-edit the output.
// Anything it cannot decide safely is left for the hand-finish pass and reported.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SRC = "drizzle/schema.mysql.ts";
const OUT = "drizzle/schema.ts";

// The one FK omitted by decision: saas_azal_animal_status_history row 180001
// references a hard-deleted animal. Keeping the row was chosen over keeping
// the constraint.
const OMIT_FOREIGN_KEYS = new Set(["animal_status_history_animal_fk"]);

// Production enforces no check constraints, and 2 of 49 expense rows are
// scopeType='company' while still carrying a farmId. Keeping the rows
// unaltered was chosen over keeping the constraint.
const OMIT_CHECKS = new Set(["expenses_scope_check"]);

// schema.ts marks these NOT NULL but production has them nullable, and 686
// audit rows written before the columns were introduced (2026-07-21) hold
// NULLs. Matching production keeps every historical audit row intact rather
// than fabricating actor attribution that never existed.
const DROP_NOT_NULL: { table: string; columns: string[] }[] = [
  { table: "saas_azal_audit_log", columns: ["actorType", "actionCategory"] },
];

let src = readFileSync(SRC, "utf8");
const notes: string[] = [];

/** Finds the index just past the delimiter matching the one at `open`. */
function matchDelimiter(s: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const close = pairs[s[open]];
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < s.length && s[i] !== quote) {
        if (s[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (ch === s[open]) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`unbalanced ${s[open]} at ${open}`);
}

// ── 1. Hoist mysqlEnum(...) to top-level pgEnum declarations ────────────────
// Postgres enum type names are global, so they are namespaced as
// <sql_table_name>_<lowercased column>. 19 tables share `status` and 5 share
// `role`; this rule makes all 58 collision-free.

type EnumDecl = { ident: string; typeName: string; values: string };
const enums: EnumDecl[] = [];
const enumIdents = new Map<string, string>();

function identFor(typeName: string): string {
  const base =
    typeName.replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase()) + "Enum";
  return base.charAt(0).toLowerCase() + base.slice(1);
}

{
  // Table boundaries are needed to know which SQL table an enum belongs to.
  const tableStarts = [...src.matchAll(/mysqlTable\(\s*"([^"]+)"/g)].map((m) => ({
    index: m.index!,
    sqlName: m[1],
  }));
  const tableAt = (pos: number) => {
    let found = "unknown";
    for (const t of tableStarts) {
      if (t.index <= pos) found = t.sqlName;
      else break;
    }
    return found;
  };

  let out = "";
  let cursor = 0;
  const re = /mysqlEnum\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const parenOpen = m.index + "mysqlEnum".length;
    const parenClose = matchDelimiter(src, parenOpen);
    const inner = src.slice(parenOpen + 1, parenClose);

    const colMatch = inner.match(/^\s*"([^"]+)"\s*,/);
    if (!colMatch) {
      notes.push(`could not parse mysqlEnum at offset ${m.index}`);
      continue;
    }
    const column = colMatch[1];
    const bracketOpen = inner.indexOf("[");
    const values = inner.slice(bracketOpen, matchDelimiter(inner, bracketOpen) + 1);

    const typeName = `${tableAt(m.index)}_${column.toLowerCase()}`;
    let ident = enumIdents.get(typeName);
    if (!ident) {
      ident = identFor(typeName);
      enumIdents.set(typeName, ident);
      enums.push({ ident, typeName, values });
    }

    out += src.slice(cursor, m.index) + `${ident}("${column}")`;
    cursor = parenClose + 1;
    re.lastIndex = cursor;
  }
  out += src.slice(cursor);
  src = out;
}

// ── 2. Rewrite raw SQL fragments: MySQL backticks -> Postgres double quotes ──
// Inside a TS template literal the backticks are escaped, so the body pattern
// must consume `\`` sequences rather than stopping at the bare backtick.
src = src.replace(/sql`((?:[^`\\]|\\.)*)`/g, (_full, body: string) =>
  "sql`" + body.replace(/\\`([^`\\]+)\\`/g, '"$1"') + "`",
);

// ── 3. Generated columns ────────────────────────────────────────────────────
// Postgres 17 has no VIRTUAL generated columns, so all 22 become STORED; pg's
// generatedAlwaysAs takes no mode argument. Expressions must also be
// IMMUTABLE, which CONCAT() is not in Postgres.
src = src.replace(/\.generatedAlwaysAs\(\(\) =>\s*(sql`[^`]*`),\s*\{\s*mode:\s*"(?:stored|virtual)"\s*\}\s*\)/g,
  (_f, expr: string) => `.generatedAlwaysAs(${expr})`);

function concatToConcatOperator(s: string): string {
  return s.replace(/CONCAT\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (_full, args: string) => {
    const parts: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of args) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        parts.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts.map((p) => (/^'.*'$/.test(p) ? p : `${p}::text`)).join(" || ");
  });
}

const beforeConcat = src;
src = concatToConcatOperator(src);
if (src !== beforeConcat) notes.push("rewrote CONCAT(...) to ||::text (IMMUTABLE requirement)");

// ── 4. Check constraints ────────────────────────────────────────────────────
// Postgres cannot add booleans; cast each predicate to int explicitly.
src = src.replace(/\(("[^"]+" IS (?:NOT )?NULL)\) \+ \(("[^"]+" IS (?:NOT )?NULL)\)/g,
  "($1)::int + ($2)::int");

// ── 5. Column type mappings ─────────────────────────────────────────────────
src = src.replace(/\bmysqlTable\(/g, "pgTable(");
src = src.replace(/(^|[^.\w])\bint\(/g, "$1integer(");
src = src.replace(/\bdecimal\(/g, "numeric(");
// binary(n) holds raw 32-byte SHA-256 digests; pg-core 0.45 has no bytea export.
src = src.replace(/\bbinary\("([^"]+)",\s*\{\s*length:\s*\d+\s*\}\)/g, 'bytea("$1")');
// MySQL timestamps are whole seconds; drizzle pg defaults to microseconds.
src = src.replace(/\btimestamp\("([^"]+)"\)/g, 'timestamp("$1", { precision: 0 })');
// DATE columns carry no time, and the application passes plain 'YYYY-MM-DD'
// strings from its zod schemas. pg's default string mode matches that; forcing
// mode:"date" makes drizzle call toISOString() on a string and throw.
src = src.replace(/\.autoincrement\(\)/g, ".generatedByDefaultAsIdentity()");
// ON UPDATE CURRENT_TIMESTAMP has no column-level equivalent -> triggers.
src = src.replace(/\.onUpdateNow\(\)/g, "");

// ── 6. Drop the one omitted foreign key ─────────────────────────────────────
for (const name of OMIT_FOREIGN_KEYS) {
  const re = new RegExp(`\\n\\s*\\w+:\\s*foreignKey\\(\\{[^}]*name:\\s*"${name}"[^}]*\\}\\)(\\.[\\w]+\\([^)]*\\))*,`, "g");
  const before = src;
  src = src.replace(re, "");
  if (src === before) notes.push(`FAILED to remove foreign key ${name} - remove by hand`);
  else notes.push(`removed foreign key ${name} (kept the orphan row instead)`);
}

// ── 6a. Drop omitted check constraints ──────────────────────────────────────
for (const name of OMIT_CHECKS) {
  const marker = `check(\n    "${name}"`;
  const idx = src.indexOf(marker) !== -1 ? src.indexOf(marker) : src.indexOf(`check("${name}"`);
  if (idx === -1) {
    notes.push(`FAILED to remove check ${name} - remove by hand`);
    continue;
  }
  // Walk back to the start of the "<key>: check(" property.
  const lineStart = src.lastIndexOf("\n", idx);
  const callOpen = src.indexOf("(", idx);
  const callClose = matchDelimiter(src, callOpen);
  const trailing = src.indexOf(",", callClose);
  src = src.slice(0, lineStart) + src.slice(trailing + 1);
  notes.push(`removed check ${name} (kept the 2 violating rows instead)`);
}

// ── 6b. Relax nullability where schema.ts is stricter than production ───────
for (const override of DROP_NOT_NULL) {
  const start = src.indexOf(`pgTable("${override.table}"`);
  if (start === -1) {
    notes.push(`FAILED to find table ${override.table} for nullability override`);
    continue;
  }
  const bodyOpen = src.indexOf("{", start);
  const bodyClose = matchDelimiter(src, bodyOpen);
  let body = src.slice(bodyOpen, bodyClose + 1);
  for (const column of override.columns) {
    const re = new RegExp(`(\\b${column}:\\s*[^,\\n]*?)\\.notNull\\(\\)`);
    if (!re.test(body)) {
      notes.push(`FAILED to relax ${override.table}.${column} - check by hand`);
      continue;
    }
    body = body.replace(re, "$1");
    notes.push(`relaxed ${override.table}.${column} to nullable (matches production)`);
  }
  src = src.slice(0, bodyOpen) + body + src.slice(bodyClose + 1);
}

// ── 7. Imports ──────────────────────────────────────────────────────────────
const importOpen = src.indexOf("{", src.indexOf("import"));
const importClose = matchDelimiter(src, importOpen);
const header = `import {
  bigint,
  boolean,
  customType,
  date,
  integer,
  json,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";

// drizzle-orm 0.45's pg-core exports no bytea. These columns hold raw 32-byte
// SHA-256 digests, so the driver value must stay a Buffer end to end - any
// text coercion silently breaks every auth token and invitation lookup.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});`;

src = header + src.slice(src.indexOf(";", importClose) + 1);

// ── 8. Emit the hoisted enum declarations ───────────────────────────────────
const enumBlock = enums
  .map((e) => `export const ${e.ident} = pgEnum("${e.typeName}", ${e.values});`)
  .join("\n");

const anchor = src.indexOf('import { sql } from "drizzle-orm";');
const anchorEnd = src.indexOf("\n", anchor) + 1;
src =
  src.slice(0, anchorEnd) +
  `\n// ${enums.length} enum types, namespaced <table>_<column> because Postgres\n` +
  `// enum names are global (19 tables share "status", 5 share "role").\n` +
  enumBlock +
  "\n" +
  src.slice(anchorEnd);

mkdirSync("drizzle", { recursive: true });
writeFileSync(OUT, src);

console.log(`wrote ${OUT}`);
console.log(`enum types hoisted: ${enums.length}`);
console.log(`remaining mysql references: ${(src.match(/mysql/gi) ?? []).length}`);
console.log(`remaining backticked identifiers: ${(src.match(/\\`/g) ?? []).length}`);
console.log(`remaining .onUpdateNow: ${(src.match(/onUpdateNow/g) ?? []).length}`);
if (notes.length) {
  console.log("\nnotes:");
  for (const n of notes) console.log(`  - ${n}`);
}
