// Validates live MySQL data against the constraints drizzle/schema.ts declares.
// schema.ts declares more foreign keys, uniques and checks than TiDB actually
// enforces, so the generated Postgres DDL is stricter than production. Any
// violation found here would abort the data load; find them now, not then.

import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "../../drizzle/schema.mysql";

type Violation = { kind: string; name: string; table: string; detail: string; rows: number };

function loadEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(".env", "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

/**
 * The MySQL source URL. Read from SOURCE_DATABASE_URL first so these scripts
 * keep working after .env's DATABASE_URL has been repointed at Postgres.
 */
function sourceDatabaseUrl(env: Record<string, string>): string {
  const url = process.env.SOURCE_DATABASE_URL ?? env.SOURCE_DATABASE_URL ?? env.DATABASE_URL ?? "";
  if (!url) throw new Error("SOURCE_DATABASE_URL (or DATABASE_URL) is required");
  if (!url.startsWith("mysql:")) {
    throw new Error(`source must be a mysql:// URL, got ${url.split(":")[0]}: - set SOURCE_DATABASE_URL`);
  }
  return url;
}

const q = (id: string) => "`" + id.replace(/`/g, "``") + "`";

async function main() {
  const env = loadEnv();
  const url = new URL(sourceDatabaseUrl(env));
  const c = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port) || 4000,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: true },
  });

  const tables = Object.values(schema).filter(
    (v): v is Parameters<typeof getTableConfig>[0] =>
      typeof v === "object" && v !== null && getTableConfigSafe(v) !== null,
  );

  const violations: Violation[] = [];
  let fkChecked = 0;
  let uniqueChecked = 0;
  let checkChecked = 0;

  for (const t of tables) {
    const cfg = getTableConfig(t);
    const child = cfg.name;

    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference();
      const parent = getTableConfig(ref.foreignTable).name;
      const childCols = ref.columns.map((col) => col.name);
      const parentCols = ref.foreignColumns.map((col) => col.name);
      fkChecked++;

      // A row violates the FK when every child column is non-null but no
      // parent row matches. NULLs in any column make the FK inapplicable.
      const notNull = childCols.map((col) => `c.${q(col)} IS NOT NULL`).join(" AND ");
      const join = childCols.map((col, i) => `p.${q(parentCols[i])} = c.${q(col)}`).join(" AND ");
      const sql =
        `SELECT COUNT(*) n FROM ${q(child)} c WHERE ${notNull} ` +
        `AND NOT EXISTS (SELECT 1 FROM ${q(parent)} p WHERE ${join})`;

      try {
        const [r] = await c.query<any[]>(sql);
        const n = Number(r[0].n);
        if (n > 0) {
          violations.push({
            kind: "FOREIGN KEY",
            name: fk.getName(),
            table: child,
            detail: `${child}(${childCols.join(",")}) -> ${parent}(${parentCols.join(",")})`,
            rows: n,
          });
        }
      } catch (e) {
        violations.push({
          kind: "FK-CHECK-ERROR",
          name: fk.getName(),
          table: child,
          detail: (e as Error).message.slice(0, 160),
          rows: -1,
        });
      }
    }

    const uniques: { name: string; cols: string[] }[] = [
      ...cfg.uniqueConstraints.map((u) => ({ name: u.name, cols: u.columns.map((col) => col.name) })),
      ...cfg.indexes
        .filter((i) => i.config.unique)
        .map((i) => ({ name: i.config.name, cols: (i.config.columns as any[]).map((col) => col.name).filter(Boolean) })),
      ...cfg.columns.filter((col) => col.isUnique).map((col) => ({ name: `${child}.${col.name}`, cols: [col.name] })),
    ];

    for (const u of uniques) {
      if (u.cols.length === 0) continue;
      uniqueChecked++;
      const cols = u.cols.map(q).join(",");
      const notNull = u.cols.map((col) => `${q(col)} IS NOT NULL`).join(" AND ");
      const sql = `SELECT COUNT(*) n FROM (SELECT ${cols} FROM ${q(child)} WHERE ${notNull} GROUP BY ${cols} HAVING COUNT(*)>1) x`;
      try {
        const [r] = await c.query<any[]>(sql);
        const n = Number(r[0].n);
        if (n > 0) {
          violations.push({
            kind: "UNIQUE",
            name: u.name,
            table: child,
            detail: `duplicate groups on (${u.cols.join(",")})`,
            rows: n,
          });
        }
      } catch (e) {
        violations.push({
          kind: "UNIQUE-CHECK-ERROR",
          name: u.name,
          table: child,
          detail: (e as Error).message.slice(0, 160),
          rows: -1,
        });
      }
    }

    for (const ck of cfg.checks ?? []) {
      checkChecked++;
      violations.push({
        kind: "CHECK-MANUAL",
        name: ck.name,
        table: child,
        detail: "check constraint declared in schema.ts but absent live - verify by hand",
        rows: 0,
      });
    }
  }

  await c.end();

  console.log(`tables inspected:   ${tables.length}`);
  console.log(`foreign keys:       ${fkChecked}`);
  console.log(`unique constraints: ${uniqueChecked}`);
  console.log(`check constraints:  ${checkChecked}`);
  console.log("");

  const real = violations.filter((v) => v.kind !== "CHECK-MANUAL");
  if (real.length === 0) {
    console.log("NO VIOLATIONS - live data satisfies every constraint schema.ts declares.");
  } else {
    console.log(`${real.length} VIOLATION(S) - these would abort the Postgres load:\n`);
    for (const v of real) {
      console.log(`  [${v.kind}] ${v.table} :: ${v.name}`);
      console.log(`      ${v.detail}${v.rows >= 0 ? `  (${v.rows} offending)` : ""}`);
    }
  }

  const manual = violations.filter((v) => v.kind === "CHECK-MANUAL");
  if (manual.length > 0) {
    console.log(`\n${manual.length} check constraint(s) to verify by hand:`);
    for (const v of manual) console.log(`  ${v.table} :: ${v.name}`);
  }

  process.exitCode = real.length > 0 ? 1 : 0;
}

function getTableConfigSafe(v: unknown) {
  try {
    return getTableConfig(v as any);
  } catch {
    return null;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
