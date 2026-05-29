import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Scale, Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// ─── Record Weight Dialog ────────────────────────────────────────────────────
function RecordWeightDialog({
  animals,
  preselectedId,
  onSuccess,
}: {
  animals: any[];
  preselectedId?: number;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [animalId, setAnimalId] = useState(preselectedId ? String(preselectedId) : "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [weight, setWeight] = useState("");
  const utils = trpc.useUtils();

  const addWeight = trpc.animals.addWeight.useMutation({
    onSuccess: (result: any) => {
      if (result?.autoStaged && result?.newAnimalId) {
        toast.success(`Weight recorded — animal auto-staged to ${result.newAnimalId}`);
      } else {
        toast.success(t("fattening.weightRecorded"));
      }
      utils.animals.list.invalidate();
      utils.feed.getStockStatus.invalidate();
      utils.dashboard.getKPIs.invalidate();
      utils.dashboard.getHeadCountByCategory.invalidate();
      setOpen(false);
      setWeight("");
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v && preselectedId) setAnimalId(String(preselectedId));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        {preselectedId ? (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <Scale className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="gap-2"><Plus className="h-4 w-4" />{t("fattening.recordWeight")}</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm w-[95vw] sm:w-auto">
        <DialogHeader><DialogTitle>{t("fattening.recordWeight")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {!preselectedId && (
            <div className="space-y-1.5">
              <Label>{t("common.animal")}</Label>
              <Select value={animalId} onValueChange={setAnimalId}>
                <SelectTrigger><SelectValue placeholder={t("fattening.selectAnimal")} /></SelectTrigger>
                <SelectContent>
                  {animals.map((a: any) => (
                    <SelectItem key={a.animal.id} value={String(a.animal.id)}>{a.animal.animalId}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("common.date")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Weight (kg)</Label>
            <Input type="number" step="0.1" placeholder="0.0" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button
            onClick={() => addWeight.mutate({ animalId: Number(animalId), weighDate: date, weightKg: weight })}
            disabled={!animalId || !weight || addWeight.isPending}
          >
            {addWeight.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Animal Dialog ──────────────────────────────────────────────────────
function EditAnimalDialog({ animal, groups, onSuccess }: { animal: any; groups: any[]; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    groupId: animal.animal.groupId ? String(animal.animal.groupId) : "",
    notes: animal.animal.notes ?? "",
  });
  const utils = trpc.useUtils();

  const updateAnimal = trpc.animals.update.useMutation({
    onSuccess: () => {
      toast.success(t("fattening.animalUpdated"));
      utils.animals.list.invalidate();
      utils.animals.getAllPnL.invalidate();
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm w-[95vw] sm:w-auto">
        <DialogHeader>
          <DialogTitle>{t("fattening.editAnimal")}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">{animal.animal.animalId}</p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t("common.group")}</Label>
            <Select value={form.groupId} onValueChange={(v) => setForm((f) => ({ ...f, groupId: v }))}>
              <SelectTrigger><SelectValue placeholder={t("fattening.noGroup")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("common.noGroup")}</SelectItem>
                {groups.map((g: any) => (
                  <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Input
              placeholder={t("common.optionalNotes")}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button
            onClick={() =>
              updateAnimal.mutate({
                id: animal.animal.id,
                groupId: form.groupId && form.groupId !== "none" ? Number(form.groupId) : undefined,
                notes: form.notes || undefined,
              })
            }
            disabled={updateAnimal.isPending}
          >
            {updateAnimal.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function Fattening() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const { data: animals, isLoading } = trpc.animals.list.useQuery({ isActive: true });
  const { data: groups } = trpc.config.getGroups.useQuery();
  const utils = trpc.useUtils();

  const fatteningAnimals = (animals ?? []).filter((a: any) =>
    a.statusName?.toLowerCase().includes("fatten") || a.categoryName?.toLowerCase().includes("fatten")
  );

  const deleteAnimal = trpc.recycleBin.deleteAnimal.useMutation({
    onSuccess: () => {
      toast.success(t("fattening.movedToBin"));
      utils.animals.list.invalidate();
      utils.dashboard.getKPIs.invalidate();
      utils.dashboard.getHeadCountByCategory.invalidate();
      utils.feed.getStockStatus.invalidate();
      utils.animals.getAllPnL.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Scale className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            {t("fattening.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {fatteningAnimals.length} animals in fattening
          </p>
        </div>
        <RecordWeightDialog animals={fatteningAnimals} onSuccess={() => {}} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("fattening.fatteningAnimals")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("animals.animalId")}</TableHead>
                  <TableHead>{t("common.category")}</TableHead>
                  <TableHead>{t("common.group")}</TableHead>
                  <TableHead className="text-right">{t("animals.daysOnFarm")}</TableHead>
                  <TableHead className="text-right">{t("common.currentWeight")}</TableHead>
                  <TableHead className="text-right">{t("fattening.targetWeight")}</TableHead>
                  <TableHead className="text-right">% to Target</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : fatteningAnimals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      {t("fattening.noAnimalsFattening")}
                    </TableCell>
                  </TableRow>
                ) : (
                  fatteningAnimals.map((a: any) => {
                    const acqDate = a.animal.acquisitionDate instanceof Date
                      ? a.animal.acquisitionDate
                      : new Date(a.animal.acquisitionDate);
                    const days = Math.max(0, Math.floor((Date.now() - acqDate.getTime()) / 86400000));
                    const currentWeight = a.latestWeightKg
                      ? parseFloat(a.latestWeightKg)
                      : a.animal.weightAtAcquisition
                        ? parseFloat(a.animal.weightAtAcquisition)
                        : null;
                    const targetWeight = a.targetWeightKg ? parseFloat(a.targetWeightKg) : null;
                    const acqWeight = a.animal.weightAtAcquisition ? parseFloat(a.animal.weightAtAcquisition) : null;
                    const pctToTarget =
                      currentWeight != null && targetWeight && acqWeight != null && (targetWeight - acqWeight) > 0
                        ? Math.min(100, Math.round(((currentWeight - acqWeight) / (targetWeight - acqWeight)) * 100))
                        : null;

                    return (
                      <TableRow key={a.animal.id}>
                        <TableCell
                          className="font-mono font-semibold text-primary cursor-pointer hover:underline"
                          onClick={() => setLocation(`/animals/${a.animal.id}`)}
                        >
                          {a.animal.animalId}
                        </TableCell>
                        <TableCell>{a.categoryName}</TableCell>
                        <TableCell>{a.groupName ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{days}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {currentWeight != null ? `${currentWeight.toFixed(1)} kg` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {targetWeight ? `${targetWeight.toFixed(1)} kg` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pctToTarget != null ? (
                            <span className={pctToTarget >= 100 ? "text-green-600 font-semibold" : pctToTarget >= 75 ? "text-amber-600" : "text-muted-foreground"}>
                              {pctToTarget}%
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">{a.statusName}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Record weight for this animal */}
                            <RecordWeightDialog
                              animals={fatteningAnimals}
                              preselectedId={a.animal.id}
                              onSuccess={() => {}}
                            />
                            {/* Edit animal */}
                            <EditAnimalDialog
                              animal={a}
                              groups={groups ?? []}
                              onSuccess={() => {}}
                            />
                            {/* Delete animal */}
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
                                    {t("fattening.removeAnimal")}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Move <strong>{a.animal.animalId}</strong> to the Recycle Bin? You can restore it anytime.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive hover:bg-destructive/90"
                                    onClick={() => deleteAnimal.mutate({ id: a.animal.id })}
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
        </CardContent>
      </Card>
    </div>
  );
}
