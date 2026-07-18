import { Progress } from "@/components/ui/progress";
import { useDeferredValue, useState } from "react";
import { ListToolbar } from "@admin/components/ListToolbar";
import { PageHeading } from "@admin/components/PageHeading";
import { ResourceTable, type ResourceColumn } from "@admin/components/ResourceTable";
import { useCursorPage } from "@admin/hooks/useCursorPage";
import { formatDate, formatNumber } from "@admin/lib/format";
import { platformTrpc } from "@admin/lib/trpc";

export function UsagePage() {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("all");
  const page = useCursorPage();
  const query = platformTrpc.usage.list.useQuery({ cursor: page.cursor, limit: 25, search: useDeferredValue(search) || undefined, periodType: period === "all" ? undefined : period as "monthly", sortDirection: "desc" });
  const rows = query.data?.items ?? [];
  type Row = (typeof rows)[number];
  const columns: ResourceColumn<Row>[] = [
    { key: "company", label: "Company", render: row => <div><p className="font-medium">{row.companyName}</p><p className="font-mono text-[10px] text-muted-foreground">{row.companyPublicId}</p></div> },
    { key: "metric", label: "Metric", render: row => <div><p>{row.featureName || row.metricCode}</p><p className="text-xs text-muted-foreground">{row.metricCode}</p></div> },
    { key: "period", label: "Period", render: row => <div><p className="capitalize">{row.periodType.replaceAll("_", " ")}</p><p className="text-[10px] text-muted-foreground">{formatDate(row.periodEnd)}</p></div> },
    { key: "used", label: "Used", className: "text-right", render: row => <span className="tabular-nums">{formatNumber(row.usedValue)}</span> },
    { key: "reserved", label: "Reserved", className: "text-right", render: row => <span className="tabular-nums text-muted-foreground">{formatNumber(row.reservedValue)}</span> },
    { key: "limit", label: "Limit", className: "text-right", render: row => <span className="tabular-nums">{row.limitValue === null ? "Unlimited" : formatNumber(row.limitValue)}</span> },
    { key: "utilization", label: "Utilization", className: "min-w-36", render: row => row.percentUsed === null ? <span className="text-xs text-muted-foreground">Not limited</span> : <div className="flex items-center gap-2"><Progress value={Math.min(row.percentUsed, 100)} className="h-1.5" /><span className="w-12 text-right text-xs tabular-nums">{row.percentUsed}%</span></div> },
  ];
  return <>
    <PageHeading title="Usage" description="Current consumption, reservations, and effective limits by tenant." />
    <ListToolbar search={search} onSearch={value => { setSearch(value); page.reset(); }} placeholder="Search company, feature, or metric" status={period} onStatus={value => { setPeriod(value); page.reset(); }} statuses={["lifetime", "daily", "monthly", "billing_period"]} />
    <ResourceTable rows={rows} columns={columns} rowKey={row => `${row.companyPublicId}-${row.metricCode}-${String(row.periodStart)}`} loading={query.isLoading} canNext={Boolean(query.data?.nextCursor)} canPrevious={page.canPrevious} onNext={() => query.data?.nextCursor && page.next(query.data.nextCursor)} onPrevious={page.previous} />
  </>;
}
