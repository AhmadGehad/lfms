import type { AppRole, PermissionOverrides } from "./permissions";

export type CompanyLifecycleStatus =
  | "provisioning"
  | "active"
  | "suspended"
  | "deletion_requested"
  | "purging"
  | "deleted";

export type MembershipStatus = "invited" | "active" | "suspended" | "removed";
export type FarmAccessMode = "all" | "restricted";
export type FeatureAccessMode = "enabled" | "read_only" | "disabled";
export type AuthenticationLevel = "primary" | "mfa" | "step_up";

export type TenantContext = Readonly<{
  companyId: number;
  companyPublicId: string;
  companySlug: string;
  companyLifecycleStatus: CompanyLifecycleStatus;
  userId: number;
  membershipId: number;
  membershipRole: AppRole;
  membershipStatus: MembershipStatus;
  authorizationVersion: number;
  farmAccessMode: FarmAccessMode;
  accessibleFarmIds: readonly number[] | "all";
  selectedFarmId: number | null;
  permissionOverrides: PermissionOverrides;
  sessionId: number;
  authenticationLevel: AuthenticationLevel;
  entitlementVersion: number;
  requestId: string;
}>;

export const PLATFORM_PERMISSIONS = [
  "platform.dashboard.read",
  "companies.read",
  "companies.write",
  "farms.read",
  "farms.write",
  "memberships.read",
  "memberships.write",
  "plans.read",
  "plans.write",
  "subscriptions.read",
  "subscriptions.write",
  "entitlements.read",
  "entitlements.write",
  "usage.read",
  "audit.read",
  "audit.export",
  "security.read",
  "administrators.read",
  "administrators.write",
  "support.request",
  "support.approve",
  "support.access",
  "exports.read",
  "exports.create",
  "operations.read",
  "operations.write",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export type PlatformContext = Readonly<{
  platformAdminId: number;
  userId: number;
  permissions: ReadonlySet<PlatformPermission>;
  sessionId: number;
  authenticationLevel: AuthenticationLevel;
  mfaRequired?: boolean;
  requestId: string;
}>;

export type SupportContext = Readonly<{
  platform: PlatformContext;
  grantId: number;
  companyId: number;
  companyPublicId: string;
  allowedScopes: ReadonlySet<string>;
  accessMode: "read_only" | "write";
  reason: string;
  ticketReference: string;
  expiresAt: Date;
}>;

export const SUPPORT_SCOPES = [
  "company.summary",
  "farms.read",
  "memberships.read",
  "animals.read",
  "audit.read",
] as const;

export type SupportScope = (typeof SUPPORT_SCOPES)[number];

export type SystemTenantContext = Readonly<{
  actorType: "system_job";
  jobId: number;
  companyId: number;
  requestId: string;
}>;

export type TenantActorContext = TenantContext | SupportContext | SystemTenantContext;

export type CursorPage<T> = Readonly<{
  items: readonly T[];
  nextCursor: string | null;
}>;

export const TENANCY_ERROR_CODES = {
  companySelectionRequired: "COMPANY_SELECTION_REQUIRED",
  companySuspended: "COMPANY_SUSPENDED",
  companyUnavailable: "COMPANY_UNAVAILABLE",
  featureDisabled: "FEATURE_DISABLED",
  featureReadOnly: "FEATURE_READ_ONLY",
  farmAccessDenied: "FARM_ACCESS_DENIED",
  quotaExceeded: "QUOTA_EXCEEDED",
  versionConflict: "VERSION_CONFLICT",
  mfaRequired: "MFA_REQUIRED",
  stepUpRequired: "STEP_UP_REQUIRED",
  supportGrantRequired: "SUPPORT_GRANT_REQUIRED",
} as const;

export type TenancyErrorCode =
  (typeof TENANCY_ERROR_CODES)[keyof typeof TENANCY_ERROR_CODES];

export function canAccessFarm(ctx: TenantContext, farmId: number): boolean {
  return ctx.farmAccessMode === "all" ||
    ctx.accessibleFarmIds === "all" ||
    ctx.accessibleFarmIds.includes(farmId);
}

export function requireCompanyActive(ctx: TenantContext): void {
  if (ctx.companyLifecycleStatus !== "active") {
    throw new Error(TENANCY_ERROR_CODES.companySuspended);
  }
}
