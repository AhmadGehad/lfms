import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OwnerFilterProvider } from "./contexts/OwnerFilterContext";
import { DesignVersionProvider } from "./contexts/DesignVersionContext";
import { DesignRouter } from "./designs/DesignRouter";
import AcceptInvitation from "./pages/AcceptInvitation";
import CompanySuspended from "./pages/CompanySuspended";
import { trpc } from "./lib/trpc";
import { lazy, Suspense } from "react";

const Landing = lazy(() => import("./pages/Landing"));

// Bare-domain visitors (no company subdomain) get the marketing page; a
// company workspace only exists on <slug>.<base-domain>.
function isBareHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || /^[0-9.]+$/.test(host) || host.includes(":")) return true;
  if (host.endsWith(".localhost")) return false;
  // The Manus internal domain (*.manus.space) is treated as bare host (landing page)
  if (host.endsWith(".manus.space")) return true;
  const labels = host.split(".");
  if (labels[0] === "www") return true;
  return labels.length <= 2;
}

function TenantSurface() {
  const bareHost = isBareHost(window.location.hostname);
  const acceptingInvitation = window.location.pathname === "/accept-invitation";
  const suspension = trpc.auth.suspensionStatus.useQuery(undefined, {
    enabled: !acceptingInvitation && !bareHost,
    staleTime: 30_000,
    retry: false,
  });

  if (bareHost)
    return (
      <Suspense fallback={<main className="min-h-dvh bg-[#F7F5EE]" aria-busy="true" />}>
        <Landing />
      </Suspense>
    );
  if (acceptingInvitation) return <AcceptInvitation />;
  if (suspension.data?.suspended) return <CompanySuspended />;
  if (suspension.isLoading)
    return <main className="min-h-dvh bg-background" aria-busy="true" />;
  return <DesignRouter />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <DesignVersionProvider>
          <OwnerFilterProvider>
            <TooltipProvider>
              <Toaster richColors position="top-right" />
              <TenantSurface />
            </TooltipProvider>
          </OwnerFilterProvider>
        </DesignVersionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
