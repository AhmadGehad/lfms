import { describe, expect, it } from "vitest";
import {
  DISMISS_DURATION_MS,
  isDismissActive,
  isIos,
  isMobileDevice,
  isRunningInstalled,
  readDismissedAt,
  resolveInstallMethod,
} from "./installEligibility";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

describe("platform detection", () => {
  it("recognises iOS, which has no install API and needs instructions instead", () => {
    expect(isIos(IPHONE_SAFARI)).toBe(true);
    expect(isIos(ANDROID_CHROME)).toBe(false);
    expect(isIos(DESKTOP_CHROME)).toBe(false);
  });

  it("recognises phones and tablets", () => {
    expect(isMobileDevice(IPHONE_SAFARI)).toBe(true);
    expect(isMobileDevice(ANDROID_CHROME)).toBe(true);
    expect(isMobileDevice(DESKTOP_CHROME)).toBe(false);
  });

  it("detects an already-installed app on both platforms", () => {
    // Modern browsers report display-mode…
    expect(
      isRunningInstalled({ matchMedia: () => ({ matches: true }) }),
    ).toBe(true);
    // …while iOS Safari predates it and sets navigator.standalone.
    expect(
      isRunningInstalled({
        matchMedia: () => ({ matches: false }),
        navigator: { standalone: true },
      }),
    ).toBe(true);
    expect(
      isRunningInstalled({
        matchMedia: () => ({ matches: false }),
        navigator: { standalone: false },
      }),
    ).toBe(false);
  });
});

describe("dismissal", () => {
  it("respects a dismissal for a month, then allows the invitation back", () => {
    const now = 1_000_000_000;
    expect(isDismissActive(now - 1_000, now)).toBe(true);
    expect(isDismissActive(now - DISMISS_DURATION_MS - 1, now)).toBe(false);
    expect(isDismissActive(null, now)).toBe(false);
  });

  it("ignores a corrupt stored value rather than hiding the banner forever", () => {
    expect(readDismissedAt({ getItem: () => "not-a-number" })).toBeNull();
    expect(readDismissedAt({ getItem: () => null })).toBeNull();
    expect(readDismissedAt({ getItem: () => "42" })).toBe(42);
  });
});

describe("resolveInstallMethod", () => {
  const base = {
    installed: false,
    mobile: true,
    ios: false,
    hasBrowserPrompt: false,
    waitedForPrompt: false,
    dismissedAt: null,
    now: 1_000_000_000,
  };

  it("offers the native prompt when the browser gave us one", () => {
    expect(resolveInstallMethod({ ...base, hasBrowserPrompt: true })).toBe("prompt");
  });

  it("falls back to share-sheet instructions on iOS", () => {
    // The whole reason this exists: iOS never fires beforeinstallprompt, so
    // without instructions an iPhone user cannot discover the install at all.
    expect(resolveInstallMethod({ ...base, ios: true })).toBe("manual");
  });

  it("stays quiet while the browser prompt may still be coming", () => {
    // Chrome fires beforeinstallprompt almost immediately when it fires at all,
    // so showing instructions before the wait elapses would flash the wrong UI.
    expect(resolveInstallMethod(base)).toBe("none");
  });

  it("falls back to instructions when Chrome never fires the event", () => {
    // The reported bug: an Android user saw no way to install. Chrome withholds
    // the event for reasons we cannot detect, so after the wait we instruct.
    expect(resolveInstallMethod({ ...base, waitedForPrompt: true })).toBe("manual");
  });

  it("prefers the real prompt over instructions once the event arrives", () => {
    expect(
      resolveInstallMethod({ ...base, waitedForPrompt: true, hasBrowserPrompt: true }),
    ).toBe("prompt");
  });

  it("never nags someone already running the installed app", () => {
    expect(
      resolveInstallMethod({ ...base, installed: true, hasBrowserPrompt: true }),
    ).toBe("none");
    expect(resolveInstallMethod({ ...base, installed: true, ios: true })).toBe("none");
  });

  it("does not pester desktop users", () => {
    expect(
      resolveInstallMethod({ ...base, mobile: false, hasBrowserPrompt: true }),
    ).toBe("none");
  });

  it("honours a recent dismissal on both platforms", () => {
    expect(
      resolveInstallMethod({ ...base, hasBrowserPrompt: true, dismissedAt: base.now - 1_000 }),
    ).toBe("none");
    expect(
      resolveInstallMethod({ ...base, ios: true, dismissedAt: base.now - 1_000 }),
    ).toBe("none");
  });
});
