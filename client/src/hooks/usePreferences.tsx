import { trpc } from "@/lib/trpc";
import { useCallback } from "react";

/**
 * Bridge to server-side per-user preferences (design version, theme, density,
 * saved views…). The server is the source of truth across devices; localStorage
 * is only a first-paint cache held by the consuming contexts.
 *
 * Presentation-only: shares the same session/permissions as every other call and
 * adds no business logic. See ux-audit/11_TECHNICAL_MIGRATION_CONSTRAINTS.md §B.
 */
export type PreferenceKey =
  | "ui.designVersion"
  | "ui.theme"
  | "ui.density"
  | "ui.savedViews"
  | "ui.dashboardLayout";

export function usePreferences() {
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const isAuthenticated = Boolean(meQuery.data);

  const query = trpc.preferences.get.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const mutation = trpc.preferences.set.useMutation({
    onSuccess: () => utils.preferences.get.invalidate(),
  });

  const setPreference = useCallback(
    (key: PreferenceKey, value: string) => {
      if (!isAuthenticated) return;
      // Fire-and-forget; the caller has already updated localStorage + UI so the
      // change is instant and survives even if the network call is slow/offline.
      mutation.mutate({ key, value });
    },
    [isAuthenticated, mutation]
  );

  return {
    /** This user's saved prefs, key → value. */
    user: query.data?.user ?? {},
    /** Org-wide defaults (system_settings ui.*). */
    globals: query.data?.globals ?? {},
    role: query.data?.role,
    isLoaded: meQuery.isSuccess && (!isAuthenticated || query.isSuccess),
    isError: meQuery.isError || (isAuthenticated && query.isError),
    setPreference,
  };
}
