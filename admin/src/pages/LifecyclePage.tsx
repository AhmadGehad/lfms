import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Check, DatabaseBackup, Download, Plus, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { ListToolbar } from "@admin/components/ListToolbar";
import { PageHeading } from "@admin/components/PageHeading";
import { ResourceTable, type ResourceColumn } from "@admin/components/ResourceTable";
import { StatusBadge } from "@admin/components/StatusBadge";
import { useCursorPage } from "@admin/hooks/useCursorPage";
import { formatDate } from "@admin/lib/format";
import { platformTrpc } from "@admin/lib/trpc";

type PendingAction = {
  kind: "cancel_export" | "approve_deletion" | "cancel_deletion" | "approve_restore" | "cancel_restore";
  publicId: string;
  version: number;
  companyName: string;
};

export function LifecyclePage() {
  const auth = platformTrpc.auth.me.useQuery();
  const canReadExports = Boolean(auth.data?.permissions.includes("exports.read"));
  const canCreateExports = Boolean(auth.data?.permissions.includes("exports.create"));
  const canReadOperations = Boolean(auth.data?.permissions.includes("operations.read"));
  const canWriteOperations = Boolean(auth.data?.permissions.includes("operations.write"));
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [exportStatus, setExportStatus] = useState("all");
  const [deletionStatus, setDeletionStatus] = useState("all");
  const [restoreStatus, setRestoreStatus] = useState("all");
  const exportPage = useCursorPage();
  const deletionPage = useCursorPage();
  const restorePage = useCursorPage();
  const exportsQuery = platformTrpc.lifecycle.exports.list.useQuery({
    cursor: exportPage.cursor, limit: 25, search: deferredSearch || undefined,
    status: exportStatus === "all" ? undefined : exportStatus as "pending",
    sortDirection: "desc",
  }, { enabled: canReadExports });
  const deletionsQuery = platformTrpc.lifecycle.deletions.list.useQuery({
    cursor: deletionPage.cursor, limit: 25, search: deferredSearch || undefined,
    status: deletionStatus === "all" ? undefined : deletionStatus as "requested",
    sortDirection: "desc",
  }, { enabled: canReadOperations });
  const restoresQuery = platformTrpc.lifecycle.restores.list.useQuery({
    cursor: restorePage.cursor, limit: 25, search: deferredSearch || undefined,
    status: restoreStatus === "all" ? undefined : restoreStatus as "pending",
    sortDirection: "desc",
  }, { enabled: canReadOperations });
  const companies = platformTrpc.companies.list.useQuery({ limit: 100, sortDirection: "desc" });
  const utils = platformTrpc.useUtils();
  const [requestKind, setRequestKind] = useState<"export" | "deletion" | "restore" | null>(null);
  const [companyPublicId, setCompanyPublicId] = useState("");
  const [reason, setReason] = useState("");
  const [retentionDays, setRetentionDays] = useState("30");
  const [exportType, setExportType] = useState<"tenant_full_backup" | "tenant_operational_report">("tenant_full_backup");
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [sourceFilePublicId, setSourceFilePublicId] = useState("");
  const [checkpointPublicId, setCheckpointPublicId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const selectedCompany = companies.data?.items.find(item => item.publicId === companyPublicId);
  const invalidate = async () => {
    await Promise.all([
      utils.lifecycle.exports.list.invalidate(),
      utils.lifecycle.deletions.list.invalidate(),
      utils.lifecycle.restores.list.invalidate(),
      utils.companies.list.invalidate(),
    ]);
  };
  const closeRequest = () => {
    setRequestKind(null); setCompanyPublicId(""); setReason(""); setSourceFilePublicId(""); setCheckpointPublicId("");
    setIdempotencyKey(crypto.randomUUID());
  };
  const requestExport = platformTrpc.lifecycle.exports.request.useMutation({ onSuccess: async () => { toast.success("Export queued"); closeRequest(); await invalidate(); }, onError: error => toast.error(error.message) });
  const requestDeletion = platformTrpc.lifecycle.deletions.request.useMutation({ onSuccess: async () => { toast.success("Deletion requested; retention and export controls active"); closeRequest(); await invalidate(); }, onError: error => toast.error(error.message) });
  const requestRestore = platformTrpc.lifecycle.restores.request.useMutation({ onSuccess: async () => { toast.success("Restore validation queued"); closeRequest(); await invalidate(); }, onError: error => toast.error(error.message) });
  const cancelExport = platformTrpc.lifecycle.exports.cancel.useMutation({ onSuccess: invalidate, onError: error => toast.error(error.message) });
  const downloadExport = platformTrpc.lifecycle.exports.download.useMutation({
    onSuccess: result => {
      const link = document.createElement("a");
      link.href = result.url;
      link.download = result.filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    onError: error => toast.error(error.message),
  });
  const approveDeletion = platformTrpc.lifecycle.deletions.approve.useMutation({ onSuccess: invalidate, onError: error => toast.error(error.message) });
  const cancelDeletion = platformTrpc.lifecycle.deletions.cancel.useMutation({ onSuccess: invalidate, onError: error => toast.error(error.message) });
  const approveRestore = platformTrpc.lifecycle.restores.approve.useMutation({ onSuccess: invalidate, onError: error => toast.error(error.message) });
  const cancelRestore = platformTrpc.lifecycle.restores.cancel.useMutation({ onSuccess: invalidate, onError: error => toast.error(error.message) });

  const exportRows = exportsQuery.data?.items ?? [];
  type ExportRow = (typeof exportRows)[number];
  const exportColumns: ResourceColumn<ExportRow>[] = [
    { key: "company", label: "Company", render: row => <div><p className="font-medium">{row.companyName}</p><p className="font-mono text-[10px] text-muted-foreground">{row.publicId}</p></div> },
    { key: "type", label: "Type", render: row => row.exportType.replaceAll("_", " ") },
    { key: "status", label: "Status", render: row => <StatusBadge value={row.status} /> },
    { key: "file", label: "File ID", render: row => <span className="font-mono text-[10px]">{row.filePublicId || "Pending"}</span> },
    { key: "expires", label: "Expires", render: row => <span className="whitespace-nowrap text-xs">{formatDate(row.expiresAt)}</span> },
    { key: "actions", label: "", className: "w-20", render: row => <div className="flex justify-end gap-1">{canCreateExports && row.status === "completed" && row.filePublicId && <Button variant="ghost" size="icon" disabled={downloadExport.isPending} onClick={() => downloadExport.mutate({ publicId: row.publicId })} aria-label="Download export"><Download className="h-4 w-4" /></Button>}{canCreateExports && (["pending", "failed"] as string[]).includes(row.status) && <Button variant="ghost" size="icon" onClick={() => setPendingAction({ kind: "cancel_export", publicId: row.publicId, version: row.version, companyName: row.companyName })} aria-label="Cancel export"><X className="h-4 w-4" /></Button>}</div> },
  ];
  const deletionRows = deletionsQuery.data?.items ?? [];
  type DeletionRow = (typeof deletionRows)[number];
  const deletionColumns: ResourceColumn<DeletionRow>[] = [
    { key: "company", label: "Company", render: row => <div><p className="font-medium">{row.companyName}</p><p className="font-mono text-[10px] text-muted-foreground">{row.publicId}</p></div> },
    { key: "status", label: "Status", render: row => <StatusBadge value={row.status} /> },
    { key: "retention", label: "Retention until", render: row => <span className="whitespace-nowrap text-xs">{formatDate(row.retentionUntil)}</span> },
    { key: "reason", label: "Reason", render: row => <span className="block max-w-72 truncate" title={row.reason}>{row.reason}</span> },
    { key: "created", label: "Requested", render: row => <span className="whitespace-nowrap text-xs">{formatDate(row.createdAt)}</span> },
    { key: "actions", label: "", className: "w-24", render: row => canWriteOperations && (["requested", "exported", "legal_hold"] as string[]).includes(row.status) ? <div className="flex justify-end gap-1"><Button variant="ghost" size="icon" disabled={row.status === "legal_hold"} onClick={() => setPendingAction({ kind: "approve_deletion", publicId: row.publicId, version: row.version, companyName: row.companyName })} aria-label="Approve deletion"><Check className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => setPendingAction({ kind: "cancel_deletion", publicId: row.publicId, version: row.version, companyName: row.companyName })} aria-label="Cancel deletion"><X className="h-4 w-4" /></Button></div> : null },
  ];
  const restoreRows = restoresQuery.data?.items ?? [];
  type RestoreRow = (typeof restoreRows)[number];
  const restoreColumns: ResourceColumn<RestoreRow>[] = [
    { key: "company", label: "Company", render: row => <div><p className="font-medium">{row.companyName}</p><p className="font-mono text-[10px] text-muted-foreground">{row.publicId}</p></div> },
    { key: "status", label: "Status", render: row => <StatusBadge value={row.status} /> },
    { key: "source", label: "Source file", render: row => <span className="font-mono text-[10px]">{row.sourceFilePublicId || "-"}</span> },
    { key: "failure", label: "Validation / failure", render: row => <span className="block max-w-72 truncate" title={row.failureReason || JSON.stringify(row.validationResult)}>{row.failureReason || (row.validationResult ? "Validation recorded" : "Pending")}</span> },
    { key: "created", label: "Requested", render: row => <span className="whitespace-nowrap text-xs">{formatDate(row.createdAt)}</span> },
    { key: "actions", label: "", className: "w-24", render: row => canWriteOperations && (["pending", "validating", "ready", "failed"] as string[]).includes(row.status) ? <div className="flex justify-end gap-1">{row.status === "ready" && <Button variant="ghost" size="icon" onClick={() => setPendingAction({ kind: "approve_restore", publicId: row.publicId, version: row.version, companyName: row.companyName })} aria-label="Approve restore"><Check className="h-4 w-4" /></Button>}<Button variant="ghost" size="icon" onClick={() => setPendingAction({ kind: "cancel_restore", publicId: row.publicId, version: row.version, companyName: row.companyName })} aria-label="Cancel restore"><X className="h-4 w-4" /></Button></div> : null },
  ];

  const confirmAction = () => {
    if (!pendingAction) return;
    if (pendingAction.kind === "cancel_export") cancelExport.mutate({ publicId: pendingAction.publicId, expectedVersion: pendingAction.version });
    if (pendingAction.kind === "approve_deletion") approveDeletion.mutate({ publicId: pendingAction.publicId, expectedVersion: pendingAction.version });
    if (pendingAction.kind === "cancel_deletion") cancelDeletion.mutate({ publicId: pendingAction.publicId, expectedVersion: pendingAction.version, reason: cancelReason });
    if (pendingAction.kind === "approve_restore") approveRestore.mutate({ publicId: pendingAction.publicId, expectedVersion: pendingAction.version });
    if (pendingAction.kind === "cancel_restore") cancelRestore.mutate({ publicId: pendingAction.publicId, expectedVersion: pendingAction.version, reason: cancelReason });
    setPendingAction(null); setCancelReason("");
  };
  const needsReason = pendingAction?.kind === "cancel_deletion" || pendingAction?.kind === "cancel_restore";
  const submitting = requestExport.isPending || requestDeletion.isPending || requestRestore.isPending;

  return <>
    <PageHeading title="Data lifecycle" description="Controlled tenant exports, retained deletion, and validated restoration." actions={<div className="flex gap-2">{canCreateExports && <Button variant="outline" onClick={() => setRequestKind("export")}><DatabaseBackup className="h-4 w-4" />Request export</Button>}{canWriteOperations && <Button onClick={() => setRequestKind("deletion")}><Plus className="h-4 w-4" />Lifecycle request</Button>}</div>} />
    <Tabs defaultValue={canReadExports ? "exports" : "deletions"}>
      <TabsList>{canReadExports && <TabsTrigger value="exports">Exports</TabsTrigger>}{canReadOperations && <TabsTrigger value="deletions">Deletion</TabsTrigger>}{canReadOperations && <TabsTrigger value="restores">Restore</TabsTrigger>}</TabsList>
      {canReadExports && <TabsContent value="exports"><ListToolbar search={search} onSearch={value => { setSearch(value); exportPage.reset(); }} placeholder="Search company or export ID" status={exportStatus} onStatus={value => { setExportStatus(value); exportPage.reset(); }} statuses={["pending", "processing", "completed", "failed", "expired", "canceled"]} /><ResourceTable rows={exportRows} columns={exportColumns} rowKey={row => row.publicId} loading={exportsQuery.isLoading} canNext={Boolean(exportsQuery.data?.nextCursor)} canPrevious={exportPage.canPrevious} onNext={() => exportsQuery.data?.nextCursor && exportPage.next(exportsQuery.data.nextCursor)} onPrevious={exportPage.previous} /></TabsContent>}
      {canReadOperations && <TabsContent value="deletions"><ListToolbar search={search} onSearch={value => { setSearch(value); deletionPage.reset(); }} placeholder="Search company, request, or reason" status={deletionStatus} onStatus={value => { setDeletionStatus(value); deletionPage.reset(); }} statuses={["requested", "exported", "legal_hold", "approved", "purging", "completed", "canceled"]} /><ResourceTable rows={deletionRows} columns={deletionColumns} rowKey={row => row.publicId} loading={deletionsQuery.isLoading} canNext={Boolean(deletionsQuery.data?.nextCursor)} canPrevious={deletionPage.canPrevious} onNext={() => deletionsQuery.data?.nextCursor && deletionPage.next(deletionsQuery.data.nextCursor)} onPrevious={deletionPage.previous} /></TabsContent>}
      {canReadOperations && <TabsContent value="restores"><div className="mb-3 flex justify-end"><Button onClick={() => setRequestKind("restore")}><Plus className="h-4 w-4" />Request restore</Button></div><ListToolbar search={search} onSearch={value => { setSearch(value); restorePage.reset(); }} placeholder="Search company or restore ID" status={restoreStatus} onStatus={value => { setRestoreStatus(value); restorePage.reset(); }} statuses={["pending", "validating", "ready", "restoring", "completed", "failed", "rolled_back", "canceled"]} /><ResourceTable rows={restoreRows} columns={restoreColumns} rowKey={row => row.publicId} loading={restoresQuery.isLoading} canNext={Boolean(restoresQuery.data?.nextCursor)} canPrevious={restorePage.canPrevious} onNext={() => restoresQuery.data?.nextCursor && restorePage.next(restoresQuery.data.nextCursor)} onPrevious={restorePage.previous} /></TabsContent>}
    </Tabs>

    <Dialog open={requestKind !== null} onOpenChange={open => !open && closeRequest()}><DialogContent><DialogHeader><DialogTitle className="capitalize">Request {requestKind}</DialogTitle><DialogDescription>MFA, explicit permission, version checks, idempotency, and audit logging apply.</DialogDescription></DialogHeader><div className="grid gap-3"><div className="grid gap-1.5"><Label>Company</Label><Select value={companyPublicId} onValueChange={setCompanyPublicId}><SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger><SelectContent>{companies.data?.items.filter(company => requestKind !== "restore" || company.status === "suspended").map(company => <SelectItem key={company.publicId} value={company.publicId}>{company.name} ({company.status})</SelectItem>)}</SelectContent></Select></div>{requestKind === "export" && <><div className="grid gap-1.5"><Label>Export type</Label><Select value={exportType} onValueChange={value => setExportType(value as typeof exportType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tenant_full_backup">Full tenant backup</SelectItem><SelectItem value="tenant_operational_report">Operational report</SelectItem></SelectContent></Select></div><div className="grid gap-1.5"><Label htmlFor="export-expiry">Expires in days</Label><Input id="export-expiry" type="number" min={1} max={90} value={expiresInDays} onChange={event => setExpiresInDays(event.target.value)} /></div></>}{requestKind === "deletion" && <><div className="grid gap-1.5"><Label htmlFor="deletion-retention">Retention days</Label><Input id="deletion-retention" type="number" min={30} max={365} value={retentionDays} onChange={event => setRetentionDays(event.target.value)} /></div><div className="grid gap-1.5"><Label htmlFor="deletion-reason">Reason</Label><Textarea id="deletion-reason" value={reason} onChange={event => setReason(event.target.value)} /></div></>}{requestKind === "restore" && <><div className="grid gap-1.5"><Label htmlFor="restore-source">Clean backup file public ID</Label><Input id="restore-source" value={sourceFilePublicId} onChange={event => setSourceFilePublicId(event.target.value.toUpperCase())} /></div><div className="grid gap-1.5"><Label htmlFor="restore-checkpoint">Pre-restore export public ID</Label><Input id="restore-checkpoint" value={checkpointPublicId} onChange={event => setCheckpointPublicId(event.target.value.toUpperCase())} /></div><div className="grid gap-1.5"><Label htmlFor="restore-reason">Reason</Label><Textarea id="restore-reason" value={reason} onChange={event => setReason(event.target.value)} /></div></>}</div><DialogFooter><Button variant="outline" onClick={closeRequest}>Cancel</Button><Button disabled={!selectedCompany || submitting || ((requestKind === "deletion" || requestKind === "restore") && reason.trim().length < 10) || (requestKind === "restore" && (!sourceFilePublicId || !checkpointPublicId))} onClick={() => { if (!selectedCompany) return; if (requestKind === "export") requestExport.mutate({ companyPublicId, exportType, expiresInDays: Number(expiresInDays), idempotencyKey }); if (requestKind === "deletion") requestDeletion.mutate({ companyPublicId, reason, retentionDays: Number(retentionDays), expectedCompanyVersion: selectedCompany.version, idempotencyKey }); if (requestKind === "restore") requestRestore.mutate({ companyPublicId, sourceFilePublicId, preRestoreExportPublicId: checkpointPublicId, reason, expectedCompanyVersion: selectedCompany.version, idempotencyKey }); }}>Submit request</Button></DialogFooter></DialogContent></Dialog>

    <AlertDialog open={pendingAction !== null} onOpenChange={open => { if (!open) { setPendingAction(null); setCancelReason(""); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{pendingAction?.kind.replaceAll("_", " ")}</AlertDialogTitle><AlertDialogDescription>This operation affects {pendingAction?.companyName}, requires MFA, and is permanently audited.</AlertDialogDescription></AlertDialogHeader>{needsReason && <div className="grid gap-1.5"><Label htmlFor="cancel-reason">Reason</Label><Textarea id="cancel-reason" value={cancelReason} onChange={event => setCancelReason(event.target.value)} /></div>}<AlertDialogFooter><AlertDialogCancel>Back</AlertDialogCancel><AlertDialogAction disabled={Boolean(needsReason && cancelReason.trim().length < 10)} onClick={confirmAction}>Confirm</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
