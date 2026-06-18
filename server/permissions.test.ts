import { describe, expect, it } from "vitest";
import {
  getDefaultPermission,
  hasPermission,
  isKnownPermission,
  permissionKey,
  type AppRole,
  type PermissionOverrides,
} from "../shared/permissions";
import type { TrpcContext } from "./_core/context";
import {
  anyPermissionProcedure,
  ownerProcedure,
  permissionProcedure,
  router,
} from "./_core/trpc";

const testRouter = router({
  createAnimal: permissionProcedure("animals", "create").mutation(() => true),
  sharedAnimals: anyPermissionProcedure([
    ["animals", "view"],
    ["sales", "view"],
  ]).query(() => true),
  ownerOnly: ownerProcedure.query(() => true),
});

function makeCtx(
  role: AppRole,
  permissionOverrides: PermissionOverrides = {},
): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test",
      name: "Test",
      email: "test@example.com",
      loginMethod: "test",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    permissionOverrides,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("permission defaults", () => {
  it("preserves the legacy operational hierarchy", () => {
    expect(getDefaultPermission("viewer", "animals", "view")).toBe(true);
    expect(getDefaultPermission("user", "animals", "create")).toBe(false);
    expect(getDefaultPermission("staff", "animals", "create")).toBe(true);
    expect(getDefaultPermission("staff", "animals", "delete")).toBe(false);
    expect(getDefaultPermission("supervisor", "configuration", "update")).toBe(true);
    expect(getDefaultPermission("supervisor", "users", "view")).toBe(false);
  });

  it("applies overrides and requires page visibility for actions", () => {
    const overrides: PermissionOverrides = {
      [permissionKey("animals", "view")]: false,
      [permissionKey("animals", "create")]: true,
    };
    expect(hasPermission("staff", overrides, "animals", "view")).toBe(false);
    expect(hasPermission("staff", overrides, "animals", "create")).toBe(false);
  });

  it("keeps owner and admin as lockout-safe full-access roles", () => {
    const deny: PermissionOverrides = {
      [permissionKey("users", "view")]: false,
    };
    expect(hasPermission("owner", deny, "users", "view")).toBe(true);
    expect(hasPermission("admin", deny, "users", "view")).toBe(true);
    expect(hasPermission("admin", deny, "data", "restore")).toBe(false);
  });

  it("rejects unknown page/action pairs", () => {
    expect(isKnownPermission("animals", "create")).toBe(true);
    expect(isKnownPermission("animals", "purge")).toBe(false);
    expect(isKnownPermission("unknown", "view")).toBe(false);
  });
});

describe("permission middleware", () => {
  it("denies direct mutation calls when an action is revoked", async () => {
    const caller = testRouter.createCaller(makeCtx("staff", {
      [permissionKey("animals", "create")]: false,
    }));
    await expect(caller.createAnimal()).rejects.toThrow(/animals\.create/i);
  });

  it("allows direct mutation calls when an action is granted", async () => {
    const caller = testRouter.createCaller(makeCtx("user", {
      [permissionKey("animals", "create")]: true,
    }));
    await expect(caller.createAnimal()).resolves.toBe(true);
  });

  it("allows shared queries through any matching page permission", async () => {
    const caller = testRouter.createCaller(makeCtx("viewer", {
      [permissionKey("animals", "view")]: false,
      [permissionKey("sales", "view")]: true,
    }));
    await expect(caller.sharedAnimals()).resolves.toBe(true);
  });

  it("keeps full restore authority owner-only", async () => {
    await expect(testRouter.createCaller(makeCtx("admin")).ownerOnly())
      .rejects.toThrow(/permission/i);
    await expect(testRouter.createCaller(makeCtx("owner")).ownerOnly())
      .resolves.toBe(true);
  });
});
