import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";
import type { PermissionPage } from "@shared/permissions";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  Cog,
  Database,
  DollarSign,
  FileText,
  HeartPulse,
  Leaf,
  LogOut,
  MapPinned,
  Menu,
  Monitor,
  Moon,
  Search,
  Settings2,
  ShoppingCart,
  Sun,
  Syringe,
  Trash2,
  Users,
  Wheat,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { OwnerFilterSelect } from "@/components/OwnerFilterSelect";
import { DashboardLayoutSkeleton } from "@/components/DashboardLayoutSkeleton";
import { DesignSwitch } from "@/components/DesignSwitch";
import { Button } from "@/components/ui/button";
import { ThemeMenu } from "./components/ThemeMenu";
import { CommandPalette } from "./components/CommandPalette";
import { QuickAdd } from "./components/QuickAdd";
import { useTheme, type ThemePreference } from "@/contexts/ThemeContext";
import { useDesignVersion } from "@/contexts/DesignVersionContext";

interface NavItem {
  icon: ComponentType<{ className?: string }>;
  label: string;
  path: string;
  page: PermissionPage;
  activePaths?: string[];
  badge?: number;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

function useNavGroups(): NavGroup[] {
  const { t } = useTranslation();
  const perms = usePermissions();
  // Prototype IA: Dashboard, then Herd / Operations / Finance. Admin remains
  // available lower in the rail for owners, without diluting daily work.
  const groups: NavGroup[] = [
    {
      label: "",
      items: [{ icon: BarChart3, label: t("nav.dashboard"), path: "/", page: "dashboard" }],
    },
    {
      label: t("nav.groups.herd", "Herd"),
      items: [
        { icon: Leaf, label: t("newNav.animals", "Animals"), path: "/animals", page: "animals" },
        {
          icon: HeartPulse,
          label: t("nav.breedingPregnancy", "Breeding & Pregnancy"),
          path: "/breeding",
          activePaths: ["/breeding", "/pregnancy"],
          page: "breeding",
        },
        { icon: Syringe, label: t("nav.health", "Health"), path: "/vaccinations", page: "vaccinations" },
      ],
    },
    {
      label: t("nav.groups.operations"),
      items: [
        { icon: Wheat, label: t("newNav.feed", "Feed"), path: "/feed", page: "feed" },
        { icon: DollarSign, label: t("newNav.expenses", "Expenses"), path: "/expenses", page: "expenses" },
      ],
    },
    {
      label: t("nav.groups.finance"),
      items: [
        { icon: ShoppingCart, label: t("newNav.sales", "Sales"), path: "/sales", page: "sales" },
        { icon: Activity, label: t("nav.animalPnl", "Animal P&L"), path: "/pnl", page: "pnl" },
      ],
    },
    {
      label: t("nav.groups.admin", "Admin"),
      items: [
        { icon: MapPinned, label: t("nav.farmMap"), path: "/farm-map", page: "farmMap" },
        { icon: FileText, label: t("nav.incomeStatement"), path: "/income-statement", page: "incomeStatement" },
        { icon: BookOpen, label: t("nav.auditLog"), path: "/audit", page: "audit" },
        { icon: Users, label: t("nav.users"), path: "/users", page: "users" },
        { icon: Cog, label: t("nav.configuration"), path: "/config", page: "configuration" },
        { icon: Database, label: t("nav.dataManagement"), path: "/data", page: "data" },
        { icon: Trash2, label: t("nav.recycleBin", "Recycle Bin"), path: "/recycle-bin", page: "recycleBin" },
      ],
    },
  ];
  return groups
    .map(g => ({ ...g, items: g.items.filter(i => perms.can(i.page, "view")) }))
    .filter(g => g.items.length > 0);
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const groups = useNavGroups();
  return (
    <nav className="flex flex-col gap-1 px-3 py-3">
      {groups.map((group, gi) => (
        <div key={group.label || `g${gi}`} className="flex flex-col gap-1">
          {group.label && (
            <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
              {group.label}
            </div>
          )}
          {group.items.map(item => {
            const isActive =
              location === item.path ||
              (item.path !== "/" && location.startsWith(item.path)) ||
              item.activePaths?.some(p => location === p || location.startsWith(`${p}/`));
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-[var(--sidebar-active)] font-medium text-[var(--sidebar-active-fg)]"
                    : "text-sidebar-foreground/85 hover:bg-[var(--sidebar-2)]"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.badge ? (
                  <span className="ms-auto grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-danger-foreground">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function SidebarBrand() {
  const { t } = useTranslation();
  return (
    <div className="flex h-[60px] items-center gap-2.5 border-b border-sidebar-border px-5">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--sidebar-active)]">
        <Leaf className="h-4 w-4 text-[var(--sidebar-active-fg)]" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold leading-none text-sidebar-foreground">{t("appName", "Azal Farms")}</p>
        <p className="truncate text-xs leading-none text-sidebar-muted mt-1">مزارع أزَل</p>
      </div>
    </div>
  );
}

function FarmSwitcherSlot() {
  const { t } = useTranslation();
  return (
    <div className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground shadow-[var(--shadow-sm)] lg:flex">
      <span className="grid h-6 w-6 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">A</span>
      <span className="font-semibold">{t("appName", "Azal Farms")}</span>
      <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-2">
        {t("farm.single", "Farm")}
      </span>
    </div>
  );
}

function MobileBottomNav() {
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();
  const perms = usePermissions();
  const items = [
    { icon: BarChart3, label: t("nav.dashboard", "Dashboard"), path: "/", page: "dashboard" as PermissionPage },
    { icon: Leaf, label: t("newNav.animals", "Animals"), path: "/animals", page: "animals" as PermissionPage },
    { icon: Wheat, label: t("newNav.feed", "Feed"), path: "/feed", page: "feed" as PermissionPage },
    { icon: ShoppingCart, label: t("newNav.sales", "Sales"), path: "/sales", page: "sales" as PermissionPage },
  ].filter(item => perms.can(item.page, "view"));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-1.5 backdrop-blur md:hidden">
      <div className="grid grid-cols-4 gap-1">
        {items.slice(0, 4).map(item => {
          const active = location === item.path || (item.path !== "/" && location.startsWith(item.path));
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => setLocation(item.path)}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-ring ${
                active ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground hover:bg-surface hover:text-foreground"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function DisplayMenu() {
  const { t, i18n } = useTranslation();
  const { themePreference, setThemePreference } = useTheme();
  const { design, setDesign, switchable } = useDesignVersion();
  const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: "light", label: t("theme.light", "Light"), icon: Sun },
    { value: "dark", label: t("theme.dark", "Dark"), icon: Moon },
    { value: "system", label: t("theme.system", "System"), icon: Monitor },
  ];
  const setLang = (lang: "en" | "ar") => {
    i18n.changeLanguage(lang);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-foreground/70 hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring sm:h-9 sm:w-9"
          aria-label={t("display.label", "Display")}
        >
          <Settings2 className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t("display.label", "Display")}</DropdownMenuLabel>
        {themeOptions.map(option => (
          <DropdownMenuItem key={option.value} onClick={() => setThemePreference(option.value)} className="cursor-pointer gap-2">
            <option.icon className="h-4 w-4" aria-hidden="true" />
            <span className="flex-1">{option.label}</span>
            {themePreference === option.value && <Check className="h-4 w-4" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setLang("en")} className="cursor-pointer gap-2">
          <span className="grid h-4 w-4 place-items-center text-xs font-semibold">A</span>
          <span className="flex-1">English</span>
          {i18n.language !== "ar" && <Check className="h-4 w-4" aria-hidden="true" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLang("ar")} className="cursor-pointer gap-2">
          <span className="grid h-4 w-4 place-items-center text-xs font-semibold">ع</span>
          <span className="flex-1">العربية</span>
          {i18n.language === "ar" && <Check className="h-4 w-4" aria-hidden="true" />}
        </DropdownMenuItem>
        {switchable && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setDesign("old")} className="cursor-pointer gap-2">
              <span className="flex-1">{t("design.old", "Classic")}</span>
              {design === "old" && <Check className="h-4 w-4" aria-hidden="true" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDesign("new")} className="cursor-pointer gap-2">
              <span className="flex-1">{t("design.new", "New")}</span>
              {design === "new" && <Check className="h-4 w-4" aria-hidden="true" />}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * New design shell. Same auth, permissions, i18n/RTL, and owner-scope as the Old
 * shell — only presentation differs. Adds the top-bar controls the redesign
 * requires: global search (⌘K, wired in P3), Quick Add, Notifications, the
 * Light/Dark/System theme menu, and the Old/New design switch.
 */
export default function NewShell({ children }: { children: React.ReactNode }) {
  const { loading, user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const perms = usePermissions();

  useEffect(() => {
    document.documentElement.dir = isAr ? "rtl" : "ltr";
    document.documentElement.lang = i18n.language;
  }, [i18n.language, isAr]);

  const { data: notifications } = trpc.notifications.list.useQuery(
    { unreadOnly: true },
    { enabled: perms.can("notifications", "view") }
  );
  const unreadCount = Array.isArray(notifications) ? notifications.length : 0;

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex w-full max-w-md flex-col items-center gap-8 p-8">
          <div className="grid h-20 w-20 place-items-center rounded-2xl bg-primary shadow-lg">
            <Leaf className="h-10 w-10 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight">{t("appName")}</h1>
            <p className="mt-1 text-lg text-muted-foreground">{t("appNameAr")}</p>
            <p className="mt-3 text-sm text-muted-foreground">{t("appTagline")}</p>
          </div>
          <Button onClick={() => (window.location.href = getLoginUrl())} size="lg" className="w-full">
            {t("auth.signIn")}
          </Button>
          <LanguageSwitcher />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      {!isMobile && (
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar bg-gradient-to-b from-sidebar to-sidebar-2 text-sidebar-foreground md:flex">
          <SidebarBrand />
          <div className="border-b border-sidebar-border px-3 py-3">
            <OwnerFilterSelect className="w-full" />
          </div>
          <div className="flex-1 overflow-y-auto">
            <NavList />
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex h-[60px] items-center justify-between gap-2 border-b border-border bg-card/95 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2">
            {isMobile && (
              <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                <SheetTrigger asChild>
                  <button className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-surface sm:h-9 sm:w-9" aria-label={t("nav.menu", "Menu")}>
                    <Menu className="h-5 w-5" />
                  </button>
                </SheetTrigger>
                <SheetContent side={isAr ? "right" : "left"} className="w-72 bg-sidebar p-0 text-sidebar-foreground">
                  <SheetTitle className="sr-only">{t("nav.menu", "Menu")}</SheetTitle>
                  <SidebarBrand />
                  <div className="border-b border-sidebar-border px-3 py-3">
                    <OwnerFilterSelect className="w-full" />
                  </div>
                  <NavList onNavigate={() => setDrawerOpen(false)} />
                </SheetContent>
              </Sheet>
            )}
            <FarmSwitcherSlot />
            <button
              type="button"
              className="flex h-11 min-w-11 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring sm:h-9 sm:w-72 sm:min-w-0 lg:w-96"
              aria-label={t("search.open", "Search")}
              onClick={() => setCmdOpen(true)}
            >
              <Search className="h-4 w-4" />
              <span className="hidden min-w-0 flex-1 truncate text-start sm:inline">{t("search.placeholder", "Search animals, sales, expenses…")}</span>
              <kbd className="ms-2 hidden rounded border border-border bg-card px-1.5 text-[10px] font-medium sm:inline">⌘ K</kbd>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <DesignSwitch className="hidden sm:inline-flex" />
            <QuickAdd className="hidden sm:flex" />
            {perms.can("notifications", "view") && (
              <button
                onClick={() => setLocation("/notifications")}
                className="relative grid h-11 w-11 shrink-0 place-items-center rounded-lg text-foreground/70 hover:bg-surface sm:h-9 sm:w-9"
                aria-label={t("nav.notifications")}
              >
                <Bell className="h-[18px] w-[18px]" />
                {unreadCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-danger-foreground">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            )}
            <ThemeMenu />
            <DisplayMenu />
            <LanguageSwitcher />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-lg p-1 hover:bg-surface sm:min-h-9 sm:min-w-9" aria-label={user?.name ?? "Account"}>
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                      {user?.name?.charAt(0).toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronRight className={`hidden h-3 w-3 text-muted-foreground sm:block ${isAr ? "rotate-180" : ""}`} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isAr ? "start" : "end"} className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">{user?.role}</p>
                </div>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 sm:hidden">
                  <DesignSwitch />
                </div>
                {perms.can("users", "view") && (
                  <DropdownMenuItem onClick={() => setLocation("/users")} className="cursor-pointer">
                    <Users className="mr-2 h-4 w-4" />
                    {t("nav.users")}
                  </DropdownMenuItem>
                )}
                {perms.can("configuration", "view") && (
                  <DropdownMenuItem onClick={() => setLocation("/config")} className="cursor-pointer">
                    <Cog className="mr-2 h-4 w-4" />
                    {t("nav.configuration")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("auth.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-auto pb-20 md:pb-0">{children}</main>
      </div>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      {isMobile && <MobileBottomNav />}
    </div>
  );
}
