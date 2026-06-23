import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useLocation, useSearch } from "wouter";
import { Egg, Plus, Trash2, AlertTriangle, ExternalLink, Pencil } from "lucide-react";
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
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/hooks/usePermissions";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
import { AnimalIdNumberField } from "@/components/AnimalIdNumberField";
import { extractAnimalIdNumber } from "@shared/animalIds";

function isActiveReference(record: { isActive?: boolean | number }) {
  return record.isActive !== false && record.isActive !== 0;
}

function PromotionStatus({ record }: { record: any }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  if (!record.isPromoted) {
    return <Badge variant="outline" className="text-xs">{t("common.pending")}</Badge>;
  }

  const animalCode = record.promotedAnimalCode ?? null;
  if (record.promotedAnimalPurgedAt) {
    return (
      <div className="space-y-1">
        <Badge variant="secondary" className="text-xs">{t("breeding.promotedAnimalPurged")}</Badge>
        {animalCode ? <p className="font-mono text-xs text-muted-foreground">{animalCode}</p> : null}
      </div>
    );
  }

  if (record.promotedAnimalDeletedAt || (!record.promotedHeadId && record.isPromoted)) {
    return (
      <div className="space-y-1">
        <Badge className="border-amber-200 bg-amber-100 text-xs text-amber-800">
          {t("breeding.promotedAnimalDeleted")}
        </Badge>
        {animalCode ? <p className="font-mono text-xs text-muted-foreground">{animalCode}</p> : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 text-left text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={() => setLocation(`/animals/${record.promotedHeadId}`)}
    >
      <span>
        <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
          {t("breeding.promoted")}
        </Badge>
        {animalCode ? <span className="ms-1.5 font-mono text-xs">{animalCode}</span> : null}
      </span>
      <ExternalLink aria-hidden="true" className="h-3 w-3" />
      <span className="sr-only">{t("breeding.viewPromotedAnimal")}</span>
    </button>
  );
}

function RecordBirthDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { control, handleSubmit, reset, setValue, watch } = useForm({
    defaultValues: {
      birthDate: new Date().toISOString().split("T")[0],
      damId: "",
      sireId: "",
      sex: "",
      birthTypeId: "",
      birthWeightKg: "",
      valueUsed: "",
      groupId: "",
      speciesId: "",
      categoryId: "",
      notes: "",
      lambIdNumber: "",
    },
  });

  const selectedSpeciesId = watch("speciesId");
  const selectedCategoryId = watch("categoryId");
  const { data: animals } = trpc.animals.lookup.useQuery(
    {
      isActive: true,
      speciesId: selectedSpeciesId ? Number(selectedSpeciesId) : undefined,
    },
    { enabled: Boolean(selectedSpeciesId) },
  );
  const { data: birthTypes } = trpc.config.getBirthTypes.useQuery();
  const { data: species } = trpc.config.getSpecies.useQuery();
  const { data: categories } = trpc.config.getCategories.useQuery();
  const { data: groups } = trpc.config.getGroups.useQuery();
  const selectedCategory = (categories ?? []).find(
    (category: any) => String(category.id) === selectedCategoryId,
  );

  const females = (animals ?? []).filter((a: any) => a.animal.sex === "female");
  const males = (animals ?? []).filter((a: any) => a.animal.sex === "male");
  const lambCategories = (categories ?? []).filter(
    (category: any) =>
      isActiveReference(category) &&
      (!selectedSpeciesId || String(category.speciesId) === selectedSpeciesId),
  );
  const compatibleGroups = (groups ?? []).filter(
    (group: any) =>
      isActiveReference(group) &&
      (!group.speciesId || String(group.speciesId) === selectedSpeciesId) &&
      (!group.categoryId || String(group.categoryId) === selectedCategoryId),
  );

  const utils = trpc.useUtils();
  const recordBirth = trpc.breeding.recordBirth.useMutation({
    onSuccess: () => {
      toast.success(t("breeding.birthRecorded"));
      utils.breeding.listLambing.invalidate();
      utils.breeding.summary.invalidate();
      setOpen(false);
      reset();
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (data: any) => {
    if (!data.speciesId || !data.categoryId || !data.sex || !data.birthTypeId) {
      toast.error(t("breeding.birthRequiredFields"));
      return;
    }
    recordBirth.mutate({
      birthDate: data.birthDate,
      speciesId: Number(data.speciesId),
      categoryId: Number(data.categoryId),
      damId: data.damId ? Number(data.damId) : undefined,
      sireId: data.sireId ? Number(data.sireId) : undefined,
      sex: data.sex as "male" | "female",
      birthTypeId: Number(data.birthTypeId),
      birthWeightKg: data.birthWeightKg || undefined,
      valueUsed: data.valueUsed || undefined,
      groupId: data.groupId ? Number(data.groupId) : undefined,
      notes: data.notes || undefined,
      lambIdNumber: data.lambIdNumber || undefined,
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
              <Label htmlFor="birth-species">{t("common.species")} *</Label>
              <Controller name="speciesId" control={control} render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    setValue("categoryId", "");
                    setValue("groupId", "");
                    setValue("damId", "");
                    setValue("sireId", "");
                  }}
                >
                  <SelectTrigger id="birth-species"><SelectValue placeholder={t("common.selectSpecies")} /></SelectTrigger>
                  <SelectContent>
                    {(species ?? []).filter(isActiveReference).map((item: any) => (
                      <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="birth-category">{t("breeding.lambCategory")} *</Label>
              <Controller name="categoryId" control={control} render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    setValue("groupId", "");
                  }}
                  disabled={!selectedSpeciesId}
                >
                  <SelectTrigger id="birth-category"><SelectValue placeholder={t("breeding.selectLambCategory")} /></SelectTrigger>
                  <SelectContent>
                    {lambCategories.map((category: any) => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {category.name} ({category.idPrefix})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
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
                    {(birthTypes ?? []).filter(isActiveReference).map((bt: any) => (
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
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("breeding.assignToGroup")}</Label>
              <Controller name="groupId" control={control} render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={!selectedCategoryId}
                >
                  <SelectTrigger><SelectValue placeholder={t("common.selectGroup")} /></SelectTrigger>
                  <SelectContent>
                    {compatibleGroups.map((g: any) => (
                      <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <Controller name="lambIdNumber" control={control} render={({ field }) => (
              <AnimalIdNumberField
                inputId="birth-lamb-id-number"
                label={t("breeding.lambIdNumber")}
                hint={t("breeding.lambIdNumberHint")}
                placeholder={t("breeding.lambIdNumberPlaceholder")}
                prefix={selectedCategory?.idPrefix ?? ""}
                value={field.value}
                onChange={field.onChange}
                className="sm:col-span-2"
              />
            )} />
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("common.notes")}</Label>
              <Controller name="notes" control={control} render={({ field }) => (
                <Input placeholder={t("common.optionalNotes")} {...field} />
              )} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={recordBirth.isPending}>
              {recordBirth.isPending ? t("breeding.recording") : t("breeding.recordBirth")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditLambingDialog({ record, open, onOpenChange }: { record: any; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const { control, handleSubmit, reset, watch } = useForm<any>();
  const selectedSpeciesId = watch("speciesId");
  const selectedCategoryId = watch("categoryId");

  const { data: species } = trpc.config.getSpecies.useQuery(undefined, { enabled: open });
  const { data: categories } = trpc.config.getCategories.useQuery(
    { speciesId: selectedSpeciesId ? Number(selectedSpeciesId) : undefined },
    { enabled: open },
  );
  const { data: groups } = trpc.config.getGroups.useQuery(
    { speciesId: selectedSpeciesId ? Number(selectedSpeciesId) : undefined },
    { enabled: open },
  );
  const { data: birthTypes } = trpc.config.getBirthTypes.useQuery(undefined, { enabled: open });
  const { data: animals } = trpc.animals.lookup.useQuery(
    { isActive: true, speciesId: selectedSpeciesId ? Number(selectedSpeciesId) : undefined },
    { enabled: open && Boolean(selectedSpeciesId) },
  );

  const selectedCategory = (categories ?? []).find(
    (category: any) => String(category.id) === selectedCategoryId,
  );
  const females = (animals ?? []).filter((a: any) => a.animal.sex === "female");
  const males = (animals ?? []).filter((a: any) => a.animal.sex === "male");

  useEffect(() => {
    if (!open || !record) return;
    const currentCategory = (categories ?? []).find(
      (category: any) => category.id === record.categoryId,
    );
    reset({
      speciesId: record.speciesId ? String(record.speciesId) : "",
      categoryId: record.categoryId ? String(record.categoryId) : "",
      lambIdNumber: extractAnimalIdNumber(record.lambId, currentCategory?.idPrefix ?? ""),
      birthDate: record.birthDate ? new Date(record.birthDate).toISOString().split("T")[0] : "",
      sex: record.sex ?? "",
      birthTypeId: record.birthTypeId ? String(record.birthTypeId) : "",
      birthWeightKg: record.birthWeightKg ? String(record.birthWeightKg) : "",
      valueUsed: record.valueUsed ? String(record.valueUsed) : "",
      groupId: record.groupId ? String(record.groupId) : "",
      notes: record.notes ?? "",
      damId: record.damId ? String(record.damId) : "none",
      sireId: record.sireId ? String(record.sireId) : "none",
    });
  }, [record, categories, open, reset]);

  const utils = trpc.useUtils();
  const updateLambing = trpc.breeding.updateLambing.useMutation({
    onSuccess: () => {
      toast.success(t("common.saved") || "Saved");
      utils.breeding.listLambing.invalidate();
      utils.breeding.summary.invalidate();
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const onSubmit = handleSubmit((data) => {
    updateLambing.mutate({
      id: record.id,
      lambIdNumber: data.lambIdNumber || undefined,
      birthDate: data.birthDate || undefined,
      sex: data.sex || undefined,
      birthTypeId: data.birthTypeId ? Number(data.birthTypeId) : undefined,
      birthWeightKg: data.birthWeightKg || undefined,
      valueUsed: data.valueUsed || undefined,
      groupId: data.groupId ? Number(data.groupId) : undefined,
      notes: data.notes || undefined,
      damId: data.damId && data.damId !== "none" ? Number(data.damId) : null,
      sireId: data.sireId && data.sireId !== "none" ? Number(data.sireId) : null,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>{t("common.edit")} {record?.lambId}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("common.species")}</Label>
              <Controller name="speciesId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled>
                  <SelectTrigger><SelectValue placeholder={t("common.species")} /></SelectTrigger>
                  <SelectContent>
                    {(species ?? []).filter(isActiveReference).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.category")}</Label>
              <Controller name="categoryId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled>
                  <SelectTrigger><SelectValue placeholder={t("common.category")} /></SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).filter(isActiveReference).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.idPrefix})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <Controller name="lambIdNumber" control={control} render={({ field }) => (
              <AnimalIdNumberField
                inputId="edit-lamb-id-number"
                label={t("breeding.lambIdNumber")}
                hint={t("breeding.lambIdNumberEditHint")}
                placeholder={t("breeding.lambIdNumberPlaceholder")}
                prefix={selectedCategory?.idPrefix ?? ""}
                value={field.value ?? ""}
                onChange={field.onChange}
                className="sm:col-span-2"
              />
            )} />
            <div className="space-y-1.5">
              <Label>{t("breeding.birthDate")}</Label>
              <Controller name="birthDate" control={control} render={({ field }) => (
                <Input type="date" {...field} />
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Sex</Label>
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
              <Label>{t("breeding.birthType")}</Label>
              <Controller name="birthTypeId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectType")} /></SelectTrigger>
                  <SelectContent>
                    {(birthTypes ?? []).filter(isActiveReference).map((bt: any) => (
                      <SelectItem key={bt.id} value={String(bt.id)}>{bt.name}</SelectItem>
                    ))}
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
                    <SelectItem value="none">{t("common.unknown")}</SelectItem>
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
                    <SelectItem value="none">{t("common.unknown")}</SelectItem>
                    {males.map((a: any) => (
                      <SelectItem key={a.animal.id} value={String(a.animal.id)}>{a.animal.animalId}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("breeding.assignToGroup")}</Label>
              <Controller name="groupId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={!selectedCategoryId}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectGroup")} /></SelectTrigger>
                  <SelectContent>
                    {(groups ?? []).filter(isActiveReference).map((g: any) => (
                      <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("common.notes")}</Label>
              <Controller name="notes" control={control} render={({ field }) => (
                <Input placeholder={t("common.optionalNotes")} {...field} />
              )} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={updateLambing.isPending}>
              {updateLambing.isPending ? "…" : t("common.save")}
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
  const search = useSearch();
  const focusedRecordId = useMemo(() => {
    const value = new URLSearchParams(search).get("record");
    if (!value) return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [search]);
  type LambingFilter = "all" | "pending" | "promoted";
  const [lambingFilter, setLambingFilter] = useState<LambingFilter>(
    () => focusedRecordId ? "all" : "pending",
  );
  const { ownerParam } = useOwnerFilter();
  const listInput = {
    ...(lambingFilter === "all" ? {} : { isPromoted: lambingFilter === "promoted" }),
    ownerId: ownerParam,
  };
  const { data: lambingLog, isLoading } = trpc.breeding.listLambing.useQuery(listInput);
  const { data: lambingSummary } = trpc.breeding.summary.useQuery();
  const utils = trpc.useUtils();
  const deepLinkResolvedId = useRef<number | null>(null);

  useEffect(() => {
    if (!focusedRecordId || !lambingLog || isLoading) return;
    if (deepLinkResolvedId.current !== focusedRecordId && lambingFilter !== "all") {
      setLambingFilter("all");
      return;
    }
    const focusedRecord = (lambingLog as any[]).find((record) => record.id === focusedRecordId);
    if (deepLinkResolvedId.current !== focusedRecordId &&
        lambingFilter === "all" &&
        focusedRecord) {
      deepLinkResolvedId.current = focusedRecordId;
      setLambingFilter(focusedRecord.isPromoted ? "promoted" : "pending");
      return;
    }
    if (!focusedRecord) return;
    deepLinkResolvedId.current = focusedRecordId;
    const frame = window.requestAnimationFrame(() => {
      const row = document.getElementById(`lambing-record-${focusedRecordId}`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
      row?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedRecordId, isLoading, lambingFilter, lambingLog]);

  const deleteLambingLog = trpc.recycleBin.deleteLambingLog.useMutation({
    onSuccess: () => {
      toast.success(t("breeding.birthMovedToBin"));
      utils.breeding.listLambing.invalidate();
      utils.breeding.summary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const promoteLamb = trpc.breeding.promoteLamb.useMutation({
    onSuccess: (data) => {
      toast.success(t("breeding.lambPromotedAs", { id: data.animalId }));
      setPromoteDialog({ open: false, lambId: null });
      setPromoteForm((form) => ({ ...form, animalIdNumber: "" }));
      utils.breeding.listLambing.invalidate();
      utils.breeding.summary.invalidate();
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
  const [editDialog, setEditDialog] = useState<{ open: boolean; record: any }>({ open: false, record: null });
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
      isActiveReference(category) &&
      (!promoteForm.speciesId || String(category.speciesId) === promoteForm.speciesId),
  );
  const promotionGroups = (groups ?? []).filter(
    (group: any) =>
      isActiveReference(group) &&
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
            {lambingSummary
              ? t("breeding.recordsSummary", {
                  total: lambingSummary.total,
                  pending: lambingSummary.pending,
                })
              : t("common.loading")}
          </p>
        </div>
        {canCreate && <RecordBirthDialog />}
      </div>

      <Tabs
        value={lambingFilter}
        onValueChange={(value) => setLambingFilter(value as LambingFilter)}
      >
        <TabsList className="h-auto w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="all">
            {t("common.all")}
            <Badge variant="secondary" className="ms-1 text-[10px]">
              {lambingSummary?.total ?? "…"}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="pending">
            {t("common.pending")}
            <Badge variant="secondary" className="ms-1 text-[10px]">
              {lambingSummary?.pending ?? "…"}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="promoted">
            {t("breeding.promoted")}
            <Badge variant="secondary" className="ms-1 text-[10px]">
              {lambingSummary?.promoted ?? "…"}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

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
                    <TableRow
                      key={l.id}
                      id={`lambing-record-${l.id}`}
                      tabIndex={l.id === focusedRecordId ? -1 : undefined}
                      aria-current={l.id === focusedRecordId ? "true" : undefined}
                      className={l.id === focusedRecordId
                        ? "bg-primary/10 ring-2 ring-inset ring-primary focus:outline-none"
                        : undefined}
                    >
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
                        <PromotionStatus record={l} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canUpdate && !l.isPromoted && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditDialog({ open: true, record: l })}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
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
                          {canDelete && !l.isPromoted && <AlertDialog>
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
                                  {t("breeding.deleteBirthRecordDescription", { id: l.lambId })}
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
                  {(species ?? []).filter(isActiveReference).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
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
                disabled={!promoteForm.speciesId}
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
              <Select
                value={promoteForm.groupId}
                onValueChange={(v) => setPromoteForm((f) => ({ ...f, groupId: v }))}
                disabled={!promoteForm.categoryId}
              >
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
                  {(statuses ?? [])
                    .filter((item: any) => isActiveReference(item) && !item.isExitStatus)
                    .map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
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

      <EditLambingDialog
        record={editDialog.record}
        open={editDialog.open}
        onOpenChange={(o) => setEditDialog({ open: o, record: o ? editDialog.record : null })}
      />
    </div>
  );
}
