import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarDays, Egg, Leaf, Scale, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = ["#4ade80", "#86efac", "#bbf7d0", "#d1fae5", "#6ee7b7", "#34d399"];

// ── Date range helpers ────────────────────────────────────────────────────────
type Preset = "month" | "quarter" | "year" | "custom";

function getPresetRange(preset: Preset, customFrom?: string, customTo?: string): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = fmt(now);

  if (preset === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(from), to: today };
  }
  if (preset === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const from = new Date(now.getFullYear(), q * 3, 1);
    return { from: fmt(from), to: today };
  }
  if (preset === "year") {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from: fmt(from), to: today };
  }
  // custom
  const fallbackFrom = new Date(now); fallbackFrom.setFullYear(fallbackFrom.getFullYear() - 1);
  return { from: customFrom || fmt(fallbackFrom), to: customTo || today };
}

function KPICard({
  title,
  value,
  sub,
  icon: Icon,
  trend,
  color = "text-primary",
  isLoading,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: any;
  trend?: "up" | "down" | "neutral";
  color?: string;
  isLoading?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="pt-5 pb-5">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
              <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
              {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            </div>
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
          </div>
        )}
        {trend && !isLoading && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-muted-foreground"}`}>
            {trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : trend === "down" ? <ArrowDownRight className="h-3 w-3" /> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StockStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "critical") return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">{t("dashboard.critical")}</Badge>;
  if (status === "low") return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">{t("dashboard.lowStock")}</Badge>;
  return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">{t("dashboard.adequate")}</Badge>;
}

const PRESET_LABELS: Record<Preset, string> = {
  month: "This Month",
  quarter: "This Quarter",
  year: "This Year",
  custom: "Custom Range",
};

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const [filterSpecies, setFilterSpecies] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterGroup, setFilterGroup] = useState<string>("all");

  // Date range state
  const [preset, setPreset] = useState<Preset>("year");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [pendingFrom, setPendingFrom] = useState<string>("");
  const [pendingTo, setPendingTo] = useState<string>("");

  const dateRange = useMemo(
    () => getPresetRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const { data: kpis, isLoading: kpisLoading } = trpc.dashboard.getKPIs.useQuery({
    fromDate: dateRange.from,
    toDate: dateRange.to,
    speciesId: filterSpecies !== "all" ? Number(filterSpecies) : undefined,
    categoryId: filterCategory !== "all" ? Number(filterCategory) : undefined,
    groupId: filterGroup !== "all" ? Number(filterGroup) : undefined,
  });

  // Feed stock - use shared feed.getStockStatus so it updates when Feed page changes stock
  const { data: feedStock } = trpc.feed.getStockStatus.useQuery();
  const { data: headCountByCategory } = trpc.dashboard.getHeadCountByCategory.useQuery();

  const { data: expenseTrend } = trpc.dashboard.getExpenseTrend.useQuery({
    fromDate: dateRange.from,
    toDate: dateRange.to,
  });
  const { data: salesTrend } = trpc.dashboard.getSalesTrend.useQuery({
    fromDate: dateRange.from,
    toDate: dateRange.to,
  });

  const { data: species } = trpc.config.getSpecies.useQuery();
  const { data: categories } = trpc.config.getCategories.useQuery();
  const { data: groups } = trpc.config.getGroups.useQuery();

  const locale = i18n.language === "ar" ? "ar-EG" : "en-EG";
  const fmt = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(v);

  const criticalAlerts = (feedStock ?? []).filter((s: any) => s.status === "critical").length;
  const lowAlerts = (feedStock ?? []).filter((s: any) => s.status === "low").length;

  const presetLabel = preset === "custom"
    ? `${customFrom || "?"} → ${customTo || "?"}`
    : PRESET_LABELS[preset];

  function applyCustomRange() {
    if (pendingFrom && pendingTo) {
      setCustomFrom(pendingFrom);
      setCustomTo(pendingTo);
      setPreset("custom");
      setPopoverOpen(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date().toLocaleDateString(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        {/* Filters Row */}
        <div className="flex gap-2 flex-wrap items-center">
          {/* Date Range Preset Picker */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 bg-background">
                <CalendarDays className="h-3.5 w-3.5" />
                {presetLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 space-y-3" align="end">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date Range</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(["month", "quarter", "year"] as Preset[]).map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={preset === p ? "default" : "outline"}
                    className="text-xs h-7"
                    onClick={() => { setPreset(p); setPopoverOpen(false); }}
                  >
                    {PRESET_LABELS[p]}
                  </Button>
                ))}
              </div>
              <div className="border-t pt-2 space-y-2">
                <p className="text-xs font-medium">Custom Range</p>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input
                    type="date"
                    className="h-7 text-xs"
                    value={pendingFrom}
                    onChange={(e) => setPendingFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input
                    type="date"
                    className="h-7 text-xs"
                    value={pendingTo}
                    onChange={(e) => setPendingTo(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full h-7 text-xs"
                  disabled={!pendingFrom || !pendingTo}
                  onClick={applyCustomRange}
                >
                  Apply Custom Range
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Species / Category / Group filters */}
          <Select value={filterSpecies} onValueChange={setFilterSpecies}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder={t("common.species")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")} {t("common.species")}</SelectItem>
              {(species ?? []).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder={t("common.category")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")} {t("common.category")}</SelectItem>
              {(categories ?? []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterGroup} onValueChange={setFilterGroup}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder={t("common.group")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")} {t("common.group")}</SelectItem>
              {(groups ?? []).map((g: any) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Alerts Banner */}
      {(criticalAlerts > 0 || lowAlerts > 0) && (
        <div className={`flex items-center gap-3 p-3 rounded-lg border ${criticalAlerts > 0 ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">
            {criticalAlerts > 0 && `${criticalAlerts} ${t("dashboard.critical").toLowerCase()}. `}
            {lowAlerts > 0 && `${lowAlerts} ${t("dashboard.lowStock").toLowerCase()}.`}
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title={t("dashboard.activeAnimals")}
          value={kpis?.totalActiveHeads ?? 0}
          sub={`${(kpis?.categoryBreakdown ?? []).length} ${t("common.category").toLowerCase()}`}
          icon={Leaf}
          isLoading={kpisLoading}
        />
        <KPICard
          title={t("dashboard.netPnL")}
          value={fmt(kpis?.grossPnL ?? 0)}
          sub={t("incomeStatement.revenue") + " - " + t("incomeStatement.expenses")}
          icon={Egg}
          color={(kpis?.grossPnL ?? 0) >= 0 ? "text-green-600" : "text-red-600"}
          isLoading={kpisLoading}
        />
        <KPICard
          title={t("dashboard.totalExpenses")}
          value={fmt(kpis?.totalExpenses ?? 0)}
          sub={kpis ? `Feed: ${fmt(kpis.feedExpenses ?? 0)} · Other: ${fmt(kpis.otherExpenses ?? 0)}` : ""}
          icon={Scale}
          color="text-red-600"
          isLoading={kpisLoading}
        />
        <KPICard
          title="Cost / Head / Day"
          value={kpis ? `EGP ${(kpis.costPerHeadPerDay ?? 0).toFixed(2)}` : "—"}
          sub={`${kpis?.totalActiveHeads ?? 0} heads · ${Math.ceil((new Date(dateRange.to).getTime() - new Date(dateRange.from).getTime()) / 86400000)} days`}
          icon={TrendingUp}
          color="text-amber-600"
          isLoading={kpisLoading}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Head Count by Category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("dashboard.headCount")}</CardTitle>
          </CardHeader>
          <CardContent>
            {(headCountByCategory ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={(headCountByCategory ?? []).map((d: any) => ({ name: d.category ?? t("common.noData"), value: d.count }))}
                    cx="50%"
                    cy="45%"
                    innerRadius={45}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {(headCountByCategory ?? []).map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [v, name]} />
                  <Legend
                    iconType="circle"
                    iconSize={7}
                    wrapperStyle={{ fontSize: "10px", lineHeight: "16px", paddingTop: "4px" }}
                    formatter={(value: string) => value.length > 12 ? value.slice(0, 12) + "…" : value}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                {t("common.noData")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expense Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              {t("dashboard.recentExpenses")} — {presetLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(expenseTrend ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={(expenseTrend ?? []).map((d: any) => ({
                  date: d.month ? new Date(d.month + "-01").toLocaleDateString(locale, { month: "short", year: "2-digit" }) : "—",
                  amount: parseFloat(String(d.total ?? 0)),
                }))}>
                  <defs>
                    <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [fmt(v), t("dashboard.totalExpenses")]} />
                  <Area type="monotone" dataKey="amount" stroke="hsl(var(--primary))" fill="url(#expenseGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                {t("common.noData")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sales Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              {t("incomeStatement.salesRevenue")} — {presetLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(salesTrend ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={(salesTrend ?? []).map((d: any) => ({
                  date: d.month ? new Date(d.month + "-01").toLocaleDateString(locale, { month: "short", year: "2-digit" }) : "—",
                  revenue: parseFloat(String(d.revenue ?? 0)),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [fmt(v), t("incomeStatement.revenue")]} />
                  <Bar dataKey="revenue" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                {t("common.noData")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Feed Stock Status — ALWAYS UNFILTERED */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">{t("dashboard.feedStock")}</CardTitle>
            <Badge variant="outline" className="text-xs">{t("dashboard.feedStockNote")}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("feed.feedItem")}</TableHead>
                  <TableHead>{t("feed.currentStock")}</TableHead>
                  <TableHead>{t("common.type")}</TableHead>
                  <TableHead>{t("feed.dailyConsumption")}</TableHead>
                  <TableHead>{t("feed.daysRemaining")}</TableHead>
                  <TableHead>Reorder Level</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(feedStock ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t("common.noData")}
                    </TableCell>
                  </TableRow>
                ) : (
                  (feedStock ?? []).map((item: any) => (
                    <TableRow key={item.feedItemId} className={item.status === "critical" ? "bg-red-50/50" : item.status === "low" ? "bg-amber-50/50" : ""}>
                      <TableCell className="font-medium">{item.feedItemName}</TableCell>
                      <TableCell className="font-semibold">{parseFloat(item.adjustedStock ?? item.stockOnHand).toFixed(1)}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell>{parseFloat(item.dailyUsage ?? 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <span className={`font-medium ${item.daysRemaining < 7 ? "text-red-600" : item.daysRemaining < 14 ? "text-amber-600" : "text-green-600"}`}>
                          {item.daysRemaining === 999 ? "∞" : item.daysRemaining}
                        </span>
                      </TableCell>
                      <TableCell>{item.reorderLevel ?? "—"}</TableCell>
                      <TableCell><StockStatusBadge status={item.status} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
