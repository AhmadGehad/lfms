import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Cog,
  Database,
  DollarSign,
  Egg,
  FileText,
  Leaf,
  MapPinned,
  Scale,
  ShoppingCart,
  Syringe,
  Trash2,
  Users,
  Wheat,
} from "lucide-react";
import type { ComponentType } from "react";
import { PERMISSION_PAGES, type PermissionPage } from "@shared/permissions";
import AnimalProfile from "./pages/AnimalProfile";
import AnimalVaccinations from "./pages/AnimalVaccinations";
import Animals from "./pages/Animals";
import AuditLog from "./pages/AuditLog";
import Breeding from "./pages/Breeding";
import Configuration from "./pages/Configuration";
import Dashboard from "./pages/Dashboard";
import Data from "./pages/Data";
import Expenses from "./pages/Expenses";
import FarmMap from "./pages/FarmMap";
import Fattening from "./pages/Fattening";
import Feed from "./pages/Feed";
import IncomeStatement from "./pages/IncomeStatement";
import Notifications from "./pages/Notifications";
import PnL from "./pages/PnL";
import RecycleBin from "./pages/RecycleBin";
import Sales from "./pages/Sales";
import UserManagement from "./pages/UserManagement";

export const NAVIGATION_GROUPS = [
  { id: "overview", labelKey: "nav.groups.overview" },
  { id: "livestock", labelKey: "nav.groups.livestock" },
  { id: "operations", labelKey: "nav.groups.operations" },
  { id: "finance", labelKey: "nav.groups.finance" },
  { id: "system", labelKey: "nav.groups.system" },
] as const;

export type NavigationGroupId = (typeof NAVIGATION_GROUPS)[number]["id"];

export type AppRoute = {
  path: string;
  component: ComponentType;
  permission: PermissionPage;
  navigation?: {
    group: NavigationGroupId;
    icon: LucideIcon;
    labelKey: string;
  };
};

export const APP_ROUTES = [
  {
    path: "/",
    component: Dashboard,
    permission: "dashboard",
    navigation: {
      group: "overview",
      icon: BarChart3,
      labelKey: "nav.dashboard",
    },
  },
  {
    path: "/animals",
    component: Animals,
    permission: "animals",
    navigation: {
      group: "livestock",
      icon: Leaf,
      labelKey: "nav.animals",
    },
  },
  {
    path: "/animals/:id",
    component: AnimalProfile,
    permission: "animals",
  },
  {
    path: "/breeding",
    component: Breeding,
    permission: "breeding",
    navigation: {
      group: "livestock",
      icon: Egg,
      labelKey: "nav.breeding",
    },
  },
  {
    path: "/fattening",
    component: Fattening,
    permission: "fattening",
    navigation: {
      group: "livestock",
      icon: Scale,
      labelKey: "nav.fattening",
    },
  },
  {
    path: "/feed",
    component: Feed,
    permission: "feed",
    navigation: {
      group: "operations",
      icon: Wheat,
      labelKey: "nav.feed",
    },
  },
  {
    path: "/vaccinations",
    component: AnimalVaccinations,
    permission: "vaccinations",
    navigation: {
      group: "operations",
      icon: Syringe,
      labelKey: "vaccine.title",
    },
  },
  {
    path: "/expenses",
    component: Expenses,
    permission: "expenses",
    navigation: {
      group: "operations",
      icon: DollarSign,
      labelKey: "nav.expenses",
    },
  },
  {
    path: "/pnl",
    component: PnL,
    permission: "pnl",
    navigation: {
      group: "finance",
      icon: Activity,
      labelKey: "nav.pnl",
    },
  },
  {
    path: "/income-statement",
    component: IncomeStatement,
    permission: "incomeStatement",
    navigation: {
      group: "finance",
      icon: FileText,
      labelKey: "nav.incomeStatement",
    },
  },
  {
    path: "/sales",
    component: Sales,
    permission: "sales",
    navigation: {
      group: "finance",
      icon: ShoppingCart,
      labelKey: "nav.sales",
    },
  },
  {
    path: "/notifications",
    component: Notifications,
    permission: "notifications",
    navigation: {
      group: "system",
      icon: Bell,
      labelKey: "nav.notifications",
    },
  },
  {
    path: "/audit",
    component: AuditLog,
    permission: "audit",
    navigation: {
      group: "system",
      icon: BookOpen,
      labelKey: "nav.auditLog",
    },
  },
  {
    path: "/users",
    component: UserManagement,
    permission: "users",
    navigation: {
      group: "system",
      icon: Users,
      labelKey: "nav.users",
    },
  },
  {
    path: "/config",
    component: Configuration,
    permission: "configuration",
    navigation: {
      group: "system",
      icon: Cog,
      labelKey: "nav.configuration",
    },
  },
  {
    path: "/farm-map",
    component: FarmMap,
    permission: "farmMap",
    navigation: {
      group: "system",
      icon: MapPinned,
      labelKey: "nav.farmMap",
    },
  },
  {
    path: "/data",
    component: Data,
    permission: "data",
    navigation: {
      group: "system",
      icon: Database,
      labelKey: "nav.dataManagement",
    },
  },
  {
    path: "/recycle-bin",
    component: RecycleBin,
    permission: "recycleBin",
    navigation: {
      group: "system",
      icon: Trash2,
      labelKey: "nav.recycleBin",
    },
  },
] as const satisfies readonly AppRoute[];

const canonicalPathByPermission = new Map(
  PERMISSION_PAGES.map(page => [page.id, page.path])
);

for (const route of APP_ROUTES) {
  if (
    "navigation" in route &&
    canonicalPathByPermission.get(route.permission) !== route.path
  ) {
    throw new Error(
      `Route path for ${route.permission} must match the permission registry`
    );
  }
}

export const NAVIGATION_ROUTES = APP_ROUTES.filter(
  (
    route
  ): route is (typeof APP_ROUTES)[number] & {
    navigation: NonNullable<AppRoute["navigation"]>;
  } => "navigation" in route
);

export function isNavigationRouteActive(pathname: string, routePath: string) {
  return routePath === "/"
    ? pathname === "/"
    : pathname === routePath || pathname.startsWith(`${routePath}/`);
}

export function findNavigationRoute(pathname: string) {
  return NAVIGATION_ROUTES.find(route =>
    isNavigationRouteActive(pathname, route.path)
  );
}
