import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Check, Eye, Plus, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { ListToolbar } from "@admin/components/ListToolbar";
import { PageHeading } from "@admin/components/PageHeading";
import { ResourceTable, type ResourceColumn } from "@admin/components/ResourceTable";
import { StatusBadge } from "@admin/components/StatusBadge";
import { useCursorPage } from "@admin/hooks/useCursorPage";
import { formatDate } from "@admin/lib/format";
import { platformTrpc } from "@admin/lib/trpc";
import { SUPPORT_SCOPES, type SupportScope } from "@shared/tenancy";

export function SupportPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const page = useCursorPage();
  const query = platformTrpc.support.list.useQuery({ cursor: page.cursor, limit: 25, search: useDeferredValue(search) || undefined, status: status === "all" ? undefined : status as "active", sortDirection: "desc" });
  const companies = platformTrpc.companies.list.useQuery({ limit: 100, status: "active", sortDirection: "desc" });
  const rows = query.data?.items ?? [];
  type Row = (typeof rows)[number];
  const [pendingAction, setPendingAction] = useState<{ row: Row; action: "approve" | "reject" | "revoke" } | null>(null);
  const [inspection, setInspection] = useState<{ row: Row; scope: SupportScope } | null>(null);
  const utils = platformTrpc.useUtils();
  const [open, setOpen] = useState(false);
  const [companyPublicId, setCompanyPublicId] = useState("");
  const [accessMode, setAccessMode] = useState<"read_only" | "write">("read_only");
  const [scopes, setScopes] = useState("company.summary, farms.read");
  const [reason, setReason] = useState("");
  const [ticket, setTicket] = useState("");
  const request = platformTrpc.support.request.useMutation({ onSuccess: async result => { toast.success(result.status === "active" ? "Read-only support access active" : "Write access awaiting approval"); setOpen(false); await utils.support.list.invalidate(); }, onError: error => toast.error(error.message) });
  const approve = platformTrpc.support.approve.useMutation({ onSuccess: async () => { toast.success("Support decision recorded"); await utils.support.list.invalidate(); }, onError: error => toast.error(error.message) });
  const revoke = platformTrpc.support.revoke.useMutation({ onSuccess: async () => { toast.success("Support access revoked"); await utils.support.list.invalidate(); }, onError: error => toast.error(error.message) });
  const inspect = platformTrpc.support.inspect.useMutation({ onError: error => toast.error(error.message) });
  const columns: ResourceColumn<Row>[] = [
    { key: "company", label: "Company", render: row => <div><p className="font-medium">{row.companyName}</p><p className="text-xs text-muted-foreground">{row.ticketReference}</p></div> },
    { key: "requester", label: "Requested by", render: row => row.requestedByName || "Platform admin" },
    { key: "mode", label: "Mode", render: row => <StatusBadge value={row.accessMode} /> },
    { key: "status", label: "Status", render: row => <StatusBadge value={row.status} /> },
    { key: "scopes", label: "Scopes", render: row => <span className="block max-w-56 truncate text-xs" title={Array.isArray(row.allowedScopes) ? row.allowedScopes.join(", ") : ""}>{Array.isArray(row.allowedScopes) ? row.allowedScopes.join(", ") : "—"}</span> },
    { key: "expires", label: "Expires", render: row => <span className="whitespace-nowrap text-xs">{formatDate(row.expiresAt)}</span> },
    { key: "actions", label: "", className: "w-36", render: row => <div className="flex justify-end gap-1">{row.status === "active" && <Button variant="ghost" size="icon" onClick={() => { const allowed = Array.isArray(row.allowedScopes) ? row.allowedScopes : []; const scope = allowed.find((value): value is SupportScope => SUPPORT_SCOPES.includes(value as SupportScope)); if (!scope) return; setInspection({ row, scope }); inspect.mutate({ publicId: row.publicId, scope }); }} aria-label="Inspect tenant"><Eye className="h-4 w-4" /></Button>}{row.status === "pending" && <><Button variant="ghost" size="icon" onClick={() => setPendingAction({ row, action: "approve" })} aria-label="Approve write access"><Check className="h-4 w-4 text-success" /></Button><Button variant="ghost" size="icon" onClick={() => setPendingAction({ row, action: "reject" })} aria-label="Reject write access"><X className="h-4 w-4 text-danger" /></Button></>}{(["active", "approved", "pending"] as string[]).includes(row.status) && <Button variant="ghost" size="sm" onClick={() => setPendingAction({ row, action: "revoke" })}>Revoke</Button>}</div> },
  ];
  return <>
    <PageHeading title="Support access" description="Time-limited, visible tenant access. Write grants require a second platform approver." actions={<Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4" />Request access</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Request tenant support access</DialogTitle><DialogDescription>Access expires after 30 minutes and every operation remains attributable to your platform identity.</DialogDescription></DialogHeader><div className="grid gap-3"><div className="grid gap-1.5"><Label>Company</Label><Select value={companyPublicId} onValueChange={setCompanyPublicId}><SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger><SelectContent>{companies.data?.items.map(company => <SelectItem key={company.publicId} value={company.publicId}>{company.name}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-1.5"><Label>Mode</Label><Select value={accessMode} onValueChange={value => setAccessMode(value as typeof accessMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="read_only">Read only</SelectItem><SelectItem value="write">Write (approval required)</SelectItem></SelectContent></Select></div><div className="grid gap-1.5"><Label htmlFor="support-scopes">Allowed scopes</Label><Input id="support-scopes" value={scopes} onChange={event => setScopes(event.target.value)} /></div><div className="grid gap-1.5"><Label htmlFor="ticket">Ticket reference</Label><Input id="ticket" value={ticket} onChange={event => setTicket(event.target.value)} /></div><div className="grid gap-1.5"><Label htmlFor="support-reason">Reason</Label><Textarea id="support-reason" value={reason} onChange={event => setReason(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!companyPublicId || ticket.length < 2 || reason.trim().length < 10 || request.isPending} onClick={() => request.mutate({ companyPublicId, accessMode, allowedScopes: scopes.split(",").map(value => value.trim()).filter((value): value is SupportScope => SUPPORT_SCOPES.includes(value as SupportScope)), reason, ticketReference: ticket, durationMinutes: 30 })}>Request access</Button></DialogFooter></DialogContent></Dialog>} />
    <ListToolbar search={search} onSearch={value => { setSearch(value); page.reset(); }} placeholder="Search company, ticket, or requester" status={status} onStatus={value => { setStatus(value); page.reset(); }} statuses={["pending", "active", "expired", "revoked", "rejected"]} />
    <ResourceTable rows={rows} columns={columns} rowKey={row => row.publicId} loading={query.isLoading} canNext={Boolean(query.data?.nextCursor)} canPrevious={page.canPrevious} onNext={() => query.data?.nextCursor && page.next(query.data.nextCursor)} onPrevious={page.previous} />
    <AlertDialog open={Boolean(pendingAction)} onOpenChange={open => !open && setPendingAction(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle className="capitalize">{pendingAction?.action} support access</AlertDialogTitle><AlertDialogDescription>This decision applies to ticket {pendingAction?.row.ticketReference} for {pendingAction?.row.companyName} and is permanently audited.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingAction?.action === "approve") approve.mutate({ publicId: pendingAction.row.publicId, decision: "approved", expectedVersion: pendingAction.row.version }); if (pendingAction?.action === "reject") approve.mutate({ publicId: pendingAction.row.publicId, decision: "rejected", expectedVersion: pendingAction.row.version }); if (pendingAction?.action === "revoke") revoke.mutate({ publicId: pendingAction.row.publicId, expectedVersion: pendingAction.row.version }); setPendingAction(null); }}>Confirm decision</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={Boolean(inspection)} onOpenChange={next => { if (!next) { setInspection(null); inspect.reset(); } }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{inspection?.row.companyName}</DialogTitle><DialogDescription>Ticket {inspection?.row.ticketReference}. Each inspection is recorded against this grant.</DialogDescription></DialogHeader>{inspection && <div className="grid gap-3"><Select value={inspection.scope} onValueChange={value => { const scope = value as typeof inspection.scope; setInspection({ ...inspection, scope }); inspect.mutate({ publicId: inspection.row.publicId, scope }); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Array.isArray(inspection.row.allowedScopes) ? inspection.row.allowedScopes : []).filter(scope => ["company.summary", "farms.read", "memberships.read", "animals.read", "audit.read"].includes(String(scope))).map(scope => <SelectItem key={String(scope)} value={String(scope)}>{String(scope)}</SelectItem>)}</SelectContent></Select><pre className="max-h-[55vh] overflow-auto border bg-muted/30 p-3 text-xs">{inspect.isPending ? "Loading..." : JSON.stringify(inspect.data?.data ?? null, null, 2)}</pre></div>}</DialogContent></Dialog>
  </>;
}
