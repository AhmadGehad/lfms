import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureInstallPrompt,
  consumeInstallPrompt,
  getBufferedInstallPrompt,
  resetInstallPromptBuffer,
  subscribeInstallPrompt,
  wasInstalledThisSession,
} from "./installPromptBuffer";

/** Minimal event target that records handlers so tests can fire them. */
function fakeWindow() {
  const handlers = new Map<string, (event: any) => void>();
  return {
    target: { addEventListener: (type: string, handler: any) => handlers.set(type, handler) },
    fire: (type: string, event: any = {}) => handlers.get(type)?.(event),
    has: (type: string) => handlers.has(type),
  };
}

beforeEach(() => {
  resetInstallPromptBuffer();
});

describe("install prompt buffer", () => {
  it("holds an event that arrives before anything subscribes", () => {
    // This is the whole point: Chrome fires beforeinstallprompt before React
    // mounts, so a listener attached in a component effect misses it entirely
    // and the install button never appears.
    const win = fakeWindow();
    captureInstallPrompt(win.target);

    const event = { preventDefault: vi.fn() };
    win.fire("beforeinstallprompt", event);

    expect(getBufferedInstallPrompt()).toBe(event);
    // Suppressed so Chrome's own mini-infobar does not compete with our banner.
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("notifies late subscribers when the event arrives after mount", () => {
    const win = fakeWindow();
    captureInstallPrompt(win.target);

    const listener = vi.fn();
    subscribeInstallPrompt(listener);
    win.fire("beforeinstallprompt", { preventDefault: vi.fn() });

    expect(listener).toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe", () => {
    const win = fakeWindow();
    captureInstallPrompt(win.target);
    const listener = vi.fn();
    const unsubscribe = subscribeInstallPrompt(listener);

    unsubscribe();
    win.fire("beforeinstallprompt", { preventDefault: vi.fn() });

    expect(listener).not.toHaveBeenCalled();
  });

  it("clears the event once used, since a dismissed dialog cannot be reopened", () => {
    const win = fakeWindow();
    captureInstallPrompt(win.target);
    win.fire("beforeinstallprompt", { preventDefault: vi.fn() });

    consumeInstallPrompt();

    expect(getBufferedInstallPrompt()).toBeNull();
  });

  it("records installation and drops the stale event", () => {
    const win = fakeWindow();
    captureInstallPrompt(win.target);
    win.fire("beforeinstallprompt", { preventDefault: vi.fn() });

    win.fire("appinstalled");

    expect(wasInstalledThisSession()).toBe(true);
    expect(getBufferedInstallPrompt()).toBeNull();
  });

  it("listens for both events", () => {
    const win = fakeWindow();
    captureInstallPrompt(win.target);
    expect(win.has("beforeinstallprompt")).toBe(true);
    expect(win.has("appinstalled")).toBe(true);
  });
});
