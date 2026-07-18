import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoaderCircle } from "lucide-react";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import { AdminShell } from "./components/AdminShell";
import { AuthBoundary } from "./components/AuthBoundary";

const OverviewPage = lazy(() => import("./pages/OverviewPage").then(module => ({ default: module.OverviewPage })));
const CompaniesPage = lazy(() => import("./pages/CompaniesPage").then(module => ({ default: module.CompaniesPage })));
const FarmsPage = lazy(() => import("./pages/FarmsPage").then(module => ({ default: module.FarmsPage })));
const MembershipsPage = lazy(() => import("./pages/MembershipsPage").then(module => ({ default: module.MembershipsPage })));
const PlansPage = lazy(() => import("./pages/PlansPage").then(module => ({ default: module.PlansPage })));
const SubscriptionsPage = lazy(() => import("./pages/SubscriptionsPage").then(module => ({ default: module.SubscriptionsPage })));
const FeaturesPage = lazy(() => import("./pages/FeaturesPage").then(module => ({ default: module.FeaturesPage })));
const UsagePage = lazy(() => import("./pages/UsagePage").then(module => ({ default: module.UsagePage })));
const AuditPage = lazy(() => import("./pages/AuditPage").then(module => ({ default: module.AuditPage })));
const SupportPage = lazy(() => import("./pages/SupportPage").then(module => ({ default: module.SupportPage })));
const HealthPage = lazy(() => import("./pages/HealthPage").then(module => ({ default: module.HealthPage })));
const SecurityPage = lazy(() => import("./pages/SecurityPage").then(module => ({ default: module.SecurityPage })));
const LifecyclePage = lazy(() => import("./pages/LifecyclePage").then(module => ({ default: module.LifecyclePage })));
const AdministratorsPage = lazy(() => import("./pages/AdministratorsPage").then(module => ({ default: module.AdministratorsPage })));

export function AdminApp() {
  return (
    <TooltipProvider>
      <Toaster richColors position="top-right" />
      <AuthBoundary>
        <AdminShell>
          <Suspense fallback={<div className="grid min-h-72 place-items-center"><LoaderCircle className="h-5 w-5 animate-spin text-primary" aria-label="Loading page" /></div>}>
            <Switch>
              <Route path="/" component={OverviewPage} />
              <Route path="/companies" component={CompaniesPage} />
              <Route path="/farms" component={FarmsPage} />
              <Route path="/memberships" component={MembershipsPage} />
              <Route path="/plans" component={PlansPage} />
              <Route path="/subscriptions" component={SubscriptionsPage} />
              <Route path="/features" component={FeaturesPage} />
              <Route path="/usage" component={UsagePage} />
              <Route path="/audit" component={AuditPage} />
              <Route path="/support" component={SupportPage} />
              <Route path="/health" component={HealthPage} />
              <Route path="/security" component={SecurityPage} />
              <Route path="/administrators" component={AdministratorsPage} />
              <Route path="/lifecycle" component={LifecyclePage} />
              <Route><div className="py-20 text-center"><h1 className="text-lg font-semibold">Page not found</h1></div></Route>
            </Switch>
          </Suspense>
        </AdminShell>
      </AuthBoundary>
    </TooltipProvider>
  );
}
