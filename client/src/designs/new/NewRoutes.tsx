import { Route, Switch } from "wouter";
import NotFound from "@/pages/NotFound";
import { PermissionGate } from "../routes";

// New design pages (redesigned). As more pages are ported, swap the Old import
// for the New one here — permission gating and data stay identical.
import NewDashboard from "./pages/Dashboard";
import NewAnimals from "./pages/Animals";
import NewAnimalProfile from "./pages/AnimalProfile";
import NewSales from "./pages/Sales";
import NewExpenses from "./pages/Expenses";
import NewNotifications from "./pages/Notifications";
import NewAuditLog from "./pages/AuditLog";
import NewVaccinations from "./pages/Vaccinations";
import NewRecycleBin from "./pages/RecycleBin";
import NewBreeding from "./pages/Breeding";
import NewPnL from "./pages/PnL";
import NewIncomeStatement from "./pages/IncomeStatement";
import NewUsers from "./pages/Users";
import NewFeed from "./pages/Feed";
import NewData from "./pages/Data";
import NewConfiguration from "./pages/Configuration";

// Pages not yet redesigned render their Old version inside the New shell. This
// keeps every route working while the redesign rolls out page-by-page.
import Fattening from "@/pages/Fattening";
import FarmMap from "@/pages/FarmMap";

/** Route table for the New design. */
export function NewAppRoutes() {
  return (
    <Switch>
      <Route path="/"><PermissionGate page="dashboard"><NewDashboard /></PermissionGate></Route>
      <Route path="/animals"><PermissionGate page="animals"><NewAnimals /></PermissionGate></Route>
      <Route path="/animals/:id"><PermissionGate page="animals"><NewAnimalProfile /></PermissionGate></Route>
      <Route path="/breeding"><PermissionGate page="breeding"><NewBreeding /></PermissionGate></Route>
      <Route path="/pregnancy"><PermissionGate page="pregnancy"><NewBreeding initialTab="pregnancy" /></PermissionGate></Route>
      <Route path="/fattening"><PermissionGate page="fattening"><Fattening /></PermissionGate></Route>
      <Route path="/farm-map"><PermissionGate page="farmMap"><FarmMap /></PermissionGate></Route>
      <Route path="/feed"><PermissionGate page="feed"><NewFeed /></PermissionGate></Route>
      <Route path="/expenses"><PermissionGate page="expenses"><NewExpenses /></PermissionGate></Route>
      <Route path="/pnl"><PermissionGate page="pnl"><NewPnL /></PermissionGate></Route>
      <Route path="/income-statement"><PermissionGate page="incomeStatement"><NewIncomeStatement /></PermissionGate></Route>
      <Route path="/sales"><PermissionGate page="sales"><NewSales /></PermissionGate></Route>
      <Route path="/notifications"><PermissionGate page="notifications"><NewNotifications /></PermissionGate></Route>
      <Route path="/audit"><PermissionGate page="audit"><NewAuditLog /></PermissionGate></Route>
      <Route path="/users"><PermissionGate page="users"><NewUsers /></PermissionGate></Route>
      <Route path="/config"><PermissionGate page="configuration"><NewConfiguration /></PermissionGate></Route>
      <Route path="/data"><PermissionGate page="data"><NewData /></PermissionGate></Route>
      <Route path="/recycle-bin"><PermissionGate page="recycleBin"><NewRecycleBin /></PermissionGate></Route>
      <Route path="/vaccinations"><PermissionGate page="vaccinations"><NewVaccinations /></PermissionGate></Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}
