import { lazy } from "react";
import { Route, Switch } from "wouter";
import NotFound from "@/pages/NotFound";
import { PermissionGate } from "./PermissionGate";

// Each page is its own chunk: the first visit downloads only the page being opened.
const NewDashboard = lazy(() => import("./pages/Dashboard"));
const NewAnimals = lazy(() => import("./pages/Animals"));
const NewAnimalProfile = lazy(() => import("./pages/AnimalProfile"));
const NewSales = lazy(() => import("./pages/Sales"));
const NewExpenses = lazy(() => import("./pages/Expenses"));
const NewNotifications = lazy(() => import("./pages/Notifications"));
const NewAuditLog = lazy(() => import("./pages/AuditLog"));
const NewVaccinations = lazy(() => import("./pages/Vaccinations"));
const NewRecycleBin = lazy(() => import("./pages/RecycleBin"));
const NewBreeding = lazy(() => import("./pages/Breeding"));
const NewPnL = lazy(() => import("./pages/PnL"));
const NewIncomeStatement = lazy(() => import("./pages/IncomeStatement"));
const NewUsers = lazy(() => import("./pages/Users"));
const NewFeed = lazy(() => import("./pages/Feed"));
const NewData = lazy(() => import("./pages/Data"));
const NewConfiguration = lazy(() => import("./pages/Configuration"));

// Not yet redesigned; these render inside the same shell.
const Fattening = lazy(() => import("@/pages/Fattening"));
const FarmMap = lazy(() => import("@/pages/FarmMap"));

/** Route table for the signed-in app. */
export function NewAppRoutes() {
  return (
    <Switch>
      <Route path="/"><PermissionGate page="dashboard" skeleton="dashboard"><NewDashboard /></PermissionGate></Route>
      <Route path="/animals"><PermissionGate page="animals"><NewAnimals /></PermissionGate></Route>
      <Route path="/animals/:id"><PermissionGate page="animals" skeleton="detail"><NewAnimalProfile /></PermissionGate></Route>
      <Route path="/breeding"><PermissionGate page="breeding"><NewBreeding /></PermissionGate></Route>
      <Route path="/pregnancy"><PermissionGate page="pregnancy"><NewBreeding initialTab="pregnancy" /></PermissionGate></Route>
      <Route path="/fattening"><PermissionGate page="fattening"><Fattening /></PermissionGate></Route>
      <Route path="/farm-map"><PermissionGate page="farmMap"><FarmMap /></PermissionGate></Route>
      <Route path="/feed"><PermissionGate page="feed"><NewFeed /></PermissionGate></Route>
      <Route path="/expenses"><PermissionGate page="expenses"><NewExpenses /></PermissionGate></Route>
      <Route path="/pnl"><PermissionGate page="pnl"><NewPnL /></PermissionGate></Route>
      <Route path="/income-statement"><PermissionGate page="incomeStatement"><NewIncomeStatement /></PermissionGate></Route>
      <Route path="/sales"><PermissionGate page="sales"><NewSales /></PermissionGate></Route>
      <Route path="/notifications"><PermissionGate page="notifications" skeleton="list"><NewNotifications /></PermissionGate></Route>
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
