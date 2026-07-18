import {
  TENANCY_ERROR_CODES,
  type AuthenticationLevel,
  type CompanyLifecycleStatus,
  type FarmAccessMode,
  type MembershipStatus,
  type TenantContext,
  type TenancyErrorCode,
} from "../../shared/tenancy";
import type { AppRole, PermissionOverrides } from "../../shared/permissions";

export type TenantSessionPrincipal = Readonly<{
  sessionId: number;
  userId: number;
  authLevel: AuthenticationLevel;
}>;

export type CompanyContextRecord = Readonly<{
  id: number;
  publicId: string;
  slug: string;
  lifecycleStatus: CompanyLifecycleStatus;
  entitlementVersion: number;
}>;

export type MembershipContextRecord = Readonly<{
  id: number;
  companyId: number;
  userId: number;
  role: AppRole;
  status: MembershipStatus;
  farmAccessMode: FarmAccessMode;
  authorizationVersion: number;
}>;

export interface TenantContextStore {
  findCompanyBySlug(slug: string): Promise<CompanyContextRecord | null>;
  findMembership(companyId: number, userId: number): Promise<MembershipContextRecord | null>;
  findFarmIdByPublicId(companyId: number, publicId: string): Promise<number | null>;
  listCompanyFarmIds(companyId: number): Promise<readonly number[]>;
  listAccessibleFarmIds(companyId: number, membershipId: number): Promise<readonly number[]>;
  loadPermissionOverrides(companyId: number, role: AppRole): Promise<PermissionOverrides>;
}

export class TenantResolutionError extends Error {
  constructor(
    public readonly code: TenancyErrorCode,
    public readonly httpStatus: 401 | 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = "TenantResolutionError";
  }
}

export async function resolveTenantContext(input: {
  companySlug: string | null;
  principal: TenantSessionPrincipal | null;
  requestId: string;
  requestedFarmPublicId?: string | null;
  store: TenantContextStore;
}): Promise<TenantContext> {
  if (!input.principal) {
    throw new TenantResolutionError(
      TENANCY_ERROR_CODES.companySelectionRequired,
      401,
      "Authentication required",
    );
  }
  if (!input.companySlug) {
    throw new TenantResolutionError(
      TENANCY_ERROR_CODES.companySelectionRequired,
      403,
      "Company subdomain required",
    );
  }

  const company = await input.store.findCompanyBySlug(input.companySlug);
  if (!company || company.lifecycleStatus === "deleted") {
    throw new TenantResolutionError(
      TENANCY_ERROR_CODES.companyUnavailable,
      404,
      "Company not found",
    );
  }
  const membership = await input.store.findMembership(company.id, input.principal.userId);
  // The SQL store already uses both ids in its query. Verify the returned
  // record as well, so a future cache/store implementation cannot bind a
  // membership from another company or user to this request.
  if (
    !membership ||
    membership.companyId !== company.id ||
    membership.userId !== input.principal.userId ||
    membership.status !== "active"
  ) {
    throw new TenantResolutionError(
      TENANCY_ERROR_CODES.companyUnavailable,
      404,
      "Company not found",
    );
  }

  const [accessibleFarmIds, permissionOverrides] = await Promise.all([
    membership.farmAccessMode === "all"
      ? input.store.listCompanyFarmIds(company.id)
      : input.store.listAccessibleFarmIds(company.id, membership.id),
    input.store.loadPermissionOverrides(company.id, membership.role),
  ]);

  const requestedFarmId = input.requestedFarmPublicId
    ? await input.store.findFarmIdByPublicId(company.id, input.requestedFarmPublicId)
    : null;
  if (input.requestedFarmPublicId && requestedFarmId === null) {
    throw new TenantResolutionError(
      TENANCY_ERROR_CODES.farmAccessDenied,
      404,
      "Farm not found",
    );
  }
  if (requestedFarmId !== null && !accessibleFarmIds.includes(requestedFarmId)) {
    throw new TenantResolutionError(
      TENANCY_ERROR_CODES.farmAccessDenied,
      404,
      "Farm not found",
    );
  }
  const selectedFarmId = requestedFarmId ??
    (accessibleFarmIds.length === 1 ? accessibleFarmIds[0] : null);

  return {
    companyId: company.id,
    companyPublicId: company.publicId,
    companySlug: company.slug,
    companyLifecycleStatus: company.lifecycleStatus,
    userId: input.principal.userId,
    membershipId: membership.id,
    membershipRole: membership.role,
    membershipStatus: membership.status,
    authorizationVersion: membership.authorizationVersion,
    farmAccessMode: membership.farmAccessMode,
    accessibleFarmIds,
    selectedFarmId,
    permissionOverrides,
    sessionId: input.principal.sessionId,
    authenticationLevel: input.principal.authLevel,
    entitlementVersion: company.entitlementVersion,
    requestId: input.requestId,
  };
}
