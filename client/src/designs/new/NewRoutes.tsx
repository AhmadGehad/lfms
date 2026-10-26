import { Route, Switch } from "wouter";
import NotFound from "@/pages/NotFound";
import { PermissionGate } from "./PermissionGate";
import { lazyPage } from "./lazyPage";

// Each page is its own chunk: the first visit downloads only the page being opened.
const NewDashboard = lazyPage(() => import("./pages/Dashboard"));
const NewAnimals = lazyPage(() => import("./pages/Animals"));
const NewAnimalProfile = lazyPage(() => import("./pages/AnimalProfile"));
const NewSales = lazyPage(() => import("./pages/Sales"));
const NewExpenses = lazyPage(() => import("./pages/Expenses"));
const NewNotifications = lazyPage(() => import("./pages/Notifications"));
const NewAuditLog = lazyPage(() => import("./pages/AuditLog"));
const NewVaccinations = lazyPage(() => import("./pages/Vaccinations"));
const NewRecycleBin = lazyPage(() => import("./pages/RecycleBin"));
const NewBreeding = lazyPage(() => import("./pages/Breeding"));
const NewPnL = lazyPage(() => import("./pages/PnL"));
const NewIncomeStatement = lazyPage(() => import("./pages/IncomeStatement"));
const NewUsers = lazyPage(() => import("./pages/Users"));
const NewFeed = lazyPage(() => import("./pages/Feed"));
const NewData = lazyPage(() => import("./pages/Data"));
const NewConfiguration = lazyPage(() => import("./pages/Configuration"));

// Not yet redesigned; these render inside the same shell.
const Fattening = lazyPage(() => import("@/pages/Fattening"));
const FarmMap = lazyPage(() => import("@/pages/FarmMap"));

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
