import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  permissionKey,
  type PermissionAction,
  type PermissionPage,
} from "@shared/permissions";
import { useCallback, useMemo } from "react";

export function usePermissions(page?: PermissionPage) {
  const { user } = useAuth();
  const permissionsQuery = trpc.permissions.my.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const permissions = useMemo(() => {
    const values = new Map<string, boolean>();
    for (const pageEntry of permissionsQuery.data?.matrix ?? []) {
      for (const actionEntry of pageEntry.actions) {
        values.set(
          permissionKey(pageEntry.page, actionEntry.action),
          actionEntry.allowed,
        );
      }
    }
    return values;
  }, [permissionsQuery.data]);

  const can = useCallback((
    targetPage: PermissionPage,
    action: PermissionAction,
  ) => permissions.get(permissionKey(targetPage, action)) ?? false, [permissions]);

  const scoped = useMemo(() => {
    const scopedCan = (action: PermissionAction) =>
      page ? can(page, action) : false;
    return {
      canView: scopedCan("view"),
      canCreate: scopedCan("create"),
      canUpdate: scopedCan("update"),
      canDelete: scopedCan("delete"),
      canExport: scopedCan("export"),
      canReport: scopedCan("report"),
      canImport: scopedCan("import"),
      canRestore: scopedCan("restore"),
      canMutate: page
        ? ["create", "update", "delete", "import", "restore"]
          .some(action => scopedCan(action as PermissionAction))
        : false,
    };
  }, [can, page]);

  return {
    role: (user?.role as string) ?? "viewer",
    loading: Boolean(user) && permissionsQuery.isLoading,
    can,
    ...scoped,
    // Backward-compatible aliases while page components migrate to scoped
    // names. These values are still dynamic and server-provided.
    canRecord: page ? can(page, "create") : false,
    canEditConfig: can("configuration", "update"),
    canManageUsers: can("users", "update"),
    canPurgeOrRestore: can("recycleBin", "restore"),
    isViewer: user?.role === "viewer",
    isReadOnly: page ? !scoped.canMutate : false,
  };
}
