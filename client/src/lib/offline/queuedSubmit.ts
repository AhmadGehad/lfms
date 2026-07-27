/**
 * Submitting a form whose write may be queued offline.
 *
 * React Query represents a paused (queued) mutation as `status: "pending"`, so
 * `isPending` stays true for as long as the device is offline and `onSuccess`
 * never runs. A form that disables its button on `isPending` and closes itself
 * in `onSuccess` therefore appears frozen: the record *was* saved and queued,
 * but nothing in the UI says so. These two helpers are the fix, and every
 * offline-capable form uses them.
 */
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/**
 * Whether a spinner is warranted.
 *
 * A paused mutation is waiting for a network, not working — showing "Saving…"
 * for it is what made the UI look stuck.
 */
export function isMutationWorking(mutation: {
  isPending: boolean;
  isPaused: boolean;
}): boolean {
  return mutation.isPending && !mutation.isPaused;
}

/**
 * Fires a mutation and, if it ends up queued rather than delivered, runs the
 * same follow-up the success path would (close the dialog, clear the form) plus
 * a toast making clear the record is stored on the device.
 *
 * "Queued" is detected by watching the mutation itself become paused — NOT by
 * checking `navigator.onLine` up front. A phone on dead wifi or one bar of
 * signal reports online while every request fails; in that state the write
 * fires, times out, and only *then* pauses. Watching the pause covers both the
 * instant case (known offline: pauses immediately) and the lying-network case
 * (pauses after the timed-out attempt), so the form always gets released.
 */
export function useQueuedSubmit() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useCallback(
    <TVariables,>(
      mutation: {
        mutate: (
          variables: TVariables,
          options?: { onSuccess?: () => void },
        ) => void;
      },
      variables: TVariables,
      callbacks?: {
        /** Runs on a real server round-trip, exactly as before. */
        onOnlineSuccess?: () => void;
        /**
         * Runs when the write was queued instead. Must do whatever the
         * mutation's own `onSuccess` would have done to the UI — closing the
         * dialog, clearing the form — because that handler will not run until
         * the record eventually syncs.
         */
        whenQueued?: () => void;
      },
    ): boolean => {
      mutation.mutate(
        variables,
        callbacks?.onOnlineSuccess ? { onSuccess: callbacks.onOnlineSuccess } : undefined,
      );

      // `mutate` builds its cache entry synchronously, so the newest mutation
      // in the cache is the one just fired.
      const cache = queryClient.getMutationCache();
      const mine = cache
        .getAll()
        .reduce<{ mutationId: number; state: { isPaused: boolean } } | null>(
          (newest, candidate) =>
            !newest || candidate.mutationId > newest.mutationId ? candidate : newest,
          null,
        );

      let settled = false;
      let unsubscribe = () => {};
      const queuedNow = () => {
        if (settled) return;
        settled = true;
        unsubscribe();
        toast.success(
          t(
            "offline.savedLocally",
            "Saved on this device. It will sync when you are back online.",
          ),
        );
        callbacks?.whenQueued?.();
      };

      if (mine) {
        unsubscribe = cache.subscribe(event => {
          const changed = "mutation" in event ? event.mutation : undefined;
          if (!changed || changed.mutationId !== mine.mutationId) return;
          if (changed.state.isPaused) {
            queuedNow();
          } else if (
            changed.state.status === "success" ||
            changed.state.status === "error"
          ) {
            // Delivered or genuinely failed — the mutation's own handlers own
            // the UI from here.
            settled = true;
            unsubscribe();
          }
        });
      }

      // Fast path: already known to be offline, no need to wait for the pause.
      if (mine?.state.isPaused || !onlineManager.isOnline()) queuedNow();
      return settled;
    },
    [queryClient, t],
  );
}
