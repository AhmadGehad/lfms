import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Egg, Plus, Trash2, AlertTriangle } from "lucide-react";
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
import { toast } from "sonner";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/hooks/usePermissions";
import { AnimalIdNumberField } from "@/components/AnimalIdNumberField";

function RecordBirthDialog({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { control, handleSubmit, reset } = useForm({
    defaultValues: {
      birthDate: new Date().toISOString().split("T")[0],
      damId: "",
      sireId: "",
      sex: "",
      birthTypeId: "",
      birthWeightKg: "",
      valueUsed: "",
      groupId: "",
      notes: "",
    },
  });

  const { data: animals } = trpc.animals.lookup.useQuery({ isActive: true });
  const { data: birthTypes } = trpc.config.getBirthTypes.useQuery();
  const { data: groups } = trpc.config.getGroups.useQuery();

  const females = (animals ?? []).filter((a: any) => a.animal.sex === "female");
  const males = (animals ?? []).filter((a: any) => a.animal.sex === "male");

  const utils = trpc.useUtils();
  const recordBirth = trpc.breeding.recordBirth.useMutation({
    onSuccess: () => {
      toast.success(t("breeding.birthRecorded"));
      utils.breeding.listLambing.invalidate();
      setOpen(false);
      reset();
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (data: any) => {
    if (!data.sex || !data.birthTypeId) {
      toast.error(t("breeding.sexBirthTypeRequired"));
      return;
    }
    recordBirth.mutate({
      birthDate: data.birthDate,
      damId: data.damId ? Number(data.damId) : undefined,
      sireId: data.sireId ? Number(data.sireId) : undefined,
      sex: data.sex as "male" | "female",
      birthTypeId: Number(data.birthTypeId),
      birthWeightKg: data.birthWeightKg || undefined,
      valueUsed: data.valueUsed || undefined,
      groupId: data.groupId ? Number(data.groupId) : undefined,
      notes: data.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" />{t("breeding.recordBirth")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("breeding.recordNewBirth")}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("breeding.birthDate")} *</Label>
              <Controller name="birthDate" control={control} render={({ field }) => (
                <Input type="date" {...field} />
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("breeding.birthType")} *</Label>
              <Controller name="birthTypeId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectType")} /></SelectTrigger>
                  <SelectContent>
                    {(birthTypes ?? []).map((bt: any) => (
                      <SelectItem key={bt.id} value={String(bt.id)}>{bt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Sex *</Label>
              <Controller name="sex" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectSex")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">{t("common.female")}</SelectItem>
                    <SelectItem value="male">{t("common.male")}</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("breeding.birthWeight")}</Label>
              <Controller name="birthWeightKg" control={control} render={({ field }) => (
                <Input type="number" placeholder="0.0" {...field} />
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("breeding.valueUsed")}</Label>
              <Controller name="valueUsed" control={control} render={({ field }) => (
                <Input type="number" placeholder="0.00" {...field} />
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("breeding.dam")}</Label>
              <Controller name="damId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder={t("breeding.selectDam")} /></SelectTrigger>
                  <SelectContent>
                    {females.map((a: any) => (
                      <SelectItem key={a.animal.id} value={String(a.animal.id)}>{a.animal.animalId}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("breeding.sire")}</Label>
              <Controller name="sireId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder={t("breeding.selectSire")} /></SelectTrigger>
                  <SelectContent>
                    {males.map((a: any) => (
                      <SelectItem key={a.animal.id} value={String(a.animal.id)}>{a.animal.animalId}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>{t("breeding.assignToGroup")}</Label>
              <Controller name="groupId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectGroup")} /></SelectTrigger>
                  <SelectContent>
                    {(groups ?? []).map((g: any) => (
                      <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>{t("common.notes")}</Label>
              <Controller name="notes" control={control} render={({ field }) => (
                <Input placeholder={t("common.optionalNotes")} {...field} />
              )} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={recordBirth.isPending}>
              {recordBirth.isPending ? "Recording..." : t("breeding.recordBirth")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Breeding() {
  const { t } = useTranslation();
  const { can, canCreate, canUpdate, canDelete } = usePermissions("breeding");
  const canPromote = canUpdate && can("animals", "create");
  const [, setLocation] = useLocation();
  const { data: lambingLog, isLoading, refetch } = trpc.breeding.listLambing.useQuery();
  const utils = trpc.useUtils();

  const deleteLambingLog = trpc.recycleBin.deleteLambingLog.useMutation({
    onSuccess: () => { toast.success(t("breeding.birthMovedToBin")); utils.breeding.listLambing.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const promoteLamb = trpc.breeding.promoteLamb.useMutation({
    onSuccess: (data) => {
      toast.success(t("breeding.lambPromotedAs", { id: data.animalId }));
      setPromoteDialog({ open: false, lambId: null });
      setPromoteForm((form) => ({ ...form, animalIdNumber: "" }));
      utils.breeding.listLambing.invalidate();
      utils.animals.list.invalidate();
      utils.dashboard.getKPIs.invalidate();
      utils.dashboard.getHeadCountByCategory.invalidate();
      utils.feed.getStockStatus.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: categories } = trpc.config.getCategories.useQuery();
  const { data: species } = trpc.config.getSpecies.useQuery();
  const { data: groups } = trpc.config.getGroups.useQuery();
  const { data: statuses } = trpc.config.getStatuses.useQuery();

  const [promoteDialog, setPromoteDialog] = useState<{ open: boolean; lambId: number | null }>({ open: false, lambId: null });
  const [promoteForm, setPromoteForm] = useState({
    categoryId: "",
    speciesId: "",
    groupId: "",
    statusId: "",
    acquisitionDate: new Date().toISOString().split("T")[0],
    animalIdNumber: "",
  });
  const selectedPromotionCategory = (categories ?? []).find(
    (category: any) => String(category.id) === promoteForm.categoryId,
  );
  const promotionCategories = (categories ?? []).filter(
    (category: any) =>
      !promoteForm.speciesId || String(category.speciesId) === promoteForm.speciesId,
  );
  const promotionGroups = (groups ?? []).filter(
    (group: any) =>
      (!group.speciesId || String(group.speciesId) === promoteForm.speciesId) &&
      (!group.categoryId || String(group.categoryId) === promoteForm.categoryId),
  );

  const handlePromote = () => {
    if (!promoteDialog.lambId || !promoteForm.categoryId || !promoteForm.speciesId || !promoteForm.groupId || !promoteForm.statusId) {
      toast.error(t("breeding.promotionFieldsRequired"));
      return;
    }
    promoteLamb.mutate({
      lambingLogId: promoteDialog.lambId,
      categoryId: Number(promoteForm.categoryId),
      speciesId: Number(promoteForm.speciesId),
      groupId: Number(promoteForm.groupId),
      statusId: Number(promoteForm.statusId),
      acquisitionDate: promoteForm.acquisitionDate,
      animalIdNumber: promoteForm.animalIdNumber || undefined,
    });
  };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Egg className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            {t("breeding.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {(lambingLog ?? []).length} birth records · {(lambingLog ?? []).filter((l: any) => !l.isPromoted).length} pending promotion
          </p>
        </div>
        {canCreate && <RecordBirthDialog onSuccess={refetch} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("breeding.lambingLog")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("breeding.lambId")}</TableHead>
                  <TableHead>{t("breeding.birthDate")}</TableHead>
                  <TableHead>{t("breeding.age")}</TableHead>
                  <TableHead>Sex</TableHead>
                  <TableHead>{t("breeding.birthType")}</TableHead>
                  <TableHead>{t("breeding.birthWeight")}</TableHead>
                  <TableHead>Value (EGP)</TableHead>
                  <TableHead>{t("breeding.dam")}</TableHead>
                  <TableHead>{t("breeding.sire")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (lambingLog ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-12 text-muted-foreground">{t("breeding.noBirthRecords")}</TableCell></TableRow>
                ) : (
                  (lambingLog ?? []).map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono font-semibold text-primary">{l.lambId}</TableCell>
                      <TableCell>{new Date(l.birthDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{(() => {
                        const birth = new Date(l.birthDate);
                        const now = new Date();
                        const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
                        if (months < 1) {
                          const days = Math.max(0, Math.floor((now.getTime() - birth.getTime()) / 86400000));
                          return `${days}d`;
                        }
                        if (months < 12) return `${months}mo`;
                        const years = Math.floor(months / 12);
                        const remMonths = months % 12;
                        return remMonths === 0 ? `${years}y` : `${years}y ${remMonths}mo`;
                      })()}</TableCell>
                      <TableCell className="capitalize">{l.sex}</TableCell>
                      <TableCell>{l.birthTypeName ?? "—"}</TableCell>
                      <TableCell>{l.birthWeightKg ? `${parseFloat(l.birthWeightKg).toFixed(1)} kg` : "—"}</TableCell>
                      <TableCell>{l.valueUsed ? `${parseFloat(l.valueUsed).toFixed(2)} EGP` : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {l.damAnimalId ? (
                          <button onClick={() => setLocation(`/animals/${l.effectiveDamId ?? l.damId}`)} className="text-primary hover:underline">{l.damAnimalId}</button>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {l.sireAnimalId ? (
                          <button onClick={() => setLocation(`/animals/${l.effectiveSireId ?? l.sireId}`)} className="text-primary hover:underline">{l.sireAnimalId}</button>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {l.isPromoted ? (
                          <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">{t("breeding.promoted")}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">{t("common.pending")}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canPromote && !l.isPromoted && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setPromoteForm((form) => ({ ...form, animalIdNumber: "" }));
                                setPromoteDialog({ open: true, lambId: l.id });
                              }}
                            >
                              {t("breeding.promote")}
                            </Button>
                          )}
                          {canDelete && <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2">
                                  <AlertTriangle className="h-5 w-5 text-destructive" />
                                  {t("breeding.deleteBirthRecord")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Move birth record <strong>{l.lambId}</strong> to the Recycle Bin? You can restore it anytime.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteLambingLog.mutate({ id: l.id })}>
                                  {t("common.moveToBin")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Promote Dialog */}
      <Dialog open={promoteDialog.open} onOpenChange={(o) => setPromoteDialog({ open: o, lambId: promoteDialog.lambId })}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto overscroll-contain">
          <DialogHeader><DialogTitle>{t("breeding.promoteLambToRegistry")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="promotion-species">Species *</Label>
              <Select
                value={promoteForm.speciesId}
                onValueChange={(value) => setPromoteForm((form) => ({
                  ...form,
                  speciesId: value,
                  categoryId: "",
                  groupId: "",
                }))}
              >
                <SelectTrigger id="promotion-species"><SelectValue placeholder={t("common.selectSpecies")} /></SelectTrigger>
                <SelectContent>
                  {(species ?? []).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="promotion-category">Category *</Label>
              <Select
                value={promoteForm.categoryId}
                onValueChange={(value) => setPromoteForm((form) => ({
                  ...form,
                  categoryId: value,
                  groupId: "",
                }))}
              >
                <SelectTrigger id="promotion-category"><SelectValue placeholder={t("common.selectCategory")} /></SelectTrigger>
                <SelectContent>
                  {promotionCategories.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <AnimalIdNumberField
              inputId="promotion-animal-id-number"
              label={t("animals.animalIdNumber")}
              hint={t("animals.animalIdNumberHint")}
              placeholder={t("animals.animalIdNumberPlaceholder")}
              prefix={selectedPromotionCategory?.idPrefix ?? ""}
              value={promoteForm.animalIdNumber}
              onChange={(animalIdNumber) => setPromoteForm((form) => ({ ...form, animalIdNumber }))}
            />
            <div className="space-y-1.5">
              <Label htmlFor="promotion-group">Group *</Label>
              <Select value={promoteForm.groupId} onValueChange={(v) => setPromoteForm((f) => ({ ...f, groupId: v }))}>
                <SelectTrigger id="promotion-group"><SelectValue placeholder={t("common.selectGroup")} /></SelectTrigger>
                <SelectContent>
                  {promotionGroups.map((g: any) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="promotion-status">Initial Status *</Label>
              <Select value={promoteForm.statusId} onValueChange={(v) => setPromoteForm((f) => ({ ...f, statusId: v }))}>
                <SelectTrigger id="promotion-status"><SelectValue placeholder={t("common.selectStatus")} /></SelectTrigger>
                <SelectContent>
                  {(statuses ?? []).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="promotion-acquisition-date">Acquisition Date *</Label>
              <Input
                id="promotion-acquisition-date"
                name="acquisitionDate"
                type="date"
                value={promoteForm.acquisitionDate}
                onChange={(e) => setPromoteForm((f) => ({ ...f, acquisitionDate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteDialog({ open: false, lambId: null })}>{t("common.cancel")}</Button>
            <Button onClick={handlePromote} disabled={promoteLamb.isPending}>
              {promoteLamb.isPending ? t("breeding.promoting") : t("breeding.promoteToRegistry")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
