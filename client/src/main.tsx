import { trpc } from "@/lib/trpc";
import "./lib/i18n"; // Initialize i18n before App renders
import { UNAUTHED_ERR_MSG, NOT_ADMIN_ERR_MSG } from '@shared/const';
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { toast } from "sonner";
import App from "./App";
import { getLoginUrl } from "./const";
import { getStoredFarmPublicId } from "./lib/farmSelection";
import { readOfflineIdentity } from "./lib/offline/identity";
import {
  isOfflineMutationPath,
  registerOfflineMutationDefaults,
} from "./lib/offline/offlineMutations";
import { bucketForIdentity, createOfflinePersister } from "./lib/offline/persister";
import { registerServiceWorker } from "./lib/offline/registerServiceWorker";
import { captureInstallPrompt } from "./lib/pwa/installPromptBuffer";
import { isAuthExpiredError } from "./lib/offline/syncQueue";
import { initializePublicBrowserServices } from "./lib/publicConfig";
import "./index.css";

initializePublicBrowserServices();

// Before any rendering: Chrome fires beforeinstallprompt as soon as the page
// qualifies for installation, and the event neither replays nor can be
// re-requested. Attaching this from a component effect would miss it.
captureInstallPrompt();

/** A week: long enough to survive a stretch in the field with no signal. */
const OFFLINE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // offlineFirst serves cached data instead of hanging when there is no
      // network, which is the whole point on a farm with patchy signal.
      networkMode: "offlineFirst",
      gcTime: OFFLINE_CACHE_MAX_AGE_MS,
      staleTime: 30_000,
    },
    mutations: { networkMode: "offlineFirst" },
  },
});

// The cache bucket is named from the identity stored at the previous sign-in, so
// it is known synchronously here — before any query resolves and before the app
// could render another user's data.
const offlinePersister = createOfflinePersister(bucketForIdentity(readOfflineIdentity()));

function readCsrfCookie() {
  const secureName = "__Host-lfms_tenant_csrf=";
  const localName = "lfms_tenant_csrf=";
  const entry = document.cookie
    .split(";")
    .map(value => value.trim())
    .find(value => value.startsWith(secureName) || value.startsWith(localName));
  if (!entry) return null;
  return decodeURIComponent(entry.slice(entry.indexOf("=") + 1));
}

function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  includeFarm = true,
) {
  const headers = new Headers(init?.headers);
  const csrfToken = readCsrfCookie();
  if (csrfToken) headers.set("X-LFMS-CSRF", csrfToken);
  const farmPublicId = includeFarm ? getStoredFarmPublicId() : null;
  if (farmPublicId) headers.set("X-LFMS-Farm", farmPublicId);
  return globalThis.fetch(input, {
    ...(init ?? {}),
    credentials: "include",
    headers,
  });
}

const csrfFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  authenticatedFetch(input, init, true);

const contextFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  authenticatedFetch(input, init, false);

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  // Check the error code, not just the exact legacy message: any procedure
  // built on requireUser can throw UNAUTHORIZED with a different message
  // (e.g. a tenant-resolution failure), and that must redirect too, not just
  // this one hardcoded string.
  const isUnauthorized = error.data?.code === "UNAUTHORIZED" || error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

const toastIfForbidden = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (error.data?.code === "FORBIDDEN" || error.message === NOT_ADMIN_ERR_MSG) {
    toast.error("You don't have permission to perform this action.");
  }
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

/** Dot-path of the procedure a mutation belongs to, from its React Query key. */
const mutationPath = (key: readonly unknown[] | undefined) =>
  Array.isArray(key?.[0]) ? (key[0] as string[]).join(".") : "";

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    const path = mutationPath(event.mutation.options.mutationKey);

    // A queued offline write can come back 401 simply because the session idled
    // out while the device had no signal. The record itself is still valid and
    // stays in the persisted queue, so say so before sending them to sign in.
    if (isAuthExpiredError(error) && isOfflineMutationPath(path)) {
      toast.error("Your session expired. Sign in again to finish syncing your saved records.");
    }

    redirectToLoginIfUnauthorized(error);
    toastIfForbidden(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: (op) => op.path === "auth.me" || op.path === "auth.tenantContext",
      true: httpLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: contextFetch,
      }),
      false: splitLink({
        // Offline-capable mutations must not be batched: a batch is one HTTP
        // request, so a single failing member would fail its unrelated
        // neighbours and make per-record retry meaningless.
        condition: (op) =>
          op.path.startsWith("feed.") ||
          op.path === "config.getFeedItems" ||
          isOfflineMutationPath(op.path),
        true: httpLink({
          url: "/api/trpc",
          transformer: superjson,
          fetch: csrfFetch,
        }),
        false: httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
          fetch: csrfFetch,
        }),
      }),
    }),
  ],
});

// Must happen before the persisted cache is restored: a rehydrated paused
// mutation has no function of its own and can only resume via these defaults.
registerOfflineMutationDefaults(queryClient, trpcClient);

registerServiceWorker(applyUpdate => {
  toast("A new version of LFMS is ready.", {
    duration: Infinity,
    action: { label: "Reload", onClick: applyUpdate },
  });
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: offlinePersister,
        maxAge: OFFLINE_CACHE_MAX_AGE_MS,
        // A deploy can change response shapes, so discard the cache when the
        // bundle changes rather than hydrating stale structures.
        buster: import.meta.env.LFMS_BUILD_ID ?? "dev",
      }}
      onSuccess={() => {
        // Writes queued before the app was closed only replay if this runs.
        void queryClient.resumePausedMutations();
      }}
    >
      <App />
    </PersistQueryClientProvider>
  </trpc.Provider>
);
