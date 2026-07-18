import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  Building2,
  ChevronsUpDown,
  ClipboardList,
  DatabaseBackup,
  FileKey2,
  Flag,
  HeartPulse,
  LifeBuoy,
  Menu,
  ShieldCheck,
  ShieldAlert,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { platformTrpc } from "@admin/lib/trpc";

const sections = [
  { label: "Overview", links: [{ href: "/", label: "Dashboard", icon: BarChart3, permission: "platform.dashboard.read" }] },
  {
    label: "Tenants",
    links: [
      { href: "/companies", label: "Companies", icon: Building2, permission: "companies.read" },
      { href: "/farms", label: "Farms", icon: Warehouse, permission: "farms.read" },
      { href: "/memberships", label: "Users & access", icon: Users, permission: "memberships.read" },
    ],
  },
  {
    label: "Commercial",
    links: [
      { href: "/plans", label: "Plans", icon: BadgeDollarSign, permission: "plans.read" },
      { href: "/subscriptions", label: "Subscriptions", icon: FileKey2, permission: "subscriptions.read" },
      { href: "/features", label: "Features", icon: Flag, permission: "entitlements.read" },
      { href: "/usage", label: "Usage", icon: Activity, permission: "usage.read" },
    ],
  },
  {
    label: "Operations",
    links: [
      { href: "/audit", label: "Audit logs", icon: ClipboardList, permission: "audit.read" },
      { href: "/security", label: "Security events", icon: ShieldAlert, permission: "security.read" },
      { href: "/administrators", label: "Platform admins", icon: ShieldCheck, permission: "administrators.read" },
      { href: "/lifecycle", label: "Data lifecycle", icon: DatabaseBackup, permission: "operations.read" },
      { href: "/support", label: "Support access", icon: LifeBuoy, permission: "support.access" },
      { href: "/health", label: "System health", icon: HeartPulse, permission: "operations.read" },
    ],
  },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const session = platformTrpc.auth.me.useQuery();
  const logout = platformTrpc.auth.logout.useMutation({
    onSuccess: () => window.location.assign("/"),
  });

  const sidebar = (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-[var(--admin-sidebar)] text-white">
      <div className="flex h-14 items-center gap-3 border-b border-[var(--admin-sidebar-border)] px-4">
        <div className="grid h-8 w-8 place-items-center bg-primary text-primary-foreground"><ShieldCheck className="h-4 w-4" /></div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">LFMS Platform</p>
          <p className="text-[11px] text-[var(--admin-sidebar-muted)]">Operations console</p>
        </div>
        <Button variant="ghost" size="icon" className="ml-auto text-white hover:bg-white/10 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Platform navigation">
        {sections.map(section => (
          <div key={section.label} className="mb-4">
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase text-[var(--admin-sidebar-muted)]">{section.label}</p>
            {section.links.filter(item => session.data?.permissions.includes(item.permission)).map(item => {
              const active = location === item.href || (item.href !== "/" && location.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "mb-0.5 flex h-9 items-center gap-2 px-2 text-sm text-[var(--admin-sidebar-muted)] hover:bg-white/8 hover:text-white",
                    active && "bg-white/12 font-medium text-white",
                  )}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-[var(--admin-sidebar-border)] p-2">
        <button
          type="button"
          onClick={() => logout.mutate()}
          className="flex h-11 w-full items-center gap-2 px-2 text-left hover:bg-white/8"
        >
          <Avatar className="h-7 w-7"><AvatarFallback className="bg-primary text-xs text-white">{session.data?.name?.slice(0, 2).toUpperCase() || "PA"}</AvatarFallback></Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{session.data?.name || "Platform administrator"}</span>
            <span className="block truncate text-[10px] text-[var(--admin-sidebar-muted)]">MFA protected</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-[var(--admin-sidebar-muted)]" />
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <a href="#platform-main" className="sr-only z-[100] bg-background px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to main content</a>
      <div className="fixed inset-y-0 left-0 z-40 hidden md:block">{sidebar}</div>
      {mobileOpen && <div className="fixed inset-0 z-50 md:hidden"><button className="absolute inset-0 bg-black/45" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />{sidebar}</div>}
      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-5">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-4 w-4" /></Button>
          <p className="text-sm font-medium">Platform administration</p>
          <p className="ml-auto text-xs text-muted-foreground">Separate workforce identity</p>
        </header>
        <main id="platform-main" tabIndex={-1} className="w-full flex-1 p-3 sm:p-5 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
