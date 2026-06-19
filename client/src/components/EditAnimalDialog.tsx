import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { AnimalIdNumberField } from "@/components/AnimalIdNumberField";
import { extractAnimalIdNumber } from "@shared/animalIds";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type EditAnimalDialogProps = {
  animalId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditAnimalDialog({
  animalId,
  open,
  onOpenChange,
}: EditAnimalDialogProps) {
  const { t } = useTranslation();
  const queryEnabled = open && animalId !== null;
  const { data: animal } = trpc.animals.getById.useQuery(
    { id: animalId! },
    { enabled: queryEnabled },
  );
  const speciesFilter = animal?.animal.speciesId
    ? { speciesId: animal.animal.speciesId }
    : undefined;
  const { data: groups } = trpc.config.getGroups.useQuery(
    speciesFilter,
    { enabled: open && Boolean(animal) },
  );
  const { data: statuses } = trpc.config.getStatuses.useQuery(undefined, { enabled: open });
  const { data: ownersList } = trpc.config.getOwnerOptions.useQuery(undefined, { enabled: open });
  const { data: categories } = trpc.config.getCategories.useQuery(
    speciesFilter,
    { enabled: open && Boolean(animal) },
  );
  const { data: females } = trpc.animals.lookup.useQuery(
    { isActive: true, sex: "female", limit: 500 },
    { enabled: open },
  );
  const { data: males } = trpc.animals.lookup.useQuery(
    { isActive: true, sex: "male", limit: 500 },
    { enabled: open },
  );
  const utils = trpc.useUtils();
  const { control, handleSubmit, reset, watch } = useForm<any>();
  const selectedCategoryId = watch("categoryId");
  const selectedCategory = (categories ?? []).find(
    (category: any) => String(category.id) === selectedCategoryId,
  );

  useEffect(() => {
    if (!open || !animal) return;
    const currentCategory = (categories ?? []).find(
      (category: any) => category.id === animal.animal.categoryId,
    );
    reset({
      categoryId: String(animal.animal.categoryId ?? ""),
      groupId: String(animal.animal.groupId ?? ""),
      statusId: String(animal.animal.statusId ?? ""),
      ownerId: animal.animal.ownerId ? String(animal.animal.ownerId) : "none",
      sex: animal.animal.sex ?? "",
      acquisitionDate: animal.animal.acquisitionDate
        ? new Date(animal.animal.acquisitionDate).toISOString().split("T")[0]
        : "",
      birthDate: animal.animal.birthDate
        ? new Date(animal.animal.birthDate).toISOString().split("T")[0]
        : "",
      purchaseCost: animal.animal.purchaseCost != null
        ? String(animal.animal.purchaseCost)
        : "",
      notes: animal.animal.notes ?? "",
      exitDate: animal.animal.exitDate
        ? new Date(animal.animal.exitDate).toISOString().split("T")[0]
        : "",
      exitReason: animal.animal.exitReason ?? "",
      damId: animal.animal.damId ? String(animal.animal.damId) : "none",
      sireId: animal.animal.sireId ? String(animal.animal.sireId) : "none",
      animalIdNumber: extractAnimalIdNumber(
        animal.animal.animalId,
        currentCategory?.idPrefix ?? "",
      ),
    });
  }, [animal, categories, open, reset]);

  const updateAnimal = trpc.animals.update.useMutation({
    onSuccess: () => {
      toast.success(t("common.saved") || "Saved");
      utils.animals.list.invalidate();
      utils.breeding.listLambing.invalidate();
      if (animalId !== null) {
        utils.animals.getById.invalidate({ id: animalId });
      }
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const onSubmit = handleSubmit((data) => {
    if (animalId === null) return;
    updateAnimal.mutate({
      id: animalId,
      categoryId: data.categoryId ? Number(data.categoryId) : undefined,
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
      damId: data.damId && data.damId !== "none" ? Number(data.damId) : null,
      sireId: data.sireId && data.sireId !== "none" ? Number(data.sireId) : null,
      animalIdNumber: data.animalIdNumber || undefined,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>{t("common.edit")} {animal?.animal.animalId}</DialogTitle>
        </DialogHeader>
        {!animal ? (
          <div className="py-8">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-animal-category">{t("common.category")}</Label>
                <Controller name="categoryId" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="edit-animal-category"><SelectValue placeholder={t("common.category")} /></SelectTrigger>
                    <SelectContent>
                      {(categories ?? []).map((category: any) => (
                        <SelectItem key={category.id} value={String(category.id)}>
                          {category.name} ({category.idPrefix})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <Controller name="animalIdNumber" control={control} render={({ field }) => (
                <AnimalIdNumberField
                  inputId="edit-animal-id-number"
                  label={t("animals.animalIdNumber")}
                  hint={t("animals.animalIdNumberEditHint")}
                  placeholder={t("animals.animalIdNumberPlaceholder")}
                  prefix={selectedCategory?.idPrefix ?? ""}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  className="sm:col-span-2"
                />
              )} />
              <div className="space-y-1.5">
                <Label htmlFor="edit-animal-group">{t("common.group")}</Label>
                <Controller name="groupId" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="edit-animal-group"><SelectValue placeholder={t("common.group")} /></SelectTrigger>
                    <SelectContent>
                      {(groups ?? []).map((group: any) => (
                        <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-animal-status">{t("common.status")}</Label>
                <Controller name="statusId" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="edit-animal-status"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
                    <SelectContent>
                      {(statuses ?? []).map((status: any) => (
                        <SelectItem key={status.id} value={String(status.id)}>{status.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="edit-animal-owner">{t("owners.owner")}</Label>
                <Controller name="ownerId" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="edit-animal-owner"><SelectValue placeholder={t("owners.selectOwner")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("owners.noOwner")}</SelectItem>
                      {(ownersList ?? []).map((owner: any) => (
                        <SelectItem key={owner.id} value={String(owner.id)}>{owner.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-animal-sex">{t("common.sex")}</Label>
                <Controller name="sex" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="edit-animal-sex"><SelectValue placeholder={t("common.sex")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{t("common.male")}</SelectItem>
                      <SelectItem value="female">{t("common.female")}</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-animal-purchase-cost">{t("animals.purchaseCost")}</Label>
                <Controller name="purchaseCost" control={control} render={({ field }) => (
                  <Input id="edit-animal-purchase-cost" type="number" step="0.01" inputMode="decimal" {...field} />
                )} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-animal-birth-date">{t("animals.birthDate")}</Label>
                <Controller name="birthDate" control={control} render={({ field }) => (
                  <Input id="edit-animal-birth-date" type="date" {...field} />
                )} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-animal-acquisition-date">{t("animals.acquisitionDate")}</Label>
                <Controller name="acquisitionDate" control={control} render={({ field }) => (
                  <Input id="edit-animal-acquisition-date" type="date" {...field} />
                )} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-animal-exit-date">{t("animals.exitDate")}</Label>
                <Controller name="exitDate" control={control} render={({ field }) => (
                  <Input id="edit-animal-exit-date" type="date" {...field} />
                )} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-animal-exit-reason">{t("animals.exitReason")}</Label>
                <Controller name="exitReason" control={control} render={({ field }) => (
                  <Input id="edit-animal-exit-reason" maxLength={1000} {...field} />
                )} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-animal-dam">{t("animalProfile.dam")}</Label>
                <Controller name="damId" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="edit-animal-dam"><SelectValue placeholder={t("breeding.selectDam")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("common.unknown")}</SelectItem>
                      {(females ?? [])
                        .filter((item: any) => item.animal.id !== animalId)
                        .map((item: any) => (
                          <SelectItem key={item.animal.id} value={String(item.animal.id)}>
                            {item.animal.animalId}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-animal-sire">{t("animalProfile.sire")}</Label>
                <Controller name="sireId" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="edit-animal-sire"><SelectValue placeholder={t("breeding.selectSire")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("common.unknown")}</SelectItem>
                      {(males ?? [])
                        .filter((item: any) => item.animal.id !== animalId)
                        .map((item: any) => (
                          <SelectItem key={item.animal.id} value={String(item.animal.id)}>
                            {item.animal.animalId}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="edit-animal-notes">{t("common.notes")}</Label>
                <Controller name="notes" control={control} render={({ field }) => (
                  <Input id="edit-animal-notes" maxLength={2000} {...field} />
                )} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={updateAnimal.isPending}>
                {updateAnimal.isPending ? "…" : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
