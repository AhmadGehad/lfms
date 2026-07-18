import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ban, Copy, Download, Eye, MailPlus, SlidersHorizontal } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { ListToolbar } from "@admin/components/ListToolbar";
import { PageHeading } from "@admin/components/PageHeading";
import { ResourceTable, type ResourceColumn } from "@admin/components/ResourceTable";
import { StatusBadge } from "@admin/components/StatusBadge";
import { useCursorPage } from "@admin/hooks/useCursorPage";
import { formatDate } from "@admin/lib/format";
import { platformTrpc } from "@admin/lib/trpc";

const roles = ["viewer", "user", "staff", "supervisor", "admin"] as const;

type MembershipInspection = {
  userPublicId: string;
  userName: string | null;
  email: string | null;
  role: string;
  status: string;
  farmAccessMode: "all" | "restricted";
  joinedAt: Date | null;
  createdAt: Date;
  lastSignedIn: Date;
  companyName: string;
  assignedFarms: Array<{ publicId: string; name: string; code: string; status: string }>;
};

export function MembershipsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const page = useCursorPage();
  const query = platformTrpc.memberships.list.useQuery({ cursor: page.cursor, limit: 25, search: useDeferredValue(search) || undefined, status: status === "all" ? undefined : status as "active", sortDirection: "desc" });
  const rows = query.data?.items ?? [];
  type Row = (typeof rows)[number];
  const utils = platformTrpc.useUtils();
  const companies = platformTrpc.companies.list.useQuery({ limit: 100, status: "active", sortDirection: "desc" });
  const [createOpen, setCreateOpen] = useState(false);
  const [companyPublicId, setCompanyPublicId] = useState("");
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<typeof roles[number]>("viewer");
  const [newFarmMode, setNewFarmMode] = useState<"all" | "restricted">("all");
  const [farmPublicIds, setFarmPublicIds] = useState<string[]>([]);
  const [createIdempotencyKey, setCreateIdempotencyKey] = useState(() => crypto.randomUUID());
  const [issuedLink, setIssuedLink] = useState<string | null>(null);
  const [inspection, setInspection] = useState<MembershipInspection | null>(null);
  const farms = platformTrpc.farms.list.useQuery({ limit: 100, companyPublicId: companyPublicId || undefined, status: "active", sortDirection: "desc" }, { enabled: Boolean(companyPublicId) });
  const invitations = platformTrpc.memberships.invitations.list.useQuery({ limit: 100, sortDirection: "desc" });
  type InvitationRow = NonNullable<typeof invitations.data>["items"][number];
  const invitationUrl = (companySlug: string, token: string) => {
    const hostname = window.location.hostname;
    const baseDomain = hostname.startsWith("admin.") ? hostname.slice("admin.".length) : hostname;
    const port = baseDomain === "localhost" ? ":3000" : "";
    const protocol = baseDomain === "localhost" ? "http:" : "https:";
    return `${protocol}//${companySlug}.${baseDomain}${port}/accept-invitation#token=${encodeURIComponent(token)}`;
  };
  const create = platformTrpc.memberships.invitations.create.useMutation({ onSuccess: async result => {
    toast.success("Invitation created");
    setCreateOpen(false);
    setCreateIdempotencyKey(crypto.randomUUID());
    setIssuedLink(result.invitationToken ? invitationUrl(result.companySlug, result.invitationToken) : null);
    await utils.memberships.invitations.list.invalidate();
  }, onError: error => toast.error(error.message) });
  const revoke = platformTrpc.memberships.invitations.revoke.useMutation({ onSuccess: async () => { toast.success("Invitation revoked"); await utils.memberships.invitations.list.invalidate(); }, onError: error => toast.error(error.message) });
  const inspect = platformTrpc.memberships.inspect.useMutation({ onSuccess: setInspection, onError: error => toast.error(error.message) });
  const exportCsv = platformTrpc.memberships.exportCsv.useMutation({ onSuccess: result => { const url = URL.createObjectURL(new Blob([result.content], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = result.filename; link.click(); URL.revokeObjectURL(url); toast.success(`${result.rowCount.toLocaleString()} access rows exported${result.truncated ? " (limit reached)" : ""}`); }, onError: error => toast.error(error.message) });
  const update = platformTrpc.memberships.update.useMutation({ onSuccess: async () => { toast.success("Access updated"); await utils.memberships.list.invalidate(); }, onError: error => toast.error(error.message) });
  const mutate = (row: Row, values: { role?: typeof roles[number]; status?: "active" | "suspended" | "removed"; farmAccessMode?: "all" | "restricted"; farmPublicIds?: string[] }) => update.mutate({ publicId: row.publicId, expectedVersion: row.version, ...values });
  const [pendingChange, setPendingChange] = useState<{ row: Row; values: { role?: typeof roles[number]; status?: "active" | "suspended" | "removed"; farmAccessMode?: "all" | "restricted" }; label: string } | null>(null);
  const [accessRow, setAccessRow] = useState<Row | null>(null);
  const [editFarmMode, setEditFarmMode] = useState<"all" | "restricted">("all");
  const [editFarmPublicIds, setEditFarmPublicIds] = useState<string[]>([]);
  const accessFarms = platformTrpc.farms.list.useQuery({ limit: 100, companyPublicId: accessRow?.companyPublicId, status: "active", sortDirection: "desc" }, { enabled: Boolean(accessRow) });
  const openAccessEditor = (row: Row) => {
    setAccessRow(row);
    setEditFarmMode(row.farmAccessMode);
    setEditFarmPublicIds(String(row.assignedFarmPublicIds || "").split(",").filter(Boolean));
  };
  const columns: ResourceColumn<Row>[] = [
    { key: "user", label: "User", render: row => <div><p className="font-medium">{row.userName || "Unnamed user"}</p><p className="text-xs text-muted-foreground">{row.email || "No email"}</p></div> },
    { key: "company", label: "Company", render: row => row.companyName },
    { key: "role", label: "Role", render: row => row.role === "owner" ? <span className="font-medium capitalize">{row.role}</span> : <Select value={row.role} onValueChange={value => setPendingChange({ row, values: { role: value as typeof roles[number] }, label: `Change role to ${value}` })}><SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger><SelectContent>{roles.map(role => <SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>)}</SelectContent></Select> },
    { key: "status", label: "Status", render: row => <Select value={row.status} disabled={row.role === "owner"} onValueChange={value => setPendingChange({ row, values: { status: value as "active" | "suspended" | "removed" }, label: `${value === "removed" ? "Remove" : value === "suspended" ? "Suspend" : "Activate"} membership` })}><SelectTrigger className="h-8 w-32 border-0 bg-transparent px-0 shadow-none"><SelectValue><StatusBadge value={row.status} /></SelectValue></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended</SelectItem><SelectItem value="removed">Removed</SelectItem></SelectContent></Select> },
    { key: "farmAccess", label: "Farm access", render: row => <Button variant="ghost" size="sm" disabled={row.role === "owner"} onClick={() => openAccessEditor(row)}><SlidersHorizontal className="h-4 w-4" />{row.farmAccessMode === "all" ? "All farms" : "Restricted"}</Button> },
    { key: "farms", label: "Assigned", className: "text-right", render: row => row.farmAccessMode === "all" ? "All" : Number(row.farmCount) },
    { key: "last", label: "Last sign-in", render: row => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.lastSignedIn)}</span> },
    { key: "inspect", label: "", className: "w-12", render: row => <Button variant="ghost" size="icon" title="Inspect user access" aria-label={`Inspect ${row.userName || row.email || "user"}`} disabled={inspect.isPending} onClick={() => inspect.mutate({ publicId: row.publicId })}><Eye className="h-4 w-4" /></Button> },
  ];
  const invitationColumns: ResourceColumn<InvitationRow>[] = [
    { key: "email", label: "Invitee", render: row => <div><p className="font-medium">{row.email}</p><p className="text-xs text-muted-foreground">{row.companyName}</p></div> },
    { key: "role", label: "Role", render: row => <span className="capitalize">{row.role}</span> },
    { key: "access", label: "Farm access", render: row => row.farmAccessMode === "all" ? "All farms" : `${Array.isArray(row.farmPublicIds) ? row.farmPublicIds.length : 0} selected` },
    { key: "status", label: "Status", render: row => <StatusBadge value={row.status} /> },
    { key: "expires", label: "Expires", render: row => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.expiresAt)}</span> },
    { key: "action", label: "", className: "w-12", render: row => <Button variant="ghost" size="icon" title="Revoke invitation" aria-label={`Revoke invitation for ${row.email}`} disabled={row.status !== "pending" || revoke.isPending} onClick={() => revoke.mutate({ publicId: row.publicId, expectedVersion: row.version })}><Ban className="h-4 w-4" /></Button> },
  ];
  return <>
    <PageHeading title="Users & access" description="Company roles, invitations, and farm assignments. Ownership transfers use a separate controlled workflow." actions={<div className="flex gap-2"><Button variant="outline" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate({ search: search.trim() || undefined })}><Download className="h-4 w-4" />Export</Button><Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogTrigger asChild><Button><MailPlus className="h-4 w-4" />Invite user</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Invite user</DialogTitle><DialogDescription>The recipient must sign in with this email before accepting the one-time invitation.</DialogDescription></DialogHeader><div className="grid gap-3"><div className="grid gap-1.5"><Label>Company</Label><Select value={companyPublicId} onValueChange={value => { setCompanyPublicId(value); setFarmPublicIds([]); }}><SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger><SelectContent>{companies.data?.items.map(company => <SelectItem key={company.publicId} value={company.publicId}>{company.name}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-1.5"><Label htmlFor="new-user-email">Email</Label><Input id="new-user-email" type="email" value={email} onChange={event => setEmail(event.target.value)} /></div><div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label>Role</Label><Select value={newRole} onValueChange={value => setNewRole(value as typeof newRole)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{roles.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-1.5"><Label>Farm access</Label><Select value={newFarmMode} onValueChange={value => setNewFarmMode(value as typeof newFarmMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All farms</SelectItem><SelectItem value="restricted">Restricted</SelectItem></SelectContent></Select></div></div>{newFarmMode === "restricted" && <div className="grid gap-2"><Label>Assigned farms</Label><div className="max-h-36 overflow-auto border p-2">{farms.data?.items.map(farm => <label key={farm.publicId} className="flex items-center gap-2 py-1 text-sm"><Checkbox checked={farmPublicIds.includes(farm.publicId)} onCheckedChange={checked => setFarmPublicIds(current => checked ? [...current, farm.publicId] : current.filter(id => id !== farm.publicId))} />{farm.name}</label>)}</div></div>}</div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={!companyPublicId || !email.trim() || (newFarmMode === "restricted" && farmPublicIds.length === 0) || create.isPending} onClick={() => create.mutate({ companyPublicId, email, role: newRole, farmAccessMode: newFarmMode, farmPublicIds, expiresInHours: 72, idempotencyKey: createIdempotencyKey })}>Create invitation</Button></DialogFooter></DialogContent></Dialog></div>} />
    <section className="mb-6 border-y py-4"><div className="mb-3"><h2 className="text-sm font-semibold">Invitations</h2><p className="text-xs text-muted-foreground">Pending and completed company access invitations.</p></div><ResourceTable rows={invitations.data?.items ?? []} columns={invitationColumns} rowKey={row => row.publicId} loading={invitations.isLoading} canNext={false} canPrevious={false} onNext={() => undefined} onPrevious={() => undefined} /></section>
    <ListToolbar search={search} onSearch={value => { setSearch(value); page.reset(); }} placeholder="Search user, email, or company" status={status} onStatus={value => { setStatus(value); page.reset(); }} statuses={["invited", "active", "suspended", "removed"]} />
    <ResourceTable rows={rows} columns={columns} rowKey={row => row.publicId} loading={query.isLoading} canNext={Boolean(query.data?.nextCursor)} canPrevious={page.canPrevious} onNext={() => query.data?.nextCursor && page.next(query.data.nextCursor)} onPrevious={page.previous} />
    <Dialog open={Boolean(accessRow)} onOpenChange={open => { if (!open) setAccessRow(null); }}><DialogContent><DialogHeader><DialogTitle>Farm access</DialogTitle><DialogDescription>Choose the farms {accessRow?.userName || "this user"} can open in {accessRow?.companyName}.</DialogDescription></DialogHeader><div className="grid gap-3"><div className="grid gap-1.5"><Label>Access mode</Label><Select value={editFarmMode} onValueChange={value => setEditFarmMode(value as typeof editFarmMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All current and future farms</SelectItem><SelectItem value="restricted">Selected farms only</SelectItem></SelectContent></Select></div>{editFarmMode === "restricted" && <div className="grid gap-2"><Label>Assigned farms</Label><div className="max-h-56 overflow-auto border p-2">{accessFarms.data?.items.map(farm => <label key={farm.publicId} className="flex items-center gap-2 py-1.5 text-sm"><Checkbox checked={editFarmPublicIds.includes(farm.publicId)} onCheckedChange={checked => setEditFarmPublicIds(current => checked ? [...new Set([...current, farm.publicId])] : current.filter(id => id !== farm.publicId))} />{farm.name}</label>)}</div></div>}</div><DialogFooter><Button variant="outline" onClick={() => setAccessRow(null)}>Cancel</Button><Button disabled={!accessRow || update.isPending || (editFarmMode === "restricted" && editFarmPublicIds.length === 0)} onClick={() => { if (!accessRow) return; mutate(accessRow, { farmAccessMode: editFarmMode, farmPublicIds: editFarmMode === "restricted" ? editFarmPublicIds : [] }); setAccessRow(null); }}>Save access</Button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={Boolean(pendingChange)} onOpenChange={open => !open && setPendingChange(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{pendingChange?.label}</AlertDialogTitle><AlertDialogDescription>This immediately changes {pendingChange?.row.userName || pendingChange?.row.email || "this user"}&apos;s company access and revokes authorization caches.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingChange) mutate(pendingChange.row, pendingChange.values); setPendingChange(null); }}>Confirm access change</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={Boolean(issuedLink)} onOpenChange={open => { if (!open) setIssuedLink(null); }}><DialogContent><DialogHeader><DialogTitle>Invitation ready</DialogTitle><DialogDescription>This link is shown once. Send it through an approved secure channel. Only the invited email can accept it.</DialogDescription></DialogHeader><div className="flex gap-2"><Input readOnly value={issuedLink ?? ""} aria-label="Invitation link" /><Button size="icon" title="Copy invitation link" aria-label="Copy invitation link" onClick={async () => { if (!issuedLink) return; await navigator.clipboard.writeText(issuedLink); toast.success("Invitation link copied"); }}><Copy className="h-4 w-4" /></Button></div><DialogFooter><Button onClick={() => setIssuedLink(null)}>Done</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(inspection)} onOpenChange={open => { if (!open) setInspection(null); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>User access detail</DialogTitle><DialogDescription>This inspection is recorded in the platform audit log.</DialogDescription></DialogHeader>{inspection && <div className="grid gap-4 text-sm"><div className="grid gap-2 border-y py-3 sm:grid-cols-2"><p><span className="text-muted-foreground">User ID</span><br /><span className="font-mono text-xs">{inspection.userPublicId}</span></p><p><span className="text-muted-foreground">Company</span><br />{inspection.companyName}</p><p><span className="text-muted-foreground">Name</span><br />{inspection.userName || "Unnamed user"}</p><p><span className="text-muted-foreground">Email</span><br />{inspection.email || "No email"}</p><p><span className="text-muted-foreground">Role / status</span><br /><span className="capitalize">{inspection.role} / {inspection.status}</span></p><p><span className="text-muted-foreground">Farm access</span><br /><span className="capitalize">{inspection.farmAccessMode}</span></p><p><span className="text-muted-foreground">Joined</span><br />{formatDate(inspection.joinedAt)}</p><p><span className="text-muted-foreground">Created / last sign-in</span><br />{formatDate(inspection.createdAt)} / {formatDate(inspection.lastSignedIn)}</p></div>{inspection.farmAccessMode === "restricted" && <div><h3 className="mb-2 font-medium">Assigned farms</h3><div className="divide-y border-y">{inspection.assignedFarms.map(farm => <div key={farm.publicId} className="flex justify-between py-2"><span>{farm.name}</span><span className="text-muted-foreground">{farm.code} / {farm.status}</span></div>)}</div></div>}</div>}<DialogFooter><Button onClick={() => setInspection(null)}>Close</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
