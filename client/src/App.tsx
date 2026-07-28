import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { InstallAppBanner } from "./components/InstallAppBanner";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OwnerFilterProvider } from "./contexts/OwnerFilterContext";
import { DesignVersionProvider } from "./contexts/DesignVersionContext";
import { DesignRouter } from "./designs/DesignRouter";
import AcceptInvitation from "./pages/AcceptInvitation";
import CompanySuspended from "./pages/CompanySuspended";
import WorkspaceNotFound from "./pages/WorkspaceNotFound";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import { trpc } from "./lib/trpc";
import { useFavicon } from "./lib/favicon";
import { OfflineIdentityTracker } from "./lib/offline/OfflineIdentityTracker";
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
  const path = window.location.pathname;
  const unauthenticatedRoute = acceptingInvitation ||
    path === "/login" || path === "/forgot-password" || path === "/reset-password";
  const suspension = trpc.auth.suspensionStatus.useQuery(undefined, {
    enabled: !unauthenticatedRoute && !bareHost,
    staleTime: 30_000,
    retry: false,
  });
  const branding = trpc.tenancy.publicBranding.useQuery(undefined, {
    enabled: !bareHost,
    staleTime: 5 * 60_000,
    retry: false,
  });
  useFavicon(branding.data?.hasFavicon);

  if (bareHost)
    return (
      <Suspense fallback={<main className="min-h-dvh bg-[#F7F5EE]" aria-busy="true" />}>
        <Landing />
      </Suspense>
    );

  // A subdomain with no matching company used to render the exact same login
  // form as a real one — nothing checked existence first. `publicBranding` is
  // already fetched above (for the favicon) and already resolves to `null`
  // for a slug with no company row, so this reuses that instead of adding a
  // new endpoint. Checked on `isSuccess` specifically, not just "not loading",
  // so a real fetch error doesn't get mistaken for "workspace doesn't exist".
  const workspaceNotFound = branding.isSuccess && branding.data === null;

  const loadingIndicator = (
    <main
      className="grid min-h-dvh place-items-center bg-background"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="text-sm">Loading…</span>
      </div>
    </main>
  );

  const surface = () => {
    // Wait for the existence check before rendering *any* route on this
    // subdomain — including /login — so a bad subdomain can never flash the
    // login form before swapping to "not found". Repeat visits are instant
    // (branding is cached for 5 minutes); only a cold session pays this.
    if (branding.isLoading) return loadingIndicator;
    if (workspaceNotFound) return <WorkspaceNotFound />;
    if (path === "/login") return <Login />;
    if (path === "/forgot-password") return <ForgotPassword />;
    if (path === "/reset-password") return <ResetPassword />;
    if (acceptingInvitation) return <AcceptInvitation />;
    if (suspension.data?.suspended) return <CompanySuspended />;
    // A visible indicator rather than an empty <main>: on a slow or offline
    // launch this used to render as an indistinguishable blank page.
    if (suspension.isLoading) return loadingIndicator;
    return (
      <>
        <OfflineIdentityTracker />
        <DesignRouter />
      </>
    );
  };

  return (
    <>
      {surface()}
      {/* Outside the authenticated branch on purpose: someone who has not signed
          in yet is exactly who still needs to install the app, and offering it
          only after login is how this went unnoticed on Android. */}
      <InstallAppBanner />
    </>
  );
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
