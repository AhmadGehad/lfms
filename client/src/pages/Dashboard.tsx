import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Egg, Leaf, Scale, TrendingUp } from "lucide-react";
import { useState } from "react";
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
            <div className={`p-2 rounded-lg bg-primary/10`}>
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

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const [filterSpecies, setFilterSpecies] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterGroup, setFilterGroup] = useState<string>("all");

  const { data: kpis, isLoading: kpisLoading } = trpc.dashboard.getKPIs.useQuery({
    speciesId: filterSpecies !== "all" ? Number(filterSpecies) : undefined,
    categoryId: filterCategory !== "all" ? Number(filterCategory) : undefined,
    groupId: filterGroup !== "all" ? Number(filterGroup) : undefined,
  });

  // Feed stock is ALWAYS unfiltered per business rules
  const { data: feedStock } = trpc.dashboard.getFeedStockStatus.useQuery();
  const { data: headCountByCategory } = trpc.dashboard.getHeadCountByCategory.useQuery();
  const { data: expenseTrend } = trpc.dashboard.getExpenseTrend.useQuery({
    fromDate: new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0],
    toDate: new Date().toISOString().split("T")[0],
  });
  const { data: salesTrend } = trpc.dashboard.getSalesTrend.useQuery({
    fromDate: new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0],
    toDate: new Date().toISOString().split("T")[0],
  });

  const { data: species } = trpc.config.getSpecies.useQuery();
  const { data: categories } = trpc.config.getCategories.useQuery();
  const { data: groups } = trpc.config.getGroups.useQuery();

  const locale = i18n.language === "ar" ? "ar-EG" : "en-EG";
  const fmt = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(v);

  const criticalAlerts = (feedStock ?? []).filter((s: any) => s.status === "critical").length;
  const lowAlerts = (feedStock ?? []).filter((s: any) => s.status === "low").length;

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
        {/* Additive Filters */}
        <div className="flex gap-2 flex-wrap">
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
          title={t("animals.totalRevenue")}
          value={fmt(kpis?.totalRevenue ?? 0)}
          sub={t("common.sold")}
          icon={TrendingUp}
          color="text-green-600"
          isLoading={kpisLoading}
        />
        <KPICard
          title={t("dashboard.totalExpenses")}
          value={fmt(kpis?.totalExpenses ?? 0)}
          sub={t("common.total")}
          icon={Scale}
          color="text-red-600"
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
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {(headCountByCategory ?? []).map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [v, name]} />
                  <Legend iconType="circle" iconSize={8} />
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
            <CardTitle className="text-sm font-semibold">{t("dashboard.recentExpenses")} (90 {t("common.perDay").replace("/", "")})</CardTitle>
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
            <CardTitle className="text-sm font-semibold">{t("incomeStatement.salesRevenue")} (90 {t("common.perDay").replace("/", "")})</CardTitle>
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
                      <TableCell className="font-semibold">{parseFloat(item.stockOnHand).toFixed(1)}</TableCell>
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
