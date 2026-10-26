import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { InstallAppBanner } from "./components/InstallAppBanner";
import { DashboardLayoutSkeleton } from "./components/DashboardLayoutSkeleton";
import { AuthPageSkeleton } from "./components/PageSkeleton";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OwnerFilterProvider } from "./contexts/OwnerFilterContext";
import AcceptInvitation from "./pages/AcceptInvitation";
import CompanySuspended from "./pages/CompanySuspended";
import WorkspaceNotFound from "./pages/WorkspaceNotFound";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import { trpc } from "./lib/trpc";
import { useFavicon } from "./lib/favicon";
import { isBareHost } from "./lib/bareHost";
import { OfflineIdentityTracker } from "./lib/offline/OfflineIdentityTracker";
import { lazy, Suspense } from "react";

const Landing = lazy(() => import("./pages/Landing"));
const NewDesign = lazy(() => import("./designs/new/NewDesign"));
const DemoApp = lazy(() => import("./demo/DemoApp"));

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
      <Suspense fallback={<main className="min-h-dvh bg-[#0D3B2E]" aria-busy="true" />}>
        {path === "/demo" || path.startsWith("/demo/") ? <DemoApp /> : <Landing />}
      </Suspense>
    );

  // A subdomain with no matching company used to render the exact same login
  // form as a real one — nothing checked existence first. `publicBranding` is
  // already fetched above (for the favicon) and already resolves to `null`
  // for a slug with no company row, so this reuses that instead of adding a
  // new endpoint. Checked on `isSuccess` specifically, not just "not loading",
  // so a real fetch error doesn't get mistaken for "workspace doesn't exist".
  const workspaceNotFound = branding.isSuccess && branding.data === null;

  // Shaped like what is about to appear: the sign-in card on auth routes, the
  // app shell everywhere else.
  const loadingIndicator = unauthenticatedRoute ? <AuthPageSkeleton /> : <DashboardLayoutSkeleton />;

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
        <Suspense fallback={<DashboardLayoutSkeleton />}>
          <NewDesign />
        </Suspense>
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
        <OwnerFilterProvider>
            <TooltipProvider>
              <Toaster richColors position="top-right" />
              <TenantSurface />
            </TooltipProvider>
        </OwnerFilterProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
