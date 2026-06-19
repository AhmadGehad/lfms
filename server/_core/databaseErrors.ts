export function isDuplicateEntryError(error: unknown) {
  let current = error as { code?: string; errno?: number; cause?: unknown } | undefined;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current.code === "ER_DUP_ENTRY" || current.errno === 1062) return true;
    current = current.cause as typeof current;
  }
  return false;
}
