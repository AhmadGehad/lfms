import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { FileText, Printer } from "lucide-react";
import { useState } from "react";

export default function IncomeStatement() {
  const now = new Date();
  const [fromDate, setFromDate] = useState(new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0]);
  const [toDate, setToDate] = useState(now.toISOString().split("T")[0]);

  const { data: statement, isLoading } = trpc.dashboard.getIncomeStatement.useQuery({ fromDate, toDate });

  const fmt = (v: number) =>
    new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", minimumFractionDigits: 2 }).format(v);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Farm Income Statement
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Financial performance summary</p>
        </div>
        <Button variant="outline" className="gap-2 no-print" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print / Export
        </Button>
      </div>

      <div className="flex gap-4 items-end no-print">
        <div className="space-y-1.5">
          <Label>From Date</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <Label>To Date</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-center text-lg">
            Farm Income Statement
            <p className="text-sm font-normal text-muted-foreground mt-1">
              {new Date(fromDate).toLocaleDateString()} – {new Date(toDate).toLocaleDateString()}
            </p>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : (
            <>
              {/* Revenue */}
              <div>
                <h3 className="font-semibold text-green-700 mb-2">Revenue</h3>
                <div className="space-y-1.5 pl-4">
                  <div className="flex justify-between text-sm">
                    <span>Animal Sales</span>
                    <span className="font-medium">{fmt(statement?.revenue?.animalSales ?? 0)}</span>
                  </div>
                </div>
                <div className="flex justify-between font-semibold border-t mt-2 pt-2">
                  <span>Total Revenue</span>
                  <span className="text-green-700">{fmt(statement?.revenue?.total ?? 0)}</span>
                </div>
              </div>

              <Separator />

              {/* Expenses */}
              <div>
                <h3 className="font-semibold text-red-700 mb-2">Expenses</h3>
                <div className="space-y-1.5 pl-4">
                  <div className="flex justify-between text-sm">
                    <span>Animal Purchases</span>
                    <span className="font-medium">{fmt(statement?.costs?.animalPurchases ?? 0)}</span>
                  </div>
                  {(statement?.costs?.byCategory ?? []).map((cat: any) => (
                    <div key={cat.categoryName} className="flex justify-between text-sm">
                      <span>{cat.categoryName ?? "Other"}</span>
                      <span className="font-medium">{fmt(cat.total)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between font-semibold border-t mt-2 pt-2">
                  <span>Total Expenses</span>
                  <span className="text-red-700">{fmt(statement?.costs?.total ?? 0)}</span>
                </div>
              </div>

              <Separator />

              {/* Net Income */}
              <div className="flex justify-between text-lg font-bold pt-2">
                <span>Gross Profit</span>
                <span className={(statement?.grossProfit ?? 0) >= 0 ? "text-green-700" : "text-red-700"}>
                  {fmt(statement?.grossProfit ?? 0)}
                </span>
              </div>

              {/* Additional Metrics */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Profit Margin</p>
                  <p className="text-lg font-bold">{(statement?.profitMargin ?? 0).toFixed(1)}%</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Period</p>
                  <p className="text-sm font-medium">{fromDate} – {toDate}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
