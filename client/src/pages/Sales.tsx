import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { Plus, ShoppingCart, Trash2, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

function RecordSaleDialog({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    animalId: "",
    saleDate: new Date().toISOString().split("T")[0],
    salePrice: "",
    weightAtSale: "",
    buyerName: "",
    notes: "",
  });

  const { data: animals } = trpc.animals.list.useQuery({ isActive: true });
  const utils = trpc.useUtils();

  const exitAnimal = trpc.animals.exit.useMutation({
    onSuccess: () => {
      toast.success("Sale recorded successfully");
      utils.animals.list.invalidate();
      utils.sales.list.invalidate();
      setOpen(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.animalId || !form.salePrice) { toast.error("Animal and sale price required"); return; }
    exitAnimal.mutate({
      id: Number(form.animalId),
      exitDate: form.saleDate,
      exitReason: "sold",
      newStatusId: 6,
      salePrice: form.salePrice,
      weightAtSale: form.weightAtSale || undefined,
      buyerName: form.buyerName || undefined,
      saleNotes: form.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" />Record Sale</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record Animal Sale</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Animal *</Label>
            <Select value={form.animalId} onValueChange={(v) => setForm((f) => ({ ...f, animalId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select animal" /></SelectTrigger>
              <SelectContent>
                {(animals ?? []).map((a: any) => (
                  <SelectItem key={a.animal.id} value={String(a.animal.id)}>{a.animal.animalId}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Sale Date *</Label>
              <Input type="date" value={form.saleDate} onChange={(e) => setForm((f) => ({ ...f, saleDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Sale Price (EGP) *</Label>
              <Input type="number" placeholder="0.00" value={form.salePrice} onChange={(e) => setForm((f) => ({ ...f, salePrice: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Weight at Sale (kg)</Label>
              <Input type="number" placeholder="0.0" value={form.weightAtSale} onChange={(e) => setForm((f) => ({ ...f, weightAtSale: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Buyer Name</Label>
              <Input placeholder="Buyer" value={form.buyerName} onChange={(e) => setForm((f) => ({ ...f, buyerName: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Input placeholder="Optional notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={exitAnimal.isPending}>
            {exitAnimal.isPending ? "Saving..." : "Record Sale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Sales() {
  const { t } = useTranslation();
  const { data: sales, isLoading, refetch } = trpc.sales.list.useQuery();
  const utils = trpc.useUtils();

  const deleteSale = trpc.recycleBin.deleteSale.useMutation({
    onSuccess: () => {
      toast.success("Sale record moved to Recycle Bin");
      utils.sales.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const totalRevenue = (sales ?? []).reduce((sum: number, s: any) => sum + parseFloat(String(s.salePrice)), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" />
            Sales Records
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {(sales ?? []).length} sales · Total Revenue: EGP {totalRevenue.toLocaleString("en-EG", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <RecordSaleDialog onSuccess={refetch} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("animals.animalId")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>Sale Price (EGP)</TableHead>
                  <TableHead>{t("pnl.weightAtSale")}</TableHead>
                  <TableHead>Price / kg</TableHead>
                  <TableHead>{t("pnl.buyer")}</TableHead>
                  <TableHead>{t("common.notes")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : (sales ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No sales recorded yet.</TableCell></TableRow>
                ) : (
                  (sales ?? []).map((s: any) => {
                    const pricePerKg = s.weightAtSale
                      ? (parseFloat(String(s.salePrice)) / parseFloat(String(s.weightAtSale))).toFixed(2)
                      : "—";
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono font-semibold text-primary">{s.animalId}</TableCell>
                        <TableCell>{new Date(s.saleDate).toLocaleDateString()}</TableCell>
                        <TableCell className="font-semibold text-green-600">
                          {parseFloat(String(s.salePrice)).toLocaleString("en-EG", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>{s.weightAtSale ? `${parseFloat(String(s.weightAtSale)).toFixed(1)} kg` : "—"}</TableCell>
                        <TableCell>{pricePerKg !== "—" ? `EGP ${pricePerKg}` : "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{s.buyerName ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{s.notes ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2">
                                  <AlertTriangle className="h-5 w-5 text-destructive" />
                                  Delete Sale Record
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Move sale record for <strong>{s.animalId}</strong> to the Recycle Bin? You can restore it anytime.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteSale.mutate({ id: s.id })}>
                                  Move to Bin
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
