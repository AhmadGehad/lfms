import { useCallback, useEffect, useState } from "react";
import {
  isIos,
  isMobileDevice,
  isRunningInstalled,
  readDismissedAt,
  resolveInstallMethod,
  writeDismissedAt,
  type InstallMethod,
} from "./installEligibility";

/** Not in the standard DOM lib — Chromium-only. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallPromptState = {
  method: InstallMethod;
  /** Triggers the browser's install dialog. Only meaningful when method is "prompt". */
  install: () => Promise<void>;
  dismiss: () => void;
};

export function useInstallPrompt(): InstallPromptState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(() =>
    typeof window === "undefined" ? null : readDismissedAt(window.localStorage),
  );
  const [installed, setInstalled] = useState(() =>
    typeof window === "undefined" ? true : isRunningInstalled(window),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onBeforeInstallPrompt = (event: Event) => {
      // Suppressing the default keeps Chrome's own mini-infobar from competing
      // with ours; the captured event is what our button triggers instead.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    // A dismissed native dialog cannot be reopened with the same event.
    setDeferred(null);
    if (choice.outcome === "dismissed") {
      const now = Date.now();
      writeDismissedAt(window.localStorage, now);
      setDismissedAt(now);
    }
  }, [deferred]);

  const dismiss = useCallback(() => {
    const now = Date.now();
    writeDismissedAt(window.localStorage, now);
    setDismissedAt(now);
  }, []);

  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const method = resolveInstallMethod({
    installed,
    mobile: isMobileDevice(userAgent),
    ios: isIos(userAgent),
    hasBrowserPrompt: deferred !== null,
    dismissedAt,
    now: Date.now(),
  });

  return { method, install, dismiss };
}
