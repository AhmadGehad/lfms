import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { AlertTriangle, CalendarDays, Pencil, Syringe, Trash2, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

function VaccinationStatusBadge({ record }: { record: any }) {
  const { t } = useTranslation();
  if (record.isCompleted) return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />{t("vaccine.completed")}</Badge>;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(record.nextDueDate instanceof Date ? record.nextDueDate.toISOString() : record.nextDueDate);
  dueDate.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
  
  if (diffDays < 0) return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">{t("vaccine.overdue")}</Badge>;
  if (diffDays <= 7) return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">{t("vaccine.due")}</Badge>;
  return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">{t("vaccine.upcoming")}</Badge>;
}

function VaccinationRecordFormDialog({ record, onSuccess }: { record?: any; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    animalId: record?.animalId ? String(record.animalId) : "",
    vaccineId: record?.vaccineId ? String(record.vaccineId) : "",
    vaccinationDate: record?.vaccinationDate ? new Date(record.vaccinationDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
    batchNumber: record?.batchNumber || "",
    notes: record?.notes || "",
    veterinarian: record?.veterinarian || "",
    isCompleted: record?.isCompleted || false,
  });

  const { data: animals } = trpc.animals.list.useQuery();
  const { data: vaccines } = trpc.config.getVaccines.useQuery();
  const utils = trpc.useUtils();

  const addMutation = trpc.vaccination.addVaccinationRecord.useMutation({
    onSuccess: () => {
      toast.success(t("vaccine.vaccinationSaved"));
      utils.vaccination.getVaccinationRecords.invalidate();
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.vaccination.updateVaccinationRecord.useMutation({
    onSuccess: () => {
      toast.success(t("vaccine.vaccinationSaved"));
      utils.vaccination.getVaccinationRecords.invalidate();
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.animalId) return toast.error(t("vaccine.animalRequired"));
    if (!form.vaccineId) return toast.error(t("vaccine.vaccineRequired"));
    if (!form.vaccinationDate) return toast.error(t("vaccine.dateRequired"));

    if (record) {
      updateMutation.mutate({
        id: record.id,
        vaccinationDate: form.vaccinationDate,
        batchNumber: form.batchNumber || undefined,
        notes: form.notes || undefined,
        veterinarian: form.veterinarian || undefined,
        isCompleted: form.isCompleted,
      });
    } else {
      addMutation.mutate({
        animalId: parseInt(form.animalId),
        vaccineId: parseInt(form.vaccineId),
        vaccinationDate: form.vaccinationDate,
        batchNumber: form.batchNumber || undefined,
        notes: form.notes || undefined,
        veterinarian: form.veterinarian || undefined,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Syringe className="h-4 w-4" />{record ? t("vaccine.editVaccination") : t("vaccine.addVaccination")}</Button>
      </DialogTrigger>
      <DialogContent className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{record ? t("vaccine.editVaccination") : t("vaccine.addVaccination")}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t("vaccine.selectAnimal")} *</Label>
            <Select value={form.animalId} onValueChange={(v) => setForm((f) => ({ ...f, animalId: v }))} disabled={!!record}>
              <SelectTrigger><SelectValue placeholder={t("vaccine.selectAnimal")} /></SelectTrigger>
              <SelectContent>
                {(animals ?? []).map((a: any) => (
                  <SelectItem key={a.animal.id} value={String(a.animal.id)}>{a.animal.animalId}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("vaccine.selectVaccine")} *</Label>
            <Select value={form.vaccineId} onValueChange={(v) => setForm((f) => ({ ...f, vaccineId: v }))} disabled={!!record}>
              <SelectTrigger><SelectValue placeholder={t("vaccine.selectVaccine")} /></SelectTrigger>
              <SelectContent>
                {(vaccines ?? []).map((v: any) => (
                  <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("vaccine.vaccinationDate")} *</Label>
            <Input type="date" value={form.vaccinationDate} onChange={(e) => setForm((f) => ({ ...f, vaccinationDate: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("vaccine.batchNumber")}</Label>
            <Input placeholder="e.g. BATCH-2024-001" value={form.batchNumber} onChange={(e) => setForm((f) => ({ ...f, batchNumber: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("vaccine.veterinarian")}</Label>
            <Input placeholder={t("common.none")} value={form.veterinarian} onChange={(e) => setForm((f) => ({ ...f, veterinarian: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Input placeholder={t("common.optionalNotes")} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          {record && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="completed" checked={form.isCompleted} onChange={(e) => setForm((f) => ({ ...f, isCompleted: e.target.checked }))} className="h-4 w-4" />
              <Label htmlFor="completed">{t("vaccine.isCompleted")}</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={addMutation.isPending || updateMutation.isPending}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AnimalVaccinations() {
  const { t } = useTranslation();
  const { data: records, isLoading } = trpc.vaccination.getVaccinationRecords.useQuery();
  const utils = trpc.useUtils();

  const deleteMutation = trpc.vaccination.deleteVaccinationRecord.useMutation({
    onSuccess: () => {
      toast.success(t("vaccine.vaccinationDeleted"));
      utils.vaccination.getVaccinationRecords.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const fmtDate = (d: any) => d ? new Date(d instanceof Date ? d.toISOString() : d).toLocaleDateString() : "—";

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Syringe className="h-6 w-6 text-primary" />
          {t("vaccine.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage animal vaccination records and track due dates
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-end gap-2 mb-4">
            <VaccinationRecordFormDialog onSuccess={() => {}} />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.animal")}</TableHead>
                  <TableHead>{t("vaccine.vaccineName")}</TableHead>
                  <TableHead>{t("vaccine.vaccinationDate")}</TableHead>
                  <TableHead>{t("vaccine.nextDueDate")}</TableHead>
                  <TableHead>{t("vaccine.batchNumber")}</TableHead>
                  <TableHead>{t("vaccine.veterinarian")}</TableHead>
                  <TableHead>{t("vaccine.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => (<TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>))}</TableRow>
                  ))
                ) : (records ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">{t("vaccine.noVaccinations")}</TableCell></TableRow>
                ) : (
                  (records ?? []).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.animalIdStr}</TableCell>
                      <TableCell>{r.vaccineName}</TableCell>
                      <TableCell>{fmtDate(r.vaccinationDate)}</TableCell>
                      <TableCell>{fmtDate(r.nextDueDate)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{r.batchNumber ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{r.veterinarian ?? "—"}</TableCell>
                      <TableCell><VaccinationStatusBadge record={r} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <VaccinationRecordFormDialog record={r} onSuccess={() => {}} />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />{t("vaccine.deleteVaccination")}</AlertDialogTitle>
                                <AlertDialogDescription>{t("vaccine.deleteVaccinationConfirm", { animal: r.animalIdStr, vaccine: r.vaccineName })}</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMutation.mutate({ id: r.id })}>{t("common.delete")}</AlertDialogAction>
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
    </div>
  );
}
