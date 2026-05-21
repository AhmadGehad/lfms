import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { ClipboardList, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300",
  update: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  delete: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300",
  restore: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
  import: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300",
  login: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300",
};

export default function AuditLog() {
  const { t } = useTranslation();
  const { data: entries, isLoading } = trpc.audit.list.useQuery();
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");

  const filtered = useMemo(() => {
    const lc = search.toLowerCase().trim();
    return (entries ?? []).filter((e: any) => {
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (entityFilter !== "all" && e.entityType !== entityFilter) return false;
      if (lc && !`${e.entityId} ${e.notes ?? ""} ${e.action} ${e.entityType}`.toLowerCase().includes(lc)) return false;
      return true;
    });
  }, [entries, search, actionFilter, entityFilter]);

  const actions = useMemo(
    () => Array.from(new Set((entries ?? []).map((e: any) => e.action))).filter(Boolean) as string[],
    [entries]
  );
  const entityTypes = useMemo(
    () => Array.from(new Set((entries ?? []).map((e: any) => e.entityType))).filter(Boolean) as string[],
    [entries]
  );

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          Audit Log
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Full history of all actions across the system • {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by entity, action, notes…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actions.map((a) => (
              <SelectItem key={a} value={a} className="capitalize">{a.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Entity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {entityTypes.map((e) => (
              <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>
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
                  <TableHead>{t("audit.timestamp")}</TableHead>
                  <TableHead>{t("audit.action")}</TableHead>
                  <TableHead>Entity Type</TableHead>
                  <TableHead>{t("audit.entityId")}</TableHead>
                  <TableHead>{t("audit.user")}</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      {(entries ?? []).length === 0 ? "No audit entries yet." : "No entries match your filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(e.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs capitalize ${ACTION_COLORS[e.action] ?? "bg-gray-100 text-gray-800 border-gray-200"}`}>
                          {e.action?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">{e.entityType}</TableCell>
                      <TableCell className="font-mono text-xs">{e.entityId}</TableCell>
                      <TableCell className="text-muted-foreground">{e.userId ?? "System"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                        {e.notes ?? (e.newValues ? JSON.stringify(e.newValues).slice(0, 60) : "—")}
                      </TableCell>
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
