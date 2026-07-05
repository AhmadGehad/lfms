import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/hooks/useCurrency";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
import { usePermissions } from "@/hooks/usePermissions";
import { usePreferences } from "@/hooks/usePreferences";
import type { PermissionPage } from "@shared/permissions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Baby,
  DollarSign,
  Eye,
  EyeOff,
  Leaf,
  Plus,
  RotateCcw,
  Scale,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Syringe,
  TrendingUp,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { ActionQueue, type QueueItem } from "../components/ActionCenter";
import { StatusBadge, type StatusTone } from "../components/StatusBadge";
import { AnimalCreateDialog, BulkRecordSaleDialog, QuickExpenseDialog, WeighInSessionDialog } from "../components/AnimalWorkflows";

const MS_DAY = 86400000;
const DASHBOARD_PREF_KEY = "lfms:new-dashboard-layout";
const PREF_SERVER_KEY = "ui.dashboardLayout" as const;

const DEFAULT_KPI_ORDER = ["animals", "revenue", "expenses", "pnl"] as const;
type KpiId = (typeof DEFAULT_KPI_ORDER)[number];

const DEFAULT_WIDGET_ORDER = ["pregnancy", "vaccinations", "feed", "ready", "lambs", "unpaid", "trends", "headcount", "recent"] as const;
type WidgetId = (typeof DEFAULT_WIDGET_ORDER)[number];

type DashboardPrefs = {
  kpiOrder: KpiId[];
  hiddenKpis: KpiId[];
  widgetOrder: WidgetId[];
  hiddenWidgets: WidgetId[];
};

const DEFAULT_PREFS: DashboardPrefs = {
  kpiOrder: [...DEFAULT_KPI_ORDER],
  hiddenKpis: [],
  widgetOrder: [...DEFAULT_WIDGET_ORDER],
  hiddenWidgets: [],
};

function dayDiff(date: unknown): number | null {
  if (!date) return null;
  const d = new Date(date instanceof Date ? date.toISOString() : (date as string));
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - t.getTime()) / MS_DAY);
}

function vaccinationDueTarget(record: any): { kind: "next" | "booster"; diff: number } | null {
  const candidates = [
    { kind: "next" as const, diff: dayDiff(record?.nextDueDate) },
    { kind: "booster" as const, diff: dayDiff(record?.boosterDueDate) },
  ].filter((item): item is { kind: "next" | "booster"; diff: number } => item.diff != null);

  if (candidates.length === 0) return null;
  return candidates.reduce((earliest, item) => item.diff < earliest.diff ? item : earliest);
}

function fmtShortDate(d: unknown) {
  if (!d) return "--";
  const x = new Date(d as string);
  return Number.isNaN(x.getTime()) ? "--" : x.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function uniqueOrder<T extends string>(value: unknown, defaults: readonly T[]): T[] {
  const allowed = new Set<string>(defaults);
  const fromValue = Array.isArray(value) ? value.filter((id): id is T => typeof id === "string" && allowed.has(id)) : [];
  return [...fromValue, ...defaults.filter(id => !fromValue.includes(id))];
}

function normalizePrefs(raw?: Partial<DashboardPrefs> | null): DashboardPrefs {
  const kpiOrder = uniqueOrder(raw?.kpiOrder, DEFAULT_KPI_ORDER);
  const widgetOrder = uniqueOrder(raw?.widgetOrder, DEFAULT_WIDGET_ORDER);
  const hiddenKpis = uniqueOrder(raw?.hiddenKpis, DEFAULT_KPI_ORDER).filter(id => raw?.hiddenKpis?.includes(id));
  const hiddenWidgets = uniqueOrder(raw?.hiddenWidgets, DEFAULT_WIDGET_ORDER).filter(id => raw?.hiddenWidgets?.includes(id));
  return { kpiOrder, hiddenKpis, widgetOrder, hiddenWidgets };
}

function parsePrefs(raw?: string | null): DashboardPrefs | null {
  if (!raw) return null;
  try {
    return normalizePrefs(JSON.parse(raw));
  } catch {
    return null;
  }
}

function loadDashboardPrefs(): DashboardPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  return parsePrefs(window.localStorage.getItem(DASHBOARD_PREF_KEY)) ?? DEFAULT_PREFS;
}

function saveLocalDashboardPrefs(prefs: DashboardPrefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DASHBOARD_PREF_KEY, JSON.stringify(prefs));
}

function moveItem<T extends string>(list: T[], id: T, direction: -1 | 1): T[] {
  const index = list.indexOf(id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return list;
  const next = [...list];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function CustomizeDashboardDialog({
  open,
  onOpenChange,
  prefs,
  onChange,
  kpiLabels,
  widgetLabels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: DashboardPrefs;
  onChange: (prefs: DashboardPrefs) => void;
  kpiLabels: Record<KpiId, string>;
  widgetLabels: Record<WidgetId, string>;
}) {
  const { t } = useTranslation();
  const setPrefs = (patch: Partial<DashboardPrefs>) => onChange(normalizePrefs({ ...prefs, ...patch }));
  const toggleKpi = (id: KpiId) => {
    const hidden = prefs.hiddenKpis.includes(id)
      ? prefs.hiddenKpis.filter(item => item !== id)
      : [...prefs.hiddenKpis, id];
    setPrefs({ hiddenKpis: hidden });
  };
  const toggleWidget = (id: WidgetId) => {
    const hidden = prefs.hiddenWidgets.includes(id)
      ? prefs.hiddenWidgets.filter(item => item !== id)
      : [...prefs.hiddenWidgets, id];
    setPrefs({ hiddenWidgets: hidden });
  };

  const renderRow = <T extends KpiId | WidgetId>({
    id,
    label,
    hidden,
    onToggle,
    onMove,
    first,
    last,
  }: {
    id: T;
    label: string;
    hidden: boolean;
    onToggle: () => void;
    onMove: (direction: -1 | 1) => void;
    first: boolean;
    last: boolean;
  }) => (
    <div key={id} className={cn("flex items-center justify-between gap-3 border-b border-border py-2 last:border-0", hidden && "opacity-60")}>
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-start focus-visible:outline-2 focus-visible:outline-ring"
      >
        {hidden ? <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : <Eye className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
        <span className="truncate text-sm font-medium">{label}</span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="outline" size="icon-sm" disabled={first} aria-label={t("common.moveUp", "Move up")} onClick={() => onMove(-1)}>
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="icon-sm" disabled={last} aria-label={t("common.moveDown", "Move down")} onClick={() => onMove(1)}>
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-info-soft text-info-soft-foreground">
              <Settings2 className="h-4 w-4" aria-hidden="true" />
            </span>
            {t("dashboard.customize", "Customize dashboard")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-3">
            <h3 className="text-sm font-semibold">{t("dashboard.kpiCards", "KPI Cards")}</h3>
            <div className="mt-2">
              {prefs.kpiOrder.map((id, index) =>
                renderRow({
                  id,
                  label: kpiLabels[id],
                  hidden: prefs.hiddenKpis.includes(id),
                  onToggle: () => toggleKpi(id),
                  onMove: direction => setPrefs({ kpiOrder: moveItem(prefs.kpiOrder, id, direction) }),
                  first: index === 0,
                  last: index === prefs.kpiOrder.length - 1,
                })
              )}
            </div>
          </section>
          <section className="rounded-xl border border-border bg-card p-3">
            <h3 className="text-sm font-semibold">{t("dashboard.actionWidgets", "Action Widgets")}</h3>
            <div className="mt-2">
              {prefs.widgetOrder.map((id, index) =>
                renderRow({
                  id,
                  label: widgetLabels[id],
                  hidden: prefs.hiddenWidgets.includes(id),
                  onToggle: () => toggleWidget(id),
                  onMove: direction => setPrefs({ widgetOrder: moveItem(prefs.widgetOrder, id, direction) }),
                  first: index === 0,
                  last: index === prefs.widgetOrder.length - 1,
                })
              )}
            </div>
          </section>
        </div>
        <DialogFooter className="border-t border-border bg-card px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onChange(DEFAULT_PREFS)}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t("common.reset", "Reset")}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>{t("common.done", "Done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * New Dashboard = daily farm action center. It keeps reporting visible, but puts
 * high-frequency actions and operational queues first for staff speed.
 */
export default function NewDashboard() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { fmt } = useCurrency();
  const { ownerParam } = useOwnerFilter();
  const perms = usePermissions();
  const { user, setPreference, isLoaded: prefsLoaded, isError: prefsApiError } = usePreferences();

  const [prefs, setPrefs] = useState<DashboardPrefs>(() => loadDashboardPrefs());
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [weighOpen, setWeighOpen] = useState(false);
  const [bulkSaleOpen, setBulkSaleOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);

  useEffect(() => {
    const serverPrefs = parsePrefs((user as Record<string, string | null | undefined>)[PREF_SERVER_KEY]);
    if (!serverPrefs) return;
    setPrefs(serverPrefs);
    saveLocalDashboardPrefs(serverPrefs);
  }, [user]);

  const updatePrefs = (next: DashboardPrefs) => {
    const normalized = normalizePrefs(next);
    setPrefs(normalized);
    saveLocalDashboardPrefs(normalized);
    if (prefsLoaded && !prefsApiError) {
      setPreference(PREF_SERVER_KEY, JSON.stringify(normalized));
    }
  };

  const { data: kpis, isLoading: kpisLoading } = trpc.dashboard.getKPIs.useQuery(
    { ownerId: ownerParam },
    { enabled: perms.can("dashboard", "view") }
  );
  const { data: feedStock } = trpc.feed.getStockStatus.useQuery(undefined, { enabled: perms.can("feed", "view") });
  const { data: upcomingVaccinations } = trpc.vaccination.getUpcomingVaccinations.useQuery(
    { days: 30 }, { enabled: perms.can("vaccinations", "view") }
  );
  const { data: pregnancyAlerts } = trpc.pregnancy.getUpcoming.useQuery(
    { days: 30 }, { enabled: perms.can("pregnancy", "view") }
  );
  const { data: unpaidSales } = trpc.sales.list.useQuery(
    { outstandingOnly: true, ownerId: ownerParam }, { enabled: perms.can("sales", "view") }
  );
  const { data: animals } = trpc.animals.list.useQuery(
    { isActive: true, ownerId: ownerParam },
    { enabled: perms.can("animals", "view") }
  );
  const { data: lambsToPromote } = trpc.breeding.listLambing.useQuery(
    { isPromoted: false, ownerId: ownerParam },
    { enabled: perms.can("breeding", "view") }
  );
  const { data: auditRows } = trpc.audit.list.useQuery(
    {},
    { enabled: perms.can("audit", "view") }
  );
  const trendRange = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }, []);
  const { data: expenseTrend } = trpc.dashboard.getExpenseTrend.useQuery(
    { fromDate: trendRange.from, toDate: trendRange.to, ownerId: ownerParam },
    { enabled: perms.can("dashboard", "view") }
  );
  const { data: salesTrend } = trpc.dashboard.getSalesTrend.useQuery(
    { fromDate: trendRange.from, toDate: trendRange.to, ownerId: ownerParam },
    { enabled: perms.can("dashboard", "view") }
  );
  const { data: headCountByCategory } = trpc.dashboard.getHeadCountByCategory.useQuery(
    { ownerId: ownerParam },
    { enabled: perms.can("dashboard", "view") }
  );

  const activeAnimals = useMemo(() => ((animals as any[]) ?? []).filter(a => a?.animal?.id), [animals]);

  const pregnancyItems: QueueItem[] = useMemo(
    () =>
      ((pregnancyAlerts?.due as any[]) ?? [])
        .map(p => ({ p, d: dayDiff(p.expectedDueDate) }))
        .sort((a, b) => (a.d ?? 999) - (b.d ?? 999))
        .map(({ p, d }) => ({
          id: p.id ?? p.animalId,
          title: p.animalCode ?? p.animalId ?? `#${p.id}`,
          meta:
            d == null ? "--" : d < 0 ? `${t("dashboard.overdue", "Overdue")} ${-d}d` : `${t("dashboard.dueIn", "Due in")} ${d}d`,
          href: "/pregnancy",
          action: d != null && d < 0 ? <StatusBadge tone="danger">{t("dashboard.overdue", "Overdue")}</StatusBadge> : undefined,
        })),
    [pregnancyAlerts, t]
  );

  const vaccinationItems: QueueItem[] = useMemo(
    () =>
      ((upcomingVaccinations as any[]) ?? [])
        .map(v => ({ v, due: vaccinationDueTarget(v) }))
        .filter(({ due }) => due != null && due.diff <= 7)
        .sort((a, b) => (a.due?.diff ?? 999) - (b.due?.diff ?? 999))
        .map(({ v, due }) => {
          const d = due?.diff ?? null;
          const doseLabel = due?.kind === "booster"
            ? t("vaccine.booster", "Booster")
            : t("vaccine.nextDue", "Next due");
          return {
            id: `${v.animalId}-${v.vaccineId ?? v.vaccineName}-${due?.kind ?? "due"}`,
            title: `${v.animalCode ?? v.animalId} · ${v.vaccineName ?? ""}`,
            meta: d == null ? "--" : `${doseLabel} · ${d < 0 ? `${t("dashboard.overdue", "Overdue")} ${-d}d` : `${t("dashboard.dueIn", "Due in")} ${d}d`}`,
            href: "/vaccinations",
            action: d != null && d < 0 ? <StatusBadge tone="danger">{t("dashboard.overdue", "Overdue")}</StatusBadge> : undefined,
          };
        }),
    [upcomingVaccinations, t]
  );

  const feedItems: QueueItem[] = useMemo(
    () =>
      ((feedStock as any[]) ?? [])
        .filter(s => s.status === "critical" || s.status === "low")
        .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999))
        .map(s => ({
          id: s.feedItemId,
          title: s.feedItemName,
          meta: `${parseFloat(s.stockOnHand).toFixed(1)} ${s.unit} · ${s.daysRemaining === 999 ? "∞" : `${s.daysRemaining}d ${t("dashboard.left", "left")}`}`,
          action: (
            <button
              type="button"
              onClick={() => setLocation("/feed")}
              className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t("feed.reorder", "Reorder")}
            </button>
          ),
        })),
    [feedStock, t, setLocation]
  );

  const unpaidItems: QueueItem[] = useMemo(
    () =>
      ((unpaidSales as any[]) ?? []).map(s => ({
        id: s.id,
        title: s.buyer || s.animalCode || `#${s.id}`,
        meta: `${t("sales.outstanding", "Outstanding")}: ${fmt(parseFloat(s.outstanding ?? s.salePrice ?? 0))}`,
        href: "/sales",
      })),
    [unpaidSales, t, fmt]
  );

  const readyItems: QueueItem[] = useMemo(
    () =>
      activeAnimals
        .filter(a => {
          const target = parseFloat(a.targetWeightKg ?? 0);
          const latest = parseFloat(a.latestWeightKg ?? a.animal?.weightAtAcquisition ?? 0);
          return target > 0 && latest >= target * 0.95;
        })
        .slice(0, 8)
        .map(a => {
          const target = parseFloat(a.targetWeightKg ?? 0);
          const latest = parseFloat(a.latestWeightKg ?? a.animal?.weightAtAcquisition ?? 0);
          return {
            id: a.animal.id,
            title: a.animal.animalId,
            meta: `${latest.toFixed(1)} / ${target.toFixed(0)} kg · ${a.categoryName ?? ""}`,
            href: `/animals/${a.animal.id}`,
            action: latest >= target ? <StatusBadge tone="success">{t("animals.ready", "Ready")}</StatusBadge> : <StatusBadge tone="warning">{t("animals.nearTarget", "Near")}</StatusBadge>,
          };
        }),
    [activeAnimals, t]
  );

  const lambItems: QueueItem[] = useMemo(
    () =>
      ((lambsToPromote as any[]) ?? [])
        .slice(0, 8)
        .map(l => ({
          id: l.id,
          title: l.lambId ?? `#${l.id}`,
          meta: `${fmtShortDate(l.birthDate)} · ${l.birthWeightKg ? `${parseFloat(l.birthWeightKg).toFixed(1)} kg · ` : ""}${l.categoryName ?? ""}`,
          href: "/breeding",
          action: <StatusBadge tone="info" icon={false}>{t("breeding.lamb", "Lamb")}</StatusBadge>,
        })),
    [lambsToPromote, t]
  );

  const recentItems: QueueItem[] = useMemo(
    () =>
      ((auditRows as any[]) ?? [])
        .slice(0, 8)
        .map(row => ({
          id: row.id,
          title: `${row.action} · ${row.entityType}`,
          meta: `${row.userName ?? t("common.system", "System")} · ${fmtShortDate(row.createdAt)}`,
          href: "/audit",
        })),
    [auditRows, t]
  );

  const overdueVax = vaccinationItems.filter(i => i.action).length;
  const grossPnL = Number(kpis?.grossPnL ?? 0);

  const kpiLabels: Record<KpiId, string> = {
    animals: t("dashboard.activeAnimals", "Active animals"),
    revenue: t("animals.totalRevenue", "Revenue"),
    expenses: t("dashboard.totalExpenses", "Expenses"),
    pnl: t("dashboard.grossPnL", "Gross P&L"),
  };

  const widgetLabels: Record<WidgetId, string> = {
    pregnancy: t("dashboard.pregnanciesDue", "Pregnancies due"),
    vaccinations: t("dashboard.vaccinationsDue", "Vaccinations due"),
    feed: t("dashboard.criticalFeed", "Low / critical feed"),
    ready: t("dashboard.readyToSell", "Ready To Sell"),
    lambs: t("dashboard.lambsToPromote", "Lambs To Promote"),
    unpaid: t("dashboard.unpaidSales", "Unpaid sales"),
    trends: t("dashboard.trends", "Revenue & expense trend"),
    headcount: t("dashboard.headCount", "Head count by category"),
    recent: t("dashboard.recentWork", "Recent Work"),
  };

  const kpiCards: Record<KpiId, ReactNode> = {
    animals: (
      <KpiCard
        label={kpiLabels.animals}
        value={kpisLoading ? "..." : (kpis?.totalActiveHeads ?? 0)}
        icon={Leaf}
        href="/animals"
        hint={`${(kpis?.categoryBreakdown ?? []).length} ${t("common.category", "categories").toLowerCase()}`}
        tone="success"
      />
    ),
    revenue: (
      <KpiCard
        label={kpiLabels.revenue}
        value={kpisLoading ? "..." : fmt(kpis?.totalRevenue ?? 0)}
        icon={TrendingUp}
        href="/sales"
        tone="success"
      />
    ),
    expenses: (
      <KpiCard
        label={kpiLabels.expenses}
        value={kpisLoading ? "..." : fmt(kpis?.totalExpenses ?? 0)}
        icon={DollarSign}
        href="/expenses"
        hint={kpis ? `${t("feed.title", "Feed")}: ${fmt(kpis.feedExpenses ?? 0)}` : undefined}
        tone="warning"
      />
    ),
    pnl: (
      <KpiCard
        label={kpiLabels.pnl}
        value={kpisLoading ? "..." : fmt(grossPnL)}
        icon={Activity}
        href="/pnl"
        trend={kpis ? { pct: 0 } : undefined}
        tone={grossPnL < 0 ? "danger" : "info"}
      />
    ),
  };

  const widgets: Record<WidgetId, { node: ReactNode; enabled: boolean }> = {
    pregnancy: {
      enabled: perms.can("pregnancy", "view"),
      node: (
        <ActionQueue
          icon={Baby}
          title={widgetLabels.pregnancy}
          tone="warning"
          count={pregnancyItems.length}
          items={pregnancyItems}
          viewAllHref="/pregnancy"
          viewAllLabel={t("common.viewAll", "View all")}
          emptyText={t("dashboard.noPregnancies", "No pregnancies due soon")}
        />
      ),
    },
    vaccinations: {
      enabled: perms.can("vaccinations", "view"),
      node: (
        <ActionQueue
          icon={Syringe}
          title={widgetLabels.vaccinations}
          tone={overdueVax > 0 ? "danger" : "warning"}
          count={vaccinationItems.length}
          items={vaccinationItems}
          viewAllHref="/vaccinations"
          viewAllLabel={t("common.viewAll", "View all")}
          emptyText={t("dashboard.noVaccinations", "Nothing due this week")}
        />
      ),
    },
    feed: {
      enabled: perms.can("feed", "view"),
      node: (
        <ActionQueue
          icon={Wheat}
          title={widgetLabels.feed}
          tone="danger"
          count={feedItems.length}
          items={feedItems}
          viewAllHref="/feed"
          viewAllLabel={t("common.viewAll", "View all")}
          emptyText={t("dashboard.feedOk", "Stock levels healthy")}
        />
      ),
    },
    ready: {
      enabled: perms.can("animals", "view"),
      node: (
        <ActionQueue
          icon={Leaf}
          title={widgetLabels.ready}
          tone="success"
          count={readyItems.length}
          items={readyItems}
          viewAllHref="/animals?view=ready"
          viewAllLabel={t("common.viewAll", "View all")}
          emptyText={t("dashboard.noneReady", "No animals near target")}
        />
      ),
    },
    lambs: {
      enabled: perms.can("breeding", "view"),
      node: (
        <ActionQueue
          icon={Sparkles}
          title={widgetLabels.lambs}
          tone="info"
          count={lambItems.length}
          items={lambItems}
          viewAllHref="/breeding"
          viewAllLabel={t("common.viewAll", "View all")}
          emptyText={t("dashboard.noLambsToPromote", "No lambs waiting for promotion")}
        />
      ),
    },
    unpaid: {
      enabled: perms.can("sales", "view"),
      node: (
        <ActionQueue
          icon={ShoppingCart}
          title={widgetLabels.unpaid}
          tone="info"
          count={unpaidItems.length}
          items={unpaidItems}
          viewAllHref="/sales"
          viewAllLabel={t("common.viewAll", "View all")}
          emptyText={t("dashboard.noUnpaid", "All sales settled")}
        />
      ),
    },
    trends: {
      enabled: perms.can("dashboard", "view"),
      node: (
        <TrendsPanel
          title={widgetLabels.trends}
          salesTrend={(salesTrend as any[]) ?? []}
          expenseTrend={(expenseTrend as any[]) ?? []}
          fmt={fmt}
        />
      ),
    },
    headcount: {
      enabled: perms.can("dashboard", "view"),
      node: <HeadcountPanel title={widgetLabels.headcount} rows={(headCountByCategory as any[]) ?? []} />,
    },
    recent: {
      enabled: perms.can("audit", "view"),
      node: (
        <ActionQueue
          icon={ShieldCheck}
          title={widgetLabels.recent}
          tone="neutral"
          count={recentItems.length}
          items={recentItems}
          viewAllHref="/audit"
          viewAllLabel={t("common.viewAll", "View all")}
          emptyText={t("dashboard.noRecentWork", "No recent changes")}
        />
      ),
    },
  };

  const quickActions: Array<{ id: string; label: string; icon: LucideIcon; page: PermissionPage; tone: StatusTone; onClick: () => void; disabled?: boolean }> = [
    { id: "weight", label: t("weight.record", "Record Weight"), icon: Scale, page: "animals", tone: "info", onClick: () => setWeighOpen(true), disabled: activeAnimals.length === 0 },
    { id: "sale", label: t("sales.recordSale", "Record Sale"), icon: ShoppingCart, page: "sales", tone: "danger", onClick: () => setBulkSaleOpen(true), disabled: activeAnimals.length === 0 },
    { id: "expense", label: t("expenses.add", "Add Expense"), icon: DollarSign, page: "expenses", tone: "warning", onClick: () => setExpenseOpen(true) },
    { id: "animal", label: t("animals.registerAnimal", "Register Animal"), icon: Plus, page: "animals", tone: "success", onClick: () => setCreateOpen(true) },
  ];

  const visibleKpis = prefs.kpiOrder.filter(id => !prefs.hiddenKpis.includes(id));
  const visibleWidgets = prefs.widgetOrder.filter(id => !prefs.hiddenWidgets.includes(id) && widgets[id].enabled);

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("dashboard.title", "Dashboard")}
        subtitle={t("dashboard.actionCenter", "Your farm at a glance - what needs attention today")}
        actions={
          <Button type="button" variant="outline" onClick={() => setCustomizeOpen(true)}>
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            {t("dashboard.customize", "Customize")}
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {quickActions.filter(a => perms.can(a.page, "create")).map(action => (
          <button
            key={action.id}
            type="button"
            disabled={action.disabled}
            onClick={action.onClick}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3 text-start shadow-[var(--shadow-sm)] transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-55",
              action.tone === "success" && "border-success/35 hover:bg-success-soft/35",
              action.tone === "warning" && "border-warning/35 hover:bg-warning-soft/35",
              action.tone === "danger" && "border-danger/35 hover:bg-danger-soft/35",
              action.tone === "info" && "border-info/35 hover:bg-info-soft/35"
            )}
          >
            <span
              className={cn(
                "grid h-9 w-9 place-items-center rounded-lg",
                action.tone === "success" && "bg-success-soft text-success-soft-foreground",
                action.tone === "warning" && "bg-warning-soft text-warning-soft-foreground",
                action.tone === "danger" && "bg-danger-soft text-danger-soft-foreground",
                action.tone === "info" && "bg-info-soft text-info-soft-foreground"
              )}
            >
              <action.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 truncate text-sm font-semibold">{action.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {visibleKpis.map(id => <div key={id}>{kpiCards[id]}</div>)}
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t("dashboard.needsAttention", "Needs attention")}
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-2">
        {visibleWidgets.map(id => <div key={id}>{widgets[id].node}</div>)}
      </div>

      <CustomizeDashboardDialog
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        prefs={prefs}
        onChange={updatePrefs}
        kpiLabels={kpiLabels}
        widgetLabels={widgetLabels}
      />
      <WeighInSessionDialog open={weighOpen} onOpenChange={setWeighOpen} animals={activeAnimals} />
      <BulkRecordSaleDialog open={bulkSaleOpen} onOpenChange={setBulkSaleOpen} animals={activeAnimals} />
      <AnimalCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <QuickExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} />
    </div>
  );
}

const monthLabel = (m: unknown) => {
  if (!m) return "—";
  const d = new Date(`${m}-01`);
  return Number.isNaN(d.getTime()) ? String(m) : d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
};

/** Six-month revenue (bars) and expense (area) trend — one measure per plot. */
function TrendsPanel({ title, salesTrend, expenseTrend, fmt }: {
  title: string;
  salesTrend: any[];
  expenseTrend: any[];
  fmt: (n: number) => string;
}) {
  const { t } = useTranslation();
  const sales = salesTrend.map(d => ({ date: monthLabel(d.month), value: parseFloat(String(d.revenue ?? 0)) }));
  const expenses = expenseTrend.map(d => ({ date: monthLabel(d.month), value: parseFloat(String(d.total ?? 0)) }));
  const tooltipStyle = { borderRadius: 8, fontSize: 12, background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" } as const;

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </h3>
      {sales.length === 0 && expenses.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("common.noData", "No data")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t("dashboard.salesTrend", "Sales revenue / month")}</p>
            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sales}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={34} />
                  <Tooltip formatter={(v: number) => [fmt(v), t("incomeStatement.revenue", "Revenue")]} contentStyle={tooltipStyle} />
                  <Bar dataKey="value" fill="var(--success)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t("dashboard.expenseTrend", "Expenses / month")}</p>
            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={expenses}>
                  <defs>
                    <linearGradient id="dashExpenseGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--warning)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--warning)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={34} />
                  <Tooltip formatter={(v: number) => [fmt(v), t("dashboard.totalExpenses", "Expenses")]} contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="value" stroke="var(--warning)" fill="url(#dashExpenseGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Active head count by category as labeled horizontal bars (replaces Old's pie). */
function HeadcountPanel({ title, rows }: { title: string; rows: any[] }) {
  const { t } = useTranslation();
  const data = rows
    .map(r => ({ name: r.category ?? t("common.noData", "No data"), count: Number(r.count ?? 0) }))
    .sort((a, b) => b.count - a.count);
  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Leaf className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </h3>
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("common.noData", "No data")}</p>
      ) : (
        <ul className="space-y-2">
          {data.map(d => (
            <li key={d.name} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 text-sm">
              <span className="truncate text-muted-foreground" title={d.name}>{d.name}</span>
              <span className="h-3 overflow-hidden rounded-full bg-surface">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (d.count / max) * 100)}%` }} />
              </span>
              <span className="font-medium tabular-nums">{d.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
