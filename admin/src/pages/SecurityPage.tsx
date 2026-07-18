import { useDeferredValue, useState } from "react";
import { ListToolbar } from "@admin/components/ListToolbar";
import { PageHeading } from "@admin/components/PageHeading";
import { ResourceTable, type ResourceColumn } from "@admin/components/ResourceTable";
import { StatusBadge } from "@admin/components/StatusBadge";
import { useCursorPage } from "@admin/hooks/useCursorPage";
import { formatDate } from "@admin/lib/format";
import { platformTrpc } from "@admin/lib/trpc";

type Severity = "info" | "warning" | "high" | "critical";

export function SecurityPage() {
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("all");
  const page = useCursorPage();
  const events = platformTrpc.security.list.useQuery({
    cursor: page.cursor,
    limit: 25,
    search: useDeferredValue(search) || undefined,
    severity: severity === "all" ? undefined : severity as Severity,
    sortDirection: "desc",
  });
  const rows = events.data?.items ?? [];
  type Row = (typeof rows)[number];
  const columns: ResourceColumn<Row>[] = [
    { key: "time", label: "Time", render: row => <span className="whitespace-nowrap text-xs">{formatDate(row.createdAt)}</span> },
    { key: "event", label: "Event", render: row => <div><p className="font-medium">{row.eventType.replaceAll(".", " ")}</p><p className="text-xs text-muted-foreground">{row.actorName || row.actorEmail || row.actorType.replaceAll("_", " ")}</p></div> },
    { key: "company", label: "Company", render: row => <div><p>{row.companyName || "Platform"}</p>{row.companyPublicId && <p className="font-mono text-[10px] text-muted-foreground">{row.companyPublicId}</p>}</div> },
    { key: "severity", label: "Severity", render: row => <StatusBadge value={row.severity} /> },
    { key: "outcome", label: "Outcome", render: row => <StatusBadge value={row.outcome} /> },
    { key: "ip", label: "IP address", render: row => <span className="font-mono text-xs">{row.ipAddress || "-"}</span> },
    { key: "request", label: "Request ID", render: row => <span className="font-mono text-[10px] text-muted-foreground">{row.requestId || "-"}</span> },
  ];

  return <>
    <PageHeading title="Security events" description="Authentication, access denials, suspicious activity, and incident correlation." />
    <ListToolbar search={search} onSearch={value => { setSearch(value); page.reset(); }} placeholder="Search event, actor, company, or request" status={severity} onStatus={value => { setSeverity(value); page.reset(); }} statuses={["info", "warning", "high", "critical"]} />
    <ResourceTable rows={rows} columns={columns} rowKey={row => row.publicId} loading={events.isLoading} canNext={Boolean(events.data?.nextCursor)} canPrevious={page.canPrevious} onNext={() => events.data?.nextCursor && page.next(events.data.nextCursor)} onPrevious={page.previous} />
  </>;
}
