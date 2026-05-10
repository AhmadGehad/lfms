import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";

// Pages
import Dashboard from "./pages/Dashboard";
import Animals from "./pages/Animals";
import AnimalProfile from "./pages/AnimalProfile";
import Breeding from "./pages/Breeding";
import Fattening from "./pages/Fattening";
import Feed from "./pages/Feed";
import Expenses from "./pages/Expenses";
import PnL from "./pages/PnL";
import IncomeStatement from "./pages/IncomeStatement";
import Sales from "./pages/Sales";
import Notifications from "./pages/Notifications";
import AuditLog from "./pages/AuditLog";
import UserManagement from "./pages/UserManagement";
import Configuration from "./pages/Configuration";
import RecycleBin from "./pages/RecycleBin";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/animals" component={Animals} />
        <Route path="/animals/:id" component={AnimalProfile} />
        <Route path="/breeding" component={Breeding} />
        <Route path="/fattening" component={Fattening} />
        <Route path="/feed" component={Feed} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/pnl" component={PnL} />
        <Route path="/income-statement" component={IncomeStatement} />
        <Route path="/sales" component={Sales} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/audit" component={AuditLog} />
        <Route path="/users" component={UserManagement} />
        <Route path="/config" component={Configuration} />
        <Route path="/recycle-bin" component={RecycleBin} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
