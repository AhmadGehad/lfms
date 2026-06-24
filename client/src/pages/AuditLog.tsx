import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { usePermissions } from "@/hooks/usePermissions";
import { ClipboardList, Search, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
  const { role } = usePermissions();
  const canRevert = role === "admin" || role === "owner";
  const { data: entries, isLoading } = trpc.audit.list.useQuery();
  const utils = trpc.useUtils();
  const revert = trpc.audit.revert.useMutation({
    onSuccess: () => {
      toast.success(t("audit.reverted"));
      // Refresh the log and every data view the revert may have touched.
      utils.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
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
          {t("audit.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("audit.subtitle")} • {t("audit.entriesCount", { count: filtered.length })}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("audit.searchPlaceholder")}
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("audit.action")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("audit.allActions")}</SelectItem>
            {actions.map((a) => (
              <SelectItem key={a} value={a} className="capitalize">{a.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("audit.entity")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("audit.allEntities")}</SelectItem>
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
                  <TableHead>{t("audit.entityType")}</TableHead>
                  <TableHead>{t("audit.entityId")}</TableHead>
                  <TableHead>{t("audit.user")}</TableHead>
                  <TableHead>{t("audit.changes") ?? "Changes"}</TableHead>
                  <TableHead>{t("audit.ipAddress") ?? "IP"}</TableHead>
                  {canRevert && <TableHead className="text-right">{t("audit.revertColumn")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={canRevert ? 8 : 7} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canRevert ? 8 : 7} className="text-center py-12 text-muted-foreground">
                      {(entries ?? []).length === 0 ? t("audit.noEntries") : t("audit.noMatch")}
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
                      <TableCell className="text-muted-foreground text-xs max-w-sm">
                        {e.oldValues || e.newValues ? (
                          <span className="font-mono">
                            {e.oldValues && (
                              <span className="text-red-600 line-through me-1">{JSON.stringify(e.oldValues).slice(0, 50)}</span>
                            )}
                            {e.newValues && (
                              <span className="text-green-700">{JSON.stringify(e.newValues).slice(0, 50)}</span>
                            )}
                          </span>
                        ) : (e.notes ?? "—")}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{e.ipAddress ?? "—"}</TableCell>
                      {canRevert && (
                        <TableCell className="text-right">
                          {e.revertedAt ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">{t("audit.revertedBadge")}</Badge>
                          ) : e.revertable ? (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
                                  <Undo2 className="h-3.5 w-3.5" />{t("audit.revertColumn")}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t("audit.revertConfirmTitle")}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t("audit.revertConfirmBody", { action: e.action?.replace(/_/g, " "), entity: e.entityType, id: e.entityId })}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => revert.mutate({ auditId: e.id })}>
                                    {t("audit.revertColumn")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
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
