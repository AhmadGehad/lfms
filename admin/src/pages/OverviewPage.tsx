import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Activity, Building2, HeartPulse, ShieldAlert, Users, Warehouse } from "lucide-react";
import { MetricCard } from "@admin/components/MetricCard";
import { PageHeading } from "@admin/components/PageHeading";
import { StatusBadge } from "@admin/components/StatusBadge";
import { formatDate, formatNumber } from "@admin/lib/format";
import { platformTrpc } from "@admin/lib/trpc";

export function OverviewPage() {
  const summary = platformTrpc.dashboard.summary.useQuery();
  const data = summary.data;
  const total = data?.companies.total ?? 0;
  const activePercent = total ? Math.round(((data?.companies.active ?? 0) / total) * 100) : 0;

  return (
    <>
      <PageHeading title="Platform dashboard" description="Tenant activity, risk signals, and service status across LFMS." />
      {(data?.security.high ?? 0) > 0 && (
        <Alert variant="destructive" className="mb-4 rounded-none">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Security review required</AlertTitle>
          <AlertDescription>{data!.security.high} high-severity events were recorded in the last 24 hours.</AlertDescription>
        </Alert>
      )}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Platform metrics">
        <MetricCard label="Companies" value={summary.isLoading ? "…" : formatNumber(total)} detail={`${data?.companies.active ?? 0} active · ${data?.companies.suspended ?? 0} suspended`} icon={Building2} />
        <MetricCard label="Farms" value={summary.isLoading ? "…" : formatNumber(data?.farms)} detail="Across all active and suspended tenants" icon={Warehouse} />
        <MetricCard label="Active users" value={summary.isLoading ? "…" : formatNumber(data?.memberships)} detail="Company memberships with active access" icon={Users} />
        <MetricCard label="Failed jobs" value={summary.isLoading ? "…" : formatNumber(data?.jobs.failed)} detail={`${data?.jobs.pending ?? 0} queued · ${data?.jobs.processing ?? 0} processing`} icon={Activity} tone={(data?.jobs.failed ?? 0) > 0 ? "danger" : "default"} />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Tenant availability</h2><p className="text-xs text-muted-foreground">Current company lifecycle distribution</p></div><StatusBadge value={activePercent >= 95 ? "healthy" : "warning"} /></div>
          <div className="flex items-end justify-between"><span className="text-2xl font-semibold tabular-nums">{activePercent}%</span><span className="text-xs text-muted-foreground">active companies</span></div>
          <Progress value={activePercent} className="mt-2 h-2" />
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
            <div><p className="text-lg font-semibold tabular-nums">{data?.companies.active ?? 0}</p><p className="text-[11px] text-muted-foreground">Active</p></div>
            <div><p className="text-lg font-semibold tabular-nums">{data?.companies.suspended ?? 0}</p><p className="text-[11px] text-muted-foreground">Suspended</p></div>
            <div><p className="text-lg font-semibold tabular-nums">{Math.max(0, total - (data?.companies.active ?? 0) - (data?.companies.suspended ?? 0))}</p><p className="text-[11px] text-muted-foreground">Other</p></div>
          </div>
        </div>
        <div className="border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><HeartPulse className="h-4 w-4 text-primary" /><div><h2 className="text-sm font-semibold">Operational signals</h2><p className="text-xs text-muted-foreground">Latest control-plane telemetry</p></div></div>
          <dl className="divide-y divide-border text-sm">
            <div className="flex items-center justify-between py-3"><dt>Queued background jobs</dt><dd className="font-medium tabular-nums">{data?.jobs.pending ?? 0}</dd></div>
            <div className="flex items-center justify-between py-3"><dt>High security events (24h)</dt><dd className="font-medium tabular-nums">{data?.security.high ?? 0}</dd></div>
            <div className="flex items-center justify-between py-3"><dt>Denied security events (24h)</dt><dd className="font-medium tabular-nums">{data?.security.denied ?? 0}</dd></div>
            <div className="flex items-center justify-between py-3"><dt>Snapshot generated</dt><dd className="text-xs text-muted-foreground">{formatDate(data?.generatedAt)}</dd></div>
          </dl>
        </div>
      </section>
    </>
  );
}
