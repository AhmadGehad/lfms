import { useDeferredValue, useState } from "react";
import { ListToolbar } from "@admin/components/ListToolbar";
import { PageHeading } from "@admin/components/PageHeading";
import { ResourceTable, type ResourceColumn } from "@admin/components/ResourceTable";
import { StatusBadge } from "@admin/components/StatusBadge";
import { useCursorPage } from "@admin/hooks/useCursorPage";
import { formatDate } from "@admin/lib/format";
import { platformTrpc } from "@admin/lib/trpc";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";

export function AuditPage() {
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("all");
  const page = useCursorPage();
  const query = platformTrpc.audit.list.useQuery({ cursor: page.cursor, limit: 25, search: useDeferredValue(search) || undefined, outcome: outcome === "all" ? undefined : outcome as "success", sortDirection: "desc" });
  const exportCsv = platformTrpc.audit.exportCsv.useMutation({
    onSuccess: result => {
      const url = URL.createObjectURL(new Blob([result.content], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${result.rowCount.toLocaleString()} audit rows exported${result.truncated ? " (limit reached)" : ""}`);
    },
    onError: error => toast.error(error.message),
  });
  const rows = query.data?.items ?? [];
  type Row = (typeof rows)[number];
  const columns: ResourceColumn<Row>[] = [
    { key: "time", label: "Time", render: row => <span className="whitespace-nowrap text-xs">{formatDate(row.createdAt)}</span> },
    { key: "actor", label: "Actor", render: row => <div><p>{row.actorName || row.actorType || "System"}</p><p className="text-xs text-muted-foreground capitalize">{row.actorType?.replaceAll("_", " ") || "legacy"}</p></div> },
    { key: "company", label: "Company", render: row => row.companyName || <span className="text-muted-foreground">Platform</span> },
    { key: "action", label: "Action", render: row => <div><p className="font-medium">{row.action}</p><p className="text-xs text-muted-foreground">{row.entityType}{row.entityId ? ` · ${row.entityId}` : ""}</p></div> },
    { key: "outcome", label: "Outcome", render: row => <StatusBadge value={row.outcome} /> },
    { key: "ip", label: "IP address", render: row => <span className="font-mono text-xs">{row.ipAddress || "—"}</span> },
    { key: "request", label: "Request ID", render: row => <span className="block max-w-36 truncate font-mono text-[10px] text-muted-foreground" title={row.requestId || undefined}>{row.requestId || "—"}</span> },
  ];
  return <>
    <PageHeading title="Audit & security" description="Append-only sensitive action trail with request and tenant correlation." actions={<Button variant="outline" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate({ search: search.trim() || undefined, outcome: outcome === "all" ? undefined : outcome as "success" })}><Download className="h-4 w-4" />Export CSV</Button>} />
    <ListToolbar search={search} onSearch={value => { setSearch(value); page.reset(); }} placeholder="Search action, entity, request, or company" status={outcome} onStatus={value => { setOutcome(value); page.reset(); }} statuses={["success", "denied", "error"]} />
    <ResourceTable rows={rows} columns={columns} rowKey={row => row.publicId || `${row.requestId}-${String(row.createdAt)}`} loading={query.isLoading} canNext={Boolean(query.data?.nextCursor)} canPrevious={page.canPrevious} onNext={() => query.data?.nextCursor && page.next(query.data.nextCursor)} onPrevious={page.previous} />
  </>;
}
