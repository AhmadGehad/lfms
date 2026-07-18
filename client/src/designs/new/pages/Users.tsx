import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { StatusBadge, type StatusTone } from "../components/StatusBadge";

const ASSIGNABLE_ROLES = ["viewer", "user", "staff", "supervisor", "admin"] as const;
const CONFIGURABLE_ROLES = ["supervisor", "staff", "user", "viewer"] as const;

function roleTone(role: string): StatusTone {
  if (role === "owner" || role === "admin") return "danger";
  if (role === "supervisor") return "warning";
  if (role === "staff") return "info";
  return "neutral";
}
function fmtDate(d: unknown) {
  if (!d) return "—";
  const x = new Date(d as string);
  return Number.isNaN(x.getTime()) ? "—" : x.toLocaleDateString();
}

/**
 * New Users + Permissions (F-USR2). Users table with inline role change, plus a
 * searchable permission matrix per configurable role with a changed-cell
 * indicator and optimistic-revision save. Owner is immutable. Same tRPC +
 * privileged gating as Old.
 */
export default function NewUsers() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const canEdit = perms.can("users", "update");
  const utils = trpc.useUtils();

  // ── Users ──
  const { data: users, isLoading } = trpc.userMgmt.listUsers.useQuery();
  const updateRole = trpc.userMgmt.updateUserRole.useMutation({
    onSuccess: () => { utils.userMgmt.listUsers.invalidate(); toast.success(t("users.roleUpdated", "Role updated")); },
    onError: e => toast.error(e.message),
  });

  const userRows = (users as any[]) ?? [];
  const userColumns: Column<any>[] = [
    { id: "name", header: t("users.name", "Name"), cell: u => <span className="font-medium">{u.name ?? "—"}</span>, sortValue: u => u.name, primary: true, mobileLabel: t("users.name", "Name") },
    { id: "email", header: t("users.email", "Email"), cell: u => u.email ?? "—", sortValue: u => u.email, mobileLabel: t("users.email", "Email") },
    {
      id: "role",
      header: t("users.role", "Role"),
      cell: u =>
        u.role === "owner" || !canEdit ? (
          <StatusBadge tone={roleTone(u.role)}>{u.role}</StatusBadge>
        ) : (
          <Select value={u.role} onValueChange={v => updateRole.mutate({ userId: u.id, role: v as any, expectedVersion: u.version })}>
            <SelectTrigger className="h-8 w-32" onClick={e => e.stopPropagation()}><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASSIGNABLE_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        ),
      mobileLabel: t("users.role", "Role"),
    },
    { id: "last", header: t("users.lastSignedIn", "Last seen"), cell: u => fmtDate(u.lastSignedIn), sortValue: u => u.lastSignedIn, hideable: true, mobileLabel: t("users.lastSignedIn", "Last seen") },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("nav.users", "Users & permissions")}
        subtitle={`${userRows.length} ${t("users.users", "users")}`}
      />

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-muted-foreground" />{t("users.title", "Users")}</h2>
        <DataTable data={userRows} columns={userColumns} rowKey={u => u.id} loading={isLoading} storageKey="users" />
      </section>

      {canEdit && <PermissionMatrix />}
    </div>
  );
}

function PermissionMatrix() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [role, setRole] = useState<(typeof CONFIGURABLE_ROLES)[number]>("staff");
  const [search, setSearch] = useState("");

  const catalog = trpc.permissions.catalog.useQuery();
  const matrix = trpc.permissions.roleMatrix.useQuery({ role });

  // Local editable copy keyed by `page:action`.
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [server, setServer] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const data = matrix.data as any;
    if (!data) return;
    const map: Record<string, boolean> = {};
    for (const p of data.matrix) for (const a of p.actions) map[`${p.page}:${a.action}`] = a.allowed;
    setLocal(map);
    setServer(map);
  }, [matrix.data]);

  const pages = (matrix.data as any)?.matrix ?? [];
  const actions: string[] = (catalog.data as any)?.actions ?? ["view", "create", "update", "delete", "report", "export", "import", "restore"];
  const dirty = useMemo(() => Object.keys(local).some(k => local[k] !== server[k]), [local, server]);

  const save = trpc.permissions.updateRoleMatrix.useMutation({
    onSuccess: () => { utils.permissions.roleMatrix.invalidate(); toast.success(t("users.permsSaved", "Permissions saved")); },
    onError: e => toast.error(e.message),
  });

  const onSave = () => {
    const entries = Object.entries(local).map(([k, allowed]) => {
      const [page, action] = k.split(":");
      return { page, action, allowed };
    });
    save.mutate({ role, expectedRevision: (matrix.data as any)?.revision ?? "", entries } as any);
  };

  const filteredPages = pages.filter((p: any) => !search || p.page.toLowerCase().includes(search.toLowerCase()));

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-muted-foreground" />{t("users.permissions", "Permissions")}</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 start-2.5 my-auto h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("users.searchPages", "Search pages…")} aria-label={t("users.searchPages", "Search pages")} className="h-9 w-40 ps-8" />
          </div>
          <Select value={role} onValueChange={v => setRole(v as any)}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{CONFIGURABLE_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
          <button
            disabled={!dirty || save.isPending}
            onClick={onSave}
            className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {t("common.save", "Save")}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-border text-start">
              <th className="px-3 py-2.5 text-start font-semibold text-muted-foreground">{t("users.page", "Page")}</th>
              {actions.map(a => <th key={a} className="px-2 py-2.5 text-center font-semibold text-muted-foreground">{a}</th>)}
            </tr>
          </thead>
          <tbody>
            {filteredPages.map((p: any) => {
              const allowed = new Set(p.actions.map((a: any) => a.action));
              return (
                <tr key={p.page} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{p.page}</td>
                  {actions.map(action => {
                    const key = `${p.page}:${action}`;
                    const applicable = allowed.has(action);
                    const changed = local[key] !== server[key];
                    return (
                      <td key={action} className="px-2 py-2 text-center">
                        {applicable ? (
                          <span className={`inline-flex rounded ${changed ? "ring-2 ring-warning" : ""}`}>
                            <Checkbox
                              checked={!!local[key]}
                              onCheckedChange={v => setLocal(m => ({ ...m, [key]: Boolean(v) }))}
                              aria-label={key}
                            />
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {dirty && <p className="mt-2 text-xs text-warning-soft-foreground">{t("users.unsaved", "Unsaved changes — highlighted cells differ from saved.")}</p>}
    </section>
  );
}
