/// <reference lib="webworker" />
/**
 * LFMS tenant service worker.
 *
 * Hand-written (injectManifest) rather than generated, because the caching
 * rules depend on how this app is actually served at the edge:
 *
 * - The SPA shell is built as `index.html` but served at `/` (the edge renames
 *   it to `tenant.html` and `resolveEdgeAssetPath` maps extensionless paths to
 *   it). `/index.html` does not exist in production, so the build rewrites the
 *   precache entry to `/` and navigations fall back to that.
 * - `/runtime-config.js` is served by the container, not from static assets,
 *   and index.html loads it before the app boots. Without a cached copy the app
 *   cannot start offline at all, so it is NetworkFirst.
 * - `/api/**` is never cached: React Query has to see a genuine network failure
 *   to pause a mutation for later replay.
 */
import { clientsClaim } from "workbox-core";
import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst, NetworkOnly } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

/** The shell URL, matching the `manifestTransforms` rewrite in vite.config.ts. */
const SHELL_URL = "/";

const RUNTIME_CONFIG_URL = "/runtime-config.js";
const RUNTIME_CONFIG_CACHE = "lfms-runtime-config";

/**
 * index.html loads /runtime-config.js before the app boots, and the server sends
 * it with `Cache-Control: no-store`. It is served by the container rather than
 * from static assets, so it is not in the precache manifest — meaning the only
 * copy would be whatever a NetworkFirst fetch happened to store while the worker
 * was already controlling the page. On a first visit the worker is not yet in
 * control, so that copy may never exist and the next offline launch has no
 * config at all. Fetching it during install closes that gap.
 */
self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(RUNTIME_CONFIG_CACHE)
      .then(cache => cache.add(new Request(RUNTIME_CONFIG_URL, { cache: "reload" })))
      .catch(() => {
        // Offline at install time, or the endpoint is unavailable: the runtime
        // route below will populate it on the next successful load.
      }),
  );
});

/** Paths that must always hit the network — dynamic, authenticated, or both. */
const NEVER_CACHED = [/^\/api\//, /^\/manus-storage\//, /^\/health\b/, /^\/metrics$/];

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ url }) => NEVER_CACHED.some(pattern => pattern.test(url.pathname)),
  new NetworkOnly(),
);

registerRoute(
  ({ url }) => url.pathname === RUNTIME_CONFIG_URL,
  new NetworkFirst({
    cacheName: RUNTIME_CONFIG_CACHE,
    networkTimeoutSeconds: 5,
  }),
);

// Serve the cached shell for any navigation, so deep links work offline.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL(SHELL_URL), {
    denylist: NEVER_CACHED,
  }),
);

// Activation is user-driven: main.tsx prompts, then posts SKIP_WAITING. This
// avoids swapping the app out from under someone mid-form on a bad connection.
self.addEventListener("message", event => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

clientsClaim();
