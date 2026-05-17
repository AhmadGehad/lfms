import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, DollarSign, GitBranch, Pencil, Plus, Scale, ShoppingCart, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function PnLCard({ animalId }: { animalId: number }) {
  const { t } = useTranslation();
  const { data: pnl, isLoading } = trpc.animals.getPnL.useQuery({ animalId });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const fmt = (v: number) =>
    new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(v);

  const items = [
    { label: "Purchase Cost", value: pnl?.purchaseCost ?? 0, type: "cost" },
    { label: "Feed Cost (historical)", value: pnl?.feedCost ?? 0, type: "cost" },
    { label: "Direct Expenses", value: pnl?.directExpenseTotal ?? 0, type: "cost" },
    { label: "Allocated Expenses", value: 0, type: "cost" },
    { label: "Total Cost", value: pnl?.totalCost ?? 0, type: "total-cost" },
    { label: "Sale Revenue", value: pnl?.revenue ?? 0, type: "revenue" },
    { label: "Net P&L", value: pnl?.netPnL ?? 0, type: "pnl" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Financial Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.label} className={`flex justify-between items-center py-1.5 ${
              item.type === "total-cost" || item.type === "pnl" ? "border-t font-semibold" : ""
            }`}>
              <span className="text-sm text-muted-foreground">{item.label}</span>
              <span className={`text-sm font-medium ${
                item.type === "revenue" ? "text-green-600" :
                item.type === "pnl" ? (item.value >= 0 ? "text-green-600" : "text-red-600") :
                item.type === "cost" || item.type === "total-cost" ? "text-red-600" : ""
              }`}>
                {fmt(item.value)}
              </span>
            </div>
          ))}
        </div>
        {pnl && (
          <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Cost / Day</p>
              <p className="text-lg font-bold">{fmt(pnl.costPerDay ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("animals.daysOnFarm")}</p>
              <p className="text-lg font-bold">{pnl.daysOnFarm ?? 0}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WeightChart({ animalId }: { animalId: number }) {
  const { t } = useTranslation();
  const { data: weights } = trpc.animals.getWeightLog.useQuery({ animalId });
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [weight, setWeight] = useState("");
  const utils = trpc.useUtils();

  const addWeight = trpc.animals.addWeight.useMutation({
    onSuccess: (result: any) => {
      if (result?.autoStaged && result?.newAnimalId) {
        toast.success(`Weight recorded — auto-staged to ${result.newAnimalId}`);
      } else {
        toast.success("Weight recorded");
      }
      utils.animals.getWeightLog.invalidate({ animalId });
      utils.animals.getPnL.invalidate({ animalId });
      utils.animals.getById.invalidate({ id: animalId });
      utils.animals.getAllPnL.invalidate();
      utils.feed.getStockStatus.invalidate();
      utils.dashboard.getKPIs.invalidate();
      setOpen(false);
      setWeight("");
    },
    onError: (e) => toast.error(e.message),
  });

  const chartData = (weights ?? []).map((w: any) => ({
    date: new Date(w.weighDate).toLocaleDateString("en-EG", { month: "short", day: "numeric" }),
    weight: parseFloat(w.weightKg),
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">{t("animals.weightHistory")}</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2">
              <Plus className="h-3 w-3" />
              Record Weight
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Record Weight</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Weight (kg)</Label>
                <Input type="number" placeholder="0.0" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => addWeight.mutate({ animalId, weighDate: date, weightKg: weight })} disabled={!weight || addWeight.isPending}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit=" kg" />
            <Tooltip formatter={(v: number) => [`${v} kg`, "Weight"]} />
            <Line type="monotone" dataKey="weight" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No weight records yet. Record the first weight above.
        </div>
      )}

      {(weights ?? []).length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Weight (kg)</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(weights ?? []).map((w: any) => (
              <TableRow key={w.id}>
                <TableCell>{new Date(w.weighDate).toLocaleDateString()}</TableCell>
                <TableCell className="font-medium">{parseFloat(w.weightKg).toFixed(1)} kg</TableCell>
                <TableCell className="text-muted-foreground text-sm">{w.notes ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function LineageTree({ animalId }: { animalId: number }) {
  const { data: lineage } = trpc.animals.getLineage.useQuery({ animalId });
  const [, setLocation] = useLocation();

  if (!lineage) return <Skeleton className="h-40 w-full" />;

  const AnimalNode = ({ animal, label }: { animal: any; label: string }) => (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {animal ? (
        <button
          onClick={() => setLocation(`/animals/${animal.animal.id}`)}
          className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-mono font-semibold hover:bg-primary/20 transition-colors"
        >
          {animal.animal.animalId}
        </button>
      ) : (
        <span className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs">Unknown</span>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <h3 className="font-semibold flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-primary" />
        Lineage Tree
      </h3>

      {/* Grandparents */}
      <div className="grid grid-cols-4 gap-4 justify-items-center">
        <AnimalNode animal={lineage.damDam} label="Dam's Dam" />
        <AnimalNode animal={lineage.damSire} label="Dam's Sire" />
        <AnimalNode animal={lineage.sireDam} label="Sire's Dam" />
        <AnimalNode animal={lineage.sireSire} label="Sire's Sire" />
      </div>

      {/* Parents */}
      <div className="grid grid-cols-2 gap-4 justify-items-center">
        <AnimalNode animal={lineage.dam} label="Dam (Mother)" />
        <AnimalNode animal={lineage.sire} label="Sire (Father)" />
      </div>

      {/* This animal */}
      <div className="flex justify-center">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-muted-foreground">This Animal</span>
          <span className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-mono font-bold">
            {lineage.animal?.animal.animalId}
          </span>
        </div>
      </div>

      {/* Offspring */}
      {lineage.offspring.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Offspring ({lineage.offspring.length})</p>
          <div className="flex flex-wrap gap-2">
            {lineage.offspring.map((o: any) => (
              <button
                key={o.animal.id}
                onClick={() => setLocation(`/animals/${o.animal.id}`)}
                className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs font-mono hover:bg-green-200 transition-colors"
              >
                {o.animal.animalId}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FeedHistoryTab({ animalId }: { animalId: number }) {
  const { data: plans } = trpc.animals.getFeedHistory.useQuery({ animalId });
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Feed Ration Plans (for this animal's category)</h3>
      {(plans ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No ration plans found for this animal's category.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Feed Item</TableHead>
              <TableHead>Qty / Head / Day</TableHead>
              <TableHead>Effective Date</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(plans ?? []).map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.feedItemName ?? p.feedItemId}</TableCell>
                <TableCell>{parseFloat(p.qtyPerHeadPerDay).toFixed(2)} kg</TableCell>
                <TableCell>{p.effectiveDate ? new Date(p.effectiveDate instanceof Date ? p.effectiveDate.toISOString() : p.effectiveDate).toLocaleDateString() : "—"}</TableCell>
                <TableCell>{p.endDate ? new Date(p.endDate instanceof Date ? p.endDate.toISOString() : p.endDate).toLocaleDateString() : "—"}</TableCell>
                <TableCell>
                  <Badge variant={p.isActive ? "default" : "secondary"}>
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ExpenseHistoryTab({ animalId }: { animalId: number }) {
  const { data: expenses } = trpc.animals.getExpenseHistory.useQuery({ animalId });
  const fmt = (v: number) =>
    new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(v);
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Direct Expenses Allocated to This Animal</h3>
      {(expenses ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No direct expenses recorded for this animal.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(expenses ?? []).map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{new Date(e.expenseDate).toLocaleDateString()}</TableCell>
                <TableCell>{e.categoryName ?? "—"}</TableCell>
                <TableCell className="font-medium text-red-600">{fmt(parseFloat(e.amount))}</TableCell>
                <TableCell>{e.vendorName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{e.notes ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function AnimalSalesTab({ animalId }: { animalId: number }) {
  const { data: salesData } = trpc.animals.getAnimalSales.useQuery({ animalId });
  const fmt = (v: number) =>
    new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(v);
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Sale Records</h3>
      {(salesData ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No sale records for this animal.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sale Date</TableHead>
              <TableHead>Sale Price</TableHead>
              <TableHead>Weight at Sale</TableHead>
              <TableHead>Price / kg</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(salesData ?? []).map((s: any) => (
              <TableRow key={s.sale.id}>
                <TableCell>{new Date(s.sale.saleDate).toLocaleDateString()}</TableCell>
                <TableCell className="font-medium text-green-600">{fmt(parseFloat(s.sale.salePrice))}</TableCell>
                <TableCell>{s.sale.weightAtSale ? `${parseFloat(s.sale.weightAtSale).toFixed(1)} kg` : "—"}</TableCell>
                <TableCell>{s.sale.pricePerKg ? `${parseFloat(s.sale.pricePerKg).toFixed(2)} EGP/kg` : "—"}</TableCell>
                <TableCell>{s.sale.buyerName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{s.sale.notes ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function StatusHistory({ animalId }: { animalId: number }) {
  const { t } = useTranslation();
  const { data: history } = trpc.animals.getStatusHistory.useQuery({ animalId });

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">{t("animals.statusHistory")}</h3>
      {(history ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No status changes recorded.</p>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-4">
            {(history ?? []).map((h: any, i: number) => (
              <div key={h.id} className="flex gap-4 pl-10 relative">
                <div className="absolute left-3 top-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                <div>
                  <p className="text-sm font-medium">{h.newStatusName}</p>
                  {h.previousStatusName && (
                    <p className="text-xs text-muted-foreground">From: {h.previousStatusName}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{new Date(h.changedAt).toLocaleString()}</p>
                  {h.notes && <p className="text-xs text-muted-foreground italic">{h.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AnimalProfile() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const animalId = Number(params.id);
  const [, setLocation] = useLocation();

  const { data: animal, isLoading } = trpc.animals.getById.useQuery({ id: animalId });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!animal) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Animal not found.</p>
        <Button variant="link" onClick={() => setLocation("/animals")}>{t("animals.title")}</Button>
      </div>
    );
  }

  const acqDate = new Date(animal.animal.acquisitionDate);
  const exitDate = animal.animal.exitDate ? new Date(animal.animal.exitDate) : new Date();
  const daysOnFarm = Math.floor((exitDate.getTime() - acqDate.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/animals")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono">{animal.animal.animalId}</h1>
            <Badge variant={animal.animal.isActive ? "default" : "secondary"}>
              {animal.animal.isActive ? "Active" : "Exited"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {animal.speciesName} · {animal.categoryName} · {animal.groupName} · {animal.animal.sex} · {daysOnFarm} days on farm
          </p>
        </div>
        {/* Quick Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setLocation(`/expenses?headId=${animal.animal.id}`)}>
            <DollarSign className="h-3.5 w-3.5" />
            Add Expense
          </Button>
          {animal.animal.isActive && (
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setLocation(`/sales?animalId=${animal.animal.id}`)}>
              <ShoppingCart className="h-3.5 w-3.5" />
              Record Sale
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setLocation(`/animals?edit=${animal.animal.id}`)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* P&L Card */}
        <PnLCard animalId={animalId} />

        {/* Animal Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              Animal Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Animal ID", value: animal.animal.animalId },
              { label: "Species", value: animal.speciesName },
              { label: "Category", value: animal.categoryName },
              { label: "Group", value: animal.groupName },
              { label: "Sex", value: animal.animal.sex },
              { label: "Status", value: animal.statusName },
              { label: "Acquisition Type", value: animal.animal.acquisitionType },
              { label: "Birth Date", value: animal.animal.birthDate ? new Date(animal.animal.birthDate).toLocaleDateString() : "—" },
              { label: "Acquisition Date", value: new Date(animal.animal.acquisitionDate).toLocaleDateString() },
              { label: "Purchase Cost", value: animal.animal.purchaseCost ? `EGP ${parseFloat(String(animal.animal.purchaseCost)).toFixed(2)}` : "—" },
              { label: "Weight at Acquisition", value: animal.animal.weightAtAcquisition ? `${parseFloat(String(animal.animal.weightAtAcquisition)).toFixed(1)} kg` : "—" },
              { label: "Target Weight", value: animal.targetWeightKg ? `${parseFloat(String(animal.targetWeightKg)).toFixed(1)} kg` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-start">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="text-sm font-medium text-right max-w-32 truncate">{value ?? "—"}</span>
              </div>
            ))}
            {animal.animal.exitDate && (
              <div className="flex justify-between items-start border-t pt-2">
                <span className="text-sm text-muted-foreground">Exit Date</span>
                <span className="text-sm font-medium">{new Date(animal.animal.exitDate).toLocaleDateString()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lineage */}
        <Card>
          <CardContent className="pt-6">
            <LineageTree animalId={animalId} />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="weights">
            <TabsList className="mb-4 flex-wrap h-auto gap-1">
              <TabsTrigger value="weights">Weight Log</TabsTrigger>
              <TabsTrigger value="feed">{t("animals.feedHistory")}</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="sales">Sales</TabsTrigger>
              <TabsTrigger value="status">{t("animals.statusHistory")}</TabsTrigger>
            </TabsList>
            <TabsContent value="weights">
              <WeightChart animalId={animalId} />
            </TabsContent>
            <TabsContent value="feed">
              <FeedHistoryTab animalId={animalId} />
            </TabsContent>
            <TabsContent value="expenses">
              <ExpenseHistoryTab animalId={animalId} />
            </TabsContent>
            <TabsContent value="sales">
              <AnimalSalesTab animalId={animalId} />
            </TabsContent>
            <TabsContent value="status">
              <StatusHistory animalId={animalId} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
