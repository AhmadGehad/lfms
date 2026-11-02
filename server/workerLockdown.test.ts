import { describe, expect, it, vi } from "vitest";
import {
  APP_ROLES,
  buildDeniedPermissionOverrides,
  hasPermission,
  PERMISSION_PAGES,
  type PermissionOverrides,
} from "../shared/permissions";
import type { TrpcContext } from "./_core/context";
import { WORKER_SESSION_IDLE_MS } from "./_core/passwordAuth";
import { appRouter } from "./routers";

vi.mock("./entitlements/sqlStore", async importOriginal => {
  const actual = await importOriginal<typeof import("./entitlements/sqlStore")>();
  return { ...actual, getEntitlementService: () => ({ assertAccess: async () => undefined }) };
});

/**
 * Everything a tablet account may reach without a permission check of its own.
 * Adding to this list means the shared farm tablet can call it, so justify it.
 */
const TABLET_REACHABLE = new Set([
  "system.health",
  "auth.me",
  "auth.invitationIdentity",
  "auth.suspensionStatus",
  "auth.tenantContext",
  "auth.logout",
  "invitations.preview",
  "invitations.accept",
  "invitations.activateWithPassword",
  "tenancy.publicBranding",
  "permissions.my",
  "preferences.get",
  "preferences.set",
  "config.getCompanyBranding",
  // Its own screen.
  "tasks.today",
  "tasks.recordAction",
  "tasks.submitReport",
  "tasks.checkIn",
]);

function workerContext(overrides: PermissionOverrides = {}): TrpcContext {
  return {
    user: {
      id: 1, openId: "tablet", email: "tablet@farm.test", name: "Tablet", loginMethod: "password",
      role: "worker", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    session: { subjectId: 1 },
    tenant: {
      companyId: 11, companyPublicId: "01J00000000000000000000000", companySlug: "farm",
      companyLifecycleStatus: "active", userId: 1, membershipId: 31, membershipRole: "worker",
      membershipStatus: "active", authorizationVersion: 1, farmAccessMode: "restricted",
      accessibleFarmIds: [41], selectedFarmId: 41, permissionOverrides: overrides, sessionId: 51,
      authenticationLevel: "primary", entitlementVersion: 1, requestId: "lockdown-test",
    },
    permissionOverrides: overrides,
    tenantWriteFence: async (_tenant: unknown, operation: () => unknown) => operation(),
    req: { protocol: "https", headers: {} },
    res: {},
  } as unknown as TrpcContext;
}

describe("worker role permissions", () => {
  it("is allowed the tablet screen and denied every other page and action", () => {
    for (const page of PERMISSION_PAGES) {
      for (const action of page.actions) {
        expect(hasPermission("worker", null, page.id, action), `${page.id}:${action}`)
          .toBe(page.id === "workerTasks");
      }
    }
  });

  it("can't be widened by a role-permission row", () => {
    const allowEverything = Object.fromEntries(
      Object.keys(buildDeniedPermissionOverrides()).map(key => [key, true]),
    ) as PermissionOverrides;
    expect(hasPermission("worker", allowEverything, "pnl", "view")).toBe(false);
    expect(hasPermission("worker", allowEverything, "sales", "view")).toBe(false);
  });

  it("keeps the tablet screen from every other role except the owner", () => {
    const allowEverything = Object.fromEntries(
      Object.keys(buildDeniedPermissionOverrides()).map(key => [key, true]),
    ) as PermissionOverrides;
    for (const role of APP_ROLES) {
      const expected = role === "owner" || role === "worker";
      expect(hasPermission(role, allowEverything, "workerTasks", "update"), role).toBe(expected);
    }
  });

  it("gives task management to supervisors and above only", () => {
    expect(hasPermission("supervisor", null, "tasks", "create")).toBe(true);
    expect(hasPermission("staff", null, "tasks", "view")).toBe(false);
    expect(hasPermission("viewer", null, "tasks", "view")).toBe(false);
  });
});

describe("worker session lifetime", () => {
  it("fits the 32-bit idleTimeoutMs column, or the tablet can't sign in at all", () => {
    expect(WORKER_SESSION_IDLE_MS).toBeLessThanOrEqual(2_147_483_647);
  });
});

describe("worker session against the whole API", () => {
  const paths = Object.keys(appRouter._def.procedures as Record<string, unknown>);

  it("sees a sensible number of procedures, and an allowlist with no stale entries", () => {
    expect(paths.length).toBeGreaterThan(100);
    expect([...TABLET_REACHABLE].filter(path => !paths.includes(path))).toEqual([]);
  });

  it("is refused by every procedure outside the allowlist", async () => {
    const caller = appRouter.createCaller(workerContext()) as any;
    const reachable: string[] = [];
    for (const path of paths) {
      if (TABLET_REACHABLE.has(path)) continue;
      const procedure = path.split(".").reduce((node, segment) => node[segment], caller);
      const code = await Promise.resolve()
        .then(() => procedure({}))
        .then(() => "OK", (error: { code?: string }) => error.code ?? "THREW");
      if (code !== "FORBIDDEN") reachable.push(`${path}: ${code}`);
    }
    expect(reachable).toEqual([]);
  }, 60_000);
});
