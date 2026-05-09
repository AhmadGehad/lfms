import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Plus, Wheat } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function StockStatusBadge({ status }: { status: string }) {
  if (status === "critical") return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Critical</Badge>;
  if (status === "low") return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Low</Badge>;
  return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">OK</Badge>;
}

function AddStockDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    feedItemId: "",
    transactionDate: new Date().toISOString().split("T")[0],
    transactionType: "purchase",
    qty: "",
    unitCost: "",
    supplierName: "",
    notes: "",
  });

  const { data: feedItems } = trpc.config.getFeedItems.useQuery();
  const utils = trpc.useUtils();

  const addStock = trpc.feed.addStockEntry.useMutation({
    onSuccess: () => {
      toast.success("Stock entry recorded");
      utils.feed.getStockStatus.invalidate();
      utils.feed.getStockLedger.invalidate();
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.feedItemId || !form.qty) { toast.error("Feed item and quantity required"); return; }
    addStock.mutate({
      feedItemId: Number(form.feedItemId),
      transactionDate: form.transactionDate,
      transactionType: form.transactionType as any,
      qty: form.qty,
      unitCost: form.unitCost || undefined,
      totalCost: form.unitCost && form.qty ? String(parseFloat(form.unitCost) * parseFloat(form.qty)) : undefined,
      supplierName: form.supplierName || undefined,
      notes: form.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" />Add Stock</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record Stock Entry</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Feed Item *</Label>
            <Select value={form.feedItemId} onValueChange={(v) => setForm((f) => ({ ...f, feedItemId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select feed item" /></SelectTrigger>
              <SelectContent>
                {(feedItems ?? []).map((fi: any) => (
                  <SelectItem key={fi.id} value={String(fi.id)}>{fi.name} ({fi.unit})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.transactionDate} onChange={(e) => setForm((f) => ({ ...f, transactionDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.transactionType} onValueChange={(v) => setForm((f) => ({ ...f, transactionType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="stock_count">Stock Count</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity *</Label>
              <Input type="number" placeholder="0.0" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Unit Cost</Label>
              <Input type="number" placeholder="0.00" value={form.unitCost} onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <Input placeholder="Supplier name" value={form.supplierName} onChange={(e) => setForm((f) => ({ ...f, supplierName: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={addStock.isPending}>
            {addStock.isPending ? "Saving..." : "Save Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Feed() {
  const { data: stockStatus, isLoading: stockLoading } = trpc.feed.getStockStatus.useQuery();
  const { data: stockLedger } = trpc.feed.getStockLedger.useQuery();
  const { data: rationPlans } = trpc.feed.getRationPlans.useQuery();

  const criticalCount = (stockStatus ?? []).filter((s: any) => s.status === "critical").length;
  const lowCount = (stockStatus ?? []).filter((s: any) => s.status === "low").length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wheat className="h-6 w-6 text-primary" />
            Feed Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {criticalCount > 0 && <span className="text-red-600 font-medium">{criticalCount} critical · </span>}
            {lowCount > 0 && <span className="text-amber-600 font-medium">{lowCount} low · </span>}
            {(stockStatus ?? []).length} feed items tracked
          </p>
        </div>
        <AddStockDialog onSuccess={() => {}} />
      </div>

      {/* Stock Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(stockStatus ?? []).map((item: any) => (
          <Card key={item.feedItemId} className={`border-l-4 ${
            item.status === "critical" ? "border-l-red-500" :
            item.status === "low" ? "border-l-amber-500" : "border-l-green-500"
          }`}>
            <CardContent className="pt-4 pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-sm">{item.feedItemName}</p>
                  <p className="text-2xl font-bold mt-1">{parseFloat(item.stockOnHand).toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground">{item.unit}</p>
                </div>
                <div className="text-right">
                  <StockStatusBadge status={item.status} />
                  <p className="text-xs text-muted-foreground mt-2">
                    {item.daysRemaining === 999 ? "∞" : item.daysRemaining} days
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {(!stockStatus || stockStatus.length === 0) && !stockLoading && (
          <Card className="col-span-4">
            <CardContent className="pt-6 text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              No feed items configured. Add feed items in Configuration first.
            </CardContent>
          </Card>
        )}
      </div>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">Stock Ledger</TabsTrigger>
          <TabsTrigger value="rations">Ration Plans</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Feed Item</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit Cost</TableHead>
                      <TableHead>Total Cost</TableHead>
                      <TableHead>Supplier</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(stockLedger ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          No stock entries yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (stockLedger ?? []).map((entry: any) => (
                        <TableRow key={entry.id}>
                          <TableCell>{new Date(entry.transactionDate).toLocaleDateString()}</TableCell>
                          <TableCell className="font-medium">{entry.feedItemName}</TableCell>
                          <TableCell className="capitalize">{entry.transactionType.replace("_", " ")}</TableCell>
                          <TableCell>{parseFloat(entry.qty).toFixed(1)}</TableCell>
                          <TableCell>{entry.unitCost ? `EGP ${parseFloat(entry.unitCost).toFixed(2)}` : "—"}</TableCell>
                          <TableCell>{entry.totalCost ? `EGP ${parseFloat(entry.totalCost).toFixed(2)}` : "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{entry.supplierName ?? "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rations">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Feed Item</TableHead>
                      <TableHead>Qty / Head / Day</TableHead>
                      <TableHead>Effective Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rationPlans ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          No ration plans configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (rationPlans ?? []).map((plan: any) => (
                        <TableRow key={plan.id}>
                          <TableCell>{plan.categoryName}</TableCell>
                          <TableCell>{plan.feedItemName}</TableCell>
                          <TableCell>{parseFloat(plan.qtyPerHeadPerDay).toFixed(2)} {plan.unit}</TableCell>
                          <TableCell>{new Date(plan.effectiveDate).toLocaleDateString()}</TableCell>
                          <TableCell>{plan.endDate ? new Date(plan.endDate).toLocaleDateString() : "Ongoing"}</TableCell>
                          <TableCell>
                            {plan.isActive ? (
                              <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Active</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">Inactive</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
