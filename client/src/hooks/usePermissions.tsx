import { useAuth } from "@/_core/hooks/useAuth";
import { useMemo } from "react";

// Must mirror ROLE_RANK in server/_core/trpc.ts
const ROLE_RANK: Record<string, number> = {
  user: 0,
  staff: 1,
  supervisor: 2,
  admin: 3,
  owner: 3,
};

/**
 * Client-side permission helper. Mirrors the server role hierarchy so the UI
 * can hide/disable actions the user isn't allowed to perform. This is a UX
 * convenience only — the server enforces the real checks.
 */
export function usePermissions() {
  const { user } = useAuth();

  return useMemo(() => {
    const rank = ROLE_RANK[(user?.role as string) ?? "user"] ?? 0;
    return {
      role: (user?.role as string) ?? "user",
      /** read-only users (rank 0) can view but not write */
      canRecord: rank >= 1, // staff+: record animals, weights, sales, expenses, feed
      canEditConfig: rank >= 2, // supervisor+: categories, ration plans, settings
      canManageUsers: rank >= 3, // admin/owner: user roles
      canDelete: rank >= 2, // supervisor+: soft-delete records
      canPurgeOrRestore: rank >= 3, // admin/owner: permanent delete, restore, backup/restore
      isReadOnly: rank === 0,
    };
  }, [user?.role]);
}
