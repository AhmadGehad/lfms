import { useMemo, useState } from "react";
import { CircleDollarSign, Plus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrency } from "@/hooks/useCurrency";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

const today = () => new Date().toISOString().slice(0, 10);
const previousMonth = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
};

export function OwnerCapitalDialog({ owner, open, onOpenChange }: { owner: { id: number; name: string } | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { fmt } = useCurrency();
  const perms = usePermissions();
  const canManage = perms.can("capital", "create");
  const canFinalize = perms.can("capital", "update");
  const utils = trpc.useUtils();
  const summary = trpc.capital.getSummary.useQuery({ ownerId: owner?.id }, { enabled: open && !!owner && perms.can("capital", "view") });
  const [mode, setMode] = useState<"investor" | "direct" | "proRata" | "allocation" | "adjustment" | null>(null);
  const [adjustmentAllocationId, setAdjustmentAllocationId] = useState<number | null>(null);
  const [form, setForm] = useState(() => ({ name: "", investorId: "", amount: "", effectiveDate: today(), periodStart: previousMonth().start, periodEnd: previousMonth().end, notes: "" }));
  const data = summary.data?.owners?.[0];
  const refresh = () => { utils.capital.getSummary.invalidate(); setMode(null); };
  const fail = (e: { message: string }) => toast.error(e.message);
  const addInvestor = trpc.capital.createInvestor.useMutation({ onSuccess: () => { toast.success("Investor added"); refresh(); }, onError: fail });
  const direct = trpc.capital.addDirectContribution.useMutation({ onSuccess: () => { toast.success("Contribution recorded"); refresh(); }, onError: fail });
  const proRata = trpc.capital.addProRataFunding.useMutation({ onSuccess: () => { toast.success("Pro-rata funding recorded"); refresh(); }, onError: fail });
  const preview = trpc.capital.previewMonthlyAllocation.useQuery({ ownerId: owner?.id ?? 0, periodStart: form.periodStart, periodEnd: form.periodEnd }, { enabled: mode === "allocation" && !!owner });
  const finalize = trpc.capital.finalizeMonthlyAllocation.useMutation({ onSuccess: () => { toast.success("Monthly P&L finalized"); refresh(); }, onError: fail });
  const adjustment = trpc.capital.postProfitAdjustment.useMutation({ onSuccess: () => { toast.success("P&L adjustment posted"); refresh(); setAdjustmentAllocationId(null); }, onError: fail });
  const history = useMemo(() => (data?.contributions ?? []).slice().sort((a: any, b: any) => String(b.effectiveDate).localeCompare(String(a.effectiveDate))), [data]);
  const submit = () => {
    if (!owner) return;
    if (mode === "investor") addInvestor.mutate({ ownerId: owner.id, name: form.name.trim(), notes: form.notes || undefined });
    if (mode === "direct") direct.mutate({ ownerId: owner.id, investorId: Number(form.investorId), amount: Number(form.amount), effectiveDate: form.effectiveDate, notes: form.notes || undefined });
    if (mode === "proRata") proRata.mutate({ ownerId: owner.id, amount: Number(form.amount), effectiveDate: form.effectiveDate, notes: form.notes || undefined });
    if (mode === "allocation") finalize.mutate({ ownerId: owner.id, periodStart: form.periodStart, periodEnd: form.periodEnd, notes: form.notes || undefined });
    if (mode === "adjustment" && adjustmentAllocationId) adjustment.mutate({ allocationId: adjustmentAllocationId, amount: Number(form.amount), effectiveDate: form.effectiveDate, notes: form.notes || undefined });
  };
  const pending = addInvestor.isPending || direct.isPending || proRata.isPending || finalize.isPending || adjustment.isPending;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-primary" /> Capital & partners — {owner?.name}</DialogTitle>
        <DialogDescription>Capital is a permanent ledger. Ownership follows each investor’s contributed capital; finalized P&L is frozen.</DialogDescription>
      </DialogHeader>
      {!data ? <div className="py-10 text-center text-sm text-muted-foreground">{summary.isLoading ? "Loading capital…" : "No capital data yet."}</div> : <>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Contributed capital</p><p className="mt-1 text-lg font-semibold">{fmt(data.investors.reduce((n: number, i: any) => n + Number(i.contributedCapital), 0))}</p></div>
          <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Current equity</p><p className="mt-1 text-lg font-semibold">{fmt(data.investors.reduce((n: number, i: any) => n + Number(i.currentEquity), 0))}</p></div>
          <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Partners</p><p className="mt-1 text-lg font-semibold">{data.investors.length}</p></div>
        </div>
        {canManage && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setMode("investor")}><UsersRound className="mr-1.5 h-4 w-4" />Add investor</Button>
          <Button size="sm" variant="outline" disabled={!data.investors.length} onClick={() => setMode("direct")}><Plus className="mr-1.5 h-4 w-4" />Direct contribution</Button>
          <Button size="sm" disabled={!data.investors.some((i: any) => i.contributedCapital > 0)} onClick={() => setMode("proRata")}>Fund all by share</Button>
          {canFinalize && <Button size="sm" variant="outline" disabled={!data.investors.some((i: any) => i.contributedCapital > 0)} onClick={() => setMode("allocation")}>Review monthly P&L</Button>}
        </div>}
        <Tabs defaultValue="partners">
          <TabsList><TabsTrigger value="partners">Partners</TabsTrigger><TabsTrigger value="history">Funding history</TabsTrigger><TabsTrigger value="allocations">P&L allocations</TabsTrigger></TabsList>
          <TabsContent value="partners"><Table><TableHeader><TableRow><TableHead>Investor</TableHead><TableHead className="text-right">Invested</TableHead><TableHead className="text-right">Additional funding</TableHead><TableHead className="text-right">Ownership</TableHead><TableHead className="text-right">Current equity</TableHead></TableRow></TableHeader><TableBody>{data.investors.map((i: any) => <TableRow key={i.id}><TableCell className="font-medium">{i.name}</TableCell><TableCell className="text-right">{fmt(i.contributedCapital)}</TableCell><TableCell className="text-right">{fmt(i.additionalFunding)}</TableCell><TableCell className="text-right">{Number(i.ownershipPct).toFixed(2)}%</TableCell><TableCell className="text-right font-medium">{fmt(i.currentEquity)}</TableCell></TableRow>)}</TableBody></Table></TabsContent>
          <TabsContent value="history"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Investor</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{history.length ? history.map((row: any) => <TableRow key={row.id}><TableCell>{String(row.effectiveDate).slice(0, 10)}</TableCell><TableCell className="capitalize">{String(row.kind).replace("_", " ")}</TableCell><TableCell>{data.investors.find((i: any) => i.id === row.investorId)?.name ?? "—"}</TableCell><TableCell className="max-w-44 truncate">{row.notes ?? "—"}</TableCell><TableCell className="text-right">{fmt(row.amount)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No funding recorded.</TableCell></TableRow>}</TableBody></Table></TabsContent>
          <TabsContent value="allocations"><Table><TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead className="text-right">P&L allocated</TableHead></TableRow></TableHeader><TableBody>{data.allocations.length ? data.allocations.slice().reverse().flatMap((a: any) => [<TableRow key={a.id}><TableCell>{String(a.periodStart).slice(0, 10)} – {String(a.periodEnd).slice(0, 10)}</TableCell><TableCell className="capitalize">{a.status}</TableCell><TableCell className="text-right font-medium">{fmt(a.amount)} {canFinalize && a.kind === "monthly" && <Button size="sm" variant="ghost" className="ml-2 h-7 px-2 text-xs" onClick={() => { setAdjustmentAllocationId(a.id); setMode("adjustment"); }}>Adjust</Button>}</TableCell></TableRow>, ...(a.lines ?? []).map((line: any) => <TableRow key={`${a.id}-${line.investorId}`} className="bg-muted/20 text-sm"><TableCell className="pl-8" colSpan={2}>{data.investors.find((i: any) => i.id === line.investorId)?.name ?? "Investor"} · {Number(line.ownershipPct).toFixed(2)}%</TableCell><TableCell className="text-right">{fmt(line.amount)}</TableCell></TableRow>)]) : <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">No finalized allocations.</TableCell></TableRow>}</TableBody></Table></TabsContent>
        </Tabs>
      </>}
      {mode && <div className="rounded-lg border bg-muted/30 p-4"><div className="mb-3 flex items-center justify-between"><p className="font-medium">{mode === "investor" ? "Add investor" : mode === "direct" ? "Record direct contribution" : mode === "proRata" ? "Fund all investors by share" : mode === "adjustment" ? "Post P&L adjustment" : "Review and finalize monthly P&L"}</p><Button variant="ghost" size="sm" onClick={() => setMode(null)}>Cancel</Button></div>{mode === "allocation" ? <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><div><Label>Period start</Label><Input type="date" value={form.periodStart} onChange={e => setForm({ ...form, periodStart: e.target.value })} /></div><div><Label>Period end</Label><Input type="date" value={form.periodEnd} onChange={e => setForm({ ...form, periodEnd: e.target.value })} /></div></div>{preview.data && <div className="rounded border bg-background p-3 text-sm"><div className="flex justify-between"><span>Operating P&L (including shared overhead)</span><strong>{fmt(preview.data.operatingProfit)}</strong></div><p className="mt-1 text-xs text-muted-foreground">Shared overhead: {fmt(preview.data.sharedOverhead)} · owner head-days: {preview.data.headDays.owner}/{preview.data.headDays.total}</p>{preview.data.lines.map((line: any) => <div key={line.investorId} className="mt-2 flex justify-between border-t pt-2"><span>{line.investorName} · {Number(line.ownershipPct).toFixed(2)}%</span><span>{fmt(line.amount)}</span></div>)}</div>}<div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div><DialogFooter><Button onClick={submit} disabled={pending || preview.isLoading || !preview.data}>Finalize month</Button></DialogFooter></div> : <div className="grid gap-3 sm:grid-cols-2">{mode === "investor" ? <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div> : <><div><Label>{mode === "adjustment" ? "Adjustment amount (+/-)" : "Amount"}</Label><Input type="number" min={mode === "adjustment" ? undefined : "0.01"} step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div><div><Label>Effective date</Label><Input type="date" value={form.effectiveDate} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} /></div>{mode === "direct" && <div><Label>Investor</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.investorId} onChange={e => setForm({ ...form, investorId: e.target.value })}><option value="">Select investor</option>{data?.investors.map((i: any) => <option value={i.id} key={i.id}>{i.name}</option>)}</select></div>}</>}<div className="sm:col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div><DialogFooter className="sm:col-span-2"><Button onClick={submit} disabled={pending || (mode === "investor" ? !form.name.trim() : !form.amount || !form.effectiveDate || (mode === "direct" && !form.investorId))}>{mode === "proRata" ? "Split by current share" : mode === "adjustment" ? "Post adjustment" : "Save"}</Button></DialogFooter></div>}</div>}
    </DialogContent>
  </Dialog>;
}
