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
import { Eye, Leaf, Plus, Search, Trash2, AlertTriangle, DollarSign, Pencil } from "lucide-react";
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
import { useLocation, useSearch } from "wouter";
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
      ownerId: "none",
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
      ownerId: (data.ownerId && data.ownerId !== "none") ? Number(data.ownerId) : undefined,
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
              <Label>{t("animals.acquisitionDate")} *</Label>
              <Controller name="acquisitionDate" control={control} render={({ field }) => (
                <Input type="date" {...field} />
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("animals.birthDate")} *</Label>
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
                    <SelectItem value="none">{t("owners.noOwner")}</SelectItem>
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

function BulkEditDialog({
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
  const { data: groups } = trpc.config.getGroups.useQuery();
  const { data: statuses } = trpc.config.getStatuses.useQuery();
  const { data: ownersList } = trpc.config.getOwners.useQuery({ activeOnly: true });

  // "" / "__keep" means leave the field alone; "__clear" means set to null
  // (only valid for nullable fields: group, owner, notes).
  const KEEP = "__keep";
  const CLEAR = "__clear";
  const [groupId, setGroupId] = useState<string>(KEEP);
  const [statusId, setStatusId] = useState<string>(KEEP);
  const [ownerId, setOwnerId] = useState<string>(KEEP);
  const [sex, setSex] = useState<string>(KEEP);
  const [acquisitionDate, setAcquisitionDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [setNotesEnabled, setSetNotesEnabled] = useState(false);
  const [exitDate, setExitDate] = useState<string>("");
  const [exitReason, setExitReason] = useState<string>("");
  const [isActiveChoice, setIsActiveChoice] = useState<string>(KEEP);

  // reset when dialog reopens
  React.useEffect(() => {
    if (open) {
      setGroupId(KEEP); setStatusId(KEEP); setOwnerId(KEEP); setSex(KEEP);
      setAcquisitionDate(""); setNotes(""); setSetNotesEnabled(false);
      setExitDate(""); setExitReason(""); setIsActiveChoice(KEEP);
    }
  }, [open]);

  const utils = trpc.useUtils();
  const bulkUpdate = trpc.animals.bulkUpdate.useMutation({
    onSuccess: (r: any) => {
      toast.success(`${r.count} ${t("animals.title").toLowerCase()} — ${t("common.updated")}`);
      utils.animals.list.invalidate();
      utils.dashboard.getKPIs.invalidate();
      onOpenChange(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const fieldsChanged = (
    (groupId !== KEEP ? 1 : 0) +
    (statusId !== KEEP ? 1 : 0) +
    (ownerId !== KEEP ? 1 : 0) +
    (sex !== KEEP ? 1 : 0) +
    (acquisitionDate ? 1 : 0) +
    (setNotesEnabled ? 1 : 0) +
    (exitDate ? 1 : 0) +
    (exitReason ? 1 : 0) +
    (isActiveChoice !== KEEP ? 1 : 0)
  );

  const onSubmit = () => {
    if (fieldsChanged === 0) {
      toast.error(t("animals.bulkEditNoFields"));
      return;
    }
    bulkUpdate.mutate({
      animalIds: selectedAnimals.map((a) => a.animal.id),
      groupId: groupId === KEEP ? undefined : groupId === CLEAR ? null : Number(groupId),
      statusId: statusId === KEEP ? undefined : Number(statusId),
      ownerId: ownerId === KEEP ? undefined : ownerId === CLEAR ? null : Number(ownerId),
      sex: sex === KEEP ? undefined : (sex as "male" | "female"),
      acquisitionDate: acquisitionDate || undefined,
      notes: setNotesEnabled ? (notes || null) : undefined,
      exitDate: exitDate || undefined,
      exitReason: exitReason || undefined,
      isActive: isActiveChoice === KEEP ? undefined : isActiveChoice === "true",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("animals.bulkEdit")} ({selectedAnimals.length})</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-2">
          {t("animals.bulkEditHint")}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{t("common.group")}</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>{t("animals.bulkEditKeep")}</SelectItem>
                <SelectItem value={CLEAR}>{t("animals.bulkEditClear")}</SelectItem>
                {(groups ?? []).map((g: any) => (
                  <SelectItem key={g.id} value={String(g.id)}>{g.groupCode} — {g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("common.status")}</Label>
            <Select value={statusId} onValueChange={setStatusId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>{t("animals.bulkEditKeep")}</SelectItem>
                {(statuses ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("owners.owner")}</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>{t("animals.bulkEditKeep")}</SelectItem>
                <SelectItem value={CLEAR}>{t("animals.bulkEditClear")}</SelectItem>
                {(ownersList ?? []).map((o: any) => (
                  <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("common.sex")}</Label>
            <Select value={sex} onValueChange={setSex}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>{t("animals.bulkEditKeep")}</SelectItem>
                <SelectItem value="male">{t("common.male")}</SelectItem>
                <SelectItem value="female">{t("common.female")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("animals.acquisitionDate")}</Label>
            <Input
              type="date"
              value={acquisitionDate}
              placeholder={t("animals.bulkEditKeep")}
              onChange={(e) => setAcquisitionDate(e.target.value)}
            />
            {acquisitionDate && <p className="text-xs text-muted-foreground">{t("animals.bulkEditWillApply")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>{t("animals.active")}?</Label>
            <Select value={isActiveChoice} onValueChange={setIsActiveChoice}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>{t("animals.bulkEditKeep")}</SelectItem>
                <SelectItem value="true">{t("animals.active")}</SelectItem>
                <SelectItem value="false">{t("animals.inactive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("animals.exitDate")}</Label>
            <Input
              type="date"
              value={exitDate}
              onChange={(e) => setExitDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("animals.exitReason")}</Label>
            <Input
              value={exitReason}
              onChange={(e) => setExitReason(e.target.value)}
              placeholder={t("animals.bulkEditKeep")}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="setNotesEnabled"
              checked={setNotesEnabled}
              onChange={(e) => setSetNotesEnabled(e.target.checked)}
            />
            <Label htmlFor="setNotesEnabled" className="cursor-pointer">{t("animals.bulkEditSetNotes")}</Label>
          </div>
          {setNotesEnabled && (
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("common.notes")}
            />
          )}
        </div>

        <div className="text-sm text-muted-foreground border-t pt-3">
          {fieldsChanged === 0
            ? t("animals.bulkEditNoFields")
            : `${fieldsChanged} ${t("animals.bulkEditFieldsCount")}`}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={onSubmit} disabled={bulkUpdate.isPending || fieldsChanged === 0}>
            {bulkUpdate.isPending ? "..." : `${t("animals.bulkEdit")} (${selectedAnimals.length})`}
          </Button>
        </DialogFooter>
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

function EditAnimalDialog({ animalId, open, onOpenChange, onSuccess }: { animalId: number | null; open: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const { data: animal } = trpc.animals.getById.useQuery({ id: animalId! }, { enabled: !!animalId });
  const { data: groups } = trpc.config.getGroups.useQuery({});
  const { data: statuses } = trpc.config.getStatuses.useQuery();
  const { data: ownersList } = trpc.config.getOwners.useQuery({ activeOnly: true });
  const utils = trpc.useUtils();
  const { control, handleSubmit, reset } = useForm<any>();
  React.useEffect(() => {
    if (animal) {
      reset({
        groupId: String(animal.animal.groupId ?? ""),
        statusId: String(animal.animal.statusId ?? ""),
        ownerId: animal.animal.ownerId ? String(animal.animal.ownerId) : "none",
        sex: animal.animal.sex ?? "",
        acquisitionDate: animal.animal.acquisitionDate ? new Date(animal.animal.acquisitionDate).toISOString().split("T")[0] : "",
        birthDate: animal.animal.birthDate ? new Date(animal.animal.birthDate).toISOString().split("T")[0] : "",
        purchaseCost: animal.animal.purchaseCost != null ? String(animal.animal.purchaseCost) : "",
        notes: animal.animal.notes ?? "",
        exitDate: animal.animal.exitDate ? new Date(animal.animal.exitDate).toISOString().split("T")[0] : "",
        exitReason: animal.animal.exitReason ?? "",
      });
    }
  }, [animal, reset]);
  const updateAnimal = trpc.animals.update.useMutation({
    onSuccess: () => {
      toast.success(t("common.saved") || "Saved");
      utils.animals.list.invalidate();
      utils.animals.getById.invalidate({ id: animalId! });
      onSuccess();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const onSubmit = handleSubmit((data) => {
    updateAnimal.mutate({
      id: animalId!,
      groupId: data.groupId ? Number(data.groupId) : undefined,
      statusId: data.statusId ? Number(data.statusId) : undefined,
      ownerId: data.ownerId && data.ownerId !== "none" ? Number(data.ownerId) : null,
      sex: data.sex || undefined,
      acquisitionDate: data.acquisitionDate || undefined,
      birthDate: data.birthDate || undefined,
      purchaseCost: data.purchaseCost !== "" ? data.purchaseCost : undefined,
      notes: data.notes || undefined,
      exitDate: data.exitDate || undefined,
      exitReason: data.exitReason || undefined,
    });
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("common.edit")} {animal?.animal.animalId}</DialogTitle>
        </DialogHeader>
        {!animal ? (
          <div className="py-8"><Skeleton className="h-40 w-full" /></div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("common.group")}</Label>
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
                <Label>{t("common.status")}</Label>
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
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("owners.owner")}</Label>
                <Controller name="ownerId" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue placeholder={t("owners.selectOwner")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("owners.noOwner")}</SelectItem>
                      {(ownersList ?? []).map((o: any) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.sex")}</Label>
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
                <Label>{t("animals.purchaseCost")}</Label>
                <Controller name="purchaseCost" control={control} render={({ field }) => (
                  <Input type="number" step="0.01" placeholder="0.00" {...field} />
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("animals.birthDate")}</Label>
                <Controller name="birthDate" control={control} render={({ field }) => (
                  <Input type="date" {...field} />
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("animals.acquisitionDate")}</Label>
                <Controller name="acquisitionDate" control={control} render={({ field }) => (
                  <Input type="date" {...field} />
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("animals.exitDate")}</Label>
                <Controller name="exitDate" control={control} render={({ field }) => (
                  <Input type="date" {...field} />
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("animals.exitReason")}</Label>
                <Controller name="exitReason" control={control} render={({ field }) => (
                  <Input placeholder={t("animals.exitReason")} {...field} />
                )} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("common.notes")}</Label>
                <Controller name="notes" control={control} render={({ field }) => (
                  <Input placeholder={t("common.notes")} {...field} />
                )} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={updateAnimal.isPending}>
                {updateAnimal.isPending ? "..." : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Animals() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const editIdFromUrl = React.useMemo(() => {
    const p = new URLSearchParams(searchStr);
    const v = p.get("edit");
    return v ? Number(v) : null;
  }, [searchStr]);
  const [editAnimalId, setEditAnimalId] = React.useState<number | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  React.useEffect(() => {
    if (editIdFromUrl) {
      setEditAnimalId(editIdFromUrl);
      setEditOpen(true);
    }
  }, [editIdFromUrl]);
  const handleEditClose = (v: boolean) => {
    setEditOpen(v);
    if (!v) setLocation("/animals");
  };
  // Persist filters + sort across navigation (e.g. viewing an animal then
  // returning) using sessionStorage, so the registry comes back the way the
  // user left it. Keyed under a single object for one read/write.
  const FILTERS_KEY = "lfms.animals.filters";
  const savedFilters = React.useMemo(() => {
    try {
      const raw = sessionStorage.getItem(FILTERS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }, []);

  const [search, setSearch] = useState<string>(savedFilters.search ?? "");
  const [filterSpecies, setFilterSpecies] = useState<string>(savedFilters.filterSpecies ?? "all");
  const [filterStatus, setFilterStatus] = useState<string>(savedFilters.filterStatus ?? "all");
  const [filterActive, setFilterActive] = useState<string>(savedFilters.filterActive ?? "active");
  const [filterOwner, setFilterOwner] = useState<string>(savedFilters.filterOwner ?? "all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkSellOpen, setBulkSellOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
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

  // ── Sorting ──────────────────────────────────────────────────────────────
  // Sortable by ID (animal code), Birth Date, Acquisition Date (default),
  // Age (inverse of birth date), and Cost.
  type SortKey = "id" | "birthDate" | "acquisitionDate" | "age" | "cost";
  const [sortBy, setSortBy] = useState<SortKey>(savedFilters.sortBy ?? "acquisitionDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(savedFilters.sortDir ?? "desc");

  React.useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify({
        search, filterSpecies, filterStatus, filterActive, filterOwner, sortBy, sortDir,
      }));
    } catch { /* ignore quota / disabled storage */ }
  }, [search, filterSpecies, filterStatus, filterActive, filterOwner, sortBy, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      // Dates default to newest-first; text defaults to A→Z
      setSortDir(key === "id" ? "asc" : "desc");
    }
  };

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a: any, b: any) => {
      switch (sortBy) {
        case "id":
          return dir * String(a.animal.animalId).localeCompare(String(b.animal.animalId), undefined, { numeric: true });
        case "birthDate":
          return dir * (new Date(a.animal.birthDate ?? 0).getTime() - new Date(b.animal.birthDate ?? 0).getTime());
        case "age":
          // Older first when desc — age sorts inversely to birth date
          return -dir * (new Date(a.animal.birthDate ?? 0).getTime() - new Date(b.animal.birthDate ?? 0).getTime());
        case "cost":
          return dir * ((parseFloat(a.animal.purchaseCost ?? "0") || 0) - (parseFloat(b.animal.purchaseCost ?? "0") || 0));
        case "acquisitionDate":
        default:
          return dir * (new Date(a.animal.acquisitionDate ?? 0).getTime() - new Date(b.animal.acquisitionDate ?? 0).getTime());
      }
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  /** Human age from birth date: "2y 3m", "7m", or "15d". */
  const formatAge = (birthDate: string | Date | null | undefined): string => {
    if (!birthDate) return "—";
    const b = new Date(birthDate);
    if (isNaN(b.getTime())) return "—";
    const now = new Date();
    let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
    if (now.getDate() < b.getDate()) months -= 1;
    if (months < 0) return "—";
    if (months === 0) {
      const days = Math.max(0, Math.floor((now.getTime() - b.getTime()) / 86400000));
      return `${days}${t("animals.ageDaysSuffix")}`;
    }
    const years = Math.floor(months / 12);
    const rem = months % 12;
    if (years === 0) return `${rem}${t("animals.ageMonthsSuffix")}`;
    return rem === 0
      ? `${years}${t("animals.ageYearsSuffix")}`
      : `${years}${t("animals.ageYearsSuffix")} ${rem}${t("animals.ageMonthsSuffix")}`;
  };

  const SortableHead = ({ k, children, className }: { k: SortKey; children: any; className?: string }) => (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground ${className ?? ""}`}
      onClick={() => toggleSort(k)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortBy === k && <span className="text-xs">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </span>
    </TableHead>
  );

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
              <div className="flex gap-2 ms-auto">
                <Button onClick={() => setBulkEditOpen(true)} variant="outline" className="gap-2">
                  <Pencil className="h-4 w-4" />
                  {t("animals.bulkEdit")} ({selectedIds.size})
                </Button>
                <Button onClick={() => setBulkSellOpen(true)} variant="default" className="gap-2">
                  <DollarSign className="h-4 w-4" />
                  {t("animals.bulkSell")} ({selectedIds.size})
                </Button>
              </div>
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
                    <SortableHead k="id">{t("animals.animalId")}</SortableHead>
                    <TableHead>{t("common.species")}</TableHead>
                    <TableHead>{t("common.category")}</TableHead>
                    <TableHead>{t("common.group")}</TableHead>
                    <TableHead>{t("owners.owner")}</TableHead>
                    <TableHead>{t("common.sex")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <SortableHead k="birthDate">{t("animals.birthDate")}</SortableHead>
                    <SortableHead k="age">{t("animals.age")}</SortableHead>
                    <SortableHead k="acquisitionDate">{t("animals.acquisitionDate")}</SortableHead>
                    <SortableHead k="cost">{t("animals.purchaseCost")}</SortableHead>
                    <TableHead>{t("animals.daysOnFarm")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center py-12 text-muted-foreground">
                        {t("animals.noAnimalsFound")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorted.map((a: any) => {
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
                            {a.animal.birthDate ? new Date(a.animal.birthDate).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell className="text-sm">{formatAge(a.animal.birthDate)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(a.animal.acquisitionDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-sm">
                            {a.animal.purchaseCost && parseFloat(a.animal.purchaseCost) > 0
                              ? parseFloat(a.animal.purchaseCost).toLocaleString("en-EG", { minimumFractionDigits: 2 })
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>{days}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                title={t("common.edit")}
                                onClick={(e) => { e.stopPropagation(); setEditAnimalId(a.animal.id); setEditOpen(true); }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
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

      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        selectedAnimals={selectedAnimals}
        onSuccess={() => { setSelectedIds(new Set()); refetch(); }}
      />

      <BulkSellDialog
        open={bulkSellOpen}
        onOpenChange={setBulkSellOpen}
        selectedAnimals={selectedAnimals}
        onSuccess={() => { setSelectedIds(new Set()); refetch(); }}
      />
      <EditAnimalDialog
        animalId={editAnimalId}
        open={editOpen}
        onOpenChange={handleEditClose}
        onSuccess={refetch}
      />
    </div>
  );
}
