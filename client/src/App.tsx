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

function TenantSurface() {
  const acceptingInvitation = window.location.pathname === "/accept-invitation";
  const suspension = trpc.auth.suspensionStatus.useQuery(undefined, {
    enabled: !acceptingInvitation,
    staleTime: 30_000,
    retry: false,
  });

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
