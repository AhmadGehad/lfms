import { describe, expect, it, vi } from "vitest";
import type { PlatformContext } from "../../shared/tenancy";
import type { PlatformTrpcContext } from "./context";
import { platformRouter } from "./router";
import {
  deletionApprovalBlockers,
  MAX_DELETION_RETENTION_DAYS,
  MIN_DELETION_RETENTION_DAYS,
  restoreApprovalBlockers,
} from "./services/lifecycle";

const NOW = new Date("2026-07-12T12:00:00.000Z");
const PUBLIC_ID = "01J00000000000000000000000";

function context(platform: PlatformContext | null): PlatformTrpcContext {
  return {
    req: {} as PlatformTrpcContext["req"],
    res: {} as PlatformTrpcContext["res"],
    platform,
    csrfToken: null,
    requireCsrf: vi.fn(),
    revokeSession: vi.fn(),
  };
}

function principal(overrides: Partial<PlatformContext> = {}): PlatformContext {
  return {
    platformAdminId: 10,
    userId: 20,
    permissions: new Set(),
    sessionId: 30,
    authenticationLevel: "primary",
    requestId: "request-lifecycle",
    ...overrides,
  };
}

describe("tenant lifecycle guards", () => {
  it("uses bounded nonzero deletion retention", () => {
    expect(MIN_DELETION_RETENTION_DAYS).toBe(30);
    expect(MAX_DELETION_RETENTION_DAYS).toBeGreaterThanOrEqual(MIN_DELETION_RETENTION_DAYS);
  });

  it("blocks self approval, early deletion, and missing export", () => {
    expect(deletionApprovalBlockers({
      status: "requested",
      requestedByPlatformAdministratorId: 10,
      approvingPlatformAdministratorId: 10,
      retentionUntil: new Date(NOW.getTime() + 1),
      now: NOW,
      hasCompletedExport: false,
    })).toEqual([
      "Requesters cannot approve their own deletion request",
      "The deletion retention deadline has not elapsed",
      "A completed clean tenant export is required",
    ]);
  });

  it("never approves a deletion under legal hold", () => {
    expect(deletionApprovalBlockers({
      status: "legal_hold",
      requestedByPlatformAdministratorId: 10,
      approvingPlatformAdministratorId: 11,
      retentionUntil: new Date(NOW.getTime() - 1),
      now: NOW,
      hasCompletedExport: true,
    })).toContain("A legal hold blocks deletion approval");
  });

  it("allows purge-ready approval only after every gate", () => {
    expect(deletionApprovalBlockers({
      status: "exported",
      requestedByPlatformAdministratorId: 10,
      approvingPlatformAdministratorId: 11,
      retentionUntil: new Date(NOW.getTime() - 1),
      now: NOW,
      hasCompletedExport: true,
    })).toEqual([]);
  });

  it("requires restore isolation, validation, checkpoint, and another approver", () => {
    expect(restoreApprovalBlockers({
      status: "pending",
      requestedByPlatformAdministratorId: 10,
      approvingPlatformAdministratorId: 10,
      companyStatus: "active",
      validationResult: { valid: true },
      hasFreshCheckpoint: false,
      sourceStillClean: false,
      sourceChecksumMatches: false,
    })).toEqual([
      "Restore validation is not ready",
      "Requesters cannot approve their own restore request",
      "Company must remain suspended during restore",
      "Restore validation did not verify schema and tenant identity",
      "Restore source is no longer clean and available",
      "Restore source checksum changed after validation",
      "A fresh completed pre-restore checkpoint is required",
    ]);
  });

  it("accepts a validated restore only for its suspended tenant", () => {
    expect(restoreApprovalBlockers({
      status: "ready",
      requestedByPlatformAdministratorId: 10,
      approvingPlatformAdministratorId: 11,
      companyStatus: "suspended",
      validationResult: {
        valid: true,
        schemaCompatible: true,
        tenantMatches: true,
        sourceChecksumSha256: "a".repeat(64),
      },
      hasFreshCheckpoint: true,
      sourceStillClean: true,
      sourceChecksumMatches: true,
    })).toEqual([]);
  });
});

describe("tenant lifecycle API boundary", () => {
  it("requires the specific read permission before lifecycle repository access", async () => {
    const caller = platformRouter.createCaller(context(principal({
      permissions: new Set(["companies.read"]),
    })));
    await expect(caller.lifecycle.deletions.list({ limit: 25, sortDirection: "desc" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires MFA for deletion requests", async () => {
    const caller = platformRouter.createCaller(context(principal({
      permissions: new Set(["operations.write"]),
      authenticationLevel: "primary",
    })));
    await expect(caller.lifecycle.deletions.request({
      companyPublicId: PUBLIC_ID,
      reason: "Customer verified deletion request",
      retentionDays: 30,
      expectedCompanyVersion: 1,
      idempotencyKey: "delete-request-1",
    })).rejects.toMatchObject({ code: "FORBIDDEN", message: "MFA verification required" });
  });

  it("does not let export permission authorize restore approval", async () => {
    const caller = platformRouter.createCaller(context(principal({
      permissions: new Set(["exports.create"]),
      authenticationLevel: "mfa",
    })));
    await expect(caller.lifecycle.restores.approve({
      publicId: PUBLIC_ID,
      expectedVersion: 1,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not let read-only export permission authorize backup download", async () => {
    const caller = platformRouter.createCaller(context(principal({
      permissions: new Set(["exports.read"]),
      authenticationLevel: "mfa",
    })));
    await expect(caller.lifecycle.exports.download({
      publicId: PUBLIC_ID,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires export create permission and MFA before issuing a download URL", async () => {
    const withoutPermission = platformRouter.createCaller(context(principal({
      permissions: new Set(["operations.read"]),
      authenticationLevel: "mfa",
    })));
    await expect(withoutPermission.lifecycle.exports.download({ publicId: PUBLIC_ID }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    const withoutMfa = platformRouter.createCaller(context(principal({
      permissions: new Set(["exports.create"]),
      authenticationLevel: "primary",
    })));
    await expect(withoutMfa.lifecycle.exports.download({ publicId: PUBLIC_ID }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "MFA verification required" });
  });

  it("rejects deletion entry through the generic company status endpoint", async () => {
    const caller = platformRouter.createCaller(context(principal({
      permissions: new Set(["companies.write"]),
      authenticationLevel: "mfa",
    })));
    await expect(caller.companies.changeStatus({
      publicId: PUBLIC_ID,
      status: "deletion_requested",
      expectedVersion: 1,
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
