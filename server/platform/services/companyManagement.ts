import { and, eq, isNull, sql } from "drizzle-orm";
import { companies } from "../../../drizzle/schema";
import { SESSION_IDLE_TIMEOUT_MINUTES_OPTIONS, type SessionIdleTimeoutMinutes } from "../../tenancy/companySettings";
import { invalidLifecycle, notFound, versionConflict } from "../errors";
import { appendPlatformAudit, type PlatformAuditActor } from "../repositories/audit";
import { getCompanyRecord } from "../repositories/companies";
import { affectedRows, requirePlatformDb } from "../repositories/db";
import { rethrowPlatformWriteError } from "./errors";

export async function inspectCompany(publicId: string, actor: PlatformAuditActor) {
  const company = await getCompanyRecord(publicId);
  if (!company) notFound("Company");
  await appendPlatformAudit(await requirePlatformDb(), actor, {
    action: "company.inspect",
    actionCategory: "company",
    entityType: "company",
    entityId: company.publicId,
    metadata: {
      farmCount: Number(company.farmCount),
      memberCount: Number(company.memberCount),
    },
  });
  return company;
}

export async function updateCompany(input: {
  publicId: string;
  name?: string;
  slug?: string;
  expectedVersion: number;
}, actor: PlatformAuditActor) {
  const db = await requirePlatformDb();
  try {
    return await db.transaction(async tx => {
      const [company] = await tx.select().from(companies)
        .where(and(eq(companies.publicId, input.publicId), isNull(companies.deletedAt)))
        .limit(1)
        .for("update");
      if (!company) notFound("Company");
      if (company.version !== input.expectedVersion) versionConflict("Company");
      const [result] = await tx.update(companies).set({
        name: input.name?.trim(),
        slug: input.slug?.trim().toLowerCase(),
        version: sql`${companies.version} + 1`,
      }).where(and(
        eq(companies.id, company.id),
        eq(companies.version, input.expectedVersion),
        isNull(companies.deletedAt),
      ));
      if (affectedRows(result) !== 1) versionConflict("Company");
      await appendPlatformAudit(tx, actor, {
        action: "company.update",
        actionCategory: "company",
        entityType: "company",
        entityId: company.publicId,
        companyId: company.id,
        before: { name: company.name, slug: company.slug, version: company.version },
        after: { name: input.name?.trim() ?? company.name, slug: input.slug?.trim().toLowerCase() ?? company.slug, version: company.version + 1 },
      });
      return { publicId: company.publicId, version: company.version + 1 };
    });
  } catch (error) {
    rethrowPlatformWriteError(error);
  }
}

export async function updateCompanySessionTimeout(input: {
  publicId: string;
  sessionIdleTimeoutMinutes: SessionIdleTimeoutMinutes;
  expectedVersion: number;
}, actor: PlatformAuditActor) {
  if (!SESSION_IDLE_TIMEOUT_MINUTES_OPTIONS.includes(input.sessionIdleTimeoutMinutes)) {
    invalidLifecycle("Unsupported session idle timeout");
  }
  const db = await requirePlatformDb();
  try {
    return await db.transaction(async tx => {
      const [company] = await tx.select().from(companies)
        .where(and(eq(companies.publicId, input.publicId), isNull(companies.deletedAt)))
        .limit(1)
        .for("update");
      if (!company) notFound("Company");
      if (company.version !== input.expectedVersion) versionConflict("Company");
      const currentSettings = (company.settings && typeof company.settings === "object")
        ? company.settings as Record<string, unknown>
        : {};
      const nextSettings = { ...currentSettings, sessionIdleTimeoutMinutes: input.sessionIdleTimeoutMinutes };
      const [result] = await tx.update(companies).set({
        settings: nextSettings,
        version: sql`${companies.version} + 1`,
      }).where(and(
        eq(companies.id, company.id),
        eq(companies.version, input.expectedVersion),
        isNull(companies.deletedAt),
      ));
      if (affectedRows(result) !== 1) versionConflict("Company");
      await appendPlatformAudit(tx, actor, {
        action: "company.update_session_timeout",
        actionCategory: "company",
        entityType: "company",
        entityId: company.publicId,
        companyId: company.id,
        before: { sessionIdleTimeoutMinutes: currentSettings.sessionIdleTimeoutMinutes ?? null, version: company.version },
        after: { sessionIdleTimeoutMinutes: input.sessionIdleTimeoutMinutes, version: company.version + 1 },
      });
      return { publicId: company.publicId, version: company.version + 1 };
    });
  } catch (error) {
    rethrowPlatformWriteError(error);
  }
}
