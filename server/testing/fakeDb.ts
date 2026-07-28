/**
 * Minimal in-memory stand-in for a drizzle handle.
 *
 * Rows are queued **per table object** rather than per call index, so a test
 * keeps passing when the code under test reorders its queries. Each queued
 * batch is consumed by one `select().from(table)`, which lets a test model
 * "found on the first lookup, gone on the second" without any ordering games.
 *
 * Extracted from the harness originally written inline in
 * `server/invitations/service.test.ts`.
 */

export type RowQueues = Map<unknown, unknown[][]>;

export interface FakeWrite {
  kind: "insert" | "update" | "delete";
  table: unknown;
  value?: unknown;
}

export interface FakeDbOptions {
  rows?: RowQueues;
  /** `affectedRows` reported by every update — drives version-CAS branches. */
  updateAffectedRows?: number;
  /** Per-table `insertId`; anything unlisted gets `defaultInsertId`. */
  insertIds?: Map<unknown, number>;
  defaultInsertId?: number;
}

export interface FakeDb {
  /** Pass this where the code expects a drizzle handle or transaction. */
  db: any;
  writes: FakeWrite[];
  /** Append another batch of rows for the next read of `table`. */
  queue(table: unknown, rows: unknown[]): void;
  /** Every write recorded against `table`, in order. */
  writesFor(table: unknown): FakeWrite[];
}

export function createFakeDb(options: FakeDbOptions = {}): FakeDb {
  const queues: RowQueues = options.rows ?? new Map();
  const writes: FakeWrite[] = [];
  const updateAffectedRows = options.updateAffectedRows ?? 1;
  const defaultInsertId = options.defaultInsertId ?? 801;

  const take = (table: unknown) => queues.get(table)?.shift() ?? [];

  // A read builder: every chaining method returns itself, and the builder is
  // thenable so `await db.select().from(t).where(...)` resolves to the rows.
  const terminal = (table: unknown) => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.innerJoin = chain;
    builder.leftJoin = chain;
    builder.rightJoin = chain;
    builder.where = chain;
    builder.groupBy = chain;
    builder.having = chain;
    builder.orderBy = chain;
    builder.limit = chain;
    builder.offset = chain;
    builder.for = async () => take(table);
    builder.execute = async () => take(table);
    builder.then = (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(take(table)).then(resolve, reject);
    return builder;
  };

  const db: any = {
    select: () => ({ from: (table: unknown) => terminal(table) }),
    selectDistinct: () => ({ from: (table: unknown) => terminal(table) }),
    insert: (table: unknown) => ({
      values: async (value: unknown) => {
        writes.push({ kind: "insert", table, value });
        return [{ insertId: options.insertIds?.get(table) ?? defaultInsertId }];
      },
    }),
    update: (table: unknown) => ({
      set: (value: unknown) => ({
        where: async () => {
          writes.push({ kind: "update", table, value });
          return [{ affectedRows: updateAffectedRows }];
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        writes.push({ kind: "delete", table });
        return [{ affectedRows: updateAffectedRows }];
      },
    }),
    // The transaction shares this same fake, so code that queries via `tx`
    // reads from the same queues and records into the same `writes`.
    transaction: async (callback: (tx: unknown) => unknown) => callback(db),
  };

  return {
    db,
    writes,
    queue(table: unknown, rows: unknown[]) {
      const existing = queues.get(table);
      if (existing) existing.push(rows);
      else queues.set(table, [rows]);
    },
    writesFor(table: unknown) {
      return writes.filter(write => write.table === table);
    },
  };
}

/** Convenience: build the queue map from a plain list of `[table, rows]` pairs. */
export function rowQueues(entries: Array<[unknown, unknown[]]>): RowQueues {
  const queues: RowQueues = new Map();
  for (const [table, rows] of entries) {
    const existing = queues.get(table);
    if (existing) existing.push(rows);
    else queues.set(table, [rows]);
  }
  return queues;
}
