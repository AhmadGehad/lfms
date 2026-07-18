import { trpc } from "@/lib/trpc";
import "./lib/i18n"; // Initialize i18n before App renders
import { UNAUTHED_ERR_MSG, NOT_ADMIN_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { toast } from "sonner";
import App from "./App";
import { getLoginUrl } from "./const";
import { getStoredFarmPublicId } from "./lib/farmSelection";
import "./index.css";

const queryClient = new QueryClient();

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

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

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

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
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
        condition: (op) => op.path.startsWith("feed.") || op.path === "config.getFeedItems",
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

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
