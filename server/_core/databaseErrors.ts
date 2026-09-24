// Postgres reports a unique violation as SQLSTATE 23505 on `error.code`.
// MySQL's ER_DUP_ENTRY / errno 1062 are still recognised so the legacy
// archive tooling and any pre-migration error object keep working.
const DUPLICATE_CODES = new Set(["23505", "ER_DUP_ENTRY"]);

export function isDuplicateEntryError(error: unknown) {
  let current = error as { code?: string; errno?: number; cause?: unknown } | undefined;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if ((current.code && DUPLICATE_CODES.has(current.code)) || current.errno === 1062) return true;
    current = current.cause as typeof current;
  }
  return false;
}
