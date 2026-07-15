import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCurrency } from "@/hooks/useCurrency";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
import { AnimalCostDetailsDialog } from "@/components/AnimalCostDetailsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, BarChart3, Banknote, Leaf, ReceiptText, Search, TrendingDown, TrendingUp, Wheat } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { DataTable, type Column } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";

/**
 * New P&L. Same getAllPnL query + owner scope as Old with the same realised
 * semantics: active animals have no revenue yet, so their net P&L is shown as
 * "Ongoing" and headline KPIs split realised (closed) from running (active)
 * money. Read-only review (brief priority #5).
 */
export default function NewPnL() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { fmt } = useCurrency();
  const { ownerParam } = useOwnerFilter();
  const [search, setSearch] = useState("");
  const [filterSpecies, setFilterSpecies] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedCostRow, setSelectedCostRow] = useState<any | null>(null);

  const { data: pnl, isLoading } = trpc.animals.getAllPnL.useQuery({
    ownerId: ownerParam,
    speciesId: filterSpecies !== "all" ? Number(filterSpecies) : undefined,
    categoryId: filterCategory !== "all" ? Number(filterCategory) : undefined,
  });
  const { data: species } = trpc.config.getSpecies.useQuery();
  const { data: categories } = trpc.config.getCategories.useQuery();

  const allStatuses = useMemo(
    () => Array.from(new Set(((pnl as any[]) ?? []).map(a => a.statusName).filter(Boolean))) as string[],
    [pnl]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ((pnl as any[]) ?? []).filter(a => {
      if (q && !a.animalCode?.toLowerCase().includes(q)) return false;
      if (filterStatus !== "all" && a.statusName !== filterStatus) return false;
      return true;
    });
  }, [pnl, search, filterStatus]);

  const stats = useMemo(() => {
    const active = rows.filter(a => a.isActive);
    const closed = rows.filter(a => !a.isActive);
    const totalRevenue = closed.reduce((s, a) => s + (a.revenue ?? 0), 0);
    const totalCost = closed.reduce((s, a) => s + (a.totalCost ?? 0), 0);
    const capitalOnHoof = active.reduce((s, a) => s + (a.purchaseCost ?? 0), 0);
    const operatingCostActive = active.reduce((s, a) => s + ((a.totalCost ?? 0) - (a.purchaseCost ?? 0)), 0);
    return {
      activeCount: active.length,
      closedCount: closed.length,
      totalRevenue,
      realisedNet: totalRevenue - totalCost,
      profitableCount: closed.filter(a => a.netPnL > 0).length,
      lossCount: closed.filter(a => a.netPnL < 0).length,
      runningCost: active.reduce((s, a) => s + (a.totalCost ?? 0), 0),
      runningCostMonthly: active.reduce((s, a) => s + (a.costPerMonth ?? 0), 0),
      feedCostMonthly: active.reduce((s, a) => s + (a.feedCostPerMonth ?? 0), 0),
      capitalOnHoof,
      animalOperatingCost: rows.reduce((s, a) => s + (a.animalOperatingCost ?? 0), 0),
      // Revenue realised + capital on hoof - operating spend on the active herd
      currentAccountValue: totalRevenue + capitalOnHoof - operatingCostActive,
    };
  }, [rows]);

  const money = (n: number) => <span className="tabular-nums">{fmt(n)}</span>;
  const cost = (n: number) => (n > 0 ? money(n) : <span className="text-muted-foreground">—</span>);
  const columns: Column<any>[] = [
    { id: "animal", header: t("animals.animalId", "Animal"), cell: r => <span className="font-medium">{r.animalCode}</span>, sortValue: r => r.animalCode, primary: true, mobileLabel: t("animals.animalId", "Animal") },
    { id: "species", header: t("common.species", "Species"), cell: r => r.speciesName ?? "—", sortValue: r => r.speciesName, hideable: true, defaultHidden: true, mobileLabel: t("common.species", "Species") },
    { id: "category", header: t("animals.category", "Category"), cell: r => r.categoryName ?? "—", sortValue: r => r.categoryName, hideable: true, mobileLabel: t("animals.category", "Category") },
    { id: "status", header: t("animals.status", "Status"), cell: r => <StatusBadge tone={r.isActive ? "success" : "neutral"}>{r.statusName}</StatusBadge>, sortValue: r => r.statusName, hideable: true, mobileLabel: t("animals.status", "Status") },
    { id: "days", header: t("pnl.daysOnFarm", "Days"), cell: r => r.daysOnFarm ?? 0, sortValue: r => r.daysOnFarm, align: "end", hideable: true, defaultHidden: true, mobileLabel: t("pnl.daysOnFarm", "Days") },
    { id: "purchase", header: t("animals.purchaseCost", "Purchase"), cell: r => cost(Number(r.purchaseCost ?? 0)), sortValue: r => Number(r.purchaseCost ?? 0), align: "end", hideable: true, defaultHidden: true, mobileLabel: t("animals.purchaseCost", "Purchase") },
    { id: "feed", header: t("pnl.feedCost", "Feed"), cell: r => cost(Number(r.feedCost ?? 0)), sortValue: r => Number(r.feedCost ?? 0), align: "end", hideable: true, defaultHidden: true, mobileLabel: t("pnl.feedCost", "Feed") },
    { id: "directExp", header: t("pnl.directExp", "Direct exp."), cell: r => cost(Number(r.directExpenseTotal ?? 0)), sortValue: r => Number(r.directExpenseTotal ?? 0), align: "end", hideable: true, defaultHidden: true, mobileLabel: t("pnl.directExp", "Direct exp.") },
    { id: "catExp", header: t("pnl.catExp", "Category exp."), cell: r => cost(Number(r.categoryExpenseAllocation ?? 0)), sortValue: r => Number(r.categoryExpenseAllocation ?? 0), align: "end", hideable: true, defaultHidden: true, mobileLabel: t("pnl.catExp", "Category exp.") },
    { id: "herdExp", header: t("pnl.herdExp", "Herd exp."), cell: r => cost(Number(r.herdExpenseAllocation ?? 0)), sortValue: r => Number(r.herdExpenseAllocation ?? 0), align: "end", hideable: true, defaultHidden: true, mobileLabel: t("pnl.herdExp", "Herd exp.") },
    { id: "cost", header: t("pnl.totalCost", "Cost"), cell: r => money(Number(r.totalCost ?? 0)), sortValue: r => Number(r.totalCost ?? 0), align: "end", mobileLabel: t("pnl.totalCost", "Cost") },
    { id: "revenue", header: t("pnl.revenue", "Revenue"), cell: r => (Number(r.revenue ?? 0) > 0 ? money(Number(r.revenue)) : <span className="text-muted-foreground">—</span>), sortValue: r => Number(r.revenue ?? 0), align: "end", mobileLabel: t("pnl.revenue", "Revenue") },
    {
      id: "net",
      header: t("pnl.netPnL", "Net P&L"),
      cell: r =>
        r.isActive ? (
          <span className="text-muted-foreground">{t("pnl.ongoing", "Ongoing")}</span>
        ) : (
          <span className={`font-medium tabular-nums ${Number(r.netPnL ?? 0) >= 0 ? "text-success-soft-foreground" : "text-danger-soft-foreground"}`}>{fmt(Number(r.netPnL ?? 0))}</span>
        ),
      sortValue: r => (r.isActive ? null : Number(r.netPnL ?? 0)),
      align: "end",
      mobileLabel: t("pnl.netPnL", "Net P&L"),
    },
    { id: "costDay", header: t("pnl.costDay", "Cost/day"), cell: r => money(Number(r.costPerDay ?? 0)), sortValue: r => Number(r.costPerDay ?? 0), align: "end", hideable: true, defaultHidden: true, mobileLabel: t("pnl.costDay", "Cost/day") },
    { id: "costMonth", header: t("pnl.costMonth", "Cost/month"), cell: r => money(Number(r.costPerMonth ?? 0)), sortValue: r => Number(r.costPerMonth ?? 0), align: "end", hideable: true, defaultHidden: true, mobileLabel: t("pnl.costMonth", "Cost/month") },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("nav.pnl", "Profit & Loss")}
        subtitle={t("pnl.activeClosed", "{{active}} active · {{closed}} closed", { active: stats.activeCount, closed: stats.closedCount })}
        crumbs={[{ label: t("nav.dashboard", "Dashboard"), href: "/" }, { label: t("nav.pnl", "Profit & Loss") }]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("pnl.realisedRevenue", "Realised revenue")} value={fmt(stats.totalRevenue)} icon={TrendingUp} hint={t("pnl.fromSold", "From sold animals")} />
        <KpiCard
          label={t("pnl.realisedNet", "Realised net P&L")}
          value={<span className={stats.realisedNet >= 0 ? "text-success-soft-foreground" : "text-danger-soft-foreground"}>{fmt(stats.realisedNet)}</span>}
          icon={Activity}
          hint={`${stats.profitableCount} ${t("pnl.profitShort", "profit")} · ${stats.lossCount} ${t("pnl.lossShort", "loss")}`}
        />
        <KpiCard label={t("pnl.runningCostMonth", "Running cost / month")} value={fmt(stats.runningCostMonthly)} icon={TrendingDown} hint={t("pnl.animalsOngoing", "{{count}} ongoing", { count: stats.activeCount })} />
        <KpiCard label={t("pnl.feedCostMonth", "Feed cost / month")} value={fmt(stats.feedCostMonthly)} icon={Wheat} hint={t("pnl.animalsOngoing", "{{count}} ongoing", { count: stats.activeCount })} />
        <KpiCard label={t("pnl.capitalOnHoof", "Capital on hoof")} value={fmt(stats.capitalOnHoof)} icon={Leaf} hint={t("pnl.activePurchaseCost", "Purchase cost of active herd")} />
        <KpiCard label={t("pnl.runningCostTotal", "Running cost total")} value={fmt(stats.runningCost)} icon={TrendingDown} hint={t("pnl.animalsOngoing", "{{count}} ongoing", { count: stats.activeCount })} />
        <KpiCard
          label={t("pnl.currentAccountValue", "Current account value")}
          value={<span className={stats.currentAccountValue >= 0 ? "text-success-soft-foreground" : "text-danger-soft-foreground"}>{fmt(stats.currentAccountValue)}</span>}
          icon={Banknote}
          hint={t("pnl.currentAccountValueSub", "Revenue + capital − operating spend")}
        />
        <KpiCard label={t("pnl.animalOperatingCost", "Animal operating cost")} value={fmt(stats.animalOperatingCost)} icon={TrendingDown} hint={t("pnl.animalOperatingCostSub", "Feed + expenses across herd")} />
      </div>

      {/* Net P&L by animal — top 20 closed, diverging around zero */}
      <PnLChart rows={rows} fmt={fmt} />

      <DataTable
        data={rows}
        columns={columns}
        rowKey={r => r.animalId}
        loading={isLoading}
        storageKey="pnl"
        onRowClick={r => setLocation(`/animals/${r.animalId}`)}
        rowActions={r => (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSelectedCostRow(r)}
            title={t("pnl.viewCostDetails", "View cost details")}
            aria-label={t("pnl.viewCostDetails", "View cost details")}
          >
            <ReceiptText className="h-4 w-4" />
          </Button>
        )}
        empty={<EmptyState icon={Activity} title={t("pnl.noAnimals", "No animals to report on")} />}
        toolbar={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                className="h-9 w-44 ps-9"
                placeholder={t("pnl.searchPlaceholder", "Search animal ID…")}
                aria-label={t("pnl.searchPlaceholder", "Search animal ID")}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterSpecies} onValueChange={v => { setFilterSpecies(v); setFilterCategory("all"); }}>
              <SelectTrigger className="h-9 w-36"><SelectValue placeholder={t("animals.species", "Species")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.allSpecies", "All species")}</SelectItem>
                {((species as any[]) ?? []).map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-9 w-40"><SelectValue placeholder={t("animals.category", "Category")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pnl.allCategories", "All categories")}</SelectItem>
                {((categories as any[]) ?? [])
                  .filter(c => filterSpecies === "all" || c.speciesId === Number(filterSpecies))
                  .map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 w-40"><SelectValue placeholder={t("animals.status", "Status")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pnl.allStatus", "All statuses")}</SelectItem>
                {allStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
      />
      <AnimalCostDetailsDialog
        animal={selectedCostRow}
        open={selectedCostRow !== null}
        onOpenChange={open => { if (!open) setSelectedCostRow(null); }}
      />
    </div>
  );
}

/** Bar chart of net P&L for the top-20 closed animals, diverging by sign. */
function PnLChart({ rows, fmt }: { rows: any[]; fmt: (n: number) => string }) {
  const { t } = useTranslation();
  const closed = useMemo(
    () =>
      rows
        .filter(a => !a.isActive && a.revenue > 0)
        .sort((a, b) => b.netPnL - a.netPnL)
        .slice(0, 20)
        .map(a => ({ name: a.animalCode, netPnL: Math.round(a.netPnL) })),
    [rows]
  );
  if (closed.length === 0) return null;

  return (
    <section className="mb-4 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
        {t("pnl.netByAnimalChart", "Net P&L by animal (top 20 closed)")}
      </h2>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={closed} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} angle={-40} textAnchor="end" interval={0} height={70} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(v: number) => [fmt(v), t("pnl.netPnL", "Net P&L")]}
              contentStyle={{ borderRadius: 8, fontSize: 12, background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
            />
            <Bar dataKey="netPnL" radius={[3, 3, 0, 0]} maxBarSize={28}>
              {closed.map((d, i) => (
                <Cell key={i} fill={d.netPnL >= 0 ? "var(--success)" : "var(--danger)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
