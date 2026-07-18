import "@/index.css";
import "./styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { AdminApp } from "./AdminApp";
import { getPlatformCsrfHeaders } from "./lib/csrf";
import { platformTrpc } from "./lib/trpc";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 20_000 },
    mutations: { retry: false },
  },
});

queryClient.getQueryCache().subscribe(event => {
  if (event.type !== "updated" || event.action.type !== "error") return;
  const error = event.query.state.error;
  if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") {
    queryClient.clear();
  }
});

const trpcClient = platformTrpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/platform/trpc",
      transformer: superjson,
      headers: getPlatformCsrfHeaders,
      fetch(input, init) {
        return globalThis.fetch(input, { ...init, credentials: "include" });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <platformTrpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <AdminApp />
    </QueryClientProvider>
  </platformTrpc.Provider>,
);
