import { describe, expect, it } from "vitest";
import { assertPlatformManagementAuthorityRemains } from "./administrators";

describe("platform administrator lockout protection", () => {
  it("blocks suspension of the last active platform manager", () => {
    expect(() => assertPlatformManagementAuthorityRemains({
      targetId: 10,
      nextStatus: "suspended",
      targetHasManagementPermission: true,
      activeManagerIds: [10],
    })).toThrow("Cannot remove the last active administrator");
  });

  it("blocks removing management permission from the last active manager", () => {
    expect(() => assertPlatformManagementAuthorityRemains({
      targetId: 10,
      nextStatus: "active",
      targetHasManagementPermission: false,
      activeManagerIds: [10],
    })).toThrow("Cannot remove the last active administrator");
  });

  it("allows a downgrade when another active manager remains", () => {
    expect(() => assertPlatformManagementAuthorityRemains({
      targetId: 10,
      nextStatus: "revoked",
      targetHasManagementPermission: false,
      activeManagerIds: [10, 11],
    })).not.toThrow();
  });
});
