import { Route, Switch } from "wouter";
import NotFound from "@/pages/NotFound";
import AccessDenied from "@/pages/AccessDenied";
import { usePermissions } from "@/hooks/usePermissions";
import type { PermissionPage } from "@shared/permissions";

// Pages are SHARED business/UI logic used by both designs. The Old and New
// shells differ; the page set and permission gating are identical (a hard
// requirement — see ux-audit/11 §E). As New pages land they are swapped in here
// behind the design version, never by forking permissions or data logic.
import Dashboard from "@/pages/Dashboard";
import Animals from "@/pages/Animals";
import AnimalProfile from "@/pages/AnimalProfile";
import Breeding from "@/pages/Breeding";
import Pregnancy from "@/pages/Pregnancy";
import Fattening from "@/pages/Fattening";
import Feed from "@/pages/Feed";
import FarmMap from "@/pages/FarmMap";
import Expenses from "@/pages/Expenses";
import PnL from "@/pages/PnL";
import IncomeStatement from "@/pages/IncomeStatement";
import Sales from "@/pages/Sales";
import Notifications from "@/pages/Notifications";
import AuditLog from "@/pages/AuditLog";
import UserManagement from "@/pages/UserManagement";
import Configuration from "@/pages/Configuration";
import Data from "@/pages/Data";
import RecycleBin from "@/pages/RecycleBin";
import AnimalVaccinations from "@/pages/AnimalVaccinations";

export function PermissionGate({ page, children }: { page: PermissionPage; children: React.ReactNode }) {
  const permissions = usePermissions(page);
  if (permissions.loading) return null;
  if (!permissions.canView) return <AccessDenied />;
  return <>{children}</>;
}

/** Shared route table rendered inside either design's shell. */
export function AppRoutes() {
  return (
    <Switch>
      <Route path="/"><PermissionGate page="dashboard"><Dashboard /></PermissionGate></Route>
      <Route path="/animals"><PermissionGate page="animals"><Animals /></PermissionGate></Route>
      <Route path="/animals/:id"><PermissionGate page="animals"><AnimalProfile /></PermissionGate></Route>
      <Route path="/breeding"><PermissionGate page="breeding"><Breeding /></PermissionGate></Route>
      <Route path="/pregnancy"><PermissionGate page="pregnancy"><Pregnancy /></PermissionGate></Route>
      <Route path="/fattening"><PermissionGate page="fattening"><Fattening /></PermissionGate></Route>
      <Route path="/farm-map"><PermissionGate page="farmMap"><FarmMap /></PermissionGate></Route>
      <Route path="/feed"><PermissionGate page="feed"><Feed /></PermissionGate></Route>
      <Route path="/expenses"><PermissionGate page="expenses"><Expenses /></PermissionGate></Route>
      <Route path="/pnl"><PermissionGate page="pnl"><PnL /></PermissionGate></Route>
      <Route path="/income-statement"><PermissionGate page="incomeStatement"><IncomeStatement /></PermissionGate></Route>
      <Route path="/sales"><PermissionGate page="sales"><Sales /></PermissionGate></Route>
      <Route path="/notifications"><PermissionGate page="notifications"><Notifications /></PermissionGate></Route>
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
