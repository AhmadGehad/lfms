export const APP_ROLES = [
  "owner",
  "admin",
  "supervisor",
  "staff",
  "user",
  "viewer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const CONFIGURABLE_ROLES = [
  "supervisor",
  "staff",
  "user",
  "viewer",
] as const satisfies readonly AppRole[];

export const PERMISSION_PAGES = [
  { id: "dashboard", path: "/", actions: ["view", "report"] },
  { id: "animals", path: "/animals", actions: ["view", "create", "update", "delete", "report"] },
  { id: "breeding", path: "/breeding", actions: ["view", "create", "update", "delete"] },
  { id: "pregnancy", path: "/pregnancy", actions: ["view", "create", "update", "delete"] },
  { id: "fattening", path: "/fattening", actions: ["view", "create", "update", "delete"] },
  { id: "feed", path: "/feed", actions: ["view", "create", "update", "delete"] },
  { id: "vaccinations", path: "/vaccinations", actions: ["view", "create", "update", "delete"] },
  { id: "expenses", path: "/expenses", actions: ["view", "create", "update", "delete"] },
  { id: "pnl", path: "/pnl", actions: ["view", "export"] },
  { id: "incomeStatement", path: "/income-statement", actions: ["view", "export"] },
  { id: "sales", path: "/sales", actions: ["view", "create", "update", "delete"] },
  { id: "notifications", path: "/notifications", actions: ["view", "update"] },
  { id: "audit", path: "/audit", actions: ["view"] },
  { id: "users", path: "/users", actions: ["view", "update"] },
  { id: "configuration", path: "/config", actions: ["view", "create", "update", "delete"] },
  { id: "farmMap", path: "/farm-map", actions: ["view", "update"] },
  { id: "capital", path: "/config", actions: ["view", "create", "update"] },
  { id: "data", path: "/data", actions: ["view", "import", "export", "restore"] },
  { id: "recycleBin", path: "/recycle-bin", actions: ["view", "restore", "purge"] },
] as const;

export type PermissionPage = (typeof PERMISSION_PAGES)[number]["id"];
export type PermissionAction =
  (typeof PERMISSION_PAGES)[number]["actions"][number];
export type PermissionKey = `${PermissionPage}:${PermissionAction}`;
export type PermissionOverrides = Partial<Record<PermissionKey, boolean>>;

const ROLE_RANK: Record<AppRole, number> = {
  viewer: -1,
  user: 0,
  staff: 1,
  supervisor: 2,
  admin: 3,
  owner: 4,
};

const DEFAULT_MIN_ROLE: Record<PermissionPage, Partial<Record<PermissionAction, AppRole>>> = {
  dashboard: { view: "viewer", report: "viewer" },
  animals: { view: "viewer", create: "staff", update: "staff", delete: "supervisor", report: "viewer" },
  breeding: { view: "viewer", create: "staff", update: "staff", delete: "supervisor" },
  pregnancy: { view: "viewer", create: "staff", update: "staff", delete: "supervisor" },
  fattening: { view: "viewer", create: "staff", update: "staff", delete: "supervisor" },
  feed: { view: "viewer", create: "staff", update: "staff", delete: "supervisor" },
  vaccinations: { view: "viewer", create: "staff", update: "staff", delete: "supervisor" },
  expenses: { view: "viewer", create: "staff", update: "staff", delete: "staff" },
  pnl: { view: "viewer", export: "admin" },
  incomeStatement: { view: "viewer", export: "viewer" },
  sales: { view: "viewer", create: "staff", update: "staff", delete: "supervisor" },
  notifications: { view: "viewer", update: "user" },
  audit: { view: "viewer" },
  users: { view: "admin", update: "admin" },
  configuration: { view: "supervisor", create: "supervisor", update: "supervisor", delete: "supervisor" },
  farmMap: { view: "supervisor", update: "supervisor" },
  capital: { view: "supervisor", create: "admin", update: "admin" },
  data: { view: "admin", import: "admin", export: "admin", restore: "owner" },
  recycleBin: { view: "supervisor", restore: "admin", purge: "admin" },
};

export function permissionKey(
  page: PermissionPage,
  action: PermissionAction,
): PermissionKey {
  return `${page}:${action}`;
}

export function isKnownPermission(
  page: string,
  action: string,
): page is PermissionPage {
  const definition = PERMISSION_PAGES.find(item => item.id === page);
  return Boolean(definition?.actions.includes(action as never));
}

export function getDefaultPermission(
  role: AppRole,
  page: PermissionPage,
  action: PermissionAction,
): boolean {
  if (role === "owner") return true;
  const minimumRole = DEFAULT_MIN_ROLE[page]?.[action];
  if (!minimumRole) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole];
}

export function hasPermission(
  role: AppRole,
  overrides: PermissionOverrides | null | undefined,
  page: PermissionPage,
  action: PermissionAction,
): boolean {
  if (role === "owner") return true;
  if (role === "admin") return getDefaultPermission(role, page, action);
  if (
    action !== "view" &&
    !hasPermission(role, overrides, page, "view")
  ) {
    return false;
  }
  const override = overrides?.[permissionKey(page, action)];
  return override ?? getDefaultPermission(role, page, action);
}

export function buildDeniedPermissionOverrides(): PermissionOverrides {
  return Object.fromEntries(
    PERMISSION_PAGES.flatMap(page =>
      page.actions.map(action => [permissionKey(page.id, action), false]),
    ),
  ) as PermissionOverrides;
}

export function buildPermissionMatrix(
  role: AppRole,
  overrides?: PermissionOverrides | null,
) {
  return PERMISSION_PAGES.map(page => ({
    page: page.id,
    path: page.path,
    actions: page.actions.map(action => ({
      action,
      allowed: hasPermission(role, overrides, page.id, action),
    })),
  }));
}

export function pageForPath(pathname: string): PermissionPage | null {
  if (pathname.startsWith("/animals/")) return "animals";
  const page = PERMISSION_PAGES.find(item =>
    item.path === "/"
      ? pathname === "/"
      : pathname === item.path || pathname.startsWith(`${item.path}/`),
  );
  return page?.id ?? null;
}
