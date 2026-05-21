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
  PanelLeft,
  Scale,
  ShoppingCart,
  Trash2,
  Users,
  Moon,
  Sun,
  Wheat,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { useTheme } from "@/contexts/ThemeContext";

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
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth} isAr={isAr}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
  isAr,
}: {
  children: React.ReactNode;
  setSidebarWidth: (w: number) => void;
  isAr: boolean;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  // Notification count
  const { data: notifications } = trpc.notifications.list.useQuery({ unreadOnly: true });
  const unreadCount = Array.isArray(notifications) ? notifications.length : 0;

  const navGroups = [
    {
      label: t("nav.groups.overview"),
      items: [
        { icon: BarChart3, label: t("nav.dashboard"), path: "/" },
      ],
    },
    {
      label: t("nav.groups.livestock"),
      items: [
        { icon: Leaf, label: t("nav.animals"), path: "/animals" },
        { icon: Egg, label: t("nav.breeding"), path: "/breeding" },
        { icon: Scale, label: t("nav.fattening"), path: "/fattening" },
      ],
    },
    {
      label: t("nav.groups.operations"),
      items: [
        { icon: Wheat, label: t("nav.feed"), path: "/feed" },
        { icon: DollarSign, label: t("nav.expenses"), path: "/expenses" },
      ],
    },
    {
      label: t("nav.groups.finance"),
      items: [
        { icon: Activity, label: t("nav.pnl"), path: "/pnl" },
        { icon: FileText, label: t("nav.incomeStatement"), path: "/income-statement" },
        { icon: ShoppingCart, label: t("nav.sales"), path: "/sales" },
      ],
    },
    {
      label: t("nav.groups.system"),
      items: [
        { icon: Bell, label: t("nav.notifications"), path: "/notifications" },
        { icon: BookOpen, label: t("nav.auditLog"), path: "/audit" },
        { icon: Users, label: t("nav.users"), path: "/users" },
        { icon: Cog, label: t("nav.configuration"), path: "/config" },
        { icon: Database, label: "Data Management", path: "/data" },
        { icon: Trash2, label: t("nav.recycleBin") ?? "Recycle Bin", path: "/recycle-bin" },
      ],
    },
  ];

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
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          side={isAr ? "right" : "left"}
          collapsible="icon"
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
              {!isCollapsed && (
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

          {/* Navigation */}
          <SidebarContent className="gap-0 py-2">
            {navGroups.map((group) => (
              <SidebarGroup key={group.label} className="py-0">
                {!isCollapsed && (
                  <SidebarGroupLabel className={`text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40 px-4 py-2 ${isAr ? "text-right" : ""}`}>
                    {group.label}
                  </SidebarGroupLabel>
                )}
                <SidebarMenu className="px-2">
                  {group.items.map((item) => {
                    const isActive = location === item.path ||
                      (item.path !== "/" && location.startsWith(item.path));
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className={`h-9 font-normal relative ${isAr ? "flex-row-reverse" : ""}`}
                        >
                          <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/70"}`} />
                          <span className={isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground"}>
                            {item.label}
                          </span>
                          {item.path === "/notifications" && unreadCount > 0 && !isCollapsed && (
                            <Badge className={`${isAr ? "mr-auto" : "ml-auto"} h-5 min-w-5 text-xs bg-red-500 text-white border-0 px-1.5`}>
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </Badge>
                          )}
                          {item.path === "/notifications" && unreadCount > 0 && isCollapsed && (
                            <span className={`absolute top-1 ${isAr ? "left-1" : "right-1"} h-2 w-2 rounded-full bg-red-500`} />
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>

          {/* Footer */}
          <SidebarFooter className="p-3 border-t border-sidebar-border">
            {/* Language + Theme row */}
            {!isCollapsed && (
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
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-sidebar-foreground truncate leading-none">
                        {user?.name ?? "User"}
                      </p>
                      <p className="text-xs text-sidebar-foreground/50 truncate mt-1">
                        {user?.role ?? "user"}
                      </p>
                    </div>
                  )}
                  {!isCollapsed && <ChevronRight className={`h-3 w-3 text-sidebar-foreground/40 shrink-0 ${isAr ? "rotate-180" : ""}`} />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isAr ? "start" : "end"} className="w-52">
                <div className={`px-2 py-1.5 ${isAr ? "text-right" : ""}`}>
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocation("/users")} className="cursor-pointer">
                  <Users className="mr-2 h-4 w-4" />
                  {t("nav.users")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/config")} className="cursor-pointer">
                  <Cog className="mr-2 h-4 w-4" />
                  {t("nav.configuration")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("auth.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle — left edge in RTL, right edge in LTR */}
        <div
          className={`absolute top-0 ${isAr ? "left-0" : "right-0"} w-1 h-full cursor-col-resize hover:bg-primary/30 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
          style={{ zIndex: 50 }}
        />
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

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
