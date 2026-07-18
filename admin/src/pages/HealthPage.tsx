import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { PageHeading } from "@admin/components/PageHeading";
import { StatusBadge } from "@admin/components/StatusBadge";
import { formatDate } from "@admin/lib/format";
import { platformTrpc } from "@admin/lib/trpc";

export function HealthPage() {
  const health = platformTrpc.health.summary.useQuery(undefined, { refetchInterval: 30_000 });
  const data = health.data;
  return <>
    <PageHeading title="System health" description="Readiness of critical dependencies and asynchronous processing." actions={<Button variant="outline" onClick={() => health.refetch()} disabled={health.isFetching}><RefreshCw className={`h-4 w-4 ${health.isFetching ? "animate-spin" : ""}`} />Refresh</Button>} />
    {health.isError ? (
      <section className="border border-danger/30 bg-danger-soft p-4 text-sm text-danger-soft-foreground" role="alert">
        <p className="font-medium">System health could not be loaded.</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => health.refetch()} disabled={health.isFetching}>
          <RefreshCw className={`h-4 w-4 ${health.isFetching ? "animate-spin" : ""}`} />Try again
        </Button>
      </section>
    ) : <>
    <div className="mb-4 flex items-center justify-between border border-border bg-card p-4 shadow-sm"><div><p className="text-xs text-muted-foreground">Overall readiness</p><div className="mt-1 flex items-center gap-2"><span className="text-xl font-semibold capitalize">{data?.status || "Checking"}</span>{data && <StatusBadge value={data.status} />}</div></div><div className="text-right"><p className="text-xs text-muted-foreground">Process uptime</p><p className="mt-1 font-medium tabular-nums">{data ? `${Math.floor(data.uptimeSeconds / 60)} min` : "—"}</p></div></div>
    <section className="border border-border bg-card shadow-sm" aria-label="Dependency checks"><div className="grid grid-cols-[minmax(0,1fr)_120px_100px] border-b border-border bg-muted/50 px-4 py-2 text-[11px] font-semibold uppercase"><span>Dependency</span><span>Status</span><span className="text-right">Latency</span></div>{Object.entries(data?.checks ?? {}).map(([name, check]) => <div key={name} className="grid grid-cols-[minmax(0,1fr)_120px_100px] items-center border-b border-border px-4 py-3 last:border-b-0"><div><p className="text-sm font-medium capitalize">{name.replaceAll("_", " ")}</p>{check.message && <p className="mt-0.5 text-xs text-muted-foreground">{check.message}</p>}</div><StatusBadge value={check.status} /><span className="text-right text-xs tabular-nums">{check.latencyMs} ms</span></div>)}{!data && <div className="p-8 text-center text-sm text-muted-foreground">Checking dependencies…</div>}</section>
    <p className="mt-3 text-right text-xs text-muted-foreground">Last checked {formatDate(data?.checkedAt)}</p>
    </>}
  </>;
}
