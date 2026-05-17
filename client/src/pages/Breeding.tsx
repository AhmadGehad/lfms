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
      groupId: "",
      notes: "",
    },
  });

  const { data: animals } = trpc.animals.list.useQuery({ isActive: true });
  const { data: birthTypes } = trpc.config.getBirthTypes.useQuery();
  const { data: groups } = trpc.config.getGroups.useQuery();

  const females = (animals ?? []).filter((a: any) => a.animal.sex === "female");
  const males = (animals ?? []).filter((a: any) => a.animal.sex === "male");

  const utils = trpc.useUtils();
  const recordBirth = trpc.breeding.recordBirth.useMutation({
    onSuccess: () => {
      toast.success("Birth recorded successfully");
      utils.breeding.listLambing.invalidate();
      setOpen(false);
      reset();
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (data: any) => {
    if (!data.sex || !data.birthTypeId) {
      toast.error("Sex and birth type are required");
      return;
    }
    recordBirth.mutate({
      birthDate: data.birthDate,
      damId: data.damId ? Number(data.damId) : undefined,
      sireId: data.sireId ? Number(data.sireId) : undefined,
      sex: data.sex as "male" | "female",
      birthTypeId: Number(data.birthTypeId),
      birthWeightKg: data.birthWeightKg || undefined,
      groupId: data.groupId ? Number(data.groupId) : undefined,
      notes: data.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" />{t("breeding.recordBirth")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record New Birth</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
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
                  <SelectTrigger><SelectValue placeholder="Select sex" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
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
              <Label>Dam (Mother)</Label>
              <Controller name="damId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Select dam" /></SelectTrigger>
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
                  <SelectTrigger><SelectValue placeholder="Select sire" /></SelectTrigger>
                  <SelectContent>
                    {males.map((a: any) => (
                      <SelectItem key={a.animal.id} value={String(a.animal.id)}>{a.animal.animalId}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Assign to Group</Label>
              <Controller name="groupId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                  <SelectContent>
                    {(groups ?? []).map((g: any) => (
                      <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notes</Label>
              <Controller name="notes" control={control} render={({ field }) => (
                <Input placeholder="Optional notes..." {...field} />
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
  const { data: lambingLog, isLoading, refetch } = trpc.breeding.listLambing.useQuery();
  const utils = trpc.useUtils();

  const deleteLambingLog = trpc.recycleBin.deleteLambingLog.useMutation({
    onSuccess: () => { toast.success("Birth record moved to Recycle Bin"); utils.breeding.listLambing.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const promoteLamb = trpc.breeding.promoteLamb.useMutation({
    onSuccess: (data) => {
      toast.success(`Lamb promoted as ${data.animalId}`);
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
  const [promoteForm, setPromoteForm] = useState({ categoryId: "", speciesId: "", groupId: "", statusId: "", acquisitionDate: new Date().toISOString().split("T")[0] });

  const handlePromote = () => {
    if (!promoteDialog.lambId || !promoteForm.categoryId || !promoteForm.speciesId || !promoteForm.groupId || !promoteForm.statusId) {
      toast.error("All fields required for promotion");
      return;
    }
    promoteLamb.mutate({
      lambingLogId: promoteDialog.lambId,
      categoryId: Number(promoteForm.categoryId),
      speciesId: Number(promoteForm.speciesId),
      groupId: Number(promoteForm.groupId),
      statusId: Number(promoteForm.statusId),
      acquisitionDate: promoteForm.acquisitionDate,
    });
    setPromoteDialog({ open: false, lambId: null });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Egg className="h-6 w-6 text-primary" />
            Breeding & Lambing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {(lambingLog ?? []).length} birth records · {(lambingLog ?? []).filter((l: any) => !l.isPromoted).length} pending promotion
          </p>
        </div>
        <RecordBirthDialog onSuccess={refetch} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lambing Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lamb ID</TableHead>
                  <TableHead>{t("breeding.birthDate")}</TableHead>
                  <TableHead>Sex</TableHead>
                  <TableHead>{t("breeding.birthType")}</TableHead>
                  <TableHead>{t("breeding.birthWeight")}</TableHead>
                  <TableHead>{t("breeding.dam")}</TableHead>
                  <TableHead>{t("breeding.sire")}</TableHead>
                  <TableHead>Status</TableHead>
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
                ) : (lambingLog ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No birth records yet. Record the first birth above.</TableCell></TableRow>
                ) : (
                  (lambingLog ?? []).map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono font-semibold text-primary">{l.lambId}</TableCell>
                      <TableCell>{new Date(l.birthDate).toLocaleDateString()}</TableCell>
                      <TableCell className="capitalize">{l.sex}</TableCell>
                      <TableCell>{l.birthTypeName ?? "—"}</TableCell>
                      <TableCell>{l.birthWeightKg ? `${parseFloat(l.birthWeightKg).toFixed(1)} kg` : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.damAnimalId ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.sireAnimalId ?? "—"}</TableCell>
                      <TableCell>
                        {l.isPromoted ? (
                          <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Promoted</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!l.isPromoted && (
                            <Button size="sm" variant="outline" onClick={() => setPromoteDialog({ open: true, lambId: l.id })}>
                              Promote
                            </Button>
                          )}
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
                                  Delete Birth Record
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Move birth record <strong>{l.lambId}</strong> to the Recycle Bin? You can restore it anytime.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteLambingLog.mutate({ id: l.id })}>
                                  Move to Bin
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Promote Lamb to Animal Registry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Species *</Label>
              <Select value={promoteForm.speciesId} onValueChange={(v) => setPromoteForm((f) => ({ ...f, speciesId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select species" /></SelectTrigger>
                <SelectContent>
                  {(species ?? []).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={promoteForm.categoryId} onValueChange={(v) => setPromoteForm((f) => ({ ...f, categoryId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Group *</Label>
              <Select value={promoteForm.groupId} onValueChange={(v) => setPromoteForm((f) => ({ ...f, groupId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                <SelectContent>
                  {(groups ?? []).map((g: any) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Initial Status *</Label>
              <Select value={promoteForm.statusId} onValueChange={(v) => setPromoteForm((f) => ({ ...f, statusId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {(statuses ?? []).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Acquisition Date *</Label>
              <Input type="date" value={promoteForm.acquisitionDate} onChange={(e) => setPromoteForm((f) => ({ ...f, acquisitionDate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteDialog({ open: false, lambId: null })}>{t("common.cancel")}</Button>
            <Button onClick={handlePromote} disabled={promoteLamb.isPending}>
              {promoteLamb.isPending ? "Promoting..." : "Promote to Registry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
