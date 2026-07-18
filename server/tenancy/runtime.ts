import { AsyncLocalStorage } from "node:async_hooks";
import type {
  SupportContext,
  SystemTenantContext,
  TenantActorContext,
  TenantContext,
} from "../../shared/tenancy";

const tenantStorage = new AsyncLocalStorage<TenantActorContext>();

export function runWithTenantContext<T>(
  context: TenantActorContext,
  operation: () => T,
): T {
  return tenantStorage.run(context, operation);
}

export function getTenantActorContext() {
  return tenantStorage.getStore() ?? null;
}

export function requireTenantActorContext(): TenantActorContext {
  const context = tenantStorage.getStore();
  if (!context) throw new Error("TENANT_CONTEXT_REQUIRED");
  return context;
}

export function requireTenantUserContext(): TenantContext {
  const context = requireTenantActorContext();
  if (!("membershipId" in context)) {
    throw new Error("TENANT_USER_CONTEXT_REQUIRED");
  }
  return context;
}

export function actorCompanyId(context = requireTenantActorContext()) {
  return context.companyId;
}

export function isSupportContext(
  context: TenantActorContext,
): context is SupportContext {
  return "grantId" in context;
}

export function isSystemTenantContext(
  context: TenantActorContext,
): context is SystemTenantContext {
  return "actorType" in context && context.actorType === "system_job";
}

export function isTenantUserContext(
  context: TenantActorContext,
): context is TenantContext {
  return "membershipId" in context;
}
