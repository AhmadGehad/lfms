import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Download, Eye, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { ListToolbar } from "@admin/components/ListToolbar";
import { PageHeading } from "@admin/components/PageHeading";
import { ResourceTable, type ResourceColumn } from "@admin/components/ResourceTable";
import { StatusBadge } from "@admin/components/StatusBadge";
import { useCursorPage } from "@admin/hooks/useCursorPage";
import { formatDate } from "@admin/lib/format";
import { platformTrpc } from "@admin/lib/trpc";

type CompanyStatus = "provisioning" | "active" | "suspended" | "deletion_requested" | "purging" | "deleted";

export function CompaniesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const deferredSearch = useDeferredValue(search);
  const page = useCursorPage();
  const query = platformTrpc.companies.list.useQuery({
    cursor: page.cursor,
    limit: 25,
    search: deferredSearch || undefined,
    status: status === "all" ? undefined : status as CompanyStatus,
    sortDirection: "desc",
  });
  const rows = query.data?.items ?? [];
  type Row = (typeof rows)[number];
  const utils = platformTrpc.useUtils();
  const [createOpen, setCreateOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [farmName, setFarmName] = useState("");
  const [farmCode, setFarmCode] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [planPublicId, setPlanPublicId] = useState("none");
  const [createIdempotencyKey, setCreateIdempotencyKey] = useState(() => crypto.randomUUID());
  const [ownerInvitationLink, setOwnerInvitationLink] = useState<string | null>(null);
  const plans = platformTrpc.plans.list.useQuery({ limit: 100, status: "active", sortDirection: "desc" });
  const [target, setTarget] = useState<Row | null>(null);
  const [targetStatus, setTargetStatus] = useState<"active" | "suspended" | null>(null);
  const [reason, setReason] = useState("");
  const [detailTarget, setDetailTarget] = useState<Row | null>(null);
  const detail = platformTrpc.companies.get.useQuery({ publicId: detailTarget?.publicId ?? "" }, { enabled: Boolean(detailTarget) });
  const detailFarms = platformTrpc.farms.list.useQuery({ limit: 10, companyPublicId: detailTarget?.publicId, sortDirection: "desc" }, { enabled: Boolean(detailTarget) });
  const detailMembers = platformTrpc.memberships.list.useQuery({ limit: 10, companyPublicId: detailTarget?.publicId, sortDirection: "desc" }, { enabled: Boolean(detailTarget) });
  const detailUsage = platformTrpc.usage.list.useQuery({ limit: 10, companyPublicId: detailTarget?.publicId, sortDirection: "desc" }, { enabled: Boolean(detailTarget) });
  const [editTarget, setEditTarget] = useState<Row | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const createReady = companyName.trim().length >= 2
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())
    && farmName.trim().length >= 2
    && farmCode.trim().length > 0
    && ownerEmail.includes("@");

  const create = platformTrpc.companies.create.useMutation({
    onSuccess: async result => { toast.success("Company created in provisioning state"); setCreateOpen(false); setCompanyName(""); setSlug(""); setFarmName(""); setFarmCode(""); setOwnerEmail(""); setPlanPublicId("none"); setCreateIdempotencyKey(crypto.randomUUID()); if (result.ownerInvitationToken) { const host = window.location.hostname.startsWith("admin.") ? window.location.hostname.slice(6) : window.location.hostname; const protocol = host === "localhost" ? "http:" : "https:"; const port = host === "localhost" ? ":3000" : ""; setOwnerInvitationLink(`${protocol}//${slug.trim()}.${host}${port}/accept-invitation#token=${encodeURIComponent(result.ownerInvitationToken)}`); } await utils.companies.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const change = platformTrpc.companies.changeStatus.useMutation({
    onSuccess: async () => { toast.success("Company status updated"); setTarget(null); setTargetStatus(null); setReason(""); await utils.companies.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const update = platformTrpc.companies.update.useMutation({ onSuccess: async () => { toast.success("Company updated"); setEditTarget(null); await utils.companies.list.invalidate(); await utils.companies.get.invalidate(); }, onError: error => toast.error(error.message) });
  const exportCsv = platformTrpc.companies.exportCsv.useMutation({
    onSuccess: result => {
      const url = URL.createObjectURL(new Blob([result.content], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${result.rowCount.toLocaleString()} companies exported${result.truncated ? " (limit reached)" : ""}`);
    },
    onError: error => toast.error(error.message),
  });
  const openEdit = (row: Row) => { setEditTarget(row); setEditName(row.name); setEditSlug(row.slug); };

  const columns: ResourceColumn<Row>[] = [
    { key: "company", label: "Company", render: row => <div><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.slug}</p></div> },
    { key: "status", label: "Status", render: row => <StatusBadge value={row.status} /> },
    { key: "plan", label: "Plan", render: row => <div><p>{row.planName || "Unassigned"}</p><p className="text-xs text-muted-foreground capitalize">{row.subscriptionStatus?.replaceAll("_", " ") || "No subscription"}</p></div> },
    { key: "farms", label: "Farms", className: "text-right", render: row => <span className="tabular-nums">{Number(row.farmCount)}</span> },
    { key: "users", label: "Users", className: "text-right", render: row => <span className="tabular-nums">{Number(row.memberCount)}</span> },
    { key: "updated", label: "Updated", render: row => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.updatedAt)}</span> },
    { key: "actions", label: "", className: "w-12", render: row => {
      const canActivate = ["provisioning", "suspended"].includes(row.status);
      const canSuspend = ["provisioning", "active"].includes(row.status);
      return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setDetailTarget(row)}><Eye className="h-4 w-4" />Inspect</DropdownMenuItem><DropdownMenuItem onClick={() => openEdit(row)}><Pencil className="h-4 w-4" />Edit</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled={!canActivate} onClick={() => { setTarget(row); setTargetStatus("active"); }}>Activate</DropdownMenuItem><DropdownMenuItem disabled={!canSuspend} onClick={() => { setTarget(row); setTargetStatus("suspended"); }}>Suspend</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled>Request deletion</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
    } },
  ];

  return (
    <>
      <PageHeading title="Companies" description="Provision tenants, control lifecycle, and inspect plan assignment." actions={
        <div className="flex gap-2"><Button variant="outline" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate({ search: search.trim() || undefined, status: status === "all" ? undefined : status as CompanyStatus })}><Download className="h-4 w-4" />Export</Button><Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4" />New company</Button></DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Create company</DialogTitle><DialogDescription>The tenant remains in provisioning until the owner accepts the one-time email-bound invitation.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="company-name">Company name</Label><Input id="company-name" maxLength={200} value={companyName} onChange={event => { setCompanyName(event.target.value); if (!slug) setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} /></div><div className="grid gap-1.5"><Label htmlFor="company-slug">Subdomain slug</Label><Input id="company-slug" maxLength={100} value={slug} onChange={event => setSlug(event.target.value.toLowerCase())} /></div></div><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="initial-farm-name">Initial farm</Label><Input id="initial-farm-name" maxLength={200} value={farmName} onChange={event => setFarmName(event.target.value)} /></div><div className="grid gap-1.5"><Label htmlFor="initial-farm-code">Farm code</Label><Input id="initial-farm-code" maxLength={40} value={farmCode} onChange={event => setFarmCode(event.target.value.toUpperCase())} /></div></div><div className="grid gap-1.5"><Label htmlFor="owner-email">Owner email</Label><Input id="owner-email" type="email" maxLength={320} autoComplete="email" value={ownerEmail} onChange={event => setOwnerEmail(event.target.value)} /></div><div className="grid gap-1.5"><Label>Plan</Label><Select value={planPublicId} onValueChange={setPlanPublicId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Assign later</SelectItem>{plans.data?.items.map(plan => <SelectItem key={plan.publicId} value={plan.publicId}>{plan.name} v{plan.planVersion}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={create.isPending || !createReady} onClick={() => create.mutate({ name: companyName.trim(), slug: slug.trim(), initialFarmName: farmName.trim(), initialFarmCode: farmCode.trim(), ownerEmail: ownerEmail.trim(), planPublicId: planPublicId === "none" ? undefined : planPublicId, idempotencyKey: createIdempotencyKey })}>Create company</Button></DialogFooter></DialogContent></Dialog></div>
      } />
      <ListToolbar search={search} onSearch={value => { setSearch(value); page.reset(); }} placeholder="Search name, slug, or ID" status={status} onStatus={value => { setStatus(value); page.reset(); }} statuses={["provisioning", "active", "suspended", "deletion_requested"]} />
      <ResourceTable rows={rows} columns={columns} rowKey={row => row.publicId} loading={query.isLoading} canNext={Boolean(query.data?.nextCursor)} canPrevious={page.canPrevious} onNext={() => query.data?.nextCursor && page.next(query.data.nextCursor)} onPrevious={page.previous} />

      <Dialog open={Boolean(detailTarget)} onOpenChange={open => !open && setDetailTarget(null)}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{detail.data?.name || "Company details"}</DialogTitle><DialogDescription>Tenant operational metadata. Business records require a separately approved support grant.</DialogDescription></DialogHeader>{detail.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p> : detail.data && <div className="grid gap-4"><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Status</p><StatusBadge value={detail.data.status} /></div><div><p className="text-xs text-muted-foreground">Plan</p><p>{detail.data.planName || "Unassigned"}</p></div><div><p className="text-xs text-muted-foreground">Farms</p><p>{Number(detail.data.activeFarmCount)} active / {Number(detail.data.farmCount)} total</p></div><div><p className="text-xs text-muted-foreground">Users</p><p>{Number(detail.data.activeMemberCount)} active / {Number(detail.data.memberCount)} total</p></div><div><p className="text-xs text-muted-foreground">Subscription</p><p className="capitalize">{detail.data.subscriptionStatus?.replaceAll("_", " ") || "None"}</p></div><div><p className="text-xs text-muted-foreground">Version</p><p>{detail.data.version}</p></div><div className="col-span-2"><p className="text-xs text-muted-foreground">Public ID</p><p className="font-mono text-xs">{detail.data.publicId}</p></div></div><div><h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Farms</h3><div className="grid gap-1 text-sm">{detailFarms.data?.items.map(farm => <div key={farm.publicId} className="flex justify-between border-b py-1"><span>{farm.name}</span><StatusBadge value={farm.status} /></div>)}</div></div><div><h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Users</h3><div className="grid gap-1 text-sm">{detailMembers.data?.items.map(member => <div key={member.publicId} className="flex justify-between border-b py-1"><span>{member.userName || member.email}</span><span className="capitalize">{member.role} / {member.status}</span></div>)}</div></div><div><h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Usage</h3><div className="grid gap-1 text-sm">{detailUsage.data?.items.map(item => <div key={`${item.metricCode}-${String(item.periodStart)}`} className="flex justify-between border-b py-1"><span>{item.featureName || item.metricCode}</span><span className="tabular-nums">{item.usedValue}{item.limitValue === null ? "" : ` / ${item.limitValue}`}</span></div>)}</div></div></div>}<DialogFooter><Button variant="outline" onClick={() => setDetailTarget(null)}>Close</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(editTarget)} onOpenChange={open => !open && setEditTarget(null)}><DialogContent><DialogHeader><DialogTitle>Edit company</DialogTitle><DialogDescription>Changing the slug changes the tenant hostname. Existing data and public IDs remain unchanged.</DialogDescription></DialogHeader><div className="grid gap-3"><div className="grid gap-1.5"><Label htmlFor="edit-company-name">Name</Label><Input id="edit-company-name" maxLength={200} value={editName} onChange={event => setEditName(event.target.value)} /></div><div className="grid gap-1.5"><Label htmlFor="edit-company-slug">Slug</Label><Input id="edit-company-slug" maxLength={100} value={editSlug} onChange={event => setEditSlug(event.target.value.toLowerCase())} /></div></div><DialogFooter><Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button><Button disabled={!editTarget || update.isPending || editName.trim().length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(editSlug.trim())} onClick={() => editTarget && update.mutate({ publicId: editTarget.publicId, expectedVersion: editTarget.version, name: editName.trim(), slug: editSlug.trim() })}>Save changes</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(target && targetStatus)} onOpenChange={open => { if (!open) { setTarget(null); setTargetStatus(null); setReason(""); } }}>
        <DialogContent><DialogHeader><DialogTitle>{targetStatus === "suspended" ? "Suspend company" : "Activate company"}</DialogTitle><DialogDescription>{target?.name} will immediately receive the selected lifecycle policy.</DialogDescription></DialogHeader>{targetStatus === "suspended" && <div className="grid gap-1.5"><Label htmlFor="suspend-reason">Reason</Label><Textarea id="suspend-reason" value={reason} onChange={event => setReason(event.target.value)} /></div>}<DialogFooter><Button variant="outline" onClick={() => { setTarget(null); setTargetStatus(null); }}>Cancel</Button><Button variant={targetStatus === "suspended" ? "destructive" : "default"} disabled={!target || change.isPending || (targetStatus === "suspended" && reason.trim().length < 5)} onClick={() => target && targetStatus && change.mutate({ publicId: target.publicId, status: targetStatus, expectedVersion: target.version, reason: targetStatus === "suspended" ? reason : undefined })}>Confirm</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={Boolean(ownerInvitationLink)} onOpenChange={open => { if (!open) setOwnerInvitationLink(null); }}><DialogContent><DialogHeader><DialogTitle>Owner invitation ready</DialogTitle><DialogDescription>This one-time link is the only way to activate the initial owner membership. Send it through an approved secure channel.</DialogDescription></DialogHeader><div className="flex gap-2"><Input readOnly value={ownerInvitationLink ?? ""} aria-label="Owner invitation link" /><Button size="icon" title="Copy owner invitation link" aria-label="Copy owner invitation link" onClick={async () => { if (!ownerInvitationLink) return; await navigator.clipboard.writeText(ownerInvitationLink); toast.success("Owner invitation link copied"); }}><Copy className="h-4 w-4" /></Button></div><DialogFooter><Button onClick={() => setOwnerInvitationLink(null)}>Done</Button></DialogFooter></DialogContent></Dialog>
    </>
  );
}
