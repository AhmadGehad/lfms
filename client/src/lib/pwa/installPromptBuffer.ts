/**
 * Captures `beforeinstallprompt` at entry-point time.
 *
 * Chrome fires this event as soon as the page qualifies for installation, which
 * is typically *before* React has mounted. The event does not replay and cannot
 * be re-requested, so a listener attached inside a component's effect misses it
 * and the install button never appears. Buffering it here — from module scope in
 * main.tsx, before any rendering — is the only reliable way to hold on to it.
 */

/** Not in the standard DOM lib; Chromium-only. */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Listener = () => void;

let buffered: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

/** Call once, as early as possible, before React renders. */
export function captureInstallPrompt(target: Pick<Window, "addEventListener"> = window) {
  target.addEventListener("beforeinstallprompt", event => {
    // Suppress Chrome's own mini-infobar so it cannot compete with our banner;
    // the captured event is what our button triggers instead.
    event.preventDefault();
    buffered = event as BeforeInstallPromptEvent;
    notify();
  });

  target.addEventListener("appinstalled", () => {
    installed = true;
    buffered = null;
    notify();
  });
}

export function getBufferedInstallPrompt() {
  return buffered;
}

export function wasInstalledThisSession() {
  return installed;
}

/** Drops the event after use — a dismissed native dialog cannot be reopened. */
export function consumeInstallPrompt() {
  buffered = null;
  notify();
}

export function subscribeInstallPrompt(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam. */
export function resetInstallPromptBuffer() {
  buffered = null;
  installed = false;
  listeners.clear();
}
