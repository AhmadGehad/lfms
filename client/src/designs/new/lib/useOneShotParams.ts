import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";

/**
 * Handles action links such as `?new=1` (quick add, command palette): calls
 * `onFound` with the current params, then removes `keys` from the URL with a
 * history replace. Removing them lets the same link work again from this page
 * and stops a reload from reopening the dialog. Wait for `enabled` (e.g.
 * permissions loaded) so the action isn't consumed before it can run.
 */
export function useOneShotParams(keys: string[], onFound: (params: URLSearchParams) => void, enabled = true) {
  const search = useSearch();
  const [path, setLocation] = useLocation();
  useEffect(() => {
    if (!enabled) return;
    const params = new URLSearchParams(search);
    if (!keys.some(k => params.has(k))) return;
    onFound(params);
    for (const k of keys) params.delete(k);
    const rest = params.toString();
    setLocation(rest ? `${path}?${rest}` : path, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, enabled]);
}
