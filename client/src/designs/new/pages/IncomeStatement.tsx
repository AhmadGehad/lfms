import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useCurrency } from "@/hooks/useCurrency";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet, FileText, Printer, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";

function startOfYear() {
  return `${new Date().getFullYear()}-01-01`;
}
const today = () => new Date().toISOString().slice(0, 10);

/**
 * New Income Statement. Same getIncomeStatement query + owner scope as Old,
 * presented as clear revenue/cost/profit cards plus a per-category cost
 * breakdown, with the same print / PDF / Excel exports. Read-only financial
 * review (brief priority #5).
 */
export default function NewIncomeStatement() {
  const { t } = useTranslation();
  const { fmt } = useCurrency();
  const { ownerParam } = useOwnerFilter();
  const { canExport } = usePermissions("incomeStatement");
  const [fromDate, setFromDate] = useState(startOfYear());
  const [toDate, setToDate] = useState(today());

  const { data, isLoading } = trpc.dashboard.getIncomeStatement.useQuery({ fromDate, toDate, ownerId: ownerParam });
  const { data: ownersList } = trpc.config.getOwnerOptions.useQuery(undefined, { enabled: canExport });
  const d = data as any;
  const ownerLabel = ownerParam != null ? ((ownersList as any[]) ?? []).find(o => o.id === ownerParam)?.name ?? "" : "";
  const ownerSlug = ownerLabel ? "-" + ownerLabel.replace(/\s+/g, "_") : "";

  const handleExportPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      doc.setFontSize(20);
      doc.setTextColor(34, 85, 34);
      doc.text("Azal Farms - مزارع أزَل", 105, 20, { align: "center" });
      doc.setFontSize(14);
      doc.setTextColor(60, 60, 60);
      doc.text(t("incomeStatement.title", "Income Statement"), 105, 30, { align: "center" });
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text(`Period: ${new Date(fromDate).toLocaleDateString()} – ${new Date(toDate).toLocaleDateString()}`, 105, 38, { align: "center" });
      if (ownerLabel) doc.text(`Owner: ${ownerLabel}`, 105, 44, { align: "center" });
      doc.text(`Generated: ${new Date().toLocaleString()}`, 105, ownerLabel ? 50 : 44, { align: "center" });

      autoTable(doc, {
        startY: 55,
        head: [["REVENUE", "Amount (EGP)"]],
        body: [
          ["Animal Sales", fmt(d?.revenue?.animalSales ?? 0)],
          ["Total Revenue", fmt(d?.revenue?.total ?? 0)],
        ],
        headStyles: { fillColor: [34, 139, 34], textColor: 255, fontStyle: "bold" },
        bodyStyles: { fontSize: 10 },
        alternateRowStyles: { fillColor: [240, 255, 240] },
        columnStyles: { 1: { halign: "right" } },
        margin: { left: 20, right: 20 },
      });

      const expenseRows: [string, string][] = [
        ["Animal Purchases", fmt(d?.costs?.animalPurchases ?? 0)],
        ...(d?.costs?.feedPurchases ? ([["Feed Stock Purchases", fmt(d?.costs?.feedPurchases)]] as [string, string][]) : []),
        ...((d?.costs?.byCategory ?? []).map((cat: any) => [cat.categoryName ?? "Other", fmt(cat.total)] as [string, string])),
        ["Total Expenses", fmt(d?.costs?.total ?? 0)],
      ];
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 8,
        head: [["EXPENSES", "Amount (EGP)"]],
        body: expenseRows,
        headStyles: { fillColor: [180, 30, 30], textColor: 255, fontStyle: "bold" },
        bodyStyles: { fontSize: 10 },
        alternateRowStyles: { fillColor: [255, 245, 245] },
        columnStyles: { 1: { halign: "right" } },
        margin: { left: 20, right: 20 },
      });

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 8,
        head: [["SUMMARY", "Amount (EGP)"]],
        body: [
          ["Total Revenue", fmt(d?.revenue?.total ?? 0)],
          ["Total Expenses", fmt(d?.costs?.total ?? 0)],
          ["Gross Profit / (Loss)", fmt(d?.grossProfit ?? 0)],
          ["Profit Margin", `${(d?.profitMargin ?? 0).toFixed(1)}%`],
        ],
        headStyles: { fillColor: [50, 50, 100], textColor: 255, fontStyle: "bold" },
        bodyStyles: { fontSize: 11 },
        alternateRowStyles: { fillColor: [245, 245, 255] },
        columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
        margin: { left: 20, right: 20 },
      });

      const rc = d?.runningCostPerMonth;
      if (rc) {
        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 8,
          head: [["RUNNING COST / MONTH", "Amount (EGP)"]],
          body: [
            ["Farm-wide (general / overhead)", `${fmt(rc.farmWide)}/mo`],
            ["Animal-wide (feed + per-animal)", `${fmt(rc.animalWide)}/mo`],
            ["Total Running Cost", `${fmt(rc.total)}/mo`],
          ],
          headStyles: { fillColor: [80, 60, 30], textColor: 255, fontStyle: "bold" },
          bodyStyles: { fontSize: 11 },
          alternateRowStyles: { fillColor: [250, 247, 240] },
          columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
          margin: { left: 20, right: 20 },
        });
      }
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: "center" });
        doc.text("Azal Farms - Confidential", 20, 290);
      }
      doc.save(`azal-farms-income-statement${ownerSlug}-${fromDate}-to-${toDate}.pdf`);
      toast.success(t("incomeStatement.pdfExported", "PDF exported"));
    } catch (err) {
      console.error(err);
      toast.error(t("incomeStatement.pdfFailed", "PDF export failed"));
    }
  };

  const handleExportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const summaryData = [
        ["Azal Farms - مزارع أزَل"],
        [t("incomeStatement.title", "Income Statement")],
        [`Period: ${new Date(fromDate).toLocaleDateString()} – ${new Date(toDate).toLocaleDateString()}`],
        ...(ownerLabel ? [[`Owner: ${ownerLabel}`]] : []),
        [`Generated: ${new Date().toLocaleString()}`],
        [],
        ["REVENUE", "Amount (EGP)"],
        ["Animal Sales", d?.revenue?.animalSales ?? 0],
        ["Total Revenue", d?.revenue?.total ?? 0],
        [],
        ["EXPENSES", "Amount (EGP)"],
        ["Animal Purchases", d?.costs?.animalPurchases ?? 0],
        ...((d?.costs?.byCategory ?? []).map((cat: any) => [cat.categoryName ?? "Other", cat.total])),
        ["Total Expenses", d?.costs?.total ?? 0],
        [],
        ["SUMMARY", "Amount (EGP)"],
        ["Total Revenue", d?.revenue?.total ?? 0],
        ["Total Expenses", d?.costs?.total ?? 0],
        ["Gross Profit / (Loss)", d?.grossProfit ?? 0],
        ["Profit Margin (%)", `${(d?.profitMargin ?? 0).toFixed(1)}%`],
        [],
        ["RUNNING COST / MONTH", "Amount (EGP)"],
        ["Farm-wide (general / overhead)", d?.runningCostPerMonth?.farmWide ?? 0],
        ["Animal-wide (feed + per-animal)", d?.runningCostPerMonth?.animalWide ?? 0],
        ["Total Running Cost / Month", d?.runningCostPerMonth?.total ?? 0],
      ];
      const ws = XLSX.utils.aoa_to_sheet(summaryData);
      ws["!cols"] = [{ wch: 35 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws, "Income Statement");

      const expenseBreakdown = [
        ["Expense Category", "Total (EGP)"],
        ...((d?.costs?.byCategory ?? []).map((cat: any) => [cat.categoryName ?? "Other", cat.total])),
      ];
      const wsExpenses = XLSX.utils.aoa_to_sheet(expenseBreakdown);
      wsExpenses["!cols"] = [{ wch: 30 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsExpenses, "Expense Breakdown");

      XLSX.writeFile(wb, `azal-farms-income-statement${ownerSlug}-${fromDate}-to-${toDate}.xlsx`);
      toast.success(t("incomeStatement.excelExported", "Excel exported"));
    } catch (err) {
      console.error(err);
      toast.error(t("incomeStatement.excelFailed", "Excel export failed"));
    }
  };

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("nav.incomeStatement", "Income statement")}
        subtitle={t("incomeStatement.subtitle", "Revenue vs cost for the selected period")}
        crumbs={[{ label: t("nav.dashboard", "Dashboard"), href: "/" }, { label: t("nav.incomeStatement", "Income statement") }]}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 w-36" />
            <span className="text-muted-foreground">→</span>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 w-36" />
            {canExport && (
              <>
                <button onClick={() => window.print()} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface">
                  <Printer className="h-4 w-4" />
                  {t("incomeStatement.print", "Print")}
                </button>
                <button onClick={handleExportPDF} disabled={isLoading} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface disabled:opacity-50">
                  <Download className="h-4 w-4" />
                  {t("common.exportPDF", "Export PDF")}
                </button>
                <button onClick={handleExportExcel} disabled={isLoading} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface disabled:opacity-50">
                  <FileSpreadsheet className="h-4 w-4" />
                  {t("common.exportExcel", "Export Excel")}
                </button>
              </>
            )}
          </div>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !d ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t("incomeStatement.noData", "No data for this period.")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label={t("incomeStatement.revenue", "Revenue")} value={fmt(d.revenue?.total ?? 0)} icon={TrendingUp} hint={`${t("incomeStatement.received", "Received")}: ${fmt(d.revenue?.cashReceived ?? 0)}`} />
            <KpiCard label={t("incomeStatement.costs", "Total costs")} value={fmt(d.costs?.total ?? 0)} icon={TrendingDown} hint={`${t("incomeStatement.feed", "Feed")}: ${fmt(d.costs?.feedPurchases ?? 0)}`} />
            <KpiCard
              label={t("incomeStatement.grossProfit", "Gross profit")}
              value={<span className={Number(d.grossProfit ?? 0) >= 0 ? "text-success-soft-foreground" : "text-danger-soft-foreground"}>{fmt(d.grossProfit ?? 0)}</span>}
              icon={FileText}
            />
            <KpiCard label={t("incomeStatement.margin", "Profit margin")} value={`${d.profitMargin ?? 0}%`} icon={TrendingUp} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Revenue & cost detail */}
            <section className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
              <h2 className="mb-3 text-sm font-semibold">{t("incomeStatement.breakdown", "Breakdown")}</h2>
              <dl className="space-y-2 text-sm">
                <Row label={t("incomeStatement.animalSales", "Animal sales")} value={fmt(d.revenue?.animalSales ?? 0)} />
                <Row label={t("incomeStatement.cashReceived", "Cash received")} value={fmt(d.revenue?.cashReceived ?? 0)} muted />
                <Row label={t("incomeStatement.outstanding", "Outstanding receivables")} value={fmt(d.revenue?.outstandingReceivables ?? 0)} muted />
                <div className="my-2 border-t border-border" />
                <Row label={t("incomeStatement.animalPurchases", "Animal purchases")} value={fmt(d.costs?.animalPurchases ?? 0)} />
                <Row label={t("incomeStatement.feedPurchases", "Feed purchases")} value={fmt(d.costs?.feedPurchases ?? 0)} />
                <Row label={t("incomeStatement.otherCosts", "Other expenses")} value={fmt(d.costs?.totalOther ?? 0)} />
                <div className="my-2 border-t border-border" />
                <Row label={t("incomeStatement.grossProfit", "Gross profit")} value={fmt(d.grossProfit ?? 0)} strong />
              </dl>
            </section>

            {/* Cost by category */}
            <section className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
              <h2 className="mb-3 text-sm font-semibold">{t("incomeStatement.costsByCategory", "Costs by category")}</h2>
              {(d.costs?.byCategory ?? []).length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t("common.none", "None")}</p>
              ) : (
                <dl className="space-y-2 text-sm">
                  {(d.costs?.byCategory as any[]).map((c, i) => (
                    <Row key={i} label={c.categoryName ?? t("common.uncategorized", "Uncategorized")} value={fmt(c.total ?? 0)} />
                  ))}
                </dl>
              )}
            </section>

            {/* Running cost per month */}
            {d.runningCostPerMonth && (
              <section className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{t("incomeStatement.runningCostMonth", "Running cost / month")}</h2>
                  <span className="text-xs text-muted-foreground">
                    {t("incomeStatement.overMonths", "over {{months}} months", { months: d.runningCostPerMonth.monthsInPeriod ?? 0 })}
                  </span>
                </div>
                <dl className="space-y-2 text-sm">
                  <Row label={t("incomeStatement.farmWide", "Farm-wide (general / overhead)")} value={`${fmt(d.runningCostPerMonth.farmWide ?? 0)}/mo`} />
                  <Row label={t("incomeStatement.animalWide", "Animal-wide (feed + per-animal)")} value={`${fmt(d.runningCostPerMonth.animalWide ?? 0)}/mo`} />
                  <div className="my-2 border-t border-border" />
                  <Row label={t("incomeStatement.totalRunningCost", "Total running cost")} value={`${fmt(d.runningCostPerMonth.total ?? 0)}/mo`} strong />
                </dl>
              </section>
            )}
          </div>
        </>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-muted-foreground" : "text-foreground"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold text-foreground" : muted ? "text-muted-foreground" : "font-medium text-foreground"}`}>{value}</dd>
    </div>
  );
}
