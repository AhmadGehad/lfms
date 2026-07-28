/**
 * Rules for whether to invite the user to install the app.
 *
 * Pure so they can be tested: the platform differences here are easy to get
 * wrong, and getting them wrong means either nagging users who already
 * installed, or never telling iPhone users the app can be installed at all.
 */

const DISMISS_KEY = "lfms-install-prompt-dismissed";

/** How long a dismissal is respected before the invitation may return. */
export const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1_000;

export type InstallMethod =
  /** The browser gave us a real prompt we can trigger. Android Chrome/Edge. */
  | "prompt"
  /** No API exists; the user must use the share sheet. iOS Safari. */
  | "manual"
  /** Not installable here. */
  | "none";

/** True when the page is already running as an installed app. */
export function isRunningInstalled(win: {
  matchMedia?: (query: string) => { matches: boolean };
  // `navigator.standalone` is non-standard (iOS only), so it is read through a
  // cast rather than declared on the lib's Navigator type.
  navigator?: unknown;
}): boolean {
  if (win.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari predates display-mode and reports this instead.
  return (win.navigator as { standalone?: boolean } | undefined)?.standalone === true;
}

/**
 * iOS cannot fire `beforeinstallprompt`, so an iOS device is the one case where
 * we must show instructions rather than a button. Chrome and Firefox on iOS run
 * on WebKit and cannot install either, so they are covered by the same check.
 */
export function isIos(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent);
}

/** Rough "is this a phone or tablet" test — installing is only worth offering there. */
export function isMobileDevice(userAgent: string): boolean {
  return /Android|iPad|iPhone|iPod|Mobile|Silk/i.test(userAgent);
}

export function readDismissedAt(storage: Pick<Storage, "getItem">): number | null {
  const raw = storage.getItem(DISMISS_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function writeDismissedAt(storage: Pick<Storage, "setItem">, now: number) {
  storage.setItem(DISMISS_KEY, String(now));
}

export function isDismissActive(dismissedAt: number | null, now: number): boolean {
  if (dismissedAt === null) return false;
  return now - dismissedAt < DISMISS_DURATION_MS;
}

/**
 * How long to wait for `beforeinstallprompt` before falling back to manual
 * instructions. Chrome fires it almost immediately when it fires at all, so a
 * few seconds is enough to tell "not yet" from "never".
 */
export const PROMPT_WAIT_MS = 3_000;

/**
 * Decides which invitation, if any, to show.
 *
 * `hasBrowserPrompt` is whether a `beforeinstallprompt` event has been captured.
 * `waitedForPrompt` is whether PROMPT_WAIT_MS has elapsed without one arriving —
 * Chrome withholds the event for reasons we cannot detect (engagement
 * heuristics, an earlier dismissal, an unsupported browser), and in that case
 * instructions are still better than showing the user nothing at all.
 */
export function resolveInstallMethod(input: {
  installed: boolean;
  mobile: boolean;
  ios: boolean;
  hasBrowserPrompt: boolean;
  waitedForPrompt: boolean;
  dismissedAt: number | null;
  now: number;
}): InstallMethod {
  if (input.installed) return "none";
  if (!input.mobile) return "none";
  if (isDismissActive(input.dismissedAt, input.now)) return "none";
  if (input.hasBrowserPrompt) return "prompt";
  // iOS never fires the event, so it needs no waiting period.
  if (input.ios) return "manual";
  return input.waitedForPrompt ? "manual" : "none";
}
