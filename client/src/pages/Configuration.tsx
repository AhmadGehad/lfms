import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Settings, Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/hooks/usePermissions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

// ── Reusable inline edit dialog ───────────────────────────────────────────────
function EditDialog({ title, open, onOpenChange, onSave, isPending, children }: {
  title: string; open: boolean; onOpenChange: (v: boolean) => void;
  onSave: () => void; isPending: boolean; children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4">{children}</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={onSave} disabled={isPending}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Species Tab ──────────────────────────────────────────────────────────────
function SpeciesTab() {
  const { t } = useTranslation();
  const { canCreate, canUpdate } = usePermissions("configuration");
  const { data: species } = trpc.config.getSpecies.useQuery();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [gestationDays, setGestationDays] = useState("150");
  const utils = trpc.useUtils();

  const create = trpc.config.createSpecies.useMutation({
    onSuccess: () => { toast.success(`${t("config.species")} ${t("common.created")}`); utils.config.getSpecies.invalidate(); setOpen(false); setName(""); setDescription(""); setGestationDays("150"); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = trpc.config.updateSpecies.useMutation({
    onSuccess: () => { toast.success(`${t("config.species")} ${t("common.updated")}`); utils.config.getSpecies.invalidate(); setEditOpen(false); setEditItem(null); },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(s: any) { setEditItem({ ...s }); setEditOpen(true); }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">{t("config.species")}</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            {canCreate && (<Button size="sm" className="gap-2"><Plus className="h-3 w-3" />{t("config.addSpecies")}</Button>)}
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{t("config.addSpecies")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Sheep" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>{t("config.description")}</Label><Input placeholder={t("common.none")} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>{t("pregnancy.gestationDays")}</Label><Input type="number" min={1} placeholder="e.g. 147 sheep · 150 goat · 283 cattle" value={gestationDays} onChange={(e) => setGestationDays(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => create.mutate({ name, description: description || undefined, gestationDays: gestationDays ? Number(gestationDays) : undefined })} disabled={!name || create.isPending}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {editItem && (
        <EditDialog title={t("config.editSpecies")} open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={() => update.mutate({ id: editItem.id, name: editItem.name, description: editItem.description, gestationDays: editItem.gestationDays != null ? Number(editItem.gestationDays) : undefined })}>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>{t("config.description")}</Label><Input value={editItem.description ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, description: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>{t("pregnancy.gestationDays")}</Label><Input type="number" min={1} value={editItem.gestationDays ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, gestationDays: e.target.value }))} /></div>
        </EditDialog>
      )}

      <Table>
        <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>{t("config.description")}</TableHead><TableHead>{t("pregnancy.gestationDays")}</TableHead><TableHead>{t("config.statusLabel")}</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
        <TableBody>
          {(species ?? []).map((s: any) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{s.description ?? "—"}</TableCell>
              <TableCell className="tabular-nums">{s.gestationDays ?? "—"}</TableCell>
              <TableCell><Badge className="bg-green-100 text-green-800 border-green-200 text-xs">{t("common.active")}</Badge></TableCell>
              <TableCell>{canUpdate && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Categories Tab ───────────────────────────────────────────────────────────
function CategoriesTab() {
  const { t } = useTranslation();
  const { canCreate, canUpdate } = usePermissions("configuration");
  const { data: categories } = trpc.config.getCategories.useQuery();
  const { data: species } = trpc.config.getSpecies.useQuery();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", idPrefix: "", speciesId: "", targetWeightKg: "" });
  const utils = trpc.useUtils();

  const create = trpc.config.createCategory.useMutation({
    onSuccess: () => { toast.success(`${t("config.categories")} ${t("common.created")}`); utils.config.getCategories.invalidate(); setOpen(false); setForm({ name: "", idPrefix: "", speciesId: "", targetWeightKg: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = trpc.config.updateCategory.useMutation({
    onSuccess: () => { toast.success(`${t("config.categories")} ${t("common.updated")}`); utils.config.getCategories.invalidate(); setEditOpen(false); setEditItem(null); },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(c: any) {
    setEditItem({
      ...c,
      speciesId: String(c.speciesId),
      targetWeightKg: c.targetWeightKg ?? "",
      autoStageWeightKg: c.autoStageWeightKg ?? "",
      autoStageTargetCategoryId: c.autoStageTargetCategoryId ? String(c.autoStageTargetCategoryId) : "",
    });
    setEditOpen(true);
  }

  function handleSave() {
    if (!editItem) return;
    update.mutate({
      id: editItem.id,
      name: editItem.name,
      idPrefix: editItem.idPrefix,
      targetWeightKg: editItem.targetWeightKg || undefined,
      autoStageWeightKg: editItem.autoStageWeightKg || null,
      autoStageTargetCategoryId: editItem.autoStageTargetCategoryId ? parseInt(editItem.autoStageTargetCategoryId) : null,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">{t("config.animalCategories")}</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            {canCreate && (<Button size="sm" className="gap-2"><Plus className="h-3 w-3" />{t("config.addCategory")}</Button>)}
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{t("config.addCategory")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Lamb" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>ID Prefix *</Label><Input placeholder="e.g. LMB" value={form.idPrefix} onChange={(e) => setForm((f) => ({ ...f, idPrefix: e.target.value.toUpperCase() }))} maxLength={6} /></div>
              <div className="space-y-1.5">
                <Label>Species *</Label>
                <Select value={form.speciesId} onValueChange={(v) => setForm((f) => ({ ...f, speciesId: v }))}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectSpecies")} /></SelectTrigger>
                  <SelectContent>{(species ?? []).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Target Weight (kg)</Label><Input type="number" placeholder="0.0" value={form.targetWeightKg} onChange={(e) => setForm((f) => ({ ...f, targetWeightKg: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => create.mutate({ name: form.name, idPrefix: form.idPrefix, speciesId: Number(form.speciesId), targetWeightKg: form.targetWeightKg || undefined })} disabled={!form.name || !form.idPrefix || !form.speciesId || create.isPending}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {editItem && (
        <EditDialog title={t("config.editCategory")} open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={handleSave}>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>{t("config.idPrefix")}</Label><Input value={editItem.idPrefix} onChange={(e) => setEditItem((p: any) => ({ ...p, idPrefix: e.target.value.toUpperCase() }))} maxLength={6} /></div>
          <div className="space-y-1.5"><Label>Target Weight (kg)</Label><Input type="number" value={editItem.targetWeightKg} onChange={(e) => setEditItem((p: any) => ({ ...p, targetWeightKg: e.target.value }))} /></div>
          <div className="border-t pt-3 mt-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{t("config.autoStageSettings")}</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Auto-stage when weight ≥ (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g. 25 (leave blank to disable)"
                  value={editItem.autoStageWeightKg}
                  onChange={(e) => setEditItem((p: any) => ({ ...p, autoStageWeightKg: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("config.moveToCategory")}</Label>
                <Select
                  value={editItem.autoStageTargetCategoryId ? String(editItem.autoStageTargetCategoryId) : "none"}
                  onValueChange={(v) => setEditItem((p: any) => ({ ...p, autoStageTargetCategoryId: v === "none" ? null : v }))}
                >
                  <SelectTrigger><SelectValue placeholder={t("config.selectTargetCategory")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("config.noneDisableAutoStage")}</SelectItem>
                    {(categories ?? []).filter((c: any) => c.id !== editItem.id).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </EditDialog>
      )}

      <Table>
        <TableHeader><TableRow>
          <TableHead>{t("common.name")}</TableHead>
          <TableHead>{t("config.idPrefix")}</TableHead>
          <TableHead>{t("config.species")}</TableHead>
          <TableHead>{t("config.targetWeight")}</TableHead>
          <TableHead>{t("config.autoStageAt")}</TableHead>
          <TableHead className="w-16"></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {(categories ?? []).map((c: any) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="font-mono font-bold text-primary">{c.idPrefix}</TableCell>
              <TableCell>{c.speciesName}</TableCell>
              <TableCell>{c.targetWeightKg ? `${parseFloat(c.targetWeightKg).toFixed(1)} kg` : "—"}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {c.autoStageWeightKg
                  ? `≥${parseFloat(c.autoStageWeightKg).toFixed(0)} kg → ${(categories ?? []).find((x: any) => x.id === c.autoStageTargetCategoryId)?.name ?? `cat #${c.autoStageTargetCategoryId}`}`
                  : "—"}
              </TableCell>
              <TableCell>{canUpdate && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Groups Tab ───────────────────────────────────────────────────────────────
function GroupsTab() {
  const { t } = useTranslation();
  const { canCreate, canUpdate } = usePermissions("configuration");
  const { data: groups } = trpc.config.getGroups.useQuery();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", groupCode: "", description: "", latitude: "", longitude: "", color: "" });
  const utils = trpc.useUtils();

  const create = trpc.config.createGroup.useMutation({
    onSuccess: () => { toast.success(`${t("config.groups")} ${t("common.created")}`); utils.config.getGroups.invalidate(); setOpen(false); setForm({ name: "", groupCode: "", description: "", latitude: "", longitude: "", color: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = trpc.config.updateGroup.useMutation({
    onSuccess: () => { toast.success(`${t("config.groups")} ${t("common.updated")}`); utils.config.getGroups.invalidate(); setEditOpen(false); setEditItem(null); },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(g: any) { setEditItem({ ...g }); setEditOpen(true); }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">{t("config.groups")}</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            {canCreate && (<Button size="sm" className="gap-2"><Plus className="h-3 w-3" />{t("config.addGroup")}</Button>)}
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{t("config.addGroupPen")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Pen A" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Group Code *</Label><Input placeholder="e.g. PEN-A" value={form.groupCode} onChange={(e) => setForm((f) => ({ ...f, groupCode: e.target.value.toUpperCase() }))} /></div>
              <div className="space-y-1.5"><Label>{t("config.description")}</Label><Input placeholder={t("common.none")} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Latitude</Label><Input type="number" step="any" placeholder="e.g. 30.0444" value={form.latitude} onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Longitude</Label><Input type="number" step="any" placeholder="e.g. 31.2357" value={form.longitude} onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5"><Label>Color</Label>
                <div className="flex items-center gap-2">
                  <input type="color" className="h-9 w-12 rounded border cursor-pointer" value={form.color || "#2563eb"} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
                  {form.color && <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, color: "" }))}>Clear</Button>}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => create.mutate({ name: form.name, groupCode: form.groupCode || form.name.toUpperCase().replace(/\s+/g, '-'), description: form.description || undefined, latitude: form.latitude || undefined, longitude: form.longitude || undefined, color: form.color || undefined })} disabled={!form.name || create.isPending}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {editItem && (
        <EditDialog title={t("config.editGroupPen")} open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={() => update.mutate({ id: editItem.id, name: editItem.name, groupCode: editItem.groupCode, description: editItem.description || undefined, latitude: editItem.latitude ?? undefined, longitude: editItem.longitude ?? undefined, color: editItem.color ?? undefined })}>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>{t("config.groupCode")}</Label><Input value={editItem.groupCode ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, groupCode: e.target.value.toUpperCase() }))} /></div>
          <div className="space-y-1.5"><Label>{t("config.description")}</Label><Input value={editItem.description ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, description: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Latitude</Label><Input type="number" step="any" value={editItem.latitude ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, latitude: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Longitude</Label><Input type="number" step="any" value={editItem.longitude ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, longitude: e.target.value }))} /></div>
          </div>
          <div className="space-y-1.5"><Label>Color</Label>
            <div className="flex items-center gap-2">
              <input type="color" className="h-9 w-12 rounded border cursor-pointer" value={editItem.color || "#2563eb"} onChange={(e) => setEditItem((p: any) => ({ ...p, color: e.target.value }))} />
              {editItem.color && <Button variant="ghost" size="sm" onClick={() => setEditItem((p: any) => ({ ...p, color: null }))}>Clear</Button>}
            </div>
          </div>
        </EditDialog>
      )}

      <Table>
        <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>{t("config.code")}</TableHead><TableHead>Color</TableHead><TableHead>{t("config.description")}</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
        <TableBody>
          {(groups ?? []).map((g: any) => (
            <TableRow key={g.id}>
              <TableCell className="font-medium">{g.name}</TableCell>
              <TableCell className="font-mono text-sm">{g.groupCode ?? "—"}</TableCell>
              <TableCell>
                {g.color ? <span className="inline-block h-5 w-5 rounded border" style={{ backgroundColor: g.color }} /> : <span className="text-muted-foreground text-sm">—</span>}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">{g.description ?? "—"}</TableCell>
              <TableCell>{canUpdate && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)}><Pencil className="h-3.5 w-3.5" /></Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Statuses Tab ────────────────────────────────────────────────────────────
function StatusesTab() {
  const { t } = useTranslation();
  const { canCreate, canUpdate } = usePermissions("configuration");
  const { data: statuses } = trpc.config.getStatuses.useQuery();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const utils = trpc.useUtils();
  const create = trpc.config.createStatus.useMutation({
    onSuccess: () => { toast.success(`${t("config.statusLabel")} ${t("common.created")}`); utils.config.getStatuses.invalidate(); setOpen(false); setForm({ name: "", description: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = trpc.config.updateStatus.useMutation({
    onSuccess: () => { toast.success(`${t("config.statusLabel")} ${t("common.updated")}`); utils.config.getStatuses.invalidate(); setEditOpen(false); setEditItem(null); },
    onError: (e: any) => toast.error(e.message),
  });
  function openEdit(s: any) { setEditItem({ ...s }); setEditOpen(true); }
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">{t("config.statuses")}</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            {canCreate && (<Button size="sm" className="gap-2"><Plus className="h-3 w-3" />{t("config.addStatus")}</Button>)}
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{t("config.addAnimalStatus")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Quarantine" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>{t("config.description")}</Label><Input placeholder={t("common.none")} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => create.mutate({ name: form.name, description: form.description || undefined })} disabled={!form.name || create.isPending}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {editItem && (
        <EditDialog title={t("config.editAnimalStatus")} open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={() => update.mutate({ id: editItem.id, name: editItem.name, description: editItem.description || undefined })}>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>{t("config.description")}</Label><Input value={editItem.description ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, description: e.target.value }))} /></div>
        </EditDialog>
      )}
      <Table>
        <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>{t("config.description")}</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
        <TableBody>
          {(statuses ?? []).map((s: any) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{s.description ?? "—"}</TableCell>
              <TableCell>{canUpdate && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
// ── Birth Types Tab ──────────────────────────────────────────────────────────
function OwnersTab() {
  const { t } = useTranslation();
  const { canCreate, canUpdate } = usePermissions("configuration");
  const { data: owners } = trpc.config.getOwners.useQuery({ activeOnly: false });
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const utils = trpc.useUtils();
  const create = trpc.config.createOwner.useMutation({
    onSuccess: () => {
      toast.success(`${t("owners.owner")} ${t("common.created")}`);
      utils.config.getOwners.invalidate();
      setOpen(false);
      setForm({ name: "", phone: "", email: "", notes: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const update = trpc.config.updateOwner.useMutation({
    onSuccess: () => {
      toast.success(`${t("owners.owner")} ${t("common.updated")}`);
      utils.config.getOwners.invalidate();
      setEditOpen(false);
      setEditItem(null);
    },
    onError: (e: any) => toast.error(e.message),
  });
  function openEdit(o: any) { setEditItem({ ...o }); setEditOpen(true); }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">{t("owners.owners")}</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            {canCreate && (<Button size="sm" className="gap-2"><Plus className="h-3 w-3" />{t("owners.addOwner")}</Button>)}
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{t("owners.addOwner")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>{t("common.name")} *</Label><Input placeholder={t("owners.ownerNamePlaceholder")} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>{t("owners.phone")}</Label><Input placeholder="+20 ..." value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>{t("owners.email")}</Label><Input type="email" placeholder="name@example.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>{t("common.notes")}</Label><Input placeholder={t("common.none")} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => create.mutate({ name: form.name, phone: form.phone || undefined, email: form.email || undefined, notes: form.notes || undefined })} disabled={!form.name || create.isPending}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {editItem && (
        <EditDialog title={t("owners.editOwner")} open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={() => update.mutate({ id: editItem.id, name: editItem.name, phone: editItem.phone || null, email: editItem.email || undefined, notes: editItem.notes || undefined, isActive: editItem.isActive })}>
          <div className="space-y-1.5"><Label>{t("common.name")} *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>{t("owners.phone")}</Label><Input value={editItem.phone ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, phone: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>{t("owners.email")}</Label><Input value={editItem.email ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, email: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>{t("common.notes")}</Label><Input value={editItem.notes ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, notes: e.target.value }))} /></div>
          <div className="flex items-center gap-2">
            <input id="ownerActive" type="checkbox" checked={editItem.isActive} onChange={(e) => setEditItem((p: any) => ({ ...p, isActive: e.target.checked }))} />
            <Label htmlFor="ownerActive">{t("common.active")}</Label>
          </div>
        </EditDialog>
      )}
      <Table>
        <TableHeader><TableRow>
          <TableHead>{t("common.name")}</TableHead>
          <TableHead>{t("owners.phone")}</TableHead>
          <TableHead>{t("owners.email")}</TableHead>
          <TableHead>{t("common.notes")}</TableHead>
          <TableHead>{t("common.status")}</TableHead>
          <TableHead className="w-16"></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {(owners ?? []).map((o: any) => (
            <TableRow key={o.id}>
              <TableCell className="font-medium">{o.name}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{o.phone ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{o.email ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground text-sm max-w-[160px] truncate">{o.notes ?? "—"}</TableCell>
              <TableCell>{o.isActive ? <Badge className="bg-green-100 text-green-800 border-green-200">{t("common.active")}</Badge> : <Badge variant="outline">{t("common.inactive")}</Badge>}</TableCell>
              <TableCell>{canUpdate && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(o)}><Pencil className="h-3.5 w-3.5" /></Button>}</TableCell>
            </TableRow>
          ))}
          {(owners ?? []).length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("owners.noOwners")}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function BirthTypesTab() {
  const { t } = useTranslation();
  const { canCreate, canUpdate } = usePermissions("configuration");
  const { data: birthTypes } = trpc.config.getBirthTypes.useQuery();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const utils = trpc.useUtils();
  const create = trpc.config.createBirthType.useMutation({
    onSuccess: () => { toast.success(`${t("config.birthTypes")} ${t("common.created")}`); utils.config.getBirthTypes.invalidate(); setOpen(false); setForm({ name: "", description: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = trpc.config.updateBirthType.useMutation({
    onSuccess: () => { toast.success(`${t("config.birthTypes")} ${t("common.updated")}`); utils.config.getBirthTypes.invalidate(); setEditOpen(false); setEditItem(null); },
    onError: (e: any) => toast.error(e.message),
  });
  function openEdit(b: any) { setEditItem({ ...b }); setEditOpen(true); }
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">{t("config.birthTypes")}</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            {canCreate && (<Button size="sm" className="gap-2"><Plus className="h-3 w-3" />{t("config.addBirthType")}</Button>)}
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{t("config.addBirthType")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Natural" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>{t("config.description")}</Label><Input placeholder={t("common.none")} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => create.mutate({ name: form.name, description: form.description || undefined })} disabled={!form.name || create.isPending}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {editItem && (
        <EditDialog title={t("config.editBirthType")} open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={() => update.mutate({ id: editItem.id, name: editItem.name, description: editItem.description || undefined })}>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>{t("config.description")}</Label><Input value={editItem.description ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, description: e.target.value }))} /></div>
        </EditDialog>
      )}
      <Table>
        <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>{t("config.description")}</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
        <TableBody>
          {(birthTypes ?? []).map((b: any) => (
            <TableRow key={b.id}>
              <TableCell className="font-medium">{b.name}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{b.description ?? "—"}</TableCell>
              <TableCell>{canUpdate && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(b)}><Pencil className="h-3.5 w-3.5" /></Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
// ── Feed Items Tab ───────────────────────────────────────────────────────────
function FeedItemsTab() {
  const { t } = useTranslation();
  const { canCreate, canUpdate } = usePermissions("configuration");
  const { data: feedItems } = trpc.config.getFeedItems.useQuery();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", unit: "kg", initialPrice: "" });
  const utils = trpc.useUtils();

  const create = trpc.config.createFeedItem.useMutation({
    onSuccess: () => { toast.success(`${t("config.feedItems")} ${t("common.created")}`); utils.config.getFeedItems.invalidate(); setOpen(false); setForm({ name: "", unit: "kg", initialPrice: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const addPrice = trpc.config.addFeedItemPrice.useMutation({
    onSuccess: () => { toast.success(t("config.priceUpdated")); utils.config.getFeedItems.invalidate(); setPriceOpen(false); setPriceItem(null); setNewPrice(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceItem, setPriceItem] = useState<any>(null);
  const [newPrice, setNewPrice] = useState("");
  const update = trpc.config.updateFeedItem.useMutation({
    onSuccess: () => { toast.success(`${t("config.feedItems")} ${t("common.updated")}`); utils.config.getFeedItems.invalidate(); setEditOpen(false); setEditItem(null); },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(fi: any) { setEditItem({ ...fi }); setEditOpen(true); }

  const unitOptions = ["kg", "ton", "bale", "bag", "liter"];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">{t("config.feedItems")}</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            {canCreate && (<Button size="sm" className="gap-2"><Plus className="h-3 w-3" />{t("config.addFeedItem")}</Button>)}
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{t("config.addFeedItem")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Alfalfa Hay" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5">
                <Label>{t("config.unit")}</Label>
                <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{unitOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("config.pricePerUnit")} (EGP)</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={form.initialPrice} onChange={(e) => setForm((f) => ({ ...f, initialPrice: e.target.value }))} />
                <p className="text-xs text-muted-foreground">{t("config.priceNeededForFeedCost")}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => create.mutate({ name: form.name, unit: form.unit, initialPrice: form.initialPrice || undefined })} disabled={!form.name || create.isPending}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {editItem && (
        <EditDialog title={t("config.editFeedItem")} open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={() => update.mutate({ id: editItem.id, name: editItem.name, unit: editItem.unit })}>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5">
            <Label>{t("config.unit")}</Label>
            <Select value={editItem.unit} onValueChange={(v) => setEditItem((p: any) => ({ ...p, unit: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{unitOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </EditDialog>
      )}

      <Table>
        <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>{t("config.unit")}</TableHead><TableHead>{t("config.pricePerUnit")}</TableHead><TableHead>{t("config.statusLabel")}</TableHead><TableHead className="w-24"></TableHead></TableRow></TableHeader>
        <TableBody>
          {(feedItems ?? []).map((fi: any) => (
            <TableRow key={fi.id}>
              <TableCell className="font-medium">{fi.name}</TableCell>
              <TableCell>{fi.unit}</TableCell>
              <TableCell>
                {fi.currentPrice != null
                  ? <span>EGP {parseFloat(fi.currentPrice).toLocaleString("en-EG", { minimumFractionDigits: 2 })}</span>
                  : <Badge variant="outline" className="border-amber-400 text-amber-700 text-xs">{t("config.noPriceSet")}</Badge>}
              </TableCell>
              <TableCell><Badge className={fi.isActive ? "bg-green-100 text-green-800 border-green-200 text-xs" : "bg-gray-100 text-gray-600 text-xs"}>{fi.isActive ? "Active" : "Inactive"}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {canUpdate && <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => { setPriceItem(fi); setNewPrice(fi.currentPrice ?? ""); setPriceOpen(true); }}>{t("config.setPrice")}</Button>}
                  {canUpdate && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(fi)}><Pencil className="h-3.5 w-3.5" /></Button>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {priceItem && (
        <Dialog open={priceOpen} onOpenChange={setPriceOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{t("config.setPrice")} — {priceItem.name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("config.pricePerUnit")} (EGP) *</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} autoFocus />
                <p className="text-xs text-muted-foreground">{t("config.priceEffectiveToday")}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPriceOpen(false)}>{t("common.cancel")}</Button>
              <Button
                disabled={!newPrice || parseFloat(newPrice) <= 0 || addPrice.isPending}
                onClick={() => addPrice.mutate({ feedItemId: priceItem.id, effectiveDate: new Date().toISOString().split("T")[0], pricePerUnit: newPrice })}
              >{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Expense Categories Tab ───────────────────────────────────────────────────
function ExpenseCategoriesTab() {
  const { t } = useTranslation();
  const { canCreate, canUpdate } = usePermissions("configuration");
  const { data: categories } = trpc.config.getExpenseCategories.useQuery();
  const { data: subCategories } = trpc.config.getExpenseSubCategories.useQuery();
  const [open, setOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSubOpen, setEditSubOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [editSubItem, setEditSubItem] = useState<any>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [subName, setSubName] = useState("");
  const [subDescription, setSubDescription] = useState("");
  const utils = trpc.useUtils();

  const create = trpc.config.createExpenseCategory.useMutation({
    onSuccess: () => { toast.success(`${t("config.categories")} ${t("common.created")}`); utils.config.getExpenseCategories.invalidate(); setOpen(false); setName(""); setDescription(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = trpc.config.updateExpenseCategory.useMutation({
    onSuccess: () => { toast.success(`${t("config.categories")} ${t("common.updated")}`); utils.config.getExpenseCategories.invalidate(); setEditOpen(false); setEditItem(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const createSub = trpc.config.createExpenseSubCategory.useMutation({
    onSuccess: () => { toast.success(`${t("expenses.subCategory")} ${t("common.created")}`); utils.config.getExpenseSubCategories.invalidate(); setSubOpen(false); setSubCategoryId(""); setSubName(""); setSubDescription(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateSub = trpc.config.updateExpenseSubCategory.useMutation({
    onSuccess: () => { toast.success(`${t("expenses.subCategory")} ${t("common.updated")}`); utils.config.getExpenseSubCategories.invalidate(); setEditSubOpen(false); setEditSubItem(null); },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(c: any) { setEditItem({ ...c }); setEditOpen(true); }
  function openSubCreate(categoryId?: number) { setSubCategoryId(categoryId ? String(categoryId) : ""); setSubName(""); setSubDescription(""); setSubOpen(true); }
  function openSubEdit(s: any) { setEditSubItem({ ...s, categoryId: String(s.categoryId) }); setEditSubOpen(true); }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <h3 className="font-semibold">{t("config.expenseCategories")}</h3>
        <div className="flex gap-2">
          {canCreate && <Button size="sm" variant="outline" className="gap-2" onClick={() => openSubCreate()}><Plus className="h-3 w-3" />{t("common.add")} {t("expenses.subCategory")}</Button>}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              {canCreate && (<Button size="sm" className="gap-2"><Plus className="h-3 w-3" />{t("config.addCategory")}</Button>)}
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>{t("config.addExpenseCategory")}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Veterinary" value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>{t("config.description")}</Label><Input placeholder={t("common.none")} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
                <Button onClick={() => create.mutate({ name, description: description || undefined })} disabled={!name || create.isPending}>{t("common.save")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={subOpen} onOpenChange={setSubOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("common.add")} {t("expenses.subCategory")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("expenses.expenseCategory")} *</Label>
              <Select value={subCategoryId} onValueChange={setSubCategoryId}>
                <SelectTrigger><SelectValue placeholder={t("expenses.expenseCategory")} /></SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Name *</Label><Input placeholder={t("expenses.subCategory")} value={subName} onChange={(e) => setSubName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t("config.description")}</Label><Input placeholder={t("common.none")} value={subDescription} onChange={(e) => setSubDescription(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => createSub.mutate({ categoryId: Number(subCategoryId), name: subName, description: subDescription || undefined })} disabled={!subCategoryId || !subName || createSub.isPending}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editItem && (
        <EditDialog title={t("config.editExpenseCategory")} open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={() => update.mutate({ id: editItem.id, name: editItem.name, description: editItem.description || undefined })}>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>{t("config.description")}</Label><Input value={editItem.description ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, description: e.target.value }))} /></div>
        </EditDialog>
      )}

      {editSubItem && (
        <EditDialog title={`${t("common.edit")} ${t("expenses.subCategory")}`} open={editSubOpen} onOpenChange={setEditSubOpen} isPending={updateSub.isPending}
          onSave={() => updateSub.mutate({ id: editSubItem.id, categoryId: Number(editSubItem.categoryId), name: editSubItem.name, description: editSubItem.description || undefined })}>
          <div className="space-y-1.5">
            <Label>{t("expenses.expenseCategory")} *</Label>
            <Select value={editSubItem.categoryId} onValueChange={(v) => setEditSubItem((p: any) => ({ ...p, categoryId: v }))}>
              <SelectTrigger><SelectValue placeholder={t("expenses.expenseCategory")} /></SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={editSubItem.name} onChange={(e) => setEditSubItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>{t("config.description")}</Label><Input value={editSubItem.description ?? ""} onChange={(e) => setEditSubItem((p: any) => ({ ...p, description: e.target.value }))} /></div>
        </EditDialog>
      )}

      <Table>
        <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>{t("config.description")}</TableHead><TableHead>{t("expenses.subCategory")}</TableHead><TableHead>{t("config.statusLabel")}</TableHead><TableHead className="w-20"></TableHead></TableRow></TableHeader>
        <TableBody>
          {(categories ?? []).flatMap((c: any) => {
            const children = (subCategories ?? []).filter((s: any) => s.categoryId === c.id);
            return [
              <TableRow key={`category-${c.id}`}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{c.description ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{children.length}</TableCell>
                <TableCell><Badge className="bg-green-100 text-green-800 border-green-200 text-xs">{t("common.active")}</Badge></TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {canCreate && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openSubCreate(c.id)}><Plus className="h-3.5 w-3.5" /></Button>}
                    {canUpdate && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>}
                  </div>
                </TableCell>
              </TableRow>,
              <TableRow key={`subcategories-${c.id}`}>
                <TableCell colSpan={5} className="bg-muted/30 py-2">
                  <div className="flex flex-wrap gap-2 pl-4">
                    {children.length === 0 ? (
                      <span className="text-xs text-muted-foreground">{t("common.none")}</span>
                    ) : children.map((s: any) => (
                      <div key={s.id} className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs">
                        <span className="font-medium">{s.name}</span>
                        {s.description && <span className="text-muted-foreground">· {s.description}</span>}
                        {canUpdate && <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openSubEdit(s)}><Pencil className="h-3 w-3" /></Button>}
                      </div>
                    ))}
                  </div>
                </TableCell>
              </TableRow>,
            ];
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function Configuration() {
  const { t } = useTranslation();
  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          {t("config.configHub")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Master data management — single source of truth for all reference data
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="species">
            <TabsList className="flex-wrap h-auto gap-1 mb-6">
              <TabsTrigger value="species">{t("config.species")}</TabsTrigger>
              <TabsTrigger value="categories">{t("config.categories")}</TabsTrigger>
              <TabsTrigger value="groups">{t("config.groups")}</TabsTrigger>
              <TabsTrigger value="owners">{t("owners.owners")}</TabsTrigger>
              <TabsTrigger value="feed">{t("config.feedItems")}</TabsTrigger>
              <TabsTrigger value="expenses">{t("config.expenseCategories")}</TabsTrigger>
              <TabsTrigger value="vaccines">{t("vaccine.title")}</TabsTrigger>
              <TabsTrigger value="statuses">{t("config.statusesLabel")}</TabsTrigger>
              <TabsTrigger value="birthtypes">{t("config.birthTypes")}</TabsTrigger>
              <TabsTrigger value="settings">{t("config.settings")}</TabsTrigger>
            </TabsList>

            <TabsContent value="species"><SpeciesTab /></TabsContent>
            <TabsContent value="categories"><CategoriesTab /></TabsContent>
            <TabsContent value="groups"><GroupsTab /></TabsContent>
            <TabsContent value="owners"><OwnersTab /></TabsContent>
            <TabsContent value="feed"><FeedItemsTab /></TabsContent>
            <TabsContent value="expenses"><ExpenseCategoriesTab /></TabsContent>
            <TabsContent value="vaccines"><VaccinesTab /></TabsContent>
            <TabsContent value="statuses"><StatusesTab /></TabsContent>
            <TabsContent value="birthtypes"><BirthTypesTab /></TabsContent>
            <TabsContent value="settings"><SettingsTab /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Vaccines Tab ─────────────────────────────────────────────────────────────
function VaccinesTab() {
  const { t } = useTranslation();
  const { canCreate, canUpdate, canDelete } = usePermissions("configuration");
  const { data: vaccines, isLoading } = trpc.config.getVaccines.useQuery();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [validityPeriod, setValidityPeriod] = useState("");
  const [validityUnit, setValidityUnit] = useState<"days" | "months">("days");
  const [boosterRequired, setBoosterRequired] = useState(false);
  const [boosterInterval, setBoosterInterval] = useState("");
  const utils = trpc.useUtils();

  const create = trpc.config.createVaccine.useMutation({
    onSuccess: () => { toast.success(t("vaccine.vaccineSaved")); utils.config.getVaccines.invalidate(); setOpen(false); resetForm(); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = trpc.config.updateVaccine.useMutation({
    onSuccess: () => { toast.success(t("vaccine.vaccineSaved")); utils.config.getVaccines.invalidate(); setEditOpen(false); setEditItem(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteVaccine = trpc.config.deleteVaccine.useMutation({
    onSuccess: () => { toast.success(t("vaccine.vaccineDeleted")); utils.config.getVaccines.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  function resetForm() {
    setName("");
    setDescription("");
    setValidityPeriod("");
    setValidityUnit("days");
    setBoosterRequired(false);
    setBoosterInterval("");
  }

  function openEdit(v: any) { 
    setEditItem({ ...v }); 
    setEditOpen(true); 
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">{t("vaccine.title")}</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            {canCreate && (<Button size="sm" className="gap-2"><Plus className="h-3 w-3" />{t("vaccine.addVaccine")}</Button>)}
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{t("vaccine.addVaccine")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>{t("vaccine.vaccineName")} *</Label><Input placeholder="e.g. Rabies" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>{t("vaccine.description")}</Label><Input placeholder={t("common.none")} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>{t("vaccine.validityPeriod")} *</Label><Input type="number" placeholder="30" value={validityPeriod} onChange={(e) => setValidityPeriod(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>{t("vaccine.validityUnit")}</Label>
                  <Select value={validityUnit} onValueChange={(v: any) => setValidityUnit(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="days">{t("vaccine.days")}</SelectItem><SelectItem value="months">{t("vaccine.months")}</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="booster" checked={boosterRequired} onChange={(e) => setBoosterRequired(e.target.checked)} className="h-4 w-4" />
                <Label htmlFor="booster">{t("vaccine.boosterRequired")}</Label>
              </div>
              {boosterRequired && (
                <div className="space-y-1.5"><Label>{t("vaccine.boosterInterval")} *</Label><Input type="number" min={1} placeholder="180" value={boosterInterval} onChange={(e) => setBoosterInterval(e.target.value)} /><p className="text-xs text-muted-foreground">{t("vaccine.boosterIntervalHint")}</p></div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => create.mutate({ name, description: description || undefined, validityPeriod: parseInt(validityPeriod), validityUnit, boosterRequired, boosterInterval: boosterInterval ? parseInt(boosterInterval) : undefined })} disabled={!name || !validityPeriod || (boosterRequired && (!boosterInterval || parseInt(boosterInterval) < 1)) || create.isPending}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {editItem && (
        <EditDialog title={t("vaccine.editVaccine")} open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={() => {
            if (editItem.boosterRequired && (!editItem.boosterInterval || editItem.boosterInterval < 1)) {
              toast.error(t("vaccine.boosterIntervalRequired"));
              return;
            }
            update.mutate({ id: editItem.id, name: editItem.name, description: editItem.description, validityPeriod: editItem.validityPeriod, validityUnit: editItem.validityUnit, boosterRequired: editItem.boosterRequired, boosterInterval: editItem.boosterInterval });
          }}>
          <div className="space-y-1.5"><Label>{t("vaccine.vaccineName")} *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>{t("vaccine.description")}</Label><Input value={editItem.description ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, description: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>{t("vaccine.validityPeriod")} *</Label><Input type="number" value={editItem.validityPeriod} onChange={(e) => setEditItem((p: any) => ({ ...p, validityPeriod: parseInt(e.target.value) }))} /></div>
            <div className="space-y-1.5"><Label>{t("vaccine.validityUnit")}</Label>
              <Select value={editItem.validityUnit} onValueChange={(v: any) => setEditItem((p: any) => ({ ...p, validityUnit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="days">{t("vaccine.days")}</SelectItem><SelectItem value="months">{t("vaccine.months")}</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="editBooster" checked={editItem.boosterRequired} onChange={(e) => setEditItem((p: any) => ({ ...p, boosterRequired: e.target.checked }))} className="h-4 w-4" />
            <Label htmlFor="editBooster">{t("vaccine.boosterRequired")}</Label>
          </div>
          {editItem.boosterRequired && (
            <div className="space-y-1.5"><Label>{t("vaccine.boosterInterval")} *</Label><Input type="number" min={1} value={editItem.boosterInterval ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, boosterInterval: parseInt(e.target.value) || undefined }))} /><p className="text-xs text-muted-foreground">{t("vaccine.boosterIntervalHint")}</p></div>
          )}
        </EditDialog>
      )}

      <Table>
        <TableHeader><TableRow><TableHead>{t("vaccine.vaccineName")}</TableHead><TableHead>{t("vaccine.validityPeriod")}</TableHead><TableHead>{t("vaccine.boosterRequired")}</TableHead><TableHead>{t("config.statusLabel")}</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => (<TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>))}</TableRow>
            ))
          ) : (vaccines ?? []).length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">{t("vaccine.noVaccines")}</TableCell></TableRow>
          ) : (
            (vaccines ?? []).map((v: any) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{v.validityPeriod} {v.validityUnit === "days" ? t("vaccine.days") : t("vaccine.months")}</TableCell>
                <TableCell><Badge variant={v.boosterRequired ? "default" : "secondary"}>{v.boosterRequired ? t("common.yes") : t("common.no")}</Badge></TableCell>
                <TableCell><Badge className={v.isActive ? "bg-green-100 text-green-800 border-green-200" : "bg-gray-100 text-gray-800 border-gray-200"}>{v.isActive ? t("common.active") : t("common.inactive")}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {canUpdate && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v)}><Pencil className="h-3.5 w-3.5" /></Button>}
                    {canDelete && <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />{t("vaccine.deleteVaccine")}</AlertDialogTitle>
                          <AlertDialogDescription>{t("vaccine.deleteVaccineConfirm", { name: v.name })}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteVaccine.mutate({ id: v.id })}>{t("common.delete")}</AlertDialogAction>
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
  );
}

// ── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab() {
  const { t } = useTranslation();
  const { canUpdate } = usePermissions("configuration");
  const { data: settings } = trpc.config.getSettings.useQuery();
  const utils = trpc.useUtils();
  const [currency, setCurrency] = useState("");
  const [farmName, setFarmName] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Populate state once settings load
  if (!initialized && settings) {
    const cur = (settings as any[]).find((s) => s.settingKey === "currency");
    const name = (settings as any[]).find((s) => s.settingKey === "farmName");
    setCurrency((cur?.settingValue ?? "EGP").trim());
    setFarmName((name?.settingValue ?? "").trim());
    setInitialized(true);
  }

  const upsert = trpc.config.upsertSetting.useMutation({
    onSuccess: () => {
      toast.success(t("common.settingSaved"));
      utils.config.getSettings.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSave = (key: string, value: string) => {
    if (!value.trim()) return toast.error(t("common.valueEmpty"));
    upsert.mutate({ key, value: value.trim() });
  };

  return (
    <div className="space-y-6 max-w-xl">
      <h3 className="font-semibold">{t("config.systemSettings")}</h3>

      <div className="space-y-1.5">
        <Label>{t("config.currencyCode")}</Label>
        <div className="flex gap-2">
          <Input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            placeholder="EGP"
            maxLength={5}
            className="font-mono"
          />
          {canUpdate && <Button onClick={() => handleSave("currency", currency)} disabled={upsert.isPending}>
            {t("common.save")}
          </Button>}
        </div>
        <p className="text-xs text-muted-foreground">
          The 3-letter code used throughout the app (e.g. EGP, USD, EUR, SAR).
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>{t("config.farmName")}</Label>
        <div className="flex gap-2">
          <Input
            value={farmName}
            onChange={(e) => setFarmName(e.target.value)}
            placeholder="e.g. Azal Farms"
          />
          {canUpdate && <Button onClick={() => handleSave("farmName", farmName)} disabled={upsert.isPending}>
            {t("common.save")}
          </Button>}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("config.farmNameHint")}
        </p>
      </div>
    </div>
  );
}
