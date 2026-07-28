/**
 * Registers the tenant service worker.
 *
 * Activation is deliberately user-driven: a silently self-updating worker can
 * reload the page mid-form, which on a bad connection is exactly when someone
 * is least able to redo the work. Instead the new worker waits, we surface a
 * prompt, and only then post SKIP_WAITING.
 */

/** Fires when a new version is installed and waiting. Argument applies it. */
export type UpdatePrompt = (applyUpdate: () => void) => void;

const SERVICE_WORKER_URL = "/sw.js";

export function registerServiceWorker(onUpdateAvailable?: UpdatePrompt) {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  // Registering from the dev server would shadow Vite's module pipeline; the
  // worker is only built for production.
  if (import.meta.env.DEV) return;

  // Whether this page was already under a worker's control. On a first-ever
  // visit `clientsClaim()` makes the brand-new worker take over mid-session,
  // which fires controllerchange; reloading on that would bounce the user
  // immediately after their first load. Only an actual *update* warrants a
  // reload, and that only happens when a controller was already present.
  const hadController = navigator.serviceWorker.controller !== null;

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(SERVICE_WORKER_URL, { scope: "/" })
      .then(registration => {
        const notifyIfWaiting = () => {
          const waiting = registration.waiting;
          if (!waiting || !navigator.serviceWorker.controller) return;
          onUpdateAvailable?.(() => waiting.postMessage({ type: "SKIP_WAITING" }));
        };

        notifyIfWaiting();
        registration.addEventListener("updatefound", () => {
          registration.installing?.addEventListener("statechange", event => {
            if ((event.target as ServiceWorker).state === "installed") notifyIfWaiting();
          });
        });
      })
      .catch(error => {
        // A failed registration must never break the app — it only costs
        // offline support for this session.
        console.error("[ServiceWorker] registration failed", error);
      });
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
}
