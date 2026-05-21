import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Activity, BarChart3, Search, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function PnL() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filterSpecies, setFilterSpecies] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: pnlData, isLoading } = trpc.animals.getAllPnL.useQuery({
    speciesId: filterSpecies !== "all" ? Number(filterSpecies) : undefined,
    categoryId: filterCategory !== "all" ? Number(filterCategory) : undefined,
  });
  const { data: species } = trpc.config.getSpecies.useQuery();
  const { data: categories } = trpc.config.getCategories.useQuery();

  const fmt = (v: number) =>
    new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(v);

  // Collect unique status names from data for the filter dropdown
  const allStatuses = Array.from(new Set((pnlData ?? []).map((a: any) => a.statusName).filter(Boolean))) as string[];

  const filtered = (pnlData ?? []).filter((a: any) => {
    if (search && !a.animalCode?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus !== "all" && a.statusName !== filterStatus) return false;
    return true;
  });

  // For active animals: revenue=0 so netPnL = -totalCost (misleading as "loss")
  // Show as "Ongoing" with neutral color; only show profit/loss for inactive (sold/dead) animals
  const getPnLDisplay = (a: any) => {
    if (a.isActive) return { label: "Ongoing", color: "text-muted-foreground", icon: null };
    if (a.netPnL > 0) return { label: fmt(a.netPnL), color: "text-green-600", icon: "up" };
    return { label: fmt(a.netPnL), color: "text-red-600", icon: "down" };
  };

  // Summary stats — only count inactive (sold/dead) animals for P&L totals
  const closedAnimals = filtered.filter((a: any) => !a.isActive);
  const totalRevenue = closedAnimals.reduce((s: number, a: any) => s + (a.revenue ?? 0), 0);
  const totalCost = closedAnimals.reduce((s: number, a: any) => s + (a.totalCost ?? 0), 0);
  const totalNetPnL = totalRevenue - totalCost;
  const profitableCount = closedAnimals.filter((a: any) => a.netPnL > 0).length;
  const lossCount = closedAnimals.filter((a: any) => a.netPnL < 0).length;
  const activeCount = filtered.filter((a: any) => a.isActive).length;
  const runningCost = filtered.filter((a: any) => a.isActive).reduce((s: number, a: any) => s + (a.totalCost ?? 0), 0);

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          {t("nav.pnl") || "P&L per Animal"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Lifetime profitability for each animal</p>
      </div>

      {/* Summary cards */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total Animals</p>
              <p className="text-xl sm:text-2xl font-bold">{filtered.length}</p>
              <p className="text-xs text-muted-foreground mt-1">{activeCount} active · {closedAnimals.length} closed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Realised Revenue</p>
              <p className="text-xl sm:text-2xl font-bold text-green-600">{fmt(totalRevenue)}</p>
              <p className="text-xs text-muted-foreground mt-1">From sold animals</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Running Cost (Active)</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-600">{fmt(runningCost)}</p>
              <p className="text-xs text-muted-foreground mt-1">{activeCount} animals ongoing</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Realised Net P&L</p>
              <p className={`text-xl sm:text-2xl font-bold ${totalNetPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
                {fmt(totalNetPnL)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {profitableCount} profitable · {lossCount} at loss
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by animal ID..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterSpecies} onValueChange={(v) => { setFilterSpecies(v); setFilterCategory("all"); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Species" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Species</SelectItem>
            {(species ?? []).map((s: any) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {(categories ?? [])
              .filter((c: any) => filterSpecies === "all" || c.speciesId === Number(filterSpecies))
              .map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {allStatuses.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Net P&L by Animal Chart — shows top 20 best/worst performers */}
      {filtered.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              Net P&L by Animal (top 20 closed animals)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PnLChart data={filtered} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Animal ID</TableHead>
                    <TableHead>Species</TableHead>
                    <TableHead>{t("common.category")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="text-right">Days on Farm</TableHead>
                    <TableHead className="text-right">{t("animals.purchaseCost")}</TableHead>
                    <TableHead className="text-right">Feed Cost</TableHead>
                    <TableHead className="text-right">Direct Exp.</TableHead>
                    <TableHead className="text-right">Cat. Exp.</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Net P&L</TableHead>
                    <TableHead className="text-right">Cost/Day</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-12 text-muted-foreground">
                        No animals found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((a: any) => {
                      return (
                        <TableRow
                          key={a.animalId}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setLocation(`/animals/${a.animalId}`)}
                        >
                          <TableCell className="font-mono font-semibold text-primary">
                            {a.animalCode}
                          </TableCell>
                          <TableCell>{a.speciesName}</TableCell>
                          <TableCell>{a.categoryName}</TableCell>
                          <TableCell>
                            <Badge
                              className={`text-xs ${
                                a.statusName?.toLowerCase().includes("active") && a.isActive
                                  ? "bg-green-100 text-green-800 border-green-200"
                                  : a.statusName?.toLowerCase().includes("sold")
                                  ? "bg-blue-100 text-blue-800 border-blue-200"
                                  : a.statusName?.toLowerCase().includes("dead") || a.statusName?.toLowerCase().includes("death")
                                  ? "bg-gray-100 text-gray-700 border-gray-200"
                                  : a.statusName?.toLowerCase().includes("ill") || a.statusName?.toLowerCase().includes("slaughter")
                                  ? "bg-red-100 text-red-700 border-red-200"
                                  : "bg-amber-100 text-amber-800 border-amber-200"
                              }`}
                            >
                              {a.statusName ?? (a.isActive ? "Active" : "Inactive")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {a.daysOnFarm}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-red-600">
                            {a.purchaseCost > 0 ? fmt(a.purchaseCost) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-red-600">
                            {a.feedCost > 0 ? fmt(a.feedCost) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-red-600">
                            {a.directExpenseTotal > 0 ? fmt(a.directExpenseTotal) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-orange-600 text-xs">
                            {a.categoryExpenseAllocation > 0 ? fmt(a.categoryExpenseAllocation) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium text-red-600">
                            {fmt(a.totalCost)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-green-600">
                            {a.revenue > 0 ? fmt(a.revenue) : "—"}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums font-bold ${getPnLDisplay(a).color}`}>
                            <span className="flex items-center justify-end gap-1">
                              {getPnLDisplay(a).icon === "up" && <TrendingUp className="h-3 w-3" />}
                              {getPnLDisplay(a).icon === "down" && <TrendingDown className="h-3 w-3" />}
                              {getPnLDisplay(a).label}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground text-xs">
                            {fmt(a.costPerDay)}/day
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── PnL Chart — bar chart sorted by netPnL ──────────────────────────────────
function PnLChart({ data }: { data: any[] }) {
  // Take only closed animals (have revenue), sort by netPnL, show top 20
  const closed = data
    .filter((a) => !a.isActive && a.revenue > 0)
    .sort((a, b) => b.netPnL - a.netPnL)
    .slice(0, 20);

  if (closed.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No closed animals to chart yet.</p>;
  }

  const chartData = closed.map((a) => ({
    name: a.animalCode,
    netPnL: Math.round(a.netPnL),
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-40} textAnchor="end" interval={0} height={70} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            formatter={(v: number) => [`EGP ${v.toLocaleString()}`, "Net P&L"]}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="netPnL" radius={[3, 3, 0, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={d.netPnL >= 0 ? "#1D9E75" : "#E24B4A"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
