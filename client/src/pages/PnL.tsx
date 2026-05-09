import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Activity, Search } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function PnL() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filterSpecies, setFilterSpecies] = useState("all");

  const { data: animals } = trpc.animals.list.useQuery({
    speciesId: filterSpecies !== "all" ? Number(filterSpecies) : undefined,
  });
  const { data: species } = trpc.config.getSpecies.useQuery();

  const fmt = (v: number) =>
    new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(v);

  const filtered = (animals ?? []).filter((a: any) => {
    if (!search) return true;
    return a.animal.animalId?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          P&L per Animal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Lifetime profitability for each animal</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by animal ID..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterSpecies} onValueChange={setFilterSpecies}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Species" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Species</SelectItem>
            {(species ?? []).map((s: any) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Animal ID</TableHead>
                  <TableHead>Species</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Purchase Cost</TableHead>
                  <TableHead className="text-right">Feed Cost</TableHead>
                  <TableHead className="text-right">Other Costs</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Net P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No animals found.</TableCell>
                  </TableRow>
                ) : (
                  filtered.map((a: any) => (
                    <TableRow
                      key={a.animal.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setLocation(`/animals/${a.animal.id}`)}
                    >
                      <TableCell className="font-mono font-semibold text-primary">{a.animal.animalId}</TableCell>
                      <TableCell>{a.speciesName}</TableCell>
                      <TableCell>{a.categoryName}</TableCell>
                      <TableCell>
                        <Badge variant={a.animal.isActive ? "default" : "secondary"} className="text-xs">
                          {a.statusName}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {a.animal.purchaseCost ? fmt(parseFloat(String(a.animal.purchaseCost))) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell className="text-right text-green-600">—</TableCell>
                      <TableCell className="text-right font-semibold">—</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
