import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Baby, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const fmtDate = (d: any) => (d ? String(d).slice(0, 10) : "—");

function statusBadge(displayStatus: string, t: (k: string) => string) {
  const map: Record<string, string> = {
    active: "bg-blue-100 text-blue-800 border-blue-200",
    due: "bg-amber-100 text-amber-800 border-amber-200",
    overdue: "bg-red-100 text-red-700 border-red-200",
    delivered: "bg-green-100 text-green-800 border-green-200",
    aborted: "bg-gray-100 text-gray-700 border-gray-200",
    lost: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return <Badge className={`text-xs ${map[displayStatus] ?? map.active}`}>{t(`pregnancy.${displayStatus}`)}</Badge>;
}

export default function Pregnancy() {
  const { t } = useTranslation();
  const { canCreate, canUpdate, canDelete } = usePermissions("pregnancy");
  const { ownerParam } = useOwnerFilter();
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: rows, isLoading, refetch } = trpc.pregnancy.list.useQuery({
    status: filterStatus !== "all" ? (filterStatus as any) : undefined,
    ownerId: ownerParam,
  });
  const { data: summary } = trpc.pregnancy.summary.useQuery({ ownerId: ownerParam });
  const utils = trpc.useUtils();

  const invalidate = () => {
    utils.pregnancy.list.invalidate();
    utils.pregnancy.summary.invalidate();
    refetch();
  };

  const updateStatus = trpc.pregnancy.update.useMutation({
    onSuccess: () => { toast.success(t("pregnancy.updated")); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteRecord = trpc.pregnancy.delete.useMutation({
    onSuccess: () => { toast.success(t("pregnancy.deleted")); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Baby className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            {t("pregnancy.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("pregnancy.subtitle")}</p>
        </div>
        {canCreate && <RecordPregnancyDialog onSuccess={invalidate} />}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{t("pregnancy.summaryActive")}</p><p className="text-2xl font-bold text-blue-600">{summary?.active ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{t("pregnancy.summaryDueSoon")}</p><p className="text-2xl font-bold text-amber-600">{summary?.dueSoon ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{t("pregnancy.summaryOverdue")}</p><p className="text-2xl font-bold text-red-600">{summary?.overdue ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{t("pregnancy.summaryDelivered")}</p><p className="text-2xl font-bold text-green-600">{summary?.delivered ?? 0}</p></CardContent></Card>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder={t("pregnancy.status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pregnancy.allStatuses")}</SelectItem>
            <SelectItem value="active">{t("pregnancy.active")}</SelectItem>
            <SelectItem value="delivered">{t("pregnancy.delivered")}</SelectItem>
            <SelectItem value="aborted">{t("pregnancy.aborted")}</SelectItem>
            <SelectItem value="lost">{t("pregnancy.lost")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("pregnancy.animal")}</TableHead>
                    <TableHead>{t("pregnancy.confirmationDate")}</TableHead>
                    <TableHead>{t("pregnancy.dueDate")}</TableHead>
                    <TableHead className="text-right">{t("pregnancy.daysPregnant")}</TableHead>
                    <TableHead className="text-right">{t("pregnancy.daysRemaining")}</TableHead>
                    <TableHead className="w-40">{t("pregnancy.progress")}</TableHead>
                    <TableHead>{t("pregnancy.status")}</TableHead>
                    <TableHead className="text-right">{t("common.actions") || "Actions"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rows ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">{t("pregnancy.noRecords")}</TableCell></TableRow>
                  ) : (
                    (rows ?? []).map((p: any) => (
                      <TableRow key={p.record.id}>
                        <TableCell>
                          <span className="font-mono font-semibold text-primary">{p.animalCode}</span>
                          {p.ownerName && <span className="block text-xs text-muted-foreground">{p.ownerName}</span>}
                        </TableCell>
                        <TableCell className="tabular-nums">{fmtDate(p.record.confirmationDate)}</TableCell>
                        <TableCell className="tabular-nums font-medium">{fmtDate(p.record.expectedDueDate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.daysPregnant}</TableCell>
                        <TableCell className={`text-right tabular-nums ${p.daysRemaining < 0 ? "text-red-600 font-medium" : ""}`}>{p.daysRemaining}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={p.progressPct} className="h-2" />
                            <span className="text-xs text-muted-foreground tabular-nums w-9">{p.progressPct}%</span>
                          </div>
                        </TableCell>
                        <TableCell>{statusBadge(p.displayStatus, t)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canUpdate && p.record.status === "active" && (
                              <Button size="icon" variant="ghost" title={t("pregnancy.markDelivered")} onClick={() => updateStatus.mutate({ id: p.record.id, status: "delivered", completedDate: new Date().toISOString().slice(0, 10) })}>
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                            {canUpdate && <EditPregnancyDialog record={p.record} onSuccess={invalidate} />}
                            {canDelete && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-red-600" /></Button></AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>{t("pregnancy.deleteConfirm")}</AlertDialogTitle><AlertDialogDescription>{p.animalCode}</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t("common.cancel") || "Cancel"}</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteRecord.mutate({ id: p.record.id })}>{t("common.delete") || "Delete"}</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Record dialog ────────────────────────────────────────────────────────────
function RecordPregnancyDialog({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    animalId: "", confirmationDate: new Date().toISOString().slice(0, 10),
    sireId: "", notifyBeforeDue: "7", checkupDate: "", notifyBeforeCheckup: "3", notes: "",
  });
  const { data: animals } = trpc.animals.lookup.useQuery({ isActive: true });
  const females = (animals ?? []).filter((a: any) => a.animal.sex === "female");
  const males = (animals ?? []).filter((a: any) => a.animal.sex === "male");

  const create = trpc.pregnancy.create.useMutation({
    onSuccess: () => { toast.success(t("pregnancy.recorded")); setOpen(false); setForm(f => ({ ...f, animalId: "", notes: "" })); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });

  const submit = () => {
    if (!form.animalId || !form.confirmationDate) { toast.error(t("pregnancy.selectFemale")); return; }
    create.mutate({
      animalId: Number(form.animalId),
      confirmationDate: form.confirmationDate,
      sireId: form.sireId ? Number(form.sireId) : undefined,
      notifyBeforeDue: form.notifyBeforeDue ? Number(form.notifyBeforeDue) : undefined,
      checkupDate: form.checkupDate || undefined,
      notifyBeforeCheckup: form.notifyBeforeCheckup ? Number(form.notifyBeforeCheckup) : undefined,
      notes: form.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" />{t("pregnancy.record")}</Button></DialogTrigger>
      <DialogContent className="max-w-md w-[95vw] sm:w-auto max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("pregnancy.record")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("pregnancy.animal")} *</Label>
            <Select value={form.animalId} onValueChange={(v) => setForm(f => ({ ...f, animalId: v }))}>
              <SelectTrigger><SelectValue placeholder={t("pregnancy.selectFemale")} /></SelectTrigger>
              <SelectContent>
                {females.map((a: any) => <SelectItem key={a.animal.id} value={String(a.animal.id)}>{a.animal.animalId}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("pregnancy.confirmationDate")} *</Label>
            <Input type="date" value={form.confirmationDate} onChange={(e) => setForm(f => ({ ...f, confirmationDate: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("pregnancy.sire")}</Label>
            <Select value={form.sireId || "none"} onValueChange={(v) => setForm(f => ({ ...f, sireId: v === "none" ? "" : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {males.map((a: any) => <SelectItem key={a.animal.id} value={String(a.animal.id)}>{a.animal.animalId}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("pregnancy.notifyBeforeDue")}</Label>
              <Input type="number" min={0} value={form.notifyBeforeDue} onChange={(e) => setForm(f => ({ ...f, notifyBeforeDue: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("pregnancy.checkupDate")}</Label>
              <Input type="date" value={form.checkupDate} onChange={(e) => setForm(f => ({ ...f, checkupDate: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("pregnancy.notes")}</Label>
            <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={create.isPending}>{t("pregnancy.save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit dialog ──────────────────────────────────────────────────────────────
function EditPregnancyDialog({ record, onSuccess }: { record: any; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    confirmationDate: String(record.confirmationDate).slice(0, 10),
    status: record.status as string,
    checkupDate: record.checkupDate ? String(record.checkupDate).slice(0, 10) : "",
    notifyBeforeDue: String(record.notifyBeforeDue ?? 7),
    notes: record.notes ?? "",
  });
  const update = trpc.pregnancy.update.useMutation({
    onSuccess: () => { toast.success(t("pregnancy.updated")); setOpen(false); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent className="max-w-md w-[95vw] sm:w-auto">
        <DialogHeader><DialogTitle>{t("pregnancy.edit")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("pregnancy.confirmationDate")}</Label>
            <Input type="date" value={form.confirmationDate} onChange={(e) => setForm(f => ({ ...f, confirmationDate: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("pregnancy.status")}</Label>
            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t("pregnancy.active")}</SelectItem>
                <SelectItem value="delivered">{t("pregnancy.delivered")}</SelectItem>
                <SelectItem value="aborted">{t("pregnancy.aborted")}</SelectItem>
                <SelectItem value="lost">{t("pregnancy.lost")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("pregnancy.notifyBeforeDue")}</Label>
              <Input type="number" min={0} value={form.notifyBeforeDue} onChange={(e) => setForm(f => ({ ...f, notifyBeforeDue: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("pregnancy.checkupDate")}</Label>
              <Input type="date" value={form.checkupDate} onChange={(e) => setForm(f => ({ ...f, checkupDate: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("pregnancy.notes")}</Label>
            <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => update.mutate({
            id: record.id,
            confirmationDate: form.confirmationDate,
            status: form.status as any,
            checkupDate: form.checkupDate || null,
            notifyBeforeDue: form.notifyBeforeDue ? Number(form.notifyBeforeDue) : undefined,
            notes: form.notes,
            completedDate: (form.status !== "active" && record.status === "active") ? new Date().toISOString().slice(0, 10) : undefined,
          })} disabled={update.isPending}>{t("pregnancy.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
