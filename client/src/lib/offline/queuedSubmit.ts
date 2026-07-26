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
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useIsOnline } from "./useOfflineSync";

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
 * Fires a mutation and, when there is no network, immediately runs the same
 * follow-up the success path would (close the dialog, clear the form) plus a
 * toast making clear the record is stored on the device.
 *
 * Safe to call when online: it simply defers to the mutation's own `onSuccess`.
 */
export function useQueuedSubmit() {
  const isOnline = useIsOnline();
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
      if (isOnline) return false;
      toast.success(
        t(
          "offline.savedLocally",
          "Saved on this device. It will sync when you are back online.",
        ),
      );
      callbacks?.whenQueued?.();
      return true;
    },
    [isOnline, t],
  );
}
