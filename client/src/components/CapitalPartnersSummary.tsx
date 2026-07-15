import { useState } from "react";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrency } from "@/hooks/useCurrency";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";
import { OwnerCapitalDialog } from "./OwnerCapitalDialog";

/** Compact farm-wide dashboard view; the full immutable ledger opens on demand. */
export function CapitalPartnersSummary({ ownerId }: { ownerId?: number }) {
  const { fmt } = useCurrency();
  const perms = usePermissions();
  const [openOwner, setOpenOwner] = useState<any>(null);
  const summary = trpc.capital.getSummary.useQuery({ ownerId }, { enabled: perms.can("capital", "view") });
  if (!perms.can("capital", "view")) return null;
  const data = summary.data;
  const partners = data?.owners.flatMap((owner: any) => owner.investors.map((investor: any) => ({ ...investor, owner }))) ?? [];
  return <><Card className="border-primary/20"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-base">Capital & partners</CardTitle><Landmark className="h-5 w-5 text-primary" /></CardHeader><CardContent>{summary.isLoading ? <div className="h-20 animate-pulse rounded bg-muted" /> : <><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Contributed capital</p><p className="text-xl font-semibold">{fmt(data?.contributedCapital)}</p></div><div><p className="text-xs text-muted-foreground">Current equity</p><p className="text-xl font-semibold">{fmt(data?.currentEquity)}</p></div><div><p className="text-xs text-muted-foreground">Latest P&L allocation</p><p className="text-sm font-medium">{data?.latestAllocation ? `${String(data.latestAllocation.periodStart).slice(0, 7)} · ${fmt(data.latestAllocation.amount)}` : "Not finalized"}</p></div></div><div className="mt-4 divide-y rounded-md border">{partners.length ? partners.slice(0, 5).map((partner: any) => <button key={`${partner.owner.id}-${partner.id}`} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/50" onClick={() => setOpenOwner(partner.owner)}><span><span className="font-medium">{partner.name}</span>{!ownerId && <span className="ml-2 text-xs text-muted-foreground">{partner.owner.name}</span>}</span><span className="text-sm">{fmt(partner.contributedCapital)} · {Number(partner.ownershipPct).toFixed(1)}%</span></button>) : <p className="px-3 py-5 text-sm text-muted-foreground">No investor capital recorded.</p>}</div>{(data?.owners.length ?? 0) > 1 && <div className="mt-3 flex justify-end"><Button size="sm" variant="outline" onClick={() => setOpenOwner(data!.owners[0])}>View contribution history</Button></div>}</>}</CardContent></Card><OwnerCapitalDialog owner={openOwner} open={openOwner !== null} onOpenChange={value => !value && setOpenOwner(null)} /></>;
}
