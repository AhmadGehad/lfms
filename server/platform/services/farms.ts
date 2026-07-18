import { and, eq, isNull, sql } from "drizzle-orm";
import { companies, farms } from "../../../drizzle/schema";
import { generatePublicId } from "../../tenancy/publicIds";
import { invalidLifecycle, notFound, versionConflict } from "../errors";
import { appendPlatformAudit, type PlatformAuditActor } from "../repositories/audit";
import { affectedRows, requirePlatformDb } from "../repositories/db";
import { findFarmByPublicId, getFarmRecord, insertFarm } from "../repositories/farms";
import { rethrowPlatformWriteError } from "./errors";
import { assertWithinLimit, getEffectiveLimit, lockCompanyQuota } from "../../entitlements/limits";
import { executeIdempotent } from "../idempotency";

export async function createFarm(input: {
  companyPublicId: string;
  name: string;
  code: string;
  timezone: string;
  idempotencyKey: string;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  try {
    return await db.transaction(async tx => {
      const [company] = await tx.select().from(companies)
        .where(eq(companies.publicId, input.companyPublicId))
        .limit(1)
        .for("update");
      if (!company || company.deletedAt) notFound("Company");
      return executeIdempotent(tx, {
        companyId: company.id,
        userId: actor.userId,
        key: input.idempotencyKey,
        operation: "platform.farms.create",
        body: {
          companyPublicId: company.publicId,
          name: input.name.trim(),
          code: input.code.trim().toUpperCase(),
          timezone: input.timezone,
        },
      }, async () => {
      if (
        company.lifecycleStatus !== "active" &&
        company.lifecycleStatus !== "provisioning"
      ) {
        invalidLifecycle("Farms cannot be created for an unavailable company");
      }
      const [count] = await tx.select({ count: sql<number>`COUNT(*)` })
        .from(farms).where(and(
          eq(farms.companyId, company.id),
          isNull(farms.deletedAt),
        ));
      const limit = await getEffectiveLimit(tx, company.id, "farms_limit");
      assertWithinLimit(Number(count?.count ?? 0), 1, limit, "farms");
      const publicId = generatePublicId();
      await insertFarm(tx, {
        publicId,
        companyId: company.id,
        name: input.name.trim(),
        code: input.code.trim().toUpperCase(),
        timezone: input.timezone,
      });
      await appendPlatformAudit(tx, actor, {
        action: "farm.create",
        actionCategory: "company",
        entityType: "farm",
        entityId: publicId,
        companyId: company.id,
        after: { name: input.name, code: input.code, timezone: input.timezone },
      });
      return { publicId };
      });
    });
  } catch (error) {
    rethrowPlatformWriteError(error);
  }
}

export async function changeFarmStatus(input: {
  publicId: string;
  status: "active" | "suspended" | "archived";
  expectedVersion: number;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  return db.transaction(async tx => {
    const candidate = await findFarmByPublicId(input.publicId, tx);
    if (!candidate || candidate.deletedAt) notFound("Farm");
    await lockCompanyQuota(tx, candidate.companyId);
    const [company] = await tx.select({ lifecycleStatus: companies.lifecycleStatus })
      .from(companies).where(eq(companies.id, candidate.companyId)).limit(1).for("update");
    if (!company) notFound("Company");
    const [farm] = await tx.select().from(farms)
      .where(eq(farms.id, candidate.id)).limit(1).for("update");
    if (!farm || farm.deletedAt) notFound("Farm");
    if (farm.version !== input.expectedVersion) versionConflict("Farm");
    if (
      input.status === "active" &&
      !["provisioning", "active", "suspended"].includes(company.lifecycleStatus)
    ) {
      invalidLifecycle("Farm cannot be activated for an unavailable company");
    }
    if (
      company.lifecycleStatus === "active" &&
      farm.status === "active" &&
      input.status !== "active"
    ) {
      const [activeFarms] = await tx.select({ count: sql<number>`COUNT(*)` })
        .from(farms).where(and(
          eq(farms.companyId, farm.companyId),
          eq(farms.status, "active"),
          isNull(farms.deletedAt),
        ));
      if (Number(activeFarms?.count ?? 0) <= 1) {
        invalidLifecycle("An active company must keep at least one active farm");
      }
    }
    const [result] = await tx.update(farms).set({
      status: input.status,
      version: sql`${farms.version} + 1`,
    }).where(and(eq(farms.id, farm.id), eq(farms.version, input.expectedVersion)));
    if (affectedRows(result) !== 1) versionConflict("Farm");
    await appendPlatformAudit(tx, actor, {
      action: "farm.status_change",
      actionCategory: "company",
      entityType: "farm",
      entityId: farm.publicId,
      companyId: farm.companyId,
      before: { status: farm.status, version: farm.version },
      after: { status: input.status, version: farm.version + 1 },
    });
    return { publicId: farm.publicId, status: input.status, version: farm.version + 1 };
  });
}

export async function inspectFarm(publicId: string, actor: PlatformAuditActor) {
  const farm = await getFarmRecord(publicId);
  if (!farm) notFound("Farm");
  await appendPlatformAudit(await requirePlatformDb(), actor, {
    action: "farm.inspect",
    actionCategory: "company",
    entityType: "farm",
    entityId: farm.publicId,
    metadata: { companyPublicId: farm.companyPublicId },
  });
  return farm;
}

export async function updateFarm(input: {
  publicId: string;
  name?: string;
  code?: string;
  timezone?: string;
  latitude?: number | null;
  longitude?: number | null;
  expectedVersion: number;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  try {
    return await db.transaction(async tx => {
      const farm = await findFarmByPublicId(input.publicId, tx);
      if (!farm || farm.deletedAt) notFound("Farm");
      const changes = {
        name: input.name?.trim(),
        code: input.code?.trim().toUpperCase(),
        timezone: input.timezone?.trim(),
        latitude: input.latitude === undefined ? undefined : input.latitude === null ? null : input.latitude.toFixed(7),
        longitude: input.longitude === undefined ? undefined : input.longitude === null ? null : input.longitude.toFixed(7),
        version: sql`${farms.version} + 1`,
      };
      const [result] = await tx.update(farms).set(changes).where(and(
        eq(farms.id, farm.id),
        eq(farms.version, input.expectedVersion),
        isNull(farms.deletedAt),
      ));
      if (affectedRows(result) !== 1) versionConflict("Farm");
      await appendPlatformAudit(tx, actor, {
        action: "farm.update",
        actionCategory: "company",
        entityType: "farm",
        entityId: farm.publicId,
        companyId: farm.companyId,
        before: {
          name: farm.name,
          code: farm.code,
          timezone: farm.timezone,
          latitude: farm.latitude,
          longitude: farm.longitude,
          version: farm.version,
        },
        after: {
          name: changes.name ?? farm.name,
          code: changes.code ?? farm.code,
          timezone: changes.timezone ?? farm.timezone,
          latitude: changes.latitude === undefined ? farm.latitude : changes.latitude,
          longitude: changes.longitude === undefined ? farm.longitude : changes.longitude,
          version: farm.version + 1,
        },
      });
      return { publicId: farm.publicId, version: farm.version + 1 };
    });
  } catch (error) {
    rethrowPlatformWriteError(error);
  }
}
