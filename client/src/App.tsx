import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell, SimpleMotion } from "@/components/simple";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { DesignProvider } from "./contexts/DesignContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import AccessDenied from "./pages/AccessDenied";
import { usePermissions } from "./hooks/usePermissions";
import type { PermissionPage } from "@shared/permissions";
import { APP_ROUTES } from "./routes";

function PermissionGate({
  page,
  children,
}: {
  page: PermissionPage;
  children: React.ReactNode;
}) {
  const permissions = usePermissions(page);
  if (permissions.loading) {
    return (
      <div
        className="flex min-h-48 items-center justify-center p-6 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        Loading permissions…
      </div>
    );
  }
  if (!permissions.canView) return <AccessDenied />;
  return <>{children}</>;
}

function Router() {
  return (
    <AppShell>
      <SimpleMotion>
        <Switch>
          {APP_ROUTES.map(({ path, component: Component, permission }) => (
            <Route key={path} path={path}>
              <PermissionGate page={permission}>
                <Component />
              </PermissionGate>
            </Route>
          ))}
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </SimpleMotion>
    </AppShell>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <DesignProvider>
          <TooltipProvider>
            <Toaster richColors position="top-right" />
            <Router />
          </TooltipProvider>
        </DesignProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
