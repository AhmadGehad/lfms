import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch as ToggleSwitch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";
import type { PermissionAction, PermissionPage } from "@shared/permissions";
import { RotateCcw, Save, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const ROLE_OPTIONS = ["viewer", "user", "staff", "supervisor", "admin"] as const;

export default function UserManagement() {
  const { t } = useTranslation();
  const { role } = usePermissions("users");
  const canUpdate = role === "admin" || role === "owner";
  const { data: users, isLoading } = trpc.userMgmt.listUsers.useQuery();
  const utils = trpc.useUtils();

  const updateRole = trpc.userMgmt.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success(t("users.roleUpdated"));
      utils.userMgmt.listUsers.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4 p-3 md:space-y-6 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Users className="h-6 w-6 text-primary" />
          {t("users.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("users.subtitle")}
        </p>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">{t("permissions.usersTab")}</TabsTrigger>
          {canUpdate && <TabsTrigger value="permissions">
            {t("permissions.rolesTab")}
          </TabsTrigger>}
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.name")}</TableHead>
                      <TableHead>{t("users.email")}</TableHead>
                      <TableHead>{t("users.role")}</TableHead>
                      <TableHead>{t("users.lastSignIn")}</TableHead>
                      <TableHead>{t("users.joined")}</TableHead>
                      <TableHead className="text-right">
                        {t("common.actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center">
                          {t("common.loading")}
                        </TableCell>
                      </TableRow>
                    ) : (users ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-12 text-center text-muted-foreground"
                        >
                          {t("users.noUsers")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      (users ?? []).map(user => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            {user.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {user.email ?? "—"}
                          </TableCell>
                          <TableCell>
                            <RoleBadge role={user.role} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {user.lastSignedIn
                              ? new Date(user.lastSignedIn).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {canUpdate && !user.isProtectedOwner ? (
                              <Select
                                value={user.role}
                                onValueChange={role =>
                                  updateRole.mutate({
                                    userId: user.id,
                                    role: role as (typeof ROLE_OPTIONS)[number],
                                  })
                                }
                                disabled={updateRole.isPending}
                              >
                                <SelectTrigger
                                  className="ms-auto w-36"
                                  aria-label={t("permissions.changeRole")}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ROLE_OPTIONS.map(role => (
                                    <SelectItem key={role} value={role}>
                                      {t(`users.${role}`)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <RoleBadge role={user.role} />
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {canUpdate && <TabsContent value="permissions">
          <RolePermissionEditor disabled={false} />
        </TabsContent>}
      </Tabs>
    </div>
  );
}

function RolePermissionEditor({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const catalog = trpc.permissions.catalog.useQuery();
  const [role, setRole] = useState<"supervisor" | "staff" | "user" | "viewer">(
    "staff",
  );
  const matrix = trpc.permissions.roleMatrix.useQuery({ role });
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [savedValues, setSavedValues] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const page of matrix.data?.matrix ?? []) {
      for (const action of page.actions) {
        next[`${page.page}:${action.action}`] = action.allowed;
      }
    }
    setValues(next);
    setSavedValues(next);
  }, [matrix.data]);

  const pages = useMemo(() => catalog.data?.pages ?? [], [catalog.data]);
  const isDirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(savedValues),
    [savedValues, values],
  );
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
  const mutation = trpc.permissions.updateRoleMatrix.useMutation({
    onSuccess: async (_data, variables) => {
      toast.success(t("permissions.saved"));
      await Promise.all([
        utils.permissions.roleMatrix.invalidate({ role: variables.role }),
        utils.permissions.my.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });

  const save = (reset = false) => {
    if (matrix.isFetching || mutation.isPending) return;
    if (reset && !window.confirm(t("permissions.resetConfirm"))) return;
    const entries = reset
      ? []
      : pages.flatMap(page =>
        page.actions.map(action => ({
          page: page.id,
          action,
          allowed: values[`${page.id}:${action}`] ?? false,
        })),
      );
    if (!matrix.data) return;
    mutation.mutate({
      role,
      expectedRevision: matrix.data.revision,
      entries,
    });
  };

  const setPermission = (
    page: PermissionPage,
    action: PermissionAction,
    allowed: boolean,
  ) => {
    setValues(current => {
      const next = { ...current, [`${page}:${action}`]: allowed };
      if (action === "view" && !allowed) {
        const definition = pages.find(item => item.id === page);
        for (const pageAction of definition?.actions ?? []) {
          next[`${page}:${pageAction}`] = false;
        }
      }
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {t("permissions.title")}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("permissions.subtitle")}
          </p>
        </div>
        <Select
          value={role}
          onValueChange={value => {
            if (isDirty && !window.confirm(t("permissions.unsavedConfirm"))) return;
            setValues({});
            setRole(value as typeof role);
          }}
          disabled={mutation.isPending}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label={t("users.role")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(catalog.data?.configurableRoles ?? []).map(item => (
              <SelectItem key={item} value={item}>
                {t(`users.${item}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-48">
                  {t("permissions.page")}
                </TableHead>
                <TableHead>{t("permissions.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.isLoading ? (
                <TableRow>
                  <TableCell colSpan={2} className="py-10 text-center">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : (
                pages.map(page => {
                  const viewAllowed = values[`${page.id}:view`] ?? false;
                  return (
                    <TableRow key={page.id}>
                      <TableCell className="font-medium">
                        {t(`permissions.pages.${page.id}`)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-4">
                          {page.actions.map(action => {
                            const id = `${role}-${page.id}-${action}`;
                            const actionDisabled =
                              disabled ||
                              (page.id === "users" && action === "update") ||
                              (page.id === "data" && action === "restore") ||
                              (action !== "view" && !viewAllowed);
                            return (
                              <label
                                key={action}
                                htmlFor={id}
                                className="flex min-w-28 items-center gap-2 text-sm"
                              >
                                <ToggleSwitch
                                  id={id}
                                  checked={values[`${page.id}:${action}`] ?? false}
                                  disabled={actionDisabled || matrix.isFetching || mutation.isPending}
                                  onCheckedChange={checked =>
                                    setPermission(page.id, action, checked)
                                  }
                                />
                                {t(`permissions.actionLabels.${action}`)}
                              </label>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={disabled || matrix.isFetching || mutation.isPending}
            onClick={() => save(true)}
          >
            <RotateCcw className="h-4 w-4" />
            {t("permissions.reset")}
          </Button>
          <Button
            type="button"
            disabled={disabled || matrix.isFetching || mutation.isPending}
            onClick={() => save()}
          >
            <Save className="h-4 w-4" />
            {mutation.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleBadge({ role }: { role: string }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant={role === "admin" || role === "owner" ? "default" : "secondary"}
      className="capitalize"
    >
      {t(`users.${role}`, role)}
    </Badge>
  );
}
