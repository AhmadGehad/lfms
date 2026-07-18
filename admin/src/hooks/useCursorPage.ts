import { useState } from "react";

export function useCursorPage() {
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<string | null>>([]);

  return {
    cursor,
    reset() { setCursor(null); setHistory([]); },
    next(nextCursor: string) {
      setHistory(current => [...current, cursor]);
      setCursor(nextCursor);
    },
    previous() {
      setHistory(current => {
        const copy = [...current];
        setCursor(copy.pop() ?? null);
        return copy;
      });
    },
    canPrevious: history.length > 0,
  };
}
