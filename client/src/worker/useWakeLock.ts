import { useEffect } from "react";

/**
 * Keeps a wall-mounted tablet's screen on. The browser drops the lock whenever
 * the page is hidden, so it's taken again on return. Unsupported or refused
 * just means the tablet's own sleep setting applies.
 */
export function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (stopped) void next.release();
        else lock = next;
      } catch {
        // Battery saver, or no permission.
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, []);
}
