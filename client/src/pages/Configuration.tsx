import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Settings, Plus, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

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
  const { data: species } = trpc.config.getSpecies.useQuery();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const utils = trpc.useUtils();

  const create = trpc.config.createSpecies.useMutation({
    onSuccess: () => { toast.success("Species created"); utils.config.getSpecies.invalidate(); setOpen(false); setName(""); setDescription(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = trpc.config.updateSpecies.useMutation({
    onSuccess: () => { toast.success("Species updated"); utils.config.getSpecies.invalidate(); setEditOpen(false); setEditItem(null); },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(s: any) { setEditItem({ ...s }); setEditOpen(true); }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Species</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-3 w-3" />{t("config.addSpecies")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{t("config.addSpecies")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Sheep" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Description</Label><Input placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => create.mutate({ name, description: description || undefined })} disabled={!name || create.isPending}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {editItem && (
        <EditDialog title="Edit Species" open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={() => update.mutate({ id: editItem.id, name: editItem.name, description: editItem.description })}>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Description</Label><Input value={editItem.description ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, description: e.target.value }))} /></div>
        </EditDialog>
      )}

      <Table>
        <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
        <TableBody>
          {(species ?? []).map((s: any) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{s.description ?? "—"}</TableCell>
              <TableCell><Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Active</Badge></TableCell>
              <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
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
  const { data: categories } = trpc.config.getCategories.useQuery();
  const { data: species } = trpc.config.getSpecies.useQuery();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", idPrefix: "", speciesId: "", targetWeightKg: "" });
  const utils = trpc.useUtils();

  const create = trpc.config.createCategory.useMutation({
    onSuccess: () => { toast.success("Category created"); utils.config.getCategories.invalidate(); setOpen(false); setForm({ name: "", idPrefix: "", speciesId: "", targetWeightKg: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = trpc.config.updateCategory.useMutation({
    onSuccess: () => { toast.success("Category updated"); utils.config.getCategories.invalidate(); setEditOpen(false); setEditItem(null); },
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
        <h3 className="font-semibold">Animal Categories</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-3 w-3" />{t("config.addCategory")}</Button>
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
        <EditDialog title="Edit Category" open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={handleSave}>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>ID Prefix</Label><Input value={editItem.idPrefix} onChange={(e) => setEditItem((p: any) => ({ ...p, idPrefix: e.target.value.toUpperCase() }))} maxLength={6} /></div>
          <div className="space-y-1.5"><Label>Target Weight (kg)</Label><Input type="number" value={editItem.targetWeightKg} onChange={(e) => setEditItem((p: any) => ({ ...p, targetWeightKg: e.target.value }))} /></div>
          <div className="border-t pt-3 mt-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Auto-Stage Settings</p>
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
                <Label>Move to category</Label>
                <Select
                  value={editItem.autoStageTargetCategoryId}
                  onValueChange={(v) => setEditItem((p: any) => ({ ...p, autoStageTargetCategoryId: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select target category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None (disable auto-stage)</SelectItem>
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
          <TableHead>ID Prefix</TableHead>
          <TableHead>Species</TableHead>
          <TableHead>{t("config.targetWeight")}</TableHead>
          <TableHead>Auto-stage at</TableHead>
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
              <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
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
  const { data: groups } = trpc.config.getGroups.useQuery();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", groupCode: "", description: "" });
  const utils = trpc.useUtils();

  const create = trpc.config.createGroup.useMutation({
    onSuccess: () => { toast.success("Group created"); utils.config.getGroups.invalidate(); setOpen(false); setForm({ name: "", groupCode: "", description: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = trpc.config.updateGroup.useMutation({
    onSuccess: () => { toast.success("Group updated"); utils.config.getGroups.invalidate(); setEditOpen(false); setEditItem(null); },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(g: any) { setEditItem({ ...g }); setEditOpen(true); }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Groups / Pens</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-3 w-3" />{t("config.addGroup")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Group / Pen</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Pen A" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Group Code *</Label><Input placeholder="e.g. PEN-A" value={form.groupCode} onChange={(e) => setForm((f) => ({ ...f, groupCode: e.target.value.toUpperCase() }))} /></div>
              <div className="space-y-1.5"><Label>Description</Label><Input placeholder="Optional" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => create.mutate({ name: form.name, groupCode: form.groupCode || form.name.toUpperCase().replace(/\s+/g, '-'), description: form.description || undefined })} disabled={!form.name || create.isPending}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {editItem && (
        <EditDialog title="Edit Group / Pen" open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={() => update.mutate({ id: editItem.id, name: editItem.name, groupCode: editItem.groupCode, description: editItem.description || undefined })}>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Group Code</Label><Input value={editItem.groupCode ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, groupCode: e.target.value.toUpperCase() }))} /></div>
          <div className="space-y-1.5"><Label>Description</Label><Input value={editItem.description ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, description: e.target.value }))} /></div>
        </EditDialog>
      )}

      <Table>
        <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>Code</TableHead><TableHead>Description</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
        <TableBody>
          {(groups ?? []).map((g: any) => (
            <TableRow key={g.id}>
              <TableCell className="font-medium">{g.name}</TableCell>
              <TableCell className="font-mono text-sm">{g.groupCode ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{g.description ?? "—"}</TableCell>
              <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
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
  const { data: statuses } = trpc.config.getStatuses.useQuery();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const utils = trpc.useUtils();
  const create = trpc.config.createStatus.useMutation({
    onSuccess: () => { toast.success("Status created"); utils.config.getStatuses.invalidate(); setOpen(false); setForm({ name: "", description: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = trpc.config.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); utils.config.getStatuses.invalidate(); setEditOpen(false); setEditItem(null); },
    onError: (e: any) => toast.error(e.message),
  });
  function openEdit(s: any) { setEditItem({ ...s }); setEditOpen(true); }
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Animal Statuses</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-3 w-3" />Add Status</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Animal Status</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Quarantine" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Description</Label><Input placeholder="Optional" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => create.mutate({ name: form.name, description: form.description || undefined })} disabled={!form.name || create.isPending}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {editItem && (
        <EditDialog title="Edit Animal Status" open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={() => update.mutate({ id: editItem.id, name: editItem.name, description: editItem.description || undefined })}>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Description</Label><Input value={editItem.description ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, description: e.target.value }))} /></div>
        </EditDialog>
      )}
      <Table>
        <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>Description</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
        <TableBody>
          {(statuses ?? []).map((s: any) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{s.description ?? "—"}</TableCell>
              <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
// ── Birth Types Tab ──────────────────────────────────────────────────────────
function BirthTypesTab() {
  const { t } = useTranslation();
  const { data: birthTypes } = trpc.config.getBirthTypes.useQuery();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const utils = trpc.useUtils();
  const create = trpc.config.createBirthType.useMutation({
    onSuccess: () => { toast.success("Birth type created"); utils.config.getBirthTypes.invalidate(); setOpen(false); setForm({ name: "", description: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = trpc.config.updateBirthType.useMutation({
    onSuccess: () => { toast.success("Birth type updated"); utils.config.getBirthTypes.invalidate(); setEditOpen(false); setEditItem(null); },
    onError: (e: any) => toast.error(e.message),
  });
  function openEdit(b: any) { setEditItem({ ...b }); setEditOpen(true); }
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Birth Types</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-3 w-3" />Add Birth Type</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Birth Type</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Natural" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Description</Label><Input placeholder="Optional" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => create.mutate({ name: form.name, description: form.description || undefined })} disabled={!form.name || create.isPending}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {editItem && (
        <EditDialog title="Edit Birth Type" open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={() => update.mutate({ id: editItem.id, name: editItem.name, description: editItem.description || undefined })}>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Description</Label><Input value={editItem.description ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, description: e.target.value }))} /></div>
        </EditDialog>
      )}
      <Table>
        <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>Description</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
        <TableBody>
          {(birthTypes ?? []).map((b: any) => (
            <TableRow key={b.id}>
              <TableCell className="font-medium">{b.name}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{b.description ?? "—"}</TableCell>
              <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(b)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
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
  const { data: feedItems } = trpc.config.getFeedItems.useQuery();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", unit: "kg" });
  const utils = trpc.useUtils();

  const create = trpc.config.createFeedItem.useMutation({
    onSuccess: () => { toast.success("Feed item created"); utils.config.getFeedItems.invalidate(); setOpen(false); setForm({ name: "", unit: "kg" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = trpc.config.updateFeedItem.useMutation({
    onSuccess: () => { toast.success("Feed item updated"); utils.config.getFeedItems.invalidate(); setEditOpen(false); setEditItem(null); },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(fi: any) { setEditItem({ ...fi }); setEditOpen(true); }

  const unitOptions = ["kg", "ton", "bale", "bag", "liter"];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Feed Items</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-3 w-3" />{t("config.addFeedItem")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{t("config.addFeedItem")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Alfalfa Hay" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{unitOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => create.mutate({ name: form.name, unit: form.unit })} disabled={!form.name || create.isPending}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {editItem && (
        <EditDialog title="Edit Feed Item" open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={() => update.mutate({ id: editItem.id, name: editItem.name, unit: editItem.unit })}>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <Select value={editItem.unit} onValueChange={(v) => setEditItem((p: any) => ({ ...p, unit: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{unitOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </EditDialog>
      )}

      <Table>
        <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>Unit</TableHead><TableHead>Status</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
        <TableBody>
          {(feedItems ?? []).map((fi: any) => (
            <TableRow key={fi.id}>
              <TableCell className="font-medium">{fi.name}</TableCell>
              <TableCell>{fi.unit}</TableCell>
              <TableCell><Badge className={fi.isActive ? "bg-green-100 text-green-800 border-green-200 text-xs" : "bg-gray-100 text-gray-600 text-xs"}>{fi.isActive ? "Active" : "Inactive"}</Badge></TableCell>
              <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(fi)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Expense Categories Tab ───────────────────────────────────────────────────
function ExpenseCategoriesTab() {
  const { t } = useTranslation();
  const { data: categories } = trpc.config.getExpenseCategories.useQuery();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const utils = trpc.useUtils();

  const create = trpc.config.createExpenseCategory.useMutation({
    onSuccess: () => { toast.success("Category created"); utils.config.getExpenseCategories.invalidate(); setOpen(false); setName(""); setDescription(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const update = trpc.config.updateExpenseCategory.useMutation({
    onSuccess: () => { toast.success("Category updated"); utils.config.getExpenseCategories.invalidate(); setEditOpen(false); setEditItem(null); },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(c: any) { setEditItem({ ...c }); setEditOpen(true); }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Expense Categories</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-3 w-3" />{t("config.addCategory")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Expense Category</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Veterinary" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Description</Label><Input placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => create.mutate({ name, description: description || undefined })} disabled={!name || create.isPending}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {editItem && (
        <EditDialog title="Edit Expense Category" open={editOpen} onOpenChange={setEditOpen} isPending={update.isPending}
          onSave={() => update.mutate({ id: editItem.id, name: editItem.name, description: editItem.description || undefined })}>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={editItem.name} onChange={(e) => setEditItem((p: any) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Description</Label><Input value={editItem.description ?? ""} onChange={(e) => setEditItem((p: any) => ({ ...p, description: e.target.value }))} /></div>
        </EditDialog>
      )}

      <Table>
        <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
        <TableBody>
          {(categories ?? []).map((c: any) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{c.description ?? "—"}</TableCell>
              <TableCell><Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Active</Badge></TableCell>
              <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
            </TableRow>
          ))}
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
          Configuration Hub
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Master data management — single source of truth for all reference data
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="species">
            <TabsList className="flex-wrap h-auto gap-1 mb-6">
              <TabsTrigger value="species">Species</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="groups">Groups / Pens</TabsTrigger>
              <TabsTrigger value="feed">Feed Items</TabsTrigger>
              <TabsTrigger value="expenses">Expense Categories</TabsTrigger>
              <TabsTrigger value="statuses">Statuses</TabsTrigger>
              <TabsTrigger value="birthtypes">Birth Types</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="species"><SpeciesTab /></TabsContent>
            <TabsContent value="categories"><CategoriesTab /></TabsContent>
            <TabsContent value="groups"><GroupsTab /></TabsContent>
            <TabsContent value="feed"><FeedItemsTab /></TabsContent>
            <TabsContent value="expenses"><ExpenseCategoriesTab /></TabsContent>
            <TabsContent value="statuses"><StatusesTab /></TabsContent>
            <TabsContent value="birthtypes"><BirthTypesTab /></TabsContent>
            <TabsContent value="settings"><SettingsTab /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab() {
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
      toast.success("Setting saved");
      utils.config.getSettings.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSave = (key: string, value: string) => {
    if (!value.trim()) return toast.error("Value cannot be empty");
    upsert.mutate({ key, value: value.trim() });
  };

  return (
    <div className="space-y-6 max-w-xl">
      <h3 className="font-semibold">System Settings</h3>

      <div className="space-y-1.5">
        <Label>Currency code</Label>
        <div className="flex gap-2">
          <Input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            placeholder="EGP"
            maxLength={5}
            className="font-mono"
          />
          <Button onClick={() => handleSave("currency", currency)} disabled={upsert.isPending}>
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The 3-letter code used throughout the app (e.g. EGP, USD, EUR, SAR).
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Farm name</Label>
        <div className="flex gap-2">
          <Input
            value={farmName}
            onChange={(e) => setFarmName(e.target.value)}
            placeholder="e.g. Azal Farms"
          />
          <Button onClick={() => handleSave("farmName", farmName)} disabled={upsert.isPending}>
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Used in report headers, PDF exports, and the dashboard title.
        </p>
      </div>
    </div>
  );
}
