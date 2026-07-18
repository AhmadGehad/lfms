import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Eye, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { ListToolbar } from "@admin/components/ListToolbar";
import { PageHeading } from "@admin/components/PageHeading";
import { ResourceTable, type ResourceColumn } from "@admin/components/ResourceTable";
import { StatusBadge } from "@admin/components/StatusBadge";
import { useCursorPage } from "@admin/hooks/useCursorPage";
import { formatDate } from "@admin/lib/format";
import { platformTrpc } from "@admin/lib/trpc";

export function FarmsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const page = useCursorPage();
  const query = platformTrpc.farms.list.useQuery({ cursor: page.cursor, limit: 25, search: useDeferredValue(search) || undefined, status: status === "all" ? undefined : status as "active", sortDirection: "desc" });
  const companies = platformTrpc.companies.list.useQuery({ limit: 100, sortDirection: "desc" });
  const rows = query.data?.items ?? [];
  type Row = (typeof rows)[number];
  const utils = platformTrpc.useUtils();
  const [open, setOpen] = useState(false);
  const [companyPublicId, setCompanyPublicId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [createIdempotencyKey, setCreateIdempotencyKey] = useState(() => crypto.randomUUID());
  const [pendingChange, setPendingChange] = useState<{ row: Row; status: "active" | "suspended" | "archived" } | null>(null);
  const [detailPublicId, setDetailPublicId] = useState<string | null>(null);
  const detail = platformTrpc.farms.get.useQuery({ publicId: detailPublicId! }, { enabled: Boolean(detailPublicId) });
  const [editTarget, setEditTarget] = useState<Row | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editTimezone, setEditTimezone] = useState("UTC");
  const create = platformTrpc.farms.create.useMutation({ onSuccess: async () => { toast.success("Farm created"); setOpen(false); setName(""); setCode(""); setCreateIdempotencyKey(crypto.randomUUID()); await utils.farms.list.invalidate(); }, onError: error => toast.error(error.message) });
  const change = platformTrpc.farms.changeStatus.useMutation({ onSuccess: async () => { toast.success("Farm status updated"); await utils.farms.list.invalidate(); }, onError: error => toast.error(error.message) });
  const update = platformTrpc.farms.update.useMutation({ onSuccess: async () => { toast.success("Farm updated"); setEditTarget(null); await utils.farms.list.invalidate(); await utils.farms.get.invalidate(); }, onError: error => toast.error(error.message) });
  const exportCsv = platformTrpc.farms.exportCsv.useMutation({
    onSuccess: result => {
      const url = URL.createObjectURL(new Blob([result.content], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${result.rowCount.toLocaleString()} farms exported${result.truncated ? " (limit reached)" : ""}`);
    },
    onError: error => toast.error(error.message),
  });
  const openEdit = (row: Row) => {
    setEditTarget(row);
    setEditName(row.name);
    setEditCode(row.code);
    setEditTimezone(row.timezone);
  };

  const columns: ResourceColumn<Row>[] = [
    { key: "farm", label: "Farm", render: row => <div><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.code}</p></div> },
    { key: "company", label: "Company", render: row => <div><p>{row.companyName}</p><p className="font-mono text-[10px] text-muted-foreground">{row.companyPublicId}</p></div> },
    { key: "status", label: "Status", render: row => <StatusBadge value={row.status} /> },
    { key: "timezone", label: "Timezone", render: row => <span className="text-xs">{row.timezone}</span> },
    { key: "members", label: "Assigned", className: "text-right", render: row => <span className="tabular-nums">{Number(row.memberCount)}</span> },
    { key: "updated", label: "Updated", render: row => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.updatedAt)}</span> },
    { key: "actions", label: "", className: "w-12", render: row => <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setDetailPublicId(row.publicId)}><Eye className="h-4 w-4" />Inspect</DropdownMenuItem><DropdownMenuItem onClick={() => openEdit(row)}><Pencil className="h-4 w-4" />Edit</DropdownMenuItem><DropdownMenuItem disabled={row.status === "active"} onClick={() => setPendingChange({ row, status: "active" })}>Activate</DropdownMenuItem><DropdownMenuItem disabled={row.status === "suspended"} onClick={() => setPendingChange({ row, status: "suspended" })}>Suspend</DropdownMenuItem><DropdownMenuItem disabled={row.status === "archived"} onClick={() => setPendingChange({ row, status: "archived" })}>Archive</DropdownMenuItem></DropdownMenuContent></DropdownMenu> },
  ];

  return <>
    <PageHeading title="Farms" description="Create and control farms within each company boundary." actions={<div className="flex gap-2"><Button variant="outline" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate({ search: search.trim() || undefined, status: status === "all" ? undefined : status as "active" | "suspended" | "archived" })}><Download className="h-4 w-4" />Export</Button><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4" />New farm</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Create farm</DialogTitle><DialogDescription>The farm is scoped to one company and cannot be moved later.</DialogDescription></DialogHeader><div className="grid gap-4"><div className="grid gap-1.5"><Label>Company</Label><Select value={companyPublicId} onValueChange={setCompanyPublicId}><SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger><SelectContent>{companies.data?.items.map(company => <SelectItem key={company.publicId} value={company.publicId}>{company.name}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-1.5"><Label htmlFor="farm-name">Farm name</Label><Input id="farm-name" value={name} onChange={event => setName(event.target.value)} /></div><div className="grid gap-1.5"><Label htmlFor="farm-code">Code</Label><Input id="farm-code" value={code} onChange={event => setCode(event.target.value.toUpperCase())} /></div><div className="grid gap-1.5"><Label htmlFor="farm-timezone">Timezone</Label><Input id="farm-timezone" value={timezone} onChange={event => setTimezone(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={create.isPending || !companyPublicId || name.length < 2 || !code} onClick={() => create.mutate({ companyPublicId, name, code, timezone, idempotencyKey: createIdempotencyKey })}>Create farm</Button></DialogFooter></DialogContent></Dialog></div>} />
    <ListToolbar search={search} onSearch={value => { setSearch(value); page.reset(); }} placeholder="Search farm, code, or company" status={status} onStatus={value => { setStatus(value); page.reset(); }} statuses={["active", "suspended", "archived"]} />
    <ResourceTable rows={rows} columns={columns} rowKey={row => row.publicId} loading={query.isLoading} canNext={Boolean(query.data?.nextCursor)} canPrevious={page.canPrevious} onNext={() => query.data?.nextCursor && page.next(query.data.nextCursor)} onPrevious={page.previous} />
    <Dialog open={Boolean(detailPublicId)} onOpenChange={open => !open && setDetailPublicId(null)}><DialogContent><DialogHeader><DialogTitle>{detail.data?.name || "Farm details"}</DialogTitle><DialogDescription>Operational metadata inside its immutable company boundary.</DialogDescription></DialogHeader>{detail.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p> : detail.data && <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Company</p><p>{detail.data.companyName}</p></div><div><p className="text-xs text-muted-foreground">Status</p><StatusBadge value={detail.data.status} /></div><div><p className="text-xs text-muted-foreground">Code</p><p>{detail.data.code}</p></div><div><p className="text-xs text-muted-foreground">Timezone</p><p>{detail.data.timezone}</p></div><div><p className="text-xs text-muted-foreground">Assigned users</p><p>{Number(detail.data.memberCount)}</p></div><div><p className="text-xs text-muted-foreground">Version</p><p>{detail.data.version}</p></div><div className="col-span-2"><p className="text-xs text-muted-foreground">Public ID</p><p className="font-mono text-xs">{detail.data.publicId}</p></div><div><p className="text-xs text-muted-foreground">Created</p><p>{formatDate(detail.data.createdAt)}</p></div><div><p className="text-xs text-muted-foreground">Updated</p><p>{formatDate(detail.data.updatedAt)}</p></div></div>}<DialogFooter><Button variant="outline" onClick={() => setDetailPublicId(null)}>Close</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(editTarget)} onOpenChange={open => !open && setEditTarget(null)}><DialogContent><DialogHeader><DialogTitle>Edit farm</DialogTitle><DialogDescription>Company assignment cannot be changed.</DialogDescription></DialogHeader><div className="grid gap-3"><div className="grid gap-1.5"><Label htmlFor="edit-farm-name">Name</Label><Input id="edit-farm-name" value={editName} maxLength={200} onChange={event => setEditName(event.target.value)} /></div><div className="grid gap-1.5"><Label htmlFor="edit-farm-code">Code</Label><Input id="edit-farm-code" value={editCode} maxLength={40} onChange={event => setEditCode(event.target.value.toUpperCase())} /></div><div className="grid gap-1.5"><Label htmlFor="edit-farm-timezone">Timezone</Label><Input id="edit-farm-timezone" value={editTimezone} maxLength={64} onChange={event => setEditTimezone(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button><Button disabled={!editTarget || update.isPending || editName.trim().length < 2 || !editCode.trim() || !editTimezone.trim()} onClick={() => editTarget && update.mutate({ publicId: editTarget.publicId, name: editName.trim(), code: editCode.trim(), timezone: editTimezone.trim(), expectedVersion: editTarget.version })}>Save changes</Button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={Boolean(pendingChange)} onOpenChange={open => !open && setPendingChange(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle className="capitalize">{pendingChange?.status} farm</AlertDialogTitle><AlertDialogDescription>This changes operational access for {pendingChange?.row.name}. Existing farm data remains retained.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingChange) change.mutate({ publicId: pendingChange.row.publicId, status: pendingChange.status, expectedVersion: pendingChange.row.version }); setPendingChange(null); }}>Confirm change</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
