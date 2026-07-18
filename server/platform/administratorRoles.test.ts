import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { platformManagementAuthorityRemains, replacePlatformAdministratorRoles } from "./administratorRoles";

describe("platform administrator role replacement", () => {
  it("deletes every stale grant before inserting the selected role set", async () => {
    const events: string[] = [];
    const tx = {
      delete: vi.fn(() => ({ where: async () => { events.push("delete"); } })),
      insert: vi.fn(() => ({ values: async (rows: unknown[]) => { events.push("insert"); return rows; } })),
    };

    await replacePlatformAdministratorRoles(tx as never, 17, [3, 5], 9);

    expect(events).toEqual(["delete", "insert"]);
    expect(tx.insert).toHaveBeenCalledOnce();
  });

  it("leaves no stale grants when replacing with an empty role set", async () => {
    const tx = {
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      insert: vi.fn(),
    };

    await replacePlatformAdministratorRoles(tx as never, 17, []);

    expect(tx.delete).toHaveBeenCalledOnce();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("refuses a bootstrap downgrade that would remove the sole platform manager", () => {
    expect(platformManagementAuthorityRemains({
      targetId: 17,
      targetWillBeActive: true,
      targetWillHaveManagementPermission: false,
      currentActiveManagerIds: [17],
    })).toBe(false);
    expect(platformManagementAuthorityRemains({
      targetId: 17,
      targetWillBeActive: true,
      targetWillHaveManagementPermission: false,
      currentActiveManagerIds: [17, 18],
    })).toBe(true);
    const bootstrap = readFileSync("scripts/bootstrap-platform-admin.ts", "utf8");
    expect(bootstrap).toContain("Bootstrap role replacement would remove the last active platform manager");
  });
});
