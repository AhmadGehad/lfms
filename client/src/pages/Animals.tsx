import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Eye, Leaf, Plus, Search, Trash2, AlertTriangle, DollarSign } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useState } from "react";
import * as React from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";

function StatusBadge({ status }: { status: string }) {
  const lower = status?.toLowerCase() ?? "";
  if (lower.includes("active") || lower.includes("fattening") || lower.includes("breeding")) {
    return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">{status}</Badge>;
  }
  if (lower.includes("sold")) return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">{status}</Badge>;
  if (lower.includes("dead") || lower.includes("mort")) return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">{status}</Badge>;
  if (lower.includes("transport")) return <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs">{status}</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

function AddAnimalDialog({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { control, handleSubmit, reset, watch } = useForm({
    defaultValues: {
      speciesId: "",
      categoryId: "",
      groupId: "",
      statusId: "",
      sex: "",
      acquisitionType: "",
      acquisitionDate: new Date().toISOString().split("T")[0],
      birthDate: new Date().toISOString().split("T")[0],
      purchaseCost: "",
      weightAtAcquisition: "",
      ownerId: "",
    },
  });

  const selectedSpeciesId = watch("speciesId");

  const { data: species } = trpc.config.getSpecies.useQuery();
  const { data: categories } = trpc.config.getCategories.useQuery(
    { speciesId: selectedSpeciesId ? Number(selectedSpeciesId) : undefined }
  );
  const { data: groups } = trpc.config.getGroups.useQuery(
    { speciesId: selectedSpeciesId ? Number(selectedSpeciesId) : undefined }
  );
  const { data: statuses } = trpc.config.getStatuses.useQuery();
  const { data: ownersList } = trpc.config.getOwners.useQuery({ activeOnly: true });

  const utils = trpc.useUtils();
  const createAnimal = trpc.animals.create.useMutation({
    onSuccess: () => {
      toast.success(t("animals.title") + " registered");
      utils.animals.list.invalidate();
      utils.dashboard.getKPIs.invalidate();
      utils.dashboard.getHeadCountByCategory.invalidate();
      utils.feed.getStockStatus.invalidate();
      setOpen(false);
      reset();
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (data: any) => {
    if (!data.speciesId || !data.categoryId || !data.groupId || !data.statusId || !data.sex || !data.acquisitionType) {
      toast.error(t("common.required"));
      return;
    }
    createAnimal.mutate({
      speciesId: Number(data.speciesId),
      categoryId: Number(data.categoryId),
      groupId: Number(data.groupId),
      statusId: Number(data.statusId),
      sex: data.sex as "male" | "female",
      acquisitionType: data.acquisitionType as "purchased" | "born",
      acquisitionDate: data.acquisitionDate,
      birthDate: data.birthDate,
      purchaseCost: data.purchaseCost || undefined,
      weightAtAcquisition: data.weightAtAcquisition || undefined,
      ownerId: data.ownerId ? Number(data.ownerId) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          {t("animals.registerAnimal")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("animals.registerNewAnimal")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("common.species")} *</Label>
              <Controller name="speciesId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder={t("common.species")} /></SelectTrigger>
                  <SelectContent>
                    {(species ?? []).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.category")} *</Label>
              <Controller name="categoryId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={!selectedSpeciesId}>
                  <SelectTrigger><SelectValue placeholder={t("common.category")} /></SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.idPrefix})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Group / Pen *</Label>
              <Controller name="groupId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder={t("common.group")} /></SelectTrigger>
                  <SelectContent>
                    {(groups ?? []).map((g: any) => (
                      <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.status")} *</Label>
              <Controller name="statusId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder={t("common.status")} /></SelectTrigger>
                  <SelectContent>
                    {(statuses ?? []).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.sex")} *</Label>
              <Controller name="sex" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder={t("common.sex")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{t("common.male")}</SelectItem>
                    <SelectItem value="female">{t("common.female")}</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("animals.acquisitionType")} *</Label>
              <Controller name="acquisitionType" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder={t("common.type")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchased">{t("common.purchased")}</SelectItem>
                    <SelectItem value="born">{t("animals.bornOnFarm")}</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Acquisition Date *</Label>
              <Controller name="acquisitionDate" control={control} render={({ field }) => (
                <Input type="date" {...field} />
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Birth Date *</Label>
              <Controller name="birthDate" control={control} render={({ field }) => (
                <Input type="date" {...field} />
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("animals.purchaseCost")}</Label>
              <Controller name="purchaseCost" control={control} render={({ field }) => (
                <Input type="number" placeholder="0.00" {...field} />
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.weight")} ({t("common.kg")})</Label>
              <Controller name="weightAtAcquisition" control={control} render={({ field }) => (
                <Input type="number" placeholder="0.0" {...field} />
              )} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("owners.owner")}</Label>
              <Controller name="ownerId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder={t("owners.selectOwner")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t("owners.noOwner")}</SelectItem>
                    {(ownersList ?? []).map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={createAnimal.isPending}>
              {createAnimal.isPending ? "Registering..." : t("animals.addAnimal")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BulkSellDialog({
  open,
  onOpenChange,
  selectedAnimals,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAnimals: any[];
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { data: statuses } = trpc.config.getStatuses.useQuery();
  const exitStatuses = (statuses ?? []).filter((s: any) => s.isExitStatus);

  const [exitDate, setExitDate] = useState(new Date().toISOString().split("T")[0]);
  const [exitReason, setExitReason] = useState("");
  const [newStatusId, setNewStatusId] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [saleNotes, setSaleNotes] = useState("");
  const [perAnimal, setPerAnimal] = useState<Record<number, { salePrice: string; amountPaid: string; weightAtSale: string }>>({});

  // initialize per-animal entries when selection changes
  React.useEffect(() => {
    const next: typeof perAnimal = {};
    for (const a of selectedAnimals) {
      next[a.animal.id] = perAnimal[a.animal.id] ?? { salePrice: "", amountPaid: "", weightAtSale: "" };
    }
    setPerAnimal(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAnimals.length]);

  const utils = trpc.useUtils();
  const bulkExit = trpc.animals.bulkExit.useMutation({
    onSuccess: (r: any) => {
      toast.success(`${r.count} ${t("animals.title").toLowerCase()} — ${t("sales.recorded")}`);
      utils.animals.list.invalidate();
      utils.sales.list.invalidate();
      utils.dashboard.getKPIs.invalidate();
      onOpenChange(false);
      setExitReason(""); setBuyerName(""); setSaleNotes(""); setPerAnimal({});
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  // totals
  const totalPrice = Object.values(perAnimal).reduce((s, v) => s + (parseFloat(v.salePrice) || 0), 0);
  const totalPaid = Object.values(perAnimal).reduce((s, v) => s + (parseFloat(v.amountPaid || v.salePrice || "0") || 0), 0);
  const totalOutstanding = totalPrice - totalPaid;

  const onSubmit = () => {
    if (!exitDate || !exitReason || !newStatusId) {
      toast.error(t("common.required"));
      return;
    }
    bulkExit.mutate({
      exitDate,
      exitReason,
      newStatusId: Number(newStatusId),
      buyerName: buyerName || undefined,
      saleNotes: saleNotes || undefined,
      animals: selectedAnimals.map((a) => ({
        id: a.animal.id,
        salePrice: perAnimal[a.animal.id]?.salePrice || undefined,
        amountPaid: perAnimal[a.animal.id]?.amountPaid || undefined,
        weightAtSale: perAnimal[a.animal.id]?.weightAtSale || undefined,
      })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            {t("animals.bulkSell")} ({selectedAnimals.length})
          </DialogTitle>
        </DialogHeader>

        {/* Shared fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border rounded-lg p-4 bg-muted/30">
          <div className="space-y-1.5">
            <Label>{t("animals.exitDate")} *</Label>
            <Input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.status")} *</Label>
            <Select value={newStatusId} onValueChange={setNewStatusId}>
              <SelectTrigger><SelectValue placeholder={t("animals.selectExitStatus")} /></SelectTrigger>
              <SelectContent>
                {exitStatuses.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("animals.exitReason")} *</Label>
            <Input value={exitReason} onChange={(e) => setExitReason(e.target.value)} placeholder={t("animals.exitReasonPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("sales.buyerName")}</Label>
            <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Input value={saleNotes} onChange={(e) => setSaleNotes(e.target.value)} />
          </div>
        </div>

        {/* Per-animal price + paid + weight */}
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("animals.animalId")}</TableHead>
                <TableHead>{t("common.weight")} (kg)</TableHead>
                <TableHead>{t("sales.salePrice")}</TableHead>
                <TableHead>{t("sales.amountPaid")}</TableHead>
                <TableHead>{t("sales.outstanding")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedAnimals.map((a: any) => {
                const row = perAnimal[a.animal.id] ?? { salePrice: "", amountPaid: "", weightAtSale: "" };
                const price = parseFloat(row.salePrice) || 0;
                const paid = parseFloat(row.amountPaid || (row.salePrice || "0")) || 0;
                const outstanding = price - paid;
                return (
                  <TableRow key={a.animal.id}>
                    <TableCell className="font-mono font-semibold text-primary">{a.animal.animalId}</TableCell>
                    <TableCell>
                      <Input type="number" placeholder="0" value={row.weightAtSale}
                        onChange={(e) => setPerAnimal((p) => ({ ...p, [a.animal.id]: { ...row, weightAtSale: e.target.value } }))}
                        className="w-24" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" placeholder="0.00" value={row.salePrice}
                        onChange={(e) => setPerAnimal((p) => ({ ...p, [a.animal.id]: { ...row, salePrice: e.target.value } }))}
                        className="w-32" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" placeholder={row.salePrice || "0.00"} value={row.amountPaid}
                        onChange={(e) => setPerAnimal((p) => ({ ...p, [a.animal.id]: { ...row, amountPaid: e.target.value } }))}
                        className="w-32" />
                    </TableCell>
                    <TableCell className={outstanding > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                      {outstanding.toFixed(2)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-3 text-sm border rounded-lg p-3 bg-muted/30">
          <div><span className="text-muted-foreground">{t("sales.totalPrice")}: </span><strong>{totalPrice.toFixed(2)}</strong></div>
          <div><span className="text-muted-foreground">{t("sales.totalPaid")}: </span><strong className="text-green-700">{totalPaid.toFixed(2)}</strong></div>
          <div><span className="text-muted-foreground">{t("sales.totalOutstanding")}: </span><strong className={totalOutstanding > 0 ? "text-amber-600" : ""}>{totalOutstanding.toFixed(2)}</strong></div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={onSubmit} disabled={bulkExit.isPending}>
            {bulkExit.isPending ? "..." : `${t("animals.bulkSell")} (${selectedAnimals.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Animals() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filterSpecies, setFilterSpecies] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterActive, setFilterActive] = useState<string>("active");
  const [filterOwner, setFilterOwner] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkSellOpen, setBulkSellOpen] = useState(false);
  const utils = trpc.useUtils();
  const deleteAnimalMutation = trpc.recycleBin.deleteAnimal.useMutation({
    onSuccess: () => {
      toast.success(t("animals.movedToBin"));
      utils.animals.list.invalidate();
      utils.dashboard.getKPIs.invalidate();
      utils.dashboard.getHeadCountByCategory.invalidate();
      utils.feed.getStockStatus.invalidate();
      utils.animals.getAllPnL.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: animals, isLoading, refetch } = trpc.animals.list.useQuery({
    isActive: filterActive === "active" ? true : filterActive === "inactive" ? false : undefined,
    speciesId: filterSpecies !== "all" ? Number(filterSpecies) : undefined,
    statusId: filterStatus !== "all" ? Number(filterStatus) : undefined,
    ownerId: filterOwner !== "all" ? Number(filterOwner) : undefined,
  });

  const { data: species } = trpc.config.getSpecies.useQuery();
  const { data: statuses } = trpc.config.getStatuses.useQuery();
  const { data: ownersList } = trpc.config.getOwners.useQuery({ activeOnly: true });

  const filtered = (animals ?? []).filter((a: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.animal.animalId?.toLowerCase().includes(q) ||
      a.categoryName?.toLowerCase().includes(q) ||
      a.speciesName?.toLowerCase().includes(q) ||
      a.groupName?.toLowerCase().includes(q) ||
      a.ownerName?.toLowerCase().includes(q)
    );
  });

  const selectedAnimals = filtered.filter((a: any) => selectedIds.has(a.animal.id));
  const allSelected = filtered.length > 0 && filtered.every((a: any) => selectedIds.has(a.animal.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((a: any) => a.animal.id)));
    }
  };

  const toggleOne = (id: number) => {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Leaf className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            {t("animals.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} animals · All lifecycle stages
          </p>
        </div>
        <AddAnimalDialog onSuccess={refetch} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("animals.searchPlaceholder")}
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterActive} onValueChange={setFilterActive}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">{t("common.active")}</SelectItem>
                <SelectItem value="inactive">{t("animals.exited")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSpecies} onValueChange={setFilterSpecies}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t("common.species")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("animals.allSpecies")}</SelectItem>
                {(species ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t("common.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("animals.allStatuses")}</SelectItem>
                {(statuses ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterOwner} onValueChange={setFilterOwner}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("owners.owner")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("owners.allOwners")}</SelectItem>
                {(ownersList ?? []).map((o: any) => (
                  <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedIds.size > 0 && (
              <Button onClick={() => setBulkSellOpen(true)} variant="default" className="gap-2 ms-auto">
                <DollarSign className="h-4 w-4" />
                {t("animals.bulkSell")} ({selectedIds.size})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>{t("animals.animalId")}</TableHead>
                    <TableHead>{t("common.species")}</TableHead>
                    <TableHead>{t("common.category")}</TableHead>
                    <TableHead>{t("common.group")}</TableHead>
                    <TableHead>{t("owners.owner")}</TableHead>
                    <TableHead>{t("common.sex")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead>{t("animals.acquisitionDate")}</TableHead>
                    <TableHead>{t("animals.daysOnFarm")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                        {t("animals.noAnimalsFound")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((a: any) => {
                      const acqDate = new Date(a.animal.acquisitionDate);
                      const exitDate = a.animal.exitDate ? new Date(a.animal.exitDate) : new Date();
                      const days = Math.floor((exitDate.getTime() - acqDate.getTime()) / (1000 * 60 * 60 * 24));
                      const isSelected = selectedIds.has(a.animal.id);
                      return (
                        <TableRow key={a.animal.id} className={`cursor-pointer hover:bg-muted/40 ${isSelected ? "bg-primary/5" : ""}`} onClick={() => setLocation(`/animals/${a.animal.id}`)}>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleOne(a.animal.id)}
                              disabled={!a.animal.isActive}
                              aria-label={`Select ${a.animal.animalId}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono font-semibold text-primary">{a.animal.animalId}</TableCell>
                          <TableCell>{a.speciesName}</TableCell>
                          <TableCell>{a.categoryName}</TableCell>
                          <TableCell>{a.groupName}</TableCell>
                          <TableCell className="text-sm">{a.ownerName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="capitalize">{a.animal.sex}</TableCell>
                          <TableCell><StatusBadge status={a.statusName ?? ""} /></TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(a.animal.acquisitionDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell>{days}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); setLocation(`/animals/${a.animal.id}`); }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:bg-destructive/10"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="flex items-center gap-2">
                                      <AlertTriangle className="h-5 w-5 text-destructive" />
                                      {t("animals.deleteAnimal")}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Move <strong>{a.animal.animalId}</strong> and all related records to the Recycle Bin? You can restore it anytime.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive hover:bg-destructive/90"
                                      onClick={(e) => { e.stopPropagation(); deleteAnimalMutation.mutate({ id: a.animal.id }); }}
                                    >
                                      {t("common.moveToBin")}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <BulkSellDialog
        open={bulkSellOpen}
        onOpenChange={setBulkSellOpen}
        selectedAnimals={selectedAnimals}
        onSuccess={() => { setSelectedIds(new Set()); refetch(); }}
      />
    </div>
  );
}
