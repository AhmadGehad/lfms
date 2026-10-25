import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import { PageSkeleton } from "@/components/PageSkeleton";
import NotFound from "@/pages/NotFound";
import AccessDenied from "@/pages/AccessDenied";
import { usePermissions } from "@/hooks/usePermissions";
import type { PermissionPage } from "@shared/permissions";

// Pages are SHARED business/UI logic used by both designs. The Old and New
// shells differ; the page set and permission gating are identical (a hard
// requirement — see ux-audit/11 §E). As New pages land they are swapped in here
// behind the design version, never by forking permissions or data logic.
// Each page is its own chunk: the first visit downloads only the page being
// opened instead of every page in the system.
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Animals = lazy(() => import("@/pages/Animals"));
const AnimalProfile = lazy(() => import("@/pages/AnimalProfile"));
const Breeding = lazy(() => import("@/pages/Breeding"));
const Pregnancy = lazy(() => import("@/pages/Pregnancy"));
const Fattening = lazy(() => import("@/pages/Fattening"));
const Feed = lazy(() => import("@/pages/Feed"));
const FarmMap = lazy(() => import("@/pages/FarmMap"));
const Expenses = lazy(() => import("@/pages/Expenses"));
const PnL = lazy(() => import("@/pages/PnL"));
const IncomeStatement = lazy(() => import("@/pages/IncomeStatement"));
const Sales = lazy(() => import("@/pages/Sales"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const AuditLog = lazy(() => import("@/pages/AuditLog"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const Configuration = lazy(() => import("@/pages/Configuration"));
const Data = lazy(() => import("@/pages/Data"));
const RecycleBin = lazy(() => import("@/pages/RecycleBin"));
const AnimalVaccinations = lazy(() => import("@/pages/AnimalVaccinations"));

type SkeletonVariant = React.ComponentProps<typeof PageSkeleton>["variant"];

export function PermissionGate({
  page,
  skeleton = "table",
  children,
}: {
  page: PermissionPage;
  skeleton?: SkeletonVariant;
  children: React.ReactNode;
}) {
  const permissions = usePermissions(page);
  if (permissions.loading) return <PageSkeleton variant={skeleton} />;
  if (!permissions.canView) return <AccessDenied />;
  // Suspends while the page's own chunk downloads.
  return <Suspense fallback={<PageSkeleton variant={skeleton} />}>{children}</Suspense>;
}

/** Shared route table rendered inside either design's shell. */
export function AppRoutes() {
  return (
    <Switch>
      <Route path="/"><PermissionGate page="dashboard" skeleton="dashboard"><Dashboard /></PermissionGate></Route>
      <Route path="/animals"><PermissionGate page="animals"><Animals /></PermissionGate></Route>
      <Route path="/animals/:id"><PermissionGate page="animals" skeleton="detail"><AnimalProfile /></PermissionGate></Route>
      <Route path="/breeding"><PermissionGate page="breeding"><Breeding /></PermissionGate></Route>
      <Route path="/pregnancy"><PermissionGate page="pregnancy"><Pregnancy /></PermissionGate></Route>
      <Route path="/fattening"><PermissionGate page="fattening"><Fattening /></PermissionGate></Route>
      <Route path="/farm-map"><PermissionGate page="farmMap"><FarmMap /></PermissionGate></Route>
      <Route path="/feed"><PermissionGate page="feed"><Feed /></PermissionGate></Route>
      <Route path="/expenses"><PermissionGate page="expenses"><Expenses /></PermissionGate></Route>
      <Route path="/pnl"><PermissionGate page="pnl"><PnL /></PermissionGate></Route>
      <Route path="/income-statement"><PermissionGate page="incomeStatement"><IncomeStatement /></PermissionGate></Route>
      <Route path="/sales"><PermissionGate page="sales"><Sales /></PermissionGate></Route>
      <Route path="/notifications"><PermissionGate page="notifications" skeleton="list"><Notifications /></PermissionGate></Route>
      <Route path="/audit"><PermissionGate page="audit"><AuditLog /></PermissionGate></Route>
      <Route path="/users"><PermissionGate page="users"><UserManagement /></PermissionGate></Route>
      <Route path="/config"><PermissionGate page="configuration"><Configuration /></PermissionGate></Route>
      <Route path="/data"><PermissionGate page="data"><Data /></PermissionGate></Route>
      <Route path="/recycle-bin"><PermissionGate page="recycleBin"><RecycleBin /></PermissionGate></Route>
      <Route path="/vaccinations"><PermissionGate page="vaccinations"><AnimalVaccinations /></PermissionGate></Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}
