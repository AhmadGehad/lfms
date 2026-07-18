import { eq } from "drizzle-orm";
import { platformAdministratorRoles } from "../../drizzle/schema";
import type { DbOrTx } from "../db";

export function platformManagementAuthorityRemains(input: {
  targetId: number;
  targetWillBeActive: boolean;
  targetWillHaveManagementPermission: boolean;
  currentActiveManagerIds: number[];
}) {
  const managersAfterChange = new Set(input.currentActiveManagerIds);
  managersAfterChange.delete(input.targetId);
  if (input.targetWillBeActive && input.targetWillHaveManagementPermission) {
    managersAfterChange.add(input.targetId);
  }
  return managersAfterChange.size > 0;
}

export async function replacePlatformAdministratorRoles(
  tx: DbOrTx,
  platformAdministratorId: number,
  platformRoleIds: number[],
  grantedByPlatformAdministratorId?: number,
) {
  await tx.delete(platformAdministratorRoles)
    .where(eq(platformAdministratorRoles.platformAdministratorId, platformAdministratorId));
  if (platformRoleIds.length === 0) return;
  await tx.insert(platformAdministratorRoles).values(platformRoleIds.map(platformRoleId => ({
    platformAdministratorId,
    platformRoleId,
    grantedByPlatformAdministratorId,
  })));
}
