import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  PROMPT_WAIT_MS,
  isIos,
  isMobileDevice,
  isRunningInstalled,
  readDismissedAt,
  resolveInstallMethod,
  writeDismissedAt,
  type InstallMethod,
} from "./installEligibility";
import {
  consumeInstallPrompt,
  getBufferedInstallPrompt,
  subscribeInstallPrompt,
  wasInstalledThisSession,
} from "./installPromptBuffer";

export type InstallPromptState = {
  method: InstallMethod;
  /** True on iOS; the instructions differ per platform. */
  isIosDevice: boolean;
  /** Triggers the browser's install dialog. Only meaningful when method is "prompt". */
  install: () => Promise<void>;
  dismiss: () => void;
};

export function useInstallPrompt(): InstallPromptState {
  // Read from the buffer populated at entry-point time: Chrome fires
  // beforeinstallprompt before React mounts, so a listener added here would
  // already have missed it.
  const deferred = useSyncExternalStore(
    subscribeInstallPrompt,
    getBufferedInstallPrompt,
    () => null,
  );
  const installedThisSession = useSyncExternalStore(
    subscribeInstallPrompt,
    wasInstalledThisSession,
    () => false,
  );

  const [dismissedAt, setDismissedAt] = useState<number | null>(() =>
    typeof window === "undefined" ? null : readDismissedAt(window.localStorage),
  );
  const [waitedForPrompt, setWaitedForPrompt] = useState(false);

  // Chrome may withhold the event entirely; after a short wait, fall back to
  // instructions rather than leaving the user with no way to install.
  useEffect(() => {
    const timer = setTimeout(() => setWaitedForPrompt(true), PROMPT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    consumeInstallPrompt();
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
  const iosDevice = isIos(userAgent);
  const method = resolveInstallMethod({
    installed:
      installedThisSession ||
      (typeof window === "undefined" ? true : isRunningInstalled(window)),
    mobile: isMobileDevice(userAgent),
    ios: iosDevice,
    hasBrowserPrompt: deferred !== null,
    waitedForPrompt,
    dismissedAt,
    now: Date.now(),
  });

  return { method, isIosDevice: iosDevice, install, dismiss };
}
