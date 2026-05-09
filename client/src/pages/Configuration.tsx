import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Settings, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ── Species Tab ──────────────────────────────────────────────────────────────
function SpeciesTab() {
  const { data: species, refetch } = trpc.config.getSpecies.useQuery();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const utils = trpc.useUtils();

  const create = trpc.config.createSpecies.useMutation({
    onSuccess: () => { toast.success("Species created"); utils.config.getSpecies.invalidate(); setOpen(false); setName(""); setCode(""); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Species</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-3 w-3" />Add Species</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Species</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input placeholder="e.g. Sheep" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input placeholder="Optional description" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate({ name })} disabled={!name || create.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {(species ?? []).map((s: any) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell className="font-mono">{s.code}</TableCell>
              <TableCell><Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Active</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Categories Tab ───────────────────────────────────────────────────────────
function CategoriesTab() {
  const { data: categories } = trpc.config.getCategories.useQuery();
  const { data: species } = trpc.config.getSpecies.useQuery();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", idPrefix: "", speciesId: "", targetWeightKg: "" });
  const utils = trpc.useUtils();

  const create = trpc.config.createCategory.useMutation({
    onSuccess: () => { toast.success("Category created"); utils.config.getCategories.invalidate(); setOpen(false); setForm({ name: "", idPrefix: "", speciesId: "", targetWeightKg: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Animal Categories</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-3 w-3" />Add Category</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input placeholder="e.g. Lamb" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>ID Prefix *</Label>
                <Input placeholder="e.g. LMB" value={form.idPrefix} onChange={(e) => setForm((f) => ({ ...f, idPrefix: e.target.value.toUpperCase() }))} maxLength={6} />
              </div>
              <div className="space-y-1.5">
                <Label>Species *</Label>
                <Select value={form.speciesId} onValueChange={(v) => setForm((f) => ({ ...f, speciesId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select species" /></SelectTrigger>
                  <SelectContent>
                    {(species ?? []).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Target Weight (kg)</Label>
                <Input type="number" placeholder="0.0" value={form.targetWeightKg} onChange={(e) => setForm((f) => ({ ...f, targetWeightKg: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate({ name: form.name, idPrefix: form.idPrefix, speciesId: Number(form.speciesId), targetWeightKg: form.targetWeightKg || undefined })} disabled={!form.name || !form.idPrefix || !form.speciesId || create.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>ID Prefix</TableHead><TableHead>Species</TableHead><TableHead>Target Weight</TableHead></TableRow></TableHeader>
        <TableBody>
          {(categories ?? []).map((c: any) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="font-mono font-bold text-primary">{c.idPrefix}</TableCell>
              <TableCell>{c.speciesName}</TableCell>
              <TableCell>{c.targetWeightKg ? `${parseFloat(c.targetWeightKg).toFixed(1)} kg` : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Groups Tab ───────────────────────────────────────────────────────────────
function GroupsTab() {
  const { data: groups } = trpc.config.getGroups.useQuery();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", groupCode: "", description: "" });
  const utils = trpc.useUtils();

  const create = trpc.config.createGroup.useMutation({
    onSuccess: () => { toast.success("Group created"); utils.config.getGroups.invalidate(); setOpen(false); setForm({ name: "", groupCode: "", description: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Groups / Pens</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-3 w-3" />Add Group</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Group / Pen</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input placeholder="e.g. Pen A" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Group Code *</Label>
                <Input placeholder="e.g. PEN-A" value={form.groupCode} onChange={(e) => setForm((f) => ({ ...f, groupCode: e.target.value.toUpperCase() }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input placeholder="Optional description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate({ name: form.name, groupCode: form.groupCode || form.name.toUpperCase().replace(/\s+/g, '-'), description: form.description || undefined })} disabled={!form.name || create.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Capacity</TableHead><TableHead>Location</TableHead></TableRow></TableHeader>
        <TableBody>
          {(groups ?? []).map((g: any) => (
            <TableRow key={g.id}>
              <TableCell className="font-medium">{g.name}</TableCell>
              <TableCell>{g.capacity ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{g.location ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Feed Items Tab ───────────────────────────────────────────────────────────
function FeedItemsTab() {
  const { data: feedItems } = trpc.config.getFeedItems.useQuery();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "", reorderLevel: "", currentPrice: "" });
  const utils = trpc.useUtils();

  const create = trpc.config.createFeedItem.useMutation({
    onSuccess: () => { toast.success("Feed item created"); utils.config.getFeedItems.invalidate(); setOpen(false); setForm({ name: "", unit: "", reorderLevel: "", currentPrice: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Feed Items</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-3 w-3" />Add Feed Item</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Feed Item</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input placeholder="e.g. Hay" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit *</Label>
                <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="ton">ton</SelectItem>
                    <SelectItem value="bale">bale</SelectItem>
                    <SelectItem value="bag">bag</SelectItem>
                    <SelectItem value="liter">liter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reorder Level</Label>
                <Input type="number" placeholder="0" value={form.reorderLevel} onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Current Price (EGP)</Label>
                <Input type="number" placeholder="0.00" value={form.currentPrice} onChange={(e) => setForm((f) => ({ ...f, currentPrice: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate({ name: form.name, unit: form.unit || undefined })} disabled={!form.name || create.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Unit</TableHead><TableHead>Current Price</TableHead><TableHead>Reorder Level</TableHead></TableRow></TableHeader>
        <TableBody>
          {(feedItems ?? []).map((fi: any) => (
            <TableRow key={fi.id}>
              <TableCell className="font-medium">{fi.name}</TableCell>
              <TableCell>{fi.unit}</TableCell>
              <TableCell>{fi.currentPrice ? `EGP ${parseFloat(fi.currentPrice).toFixed(2)}` : "—"}</TableCell>
              <TableCell>{fi.reorderLevel ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Expense Categories Tab ───────────────────────────────────────────────────
function ExpenseCategoriesTab() {
  const { data: categories } = trpc.config.getExpenseCategories.useQuery();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const utils = trpc.useUtils();

  const create = trpc.config.createExpenseCategory.useMutation({
    onSuccess: () => { toast.success("Category created"); utils.config.getExpenseCategories.invalidate(); setOpen(false); setName(""); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Expense Categories</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-3 w-3" />Add Category</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Expense Category</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input placeholder="e.g. Veterinary" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate({ name })} disabled={!name || create.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {(categories ?? []).map((c: any) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell><Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Active</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function Configuration() {
  return (
    <div className="p-6 space-y-6">
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
            </TabsList>

            <TabsContent value="species"><SpeciesTab /></TabsContent>
            <TabsContent value="categories"><CategoriesTab /></TabsContent>
            <TabsContent value="groups"><GroupsTab /></TabsContent>
            <TabsContent value="feed"><FeedItemsTab /></TabsContent>
            <TabsContent value="expenses"><ExpenseCategoriesTab /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
