import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  platformAdministratorRoles,
  platformAdministrators,
  platformRolePermissions,
  platformRoles,
  platformSessions,
} from "../../../drizzle/schema";

const mocks = vi.hoisted(() => ({
  appendPlatformAudit: vi.fn(),
  findAdministratorByPublicId: vi.fn(),
  requirePlatformDb: vi.fn(),
}));

vi.mock("../repositories/audit", () => ({
  appendPlatformAudit: mocks.appendPlatformAudit,
}));
vi.mock("../repositories/administrators", () => ({
  findAdministratorByPublicId: mocks.findAdministratorByPublicId,
}));
vi.mock("../repositories/db", async importOriginal => {
  const original = await importOriginal<typeof import("../repositories/db")>();
  return { ...original, requirePlatformDb: mocks.requirePlatformDb };
});

import { updatePlatformAdministrator } from "./administrators";

function query(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.innerJoin = chain;
  builder.where = chain;
  builder.limit = chain;
  builder.for = async () => rows;
  builder.then = (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return builder;
}

describe("platform administrator mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appendPlatformAudit.mockResolvedValue(undefined);
    mocks.findAdministratorByPublicId.mockResolvedValue({
      id: 10,
      publicId: "01J00000000000000000000010",
      status: "active",
      version: 4,
    });
  });

  it("replaces roles with CAS, revokes sessions, and audits old and new grants", async () => {
    const events: Array<{ action: string; table: unknown; value?: Record<string, unknown> }> = [];
    const managerGrantQuery = query([{ id: 10 }, { id: 11 }]);
    const lockManagerGrants = vi.fn(async () => [{ id: 10 }, { id: 11 }]);
    managerGrantQuery.for = lockManagerGrants;
    const rows = new Map<unknown, unknown[]>([
      [platformRoles, [{ id: 8, code: "platform_support" }]],
      [platformAdministratorRoles, [{ code: "platform_admin" }]],
      [platformAdministrators, [{ id: 10 }, { id: 11 }]],
      [platformRolePermissions, [{ id: 8 }]],
    ]);
    const tx = {
      select: () => ({ from: (table: unknown) => query(rows.get(table) ?? []) }),
      selectDistinct: () => ({ from: () => managerGrantQuery }),
      update: (table: unknown) => ({
        set: (value: Record<string, unknown>) => ({
          where: async () => {
            events.push({ action: "update", table, value });
            return [{ affectedRows: 1 }];
          },
        }),
      }),
      delete: (table: unknown) => ({
        where: async () => { events.push({ action: "delete", table }); },
      }),
      insert: (table: unknown) => ({
        values: async (value: Record<string, unknown>) => {
          events.push({ action: "insert", table, value });
          return [{ insertId: 1 }];
        },
      }),
    };
    mocks.requirePlatformDb.mockResolvedValue({
      transaction: (operation: (handle: unknown) => unknown) => operation(tx),
    });

    const result = await updatePlatformAdministrator({
      publicId: "01J00000000000000000000010",
      roleCodes: ["platform_support"],
      expectedVersion: 4,
    }, {
      platformAdminId: 11,
      userId: 21,
      permissions: new Set(["administrators.write"]),
      sessionId: 31,
      authenticationLevel: "mfa",
      requestId: "administrator-update-test",
    });

    expect(result).toEqual({
      publicId: "01J00000000000000000000010",
      status: "active",
      version: 5,
    });
    expect(events.find(event => event.action === "update" && event.table === platformAdministrators)?.value)
      .toHaveProperty("authVersion");
    expect(events.find(event => event.action === "update" && event.table === platformSessions)?.value)
      .toMatchObject({ revokedReason: "platform_access_changed" });
    expect(events.findIndex(event => event.action === "delete" && event.table === platformAdministratorRoles))
      .toBeLessThan(events.findIndex(event => event.action === "insert" && event.table === platformAdministratorRoles));
    expect(lockManagerGrants).toHaveBeenCalledWith("update");
    expect(mocks.appendPlatformAudit).toHaveBeenCalledWith(tx, expect.anything(), expect.objectContaining({
      before: expect.objectContaining({ roleCodes: ["platform_admin"], version: 4 }),
      after: expect.objectContaining({ roleCodes: ["platform_support"], version: 5 }),
    }));
  });

  it("rejects self-service role and status changes", async () => {
    mocks.requirePlatformDb.mockResolvedValue({
      transaction: (operation: (handle: unknown) => unknown) => operation({}),
    });

    await expect(updatePlatformAdministrator({
      publicId: "01J00000000000000000000010",
      status: "suspended",
      expectedVersion: 4,
    }, {
      platformAdminId: 10,
      userId: 20,
      permissions: new Set(["administrators.write"]),
      sessionId: 30,
      authenticationLevel: "mfa",
      requestId: "administrator-self-update-test",
    })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("cannot change their own access"),
    });
  });
});
