import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ShieldCheck } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { ListToolbar } from "@admin/components/ListToolbar";
import { PageHeading } from "@admin/components/PageHeading";
import { ResourceTable, type ResourceColumn } from "@admin/components/ResourceTable";
import { StatusBadge } from "@admin/components/StatusBadge";
import { useCursorPage } from "@admin/hooks/useCursorPage";
import { formatDate } from "@admin/lib/format";
import { platformTrpc } from "@admin/lib/trpc";

type MutableStatus = "active" | "suspended" | "revoked";

export function AdministratorsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const page = useCursorPage();
  const query = platformTrpc.administrators.list.useQuery({
    cursor: page.cursor,
    limit: 25,
    search: useDeferredValue(search) || undefined,
    status: status === "all" ? undefined : status as MutableStatus,
    sortDirection: "desc",
  });
  const roles = platformTrpc.administrators.roles.useQuery();
  const session = platformTrpc.auth.me.useQuery();
  const canWrite = Boolean(session.data?.permissions.includes("administrators.write"));
  const rows = query.data?.items ?? [];
  type Row = (typeof rows)[number];
  const utils = platformTrpc.useUtils();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [oidcSubject, setOidcSubject] = useState("");
  const [newStatus, setNewStatus] = useState<"invited" | "active">("invited");
  const [newRoleCodes, setNewRoleCodes] = useState<string[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [editRoleCodes, setEditRoleCodes] = useState<string[]>([]);
  const [pendingStatus, setPendingStatus] = useState<{ row: Row; status: MutableStatus } | null>(null);

  const create = platformTrpc.administrators.create.useMutation({
    onSuccess: async () => {
      toast.success("Platform administrator created");
      setCreateOpen(false);
      setName(""); setEmail(""); setOidcSubject(""); setNewRoleCodes([]);
      setIdempotencyKey(crypto.randomUUID());
      await utils.administrators.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const update = platformTrpc.administrators.update.useMutation({
    onSuccess: async () => {
      toast.success("Platform access updated");
      setEditRow(null);
      await utils.administrators.list.invalidate();
      await utils.auth.me.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const toggleRole = (code: string, current: string[], set: (value: string[]) => void) => {
    set(current.includes(code) ? current.filter(value => value !== code) : [...current, code]);
  };
  const openRoleEditor = (row: Row) => {
    setEditRow(row);
    setEditRoleCodes([...row.roleCodes]);
  };
  const columns: ResourceColumn<Row>[] = [
    { key: "administrator", label: "Administrator", render: row => <div><p className="font-medium">{row.name || "Unnamed administrator"}</p><p className="text-xs text-muted-foreground">{row.email || "No email"}</p></div> },
    { key: "roles", label: "Roles", render: row => <div className="flex flex-wrap gap-1">{row.roleCodes.map(code => <span key={code} className="border bg-muted px-1.5 py-0.5 text-xs">{code}</span>)}</div> },
    { key: "status", label: "Status", render: row => canWrite && row.status !== "revoked" && row.publicId !== session.data?.publicId ? <Select value={row.status} onValueChange={value => setPendingStatus({ row, status: value as MutableStatus })}><SelectTrigger className="h-8 w-32 border-0 bg-transparent px-0 shadow-none"><SelectValue><StatusBadge value={row.status} /></SelectValue></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended</SelectItem><SelectItem value="revoked">Revoked</SelectItem></SelectContent></Select> : <StatusBadge value={row.status} /> },
    { key: "mfa", label: "MFA", render: row => <span className="inline-flex items-center gap-1 text-xs"><ShieldCheck className="h-3.5 w-3.5" />{row.mfaRequired ? "Required" : "Optional"}</span> },
    { key: "last", label: "Last sign-in", render: row => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.lastSignedIn)}</span> },
    { key: "actions", label: "", className: "text-right", render: row => canWrite && row.status !== "revoked" && row.publicId !== session.data?.publicId ? <Button variant="outline" size="sm" onClick={() => openRoleEditor(row)}>Edit roles</Button> : null },
  ];

  return <>
    <PageHeading title="Platform administrators" description="Workforce identities, platform roles, MFA policy, and access status." actions={canWrite ? <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4" />Add administrator</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Add platform administrator</DialogTitle><DialogDescription>Link an approved workforce OIDC identity and assign least-privilege roles.</DialogDescription></DialogHeader><div className="grid gap-3"><div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label htmlFor="platform-admin-name">Name</Label><Input id="platform-admin-name" value={name} onChange={event => setName(event.target.value)} /></div><div className="grid gap-1.5"><Label htmlFor="platform-admin-email">Email</Label><Input id="platform-admin-email" type="email" value={email} onChange={event => setEmail(event.target.value)} /></div></div><div className="grid gap-1.5"><Label htmlFor="platform-admin-subject">OIDC subject</Label><Input id="platform-admin-subject" value={oidcSubject} onChange={event => setOidcSubject(event.target.value)} /></div><div className="grid gap-1.5"><Label>Status</Label><Select value={newStatus} onValueChange={value => setNewStatus(value as typeof newStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invited">Invited</SelectItem><SelectItem value="active">Active</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Platform roles</Label><div className="max-h-48 overflow-auto border p-2">{roles.data?.map(role => <label key={role.code} className="flex items-start gap-2 py-1.5 text-sm"><Checkbox checked={newRoleCodes.includes(role.code)} onCheckedChange={() => toggleRole(role.code, newRoleCodes, setNewRoleCodes)} /><span><span className="block font-medium">{role.name}</span><span className="block text-xs text-muted-foreground">{role.permissionCount} permissions</span></span></label>)}</div></div></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={!name.trim() || !email.trim() || !oidcSubject.trim() || newRoleCodes.length === 0 || create.isPending} onClick={() => create.mutate({ name, email, oidcSubject, status: newStatus, roleCodes: newRoleCodes, idempotencyKey })}>Create administrator</Button></DialogFooter></DialogContent></Dialog> : undefined} />
    <ListToolbar search={search} onSearch={value => { setSearch(value); page.reset(); }} placeholder="Search name or email" status={status} onStatus={value => { setStatus(value); page.reset(); }} statuses={["invited", "active", "suspended", "revoked"]} />
    <ResourceTable rows={rows} columns={columns} rowKey={row => row.publicId} loading={query.isLoading} canNext={Boolean(query.data?.nextCursor)} canPrevious={page.canPrevious} onNext={() => query.data?.nextCursor && page.next(query.data.nextCursor)} onPrevious={page.previous} />

    <Dialog open={Boolean(editRow)} onOpenChange={open => !open && setEditRow(null)}><DialogContent><DialogHeader><DialogTitle>Replace platform roles</DialogTitle><DialogDescription>Saving replaces every current role and revokes all active sessions for {editRow?.name || editRow?.email}.</DialogDescription></DialogHeader><div className="max-h-64 overflow-auto border p-2">{roles.data?.map(role => <label key={role.code} className="flex items-start gap-2 py-1.5 text-sm"><Checkbox checked={editRoleCodes.includes(role.code)} onCheckedChange={() => toggleRole(role.code, editRoleCodes, setEditRoleCodes)} /><span><span className="block font-medium">{role.name}</span><span className="block text-xs text-muted-foreground">{role.permissionCount} permissions</span></span></label>)}</div><DialogFooter><Button variant="outline" onClick={() => setEditRow(null)}>Cancel</Button><Button disabled={!editRow || editRoleCodes.length === 0 || update.isPending} onClick={() => editRow && update.mutate({ publicId: editRow.publicId, roleCodes: editRoleCodes, expectedVersion: editRow.version })}>Replace roles</Button></DialogFooter></DialogContent></Dialog>

    <AlertDialog open={Boolean(pendingStatus)} onOpenChange={open => !open && setPendingStatus(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Change administrator status</AlertDialogTitle><AlertDialogDescription>This sets {pendingStatus?.row.name || pendingStatus?.row.email} to {pendingStatus?.status} and immediately revokes all active platform sessions. Revocation is permanent.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingStatus) update.mutate({ publicId: pendingStatus.row.publicId, status: pendingStatus.status, expectedVersion: pendingStatus.row.version }); setPendingStatus(null); }}>Confirm status change</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
