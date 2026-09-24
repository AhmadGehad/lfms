import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

// Postgres returns `{ rowCount, rows }`; mysql2 returned `[ResultSetHeader, fields]`.
// 101 call sites destructure that tuple (`const [result] = await db.update(...)`)
// and read `.affectedRows` / `.insertId`, and server/testing/fakeDb.ts already
// fabricates the same shape for all 95 test files.
//
// Normalising here rather than at every call site means those sites and their
// tests stay untouched, which is what makes it possible to prove the port did
// not change any write semantics. `.returning()` is passed through unchanged,
// so new code can use the native Postgres style and this shim can be retired
// file by file.

export type MysqlResultHeader = { affectedRows: number; insertId: number };
export type MysqlResultTuple = [MysqlResultHeader, never[]];

// drizzle's Postgres mutations are typed as `QueryResult`, but at runtime this
// module makes them resolve to the mysql2 `[header, fields]` tuple that 101
// call sites destructure. Describing that tuple here - rather than re-typing
// the builders - keeps every `.values()` / `.set()` payload fully checked,
// because a mapped type over drizzle's overloaded methods silently collapses
// them to their last signature.
declare module "pg" {
  // Type parameters must match @types/pg's own declaration exactly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface QueryResult<R extends import("pg").QueryResultRow = any> {
    0: MysqlResultHeader;
    1: never[];
    [Symbol.iterator](): Iterator<MysqlResultHeader | never[]>;
  }
}

const INSERT_ID_ALIAS = "__pgCompatInsertId";

/** The single integer primary key a MySQL insertId would have returned, if any. */
function insertIdColumn(table: PgTable): unknown | null {
  let config;
  try {
    config = getTableConfig(table);
  } catch {
    return null;
  }
  if (config.primaryKeys.length > 0) return null; // composite key: no insertId
  const primaries = config.columns.filter((column) => column.primary);
  if (primaries.length !== 1) return null;
  const column = primaries[0];
  const type = column.getSQLType();
  return /^(integer|bigint|smallint)/.test(type) ? column : null;
}

// drizzle's builders are themselves thenable, so "has .then" cannot be used to
// tell a builder from a settled promise - only a real Promise is left unwrapped.
function isRealPromise(value: unknown): value is Promise<unknown> {
  return value instanceof Promise;
}

type BuilderState = {
  /** Set once the caller invokes .returning() so results pass through untouched. */
  callerWantsRows: boolean;
  insertIdColumn: unknown | null;
};

function wrapBuilder<T extends object>(builder: T, state: BuilderState): T {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (prop === "then") {
        return (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
          const run = execute(target, state);
          return run.then(onFulfilled, onRejected);
        };
      }

      if (prop === "execute") {
        return () => execute(target, state);
      }

      if (typeof value === "function") {
        return (...args: unknown[]) => {
          if (prop === "returning") state.callerWantsRows = true;
          const result = (value as (...a: unknown[]) => unknown).apply(target, args);
          // Chain methods hand back a builder - sometimes the same object,
          // sometimes a new one - and each must stay wrapped so the final
          // await still yields the mysql2 tuple.
          if (result && typeof result === "object" && !isRealPromise(result)) {
            return wrapBuilder(result as object, state);
          }
          return result;
        };
      }

      return value;
    },
  });
}

async function execute(builder: object, state: BuilderState): Promise<unknown> {
  // Caller asked for rows explicitly - hand them straight through.
  if (state.callerWantsRows) {
    return await (builder as PromiseLike<unknown>);
  }

  const withReturning = builder as { returning?: (cols: Record<string, unknown>) => PromiseLike<unknown> };
  if (state.insertIdColumn && typeof withReturning.returning === "function") {
    const rows = (await withReturning.returning({
      [INSERT_ID_ALIAS]: state.insertIdColumn,
    })) as Record<string, unknown>[];
    const first = rows[0]?.[INSERT_ID_ALIAS];
    return [{ affectedRows: rows.length, insertId: Number(first ?? 0) }, []] satisfies MysqlResultTuple;
  }

  const result = (await (builder as PromiseLike<unknown>)) as { rowCount?: number | null; length?: number };
  const affected = typeof result?.rowCount === "number" ? result.rowCount : (result?.length ?? 0);
  return [{ affectedRows: affected, insertId: 0 }, []] satisfies MysqlResultTuple;
}

const MUTATIONS = new Set(["insert", "update", "delete"]);

/**
 * Wraps a drizzle Postgres handle (or transaction) so mutations resolve to the
 * mysql2 result tuple the codebase expects.
 */
export function withMysqlResultShape<T extends object>(handle: T): T {
  return new Proxy(handle, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;

      if (MUTATIONS.has(String(prop))) {
        return (...args: unknown[]) => {
          const builder = (value as (...a: unknown[]) => object).apply(target, args);
          const table = args[0] as PgTable | undefined;
          return wrapBuilder(builder, {
            callerWantsRows: false,
            insertIdColumn: prop === "insert" && table ? insertIdColumn(table) : null,
          });
        };
      }

      if (prop === "execute") {
        return async (...args: unknown[]) => {
          const result = (await (value as (...a: unknown[]) => unknown).apply(target, args)) as {
            rows?: unknown[];
            fields?: unknown[];
          };
          // `const [rows] = await db.execute(...)` is the mysql2 shape.
          return [result?.rows ?? [], result?.fields ?? []];
        };
      }

      if (prop === "transaction") {
        return (callback: (tx: object) => unknown, ...rest: unknown[]) =>
          (value as (...a: unknown[]) => unknown).apply(target, [
            (tx: object) => callback(withMysqlResultShape(tx)),
            ...rest,
          ]);
      }

      return value.bind(target);
    },
  }) as T;
}
