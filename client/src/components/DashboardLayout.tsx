import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  ChevronRight,
  Cog,
  Database,
  DollarSign,
  Egg,
  FileText,
  Leaf,
  LogOut,
  MapPinned,
  PanelLeft,
  Scale,
  ShoppingCart,
  Trash2,
  Users,
  Moon,
  Sun,
  Wheat,
  Syringe,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { OwnerFilterSelect } from "./OwnerFilterSelect";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { usePermissions } from "@/hooks/usePermissions";
import type { PermissionPage } from "@shared/permissions";

const SIDEBAR_WIDTH_KEY = "lfms-sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 380;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const isMobile = useIsMobile();

  // Apply RTL direction based on language
  useEffect(() => {
    document.documentElement.dir = isAr ? "rtl" : "ltr";
    document.documentElement.lang = i18n.language;
  }, [i18n.language, isAr]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-4">
            <div className="h-20 w-20 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
              <Leaf className="h-10 w-10 text-primary-foreground" />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {t("appName")}
              </h1>
              <p className="text-lg text-muted-foreground mt-1">
                {t("appNameAr")}
              </p>
              <p className="text-sm text-muted-foreground mt-3">
                {t("appTagline")}
              </p>
            </div>
          </div>
          <Button
            onClick={() => { window.location.href = getLoginUrl(); }}
            size="lg"
            className="w-full"
          >
            {t("auth.signIn")}
          </Button>
          <div className="mt-2">
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      defaultOpen={!isMobile}
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth} isAr={isAr} isMobile={isMobile}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
  isAr,
  isMobile: isMobileProp,
}: {
  children: React.ReactNode;
  setSidebarWidth: (w: number) => void;
  isAr: boolean;
  isMobile: boolean;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  // On mobile the sidebar is an offcanvas drawer — when it's visible the user
  // always sees the full labels regardless of the desktop "collapsed" state.
  const showLabels = !isCollapsed || isMobileProp;
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = isMobileProp;
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const perms = usePermissions();

  // Notification count
  const { data: notifications } = trpc.notifications.list.useQuery(
    { unreadOnly: true },
    { enabled: perms.can("notifications", "view") },
  );
  const unreadCount = Array.isArray(notifications) ? notifications.length : 0;

  const navGroups = [
    {
      label: t("nav.groups.overview"),
      items: [
        { icon: BarChart3, label: t("nav.dashboard"), path: "/", page: "dashboard" as PermissionPage },
      ],
    },
    {
      label: t("nav.groups.livestock"),
      items: [
        { icon: Leaf, label: t("nav.animals"), path: "/animals", page: "animals" as PermissionPage },
        { icon: Egg, label: t("nav.breeding"), path: "/breeding", page: "breeding" as PermissionPage },
        { icon: Scale, label: t("nav.fattening"), path: "/fattening", page: "fattening" as PermissionPage },
      ],
    },
    {
      label: t("nav.groups.operations"),
      items: [
        { icon: Wheat, label: t("nav.feed"), path: "/feed", page: "feed" as PermissionPage },
        { icon: Syringe, label: t("vaccine.title"), path: "/vaccinations", page: "vaccinations" as PermissionPage },
        { icon: DollarSign, label: t("nav.expenses"), path: "/expenses", page: "expenses" as PermissionPage },
      ],
    },
    {
      label: t("nav.groups.finance"),
      items: [
        { icon: Activity, label: t("nav.pnl"), path: "/pnl", page: "pnl" as PermissionPage },
        { icon: FileText, label: t("nav.incomeStatement"), path: "/income-statement", page: "incomeStatement" as PermissionPage },
        { icon: ShoppingCart, label: t("nav.sales"), path: "/sales", page: "sales" as PermissionPage },
      ],
    },
    {
      label: t("nav.groups.system"),
      items: [
        { icon: Bell, label: t("nav.notifications"), path: "/notifications", page: "notifications" as PermissionPage },
        { icon: BookOpen, label: t("nav.auditLog"), path: "/audit", page: "audit" as PermissionPage },
        { icon: Users, label: t("nav.users"), path: "/users", page: "users" as PermissionPage },
        { icon: Cog, label: t("nav.configuration"), path: "/config", page: "configuration" as PermissionPage },
        { icon: MapPinned, label: t("nav.farmMap"), path: "/farm-map", page: "farmMap" as PermissionPage },
        { icon: Database, label: t("nav.dataManagement"), path: "/data", page: "data" as PermissionPage },
        { icon: Trash2, label: t("nav.recycleBin") ?? "Recycle Bin", path: "/recycle-bin", page: "recycleBin" as PermissionPage },
      ],
    },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter(item => perms.can(item.page, "view")),
    }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      let newWidth: number;
      if (isAr) {
        // In RTL the sidebar is on the right; width grows leftward
        newWidth = rect.right - e.clientX;
      } else {
        newWidth = e.clientX - rect.left;
      }
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth, isAr]);

  const activeLabel = navGroups
    .flatMap((g) => g.items)
    .find((item) => item.path === location)?.label ?? "Azal Farms";

  return (
    <>
      {/* Sidebar wrapper — side prop switches between left (LTR) and right (RTL) */}
      <div className="relative hidden md:block" ref={sidebarRef}>
        <Sidebar
          side={isAr ? "right" : "left"}
          collapsible={isMobile ? "offcanvas" : "icon"}
          className={isAr ? "border-l-0" : "border-r-0"}
          disableTransition={isResizing}
        >
          {/* Header */}
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">
            <div className={`flex items-center gap-3 px-2 w-full ${isAr ? "flex-row-reverse" : ""}`}>
              <button
                onClick={toggleSidebar}
                className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-sidebar-accent transition-colors shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className={`h-4 w-4 text-sidebar-foreground/70 ${isAr ? "rotate-180" : ""}`} />
              </button>
              {showLabels && (
                <div className={`flex items-center gap-2 min-w-0 ${isAr ? "flex-row-reverse" : ""}`}>
                  <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
                    <Leaf className="h-4 w-4 text-sidebar-primary-foreground" />
                  </div>
                  <div className={`min-w-0 ${isAr ? "text-right" : ""}`}>
                    <p className="text-sm font-bold text-sidebar-foreground truncate leading-none">Azal Farms</p>
                    <p className="text-xs text-sidebar-foreground/50 truncate mt-0.5">مزارع أزَل</p>
                  </div>
                </div>
              )}
            </div>
          </SidebarHeader>

          {/* Navigation - uses inline styles for critical layout to guarantee
              no overlap regardless of utility-class ordering or base styles. */}
          <SidebarContent className="py-2" style={{ gap: 0 }}>
            {navGroups.map((group) => (
              <div
                key={group.label}
                style={{ display: "flex", flexDirection: "column", padding: "8px 8px 4px 8px" }}
              >
                {showLabels && (
                  <div
                    className={`text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40 ${isAr ? "text-right" : ""}`}
                    style={{
                      height: "auto",
                      minHeight: 0,
                      padding: "8px 8px 4px 8px",
                      lineHeight: 1.2,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {group.label}
                  </div>
                )}
                <ul style={{ display: "flex", flexDirection: "column", gap: "4px", listStyle: "none", margin: 0, padding: 0 }}>
                  {group.items.map((item) => {
                    const isActive = location === item.path ||
                      (item.path !== "/" && location.startsWith(item.path));
                    return (
                      <li key={item.path} style={{ position: "relative" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setLocation(item.path);
                            if (isMobile) toggleSidebar();
                          }}
                          title={isCollapsed ? item.label : undefined}
                          className={`w-full rounded-md text-sm transition-colors ${
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                          }`}
                          style={{
                            height: "auto",
                            minHeight: "40px",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "8px 12px",
                            flexDirection: isAr ? "row-reverse" : "row",
                            textAlign: isAr ? "right" : "left",
                            border: "none",
                            background: isActive ? undefined : "transparent",
                            cursor: "pointer",
                          }}
                        >
                          <item.icon
                            className={isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/70"}
                            style={{ width: 16, height: 16, flexShrink: 0 }}
                          />
                          {showLabels && (
                            <span style={{ flex: 1, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {item.label}
                            </span>
                          )}
                          {item.path === "/notifications" && unreadCount > 0 && showLabels && (
                            <Badge
                              className="bg-red-500 text-white border-0"
                              style={{ height: 20, minWidth: 20, fontSize: 11, padding: "0 6px", marginLeft: isAr ? 0 : "auto", marginRight: isAr ? "auto" : 0, flexShrink: 0 }}
                            >
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </Badge>
                          )}
                          {item.path === "/notifications" && unreadCount > 0 && isCollapsed && (
                            <span
                              style={{
                                position: "absolute",
                                top: 4,
                                [isAr ? "left" : "right"]: 4,
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: "#ef4444",
                              }}
                            />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </SidebarContent>

          {/* Footer */}
          <SidebarFooter className="p-3 border-t border-sidebar-border">
            {/* Language + Theme row */}
            {showLabels && (
              <div className={`flex items-center justify-between mb-2 gap-2 ${isAr ? "flex-row-reverse" : ""}`}>
                <LanguageSwitcher />
                <button
                  onClick={toggleTheme}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-sidebar-accent transition-colors shrink-0"
                  aria-label="Toggle theme"
                  title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4 text-sidebar-foreground/70" />
                  ) : (
                    <Moon className="h-4 w-4 text-sidebar-foreground/70" />
                  )}
                </button>
              </div>
            )}
            {/* Collapsed: show theme toggle icon only */}
            {isCollapsed && (
              <button
                onClick={toggleTheme}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-sidebar-accent transition-colors mx-auto mb-2"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4 text-sidebar-foreground/70" />
                ) : (
                  <Moon className="h-4 w-4 text-sidebar-foreground/70" />
                )}
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors w-full ${isAr ? "flex-row-reverse text-right" : "text-left"} focus:outline-none`}>
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs font-semibold bg-sidebar-primary text-sidebar-primary-foreground">
                      {user?.name?.charAt(0).toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  {showLabels && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-sidebar-foreground truncate leading-none">
                        {user?.name ?? "User"}
                      </p>
                      <p className="text-xs text-sidebar-foreground/50 truncate mt-1">
                        {user?.role ?? "user"}
                      </p>
                    </div>
                  )}
                  {showLabels && <ChevronRight className={`h-3 w-3 text-sidebar-foreground/40 shrink-0 ${isAr ? "rotate-180" : ""}`} />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isAr ? "start" : "end"} className="w-52">
                <div className={`px-2 py-1.5 ${isAr ? "text-right" : ""}`}>
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
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
                {(perms.can("users", "view") || perms.can("configuration", "view")) && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("auth.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle — desktop only, left edge in RTL, right edge in LTR */}
        {!isMobile && (
          <div
            className={`absolute top-0 ${isAr ? "left-0" : "right-0"} w-1 h-full cursor-col-resize hover:bg-primary/30 transition-colors ${isCollapsed ? "hidden" : ""}`}
            onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
            style={{ zIndex: 50 }}
          />
        )}
      </div>

      <SidebarInset>
        {/* Mobile top bar */}
        {isMobile && (
          <div className={`flex border-b h-14 items-center justify-between bg-background/95 px-4 backdrop-blur sticky top-0 z-40 ${isAr ? "flex-row-reverse" : ""}`}>
            <div className={`flex items-center gap-3 ${isAr ? "flex-row-reverse" : ""}`}>
              <SidebarTrigger className="h-9 w-9 rounded-lg" />
              <span className="font-semibold text-sm">{activeLabel}</span>
            </div>
            <div className={`flex items-center gap-2 ${isAr ? "flex-row-reverse" : ""}`}>
              <OwnerFilterSelect className="w-32" />
              <LanguageSwitcher />
              <button onClick={() => setLocation("/notifications")} className="relative p-2 rounded-lg hover:bg-muted">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className={`absolute top-1 ${isAr ? "left-1" : "right-1"} h-2 w-2 rounded-full bg-red-500`} />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Desktop top bar — carries the global owner filter so every page can
            be scoped to a single owner from one consistent control. */}
        {!isMobile && (
          <div className={`flex border-b h-12 items-center justify-between bg-background/95 px-4 md:px-6 backdrop-blur sticky top-0 z-40 ${isAr ? "flex-row-reverse" : ""}`}>
            <span className="font-semibold text-sm text-muted-foreground">{activeLabel}</span>
            <div className={`flex items-center gap-2 ${isAr ? "flex-row-reverse" : ""}`}>
              <span className="text-xs text-muted-foreground hidden lg:inline">{t("owners.filterByOwner")}</span>
              <OwnerFilterSelect />
            </div>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
