import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function IncomeStatement() {
  const { t } = useTranslation();
  const now = new Date();
  const [fromDate, setFromDate] = useState(new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0]);
  const [toDate, setToDate] = useState(now.toISOString().split("T")[0]);

  const { data: statement, isLoading } = trpc.dashboard.getIncomeStatement.useQuery({ fromDate, toDate });

  const fmt = (v: number) =>
    new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", minimumFractionDigits: 2 }).format(v);

  const handleExportPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      // Header
      doc.setFontSize(20);
      doc.setTextColor(34, 85, 34);
      doc.text("Azal Farms - مزارع أزَل", 105, 20, { align: "center" });
      doc.setFontSize(14);
      doc.setTextColor(60, 60, 60);
      doc.text(t("incomeStatement.title"), 105, 30, { align: "center" });
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text(`Period: ${new Date(fromDate).toLocaleDateString()} – ${new Date(toDate).toLocaleDateString()}`, 105, 38, { align: "center" });
      doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 44, { align: "center" });

      // Revenue section
      autoTable(doc, {
        startY: 55,
        head: [["REVENUE", "Amount (EGP)"]],
        body: [
          ["Animal Sales", fmt(statement?.revenue?.animalSales ?? 0)],
          ["Total Revenue", fmt(statement?.revenue?.total ?? 0)],
        ],
        headStyles: { fillColor: [34, 139, 34], textColor: 255, fontStyle: "bold" },
        bodyStyles: { fontSize: 10 },
        alternateRowStyles: { fillColor: [240, 255, 240] },
        columnStyles: { 1: { halign: "right" } },
        foot: [["", ""]],
        margin: { left: 20, right: 20 },
      });

      const afterRevenue = (doc as any).lastAutoTable.finalY + 8;

      // Expenses section
      const expenseRows: [string, string][] = [
        ["Animal Purchases", fmt(statement?.costs?.animalPurchases ?? 0)],
        ...(statement?.costs?.feedPurchases ? [["Feed Stock Purchases", fmt(statement?.costs?.feedPurchases)]] as [string, string][] : []),
        ...((statement?.costs?.byCategory ?? []).map((cat: any) => [
          cat.categoryName ?? "Other",
          fmt(cat.total),
        ] as [string, string])),
        ["Total Expenses", fmt(statement?.costs?.total ?? 0)],
      ];

      autoTable(doc, {
        startY: afterRevenue,
        head: [["EXPENSES", "Amount (EGP)"]],
        body: expenseRows,
        headStyles: { fillColor: [180, 30, 30], textColor: 255, fontStyle: "bold" },
        bodyStyles: { fontSize: 10 },
        alternateRowStyles: { fillColor: [255, 245, 245] },
        columnStyles: { 1: { halign: "right" } },
        margin: { left: 20, right: 20 },
      });

      const afterExpenses = (doc as any).lastAutoTable.finalY + 8;

      // Summary section
      const grossProfit = statement?.grossProfit ?? 0;
      autoTable(doc, {
        startY: afterExpenses,
        head: [["SUMMARY", "Amount (EGP)"]],
        body: [
          ["Total Revenue", fmt(statement?.revenue?.total ?? 0)],
          ["Total Expenses", fmt(statement?.costs?.total ?? 0)],
          ["Gross Profit / (Loss)", fmt(grossProfit)],
          ["Profit Margin", `${(statement?.profitMargin ?? 0).toFixed(1)}%`],
        ],
        headStyles: { fillColor: [50, 50, 100], textColor: 255, fontStyle: "bold" },
        bodyStyles: { fontSize: 11 },
        alternateRowStyles: { fillColor: [245, 245, 255] },
        columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
        margin: { left: 20, right: 20 },
      });

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: "center" });
        doc.text("Azal Farms - Confidential", 20, 290);
      }

      doc.save(`azal-farms-income-statement-${fromDate}-to-${toDate}.pdf`);
      toast.success("PDF exported successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export PDF");
    }
  };

  const handleExportExcel = async () => {
    try {
      const XLSX = await import("xlsx");

      const wb = XLSX.utils.book_new();

      // Summary sheet
      const summaryData = [
        ["Azal Farms - مزارع أزَل"],
        [t("incomeStatement.title")],
        [`Period: ${new Date(fromDate).toLocaleDateString()} – ${new Date(toDate).toLocaleDateString()}`],
        [`Generated: ${new Date().toLocaleString()}`],
        [],
        ["REVENUE", "Amount (EGP)"],
        ["Animal Sales", statement?.revenue?.animalSales ?? 0],
        ["Total Revenue", statement?.revenue?.total ?? 0],
        [],
        ["EXPENSES", "Amount (EGP)"],
        ["Animal Purchases", statement?.costs?.animalPurchases ?? 0],
        ...((statement?.costs?.byCategory ?? []).map((cat: any) => [cat.categoryName ?? "Other", cat.total])),
        ["Total Expenses", statement?.costs?.total ?? 0],
        [],
        ["SUMMARY", "Amount (EGP)"],
        ["Total Revenue", statement?.revenue?.total ?? 0],
        ["Total Expenses", statement?.costs?.total ?? 0],
        ["Gross Profit / (Loss)", statement?.grossProfit ?? 0],
        ["Profit Margin (%)", `${(statement?.profitMargin ?? 0).toFixed(1)}%`],
      ];

      const ws = XLSX.utils.aoa_to_sheet(summaryData);

      // Column widths
      ws["!cols"] = [{ wch: 35 }, { wch: 20 }];

      // Style header rows
      const headerStyle = { font: { bold: true, sz: 14 }, alignment: { horizontal: "center" } };
      if (ws["A1"]) ws["A1"].s = headerStyle;

      XLSX.utils.book_append_sheet(wb, ws, "Income Statement");

      // Expense breakdown sheet
      const expenseBreakdown = [
        ["Expense Category", "Total (EGP)"],
        ...(statement?.costs?.byCategory ?? []).map((cat: any) => [cat.categoryName ?? "Other", cat.total]),
      ];
      const wsExpenses = XLSX.utils.aoa_to_sheet(expenseBreakdown);
      wsExpenses["!cols"] = [{ wch: 30 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsExpenses, "Expense Breakdown");

      XLSX.writeFile(wb, `azal-farms-income-statement-${fromDate}-to-${toDate}.xlsx`);
      toast.success("Excel exported successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export Excel");
    }
  };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Farm Income Statement
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Financial performance summary for Azal Farms</p>
        </div>
        <div className="flex gap-2 flex-wrap no-print">
          <Button variant="outline" className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleExportPDF} disabled={isLoading}>
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleExportExcel} disabled={isLoading}>
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end no-print">
        <div className="space-y-1.5">
          <Label>From Date</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
        </div>
        <div className="space-y-1.5">
          <Label>To Date</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" />
        </div>
      </div>

      <Card className="w-full max-w-2xl print:shadow-none print:border-0">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            Azal Farms — Farm Income Statement
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {new Date(fromDate).toLocaleDateString("en-EG", { year: "numeric", month: "long", day: "numeric" })}
            {" – "}
            {new Date(toDate).toLocaleDateString("en-EG", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : (
            <>
              {/* Revenue */}
              <div>
                <h3 className="font-semibold text-green-700 mb-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-600 inline-block" />
                  Revenue
                </h3>
                <div className="space-y-2 pl-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Animal Sales</span>
                    <span className="font-medium">{fmt(statement?.revenue?.animalSales ?? 0)}</span>
                  </div>
                </div>
                <div className="flex justify-between font-semibold border-t mt-3 pt-3">
                  <span>Total Revenue</span>
                  <span className="text-green-700">{fmt(statement?.revenue?.total ?? 0)}</span>
                </div>
              </div>

              <Separator />

              {/* Expenses */}
              <div>
                <h3 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-600 inline-block" />
                  Expenses
                </h3>
                <div className="space-y-2 pl-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Animal Purchases</span>
                    <span className="font-medium">{fmt(statement?.costs?.animalPurchases ?? 0)}</span>
                  </div>
                  {(statement?.costs?.feedPurchases ?? 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Feed Stock Purchases</span>
                      <span className="font-medium">{fmt(statement?.costs?.feedPurchases ?? 0)}</span>
                    </div>
                  )}
                  {(statement?.costs?.byCategory ?? []).map((cat: any) => (
                    <div key={cat.categoryName} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{cat.categoryName ?? "Other"}</span>
                      <span className="font-medium">{fmt(cat.total)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between font-semibold border-t mt-3 pt-3">
                  <span>Total Expenses</span>
                  <span className="text-red-700">{fmt(statement?.costs?.total ?? 0)}</span>
                </div>
              </div>

              <Separator />

              {/* Net Income */}
              <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Total Revenue</span>
                  <span>{fmt(statement?.revenue?.total ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Total Expenses</span>
                  <span>({fmt(statement?.costs?.total ?? 0)})</span>
                </div>
                <Separator className="my-1" />
                <div className="flex justify-between text-xl font-bold pt-1">
                  <span>Gross Profit / (Loss)</span>
                  <span className={(statement?.grossProfit ?? 0) >= 0 ? "text-green-700" : "text-red-700"}>
                    {fmt(statement?.grossProfit ?? 0)}
                  </span>
                </div>
              </div>

              {/* Additional Metrics */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="text-center p-3 rounded-lg bg-muted/20 border">
                  <p className="text-xs text-muted-foreground mb-1">Profit Margin</p>
                  <p className={`text-2xl font-bold ${(statement?.profitMargin ?? 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {(statement?.profitMargin ?? 0).toFixed(1)}%
                  </p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/20 border">
                  <p className="text-xs text-muted-foreground mb-1">Report Period</p>
                  <p className="text-sm font-medium">{fromDate}</p>
                  <p className="text-xs text-muted-foreground">to</p>
                  <p className="text-sm font-medium">{toDate}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
