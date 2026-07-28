import { TRPCError } from "@trpc/server";
import type { Express, Request, Response } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { companies, companyBranding, tenantFiles } from "../../drizzle/schema";
import { createAuditEntry, getDb } from "../db";
import { retireCompanyAsset, storagePutCompanyAsset } from "../storage";
import { getPrivateObjectUrl } from "../storageBackend";
import { getResolvedRequestHost } from "../_core/security/httpSecurity";
import { requireTenantUserContext } from "./runtime";

type BrandingActor = {
  userId: number;
  ipAddress?: string;
};

function conflict(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

export type TenantCompanyBranding = {
  companyPublicId: string;
  name: string;
  slug: string;
  version: number;
  logoUrl: string | null;
  hasFavicon: boolean;
};

export type PublicTenantBranding = {
  name: string;
  hasLogo: boolean;
  hasFavicon: boolean;
};

/**
 * Unauthenticated lookup for the login page: only the company display name
 * and whether a logo/favicon exists. Never exposes the storage key or any
 * other company data — the image bytes themselves are served separately via
 * /public/company-logo and /public/company-favicon, scoped to the resolved
 * tenant hostname the same way.
 */
const logoFiles = alias(tenantFiles, "logoFiles");
const faviconFiles = alias(tenantFiles, "faviconFiles");

export async function getPublicTenantBranding(companySlug: string): Promise<PublicTenantBranding | null> {
  const db = await requireDb();
  const [row] = await db.select({
    name: companies.name,
    logoStorageKey: logoFiles.storageKey,
    faviconStorageKey: faviconFiles.storageKey,
  }).from(companies)
    .leftJoin(companyBranding, eq(companyBranding.companyId, companies.id))
    .leftJoin(logoFiles, and(
      eq(logoFiles.companyId, companies.id),
      eq(logoFiles.id, companyBranding.logoTenantFileId),
      eq(logoFiles.status, "clean"),
      isNull(logoFiles.deletedAt),
    ))
    .leftJoin(faviconFiles, and(
      eq(faviconFiles.companyId, companies.id),
      eq(faviconFiles.id, companyBranding.faviconTenantFileId),
      eq(faviconFiles.status, "clean"),
      isNull(faviconFiles.deletedAt),
    ))
    .where(and(eq(companies.slug, companySlug), isNull(companies.deletedAt)))
    .limit(1);
  if (!row) return null;
  return { name: row.name, hasLogo: Boolean(row.logoStorageKey), hasFavicon: Boolean(row.faviconStorageKey) };
}

async function findCompanyAssetStorageKey(companySlug: string, asset: "logo" | "favicon") {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const column = asset === "logo" ? companyBranding.logoTenantFileId : companyBranding.faviconTenantFileId;
  const [row] = await db.select({ storageKey: tenantFiles.storageKey })
    .from(companies)
    .leftJoin(companyBranding, eq(companyBranding.companyId, companies.id))
    .leftJoin(tenantFiles, and(
      eq(tenantFiles.companyId, companies.id),
      eq(tenantFiles.id, column),
      eq(tenantFiles.status, "clean"),
      isNull(tenantFiles.deletedAt),
    ))
    .where(and(eq(companies.slug, companySlug), isNull(companies.deletedAt)))
    .limit(1);
  return row?.storageKey ?? null;
}

/**
 * Unauthenticated redirects to the current tenant's branding logo/favicon,
 * scoped to the resolved hostname the same way as everything else on the
 * tenant surface. Used on the pre-login page, so these cannot go through the
 * session-gated /manus-storage proxy.
 */
export function registerPublicCompanyLogoRoute(app: Express) {
  const respond = (asset: "logo" | "favicon") => async (_req: Request, res: Response) => {
    const host = getResolvedRequestHost(res);
    if (host?.surface !== "tenant" || !host.companySlug) {
      res.status(404).end();
      return;
    }
    try {
      const storageKey = await findCompanyAssetStorageKey(host.companySlug, asset);
      if (!storageKey) {
        res.status(404).end();
        return;
      }
      const url = await getPrivateObjectUrl(storageKey);
      res.setHeader("Cache-Control", "private, max-age=300");
      res.redirect(302, url);
    } catch {
      res.status(503).end();
    }
  };
  app.get("/public/company-logo", respond("logo"));
  app.get("/public/company-favicon", respond("favicon"));
}

/** Public branding is always read under the authenticated tenant context. */
export async function getTenantCompanyBranding(): Promise<TenantCompanyBranding> {
  const tenant = requireTenantUserContext();
  const db = await requireDb();
  const [row] = await db.select({
    publicId: companies.publicId,
    name: companies.name,
    slug: companies.slug,
    version: companies.version,
    logoStorageKey: logoFiles.storageKey,
    faviconStorageKey: faviconFiles.storageKey,
  }).from(companies)
    .leftJoin(companyBranding, eq(companyBranding.companyId, companies.id))
    .leftJoin(logoFiles, and(
      eq(logoFiles.companyId, companies.id),
      eq(logoFiles.id, companyBranding.logoTenantFileId),
      eq(logoFiles.status, "clean"),
      isNull(logoFiles.deletedAt),
    ))
    .leftJoin(faviconFiles, and(
      eq(faviconFiles.companyId, companies.id),
      eq(faviconFiles.id, companyBranding.faviconTenantFileId),
      eq(faviconFiles.status, "clean"),
      isNull(faviconFiles.deletedAt),
    ))
    .where(and(eq(companies.id, tenant.companyId), isNull(companies.deletedAt)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
  return {
    companyPublicId: row.publicId,
    name: row.name,
    slug: row.slug,
    version: row.version,
    logoUrl: row.logoStorageKey ? `/manus-storage/${row.logoStorageKey}` : null,
    hasFavicon: Boolean(row.faviconStorageKey),
  };
}

export async function updateTenantCompanyName(input: {
  name: string;
  expectedVersion: number;
}, actor: BrandingActor) {
  const tenant = requireTenantUserContext();
  const db = await requireDb();
  return db.transaction(async tx => {
    const [company] = await tx.select().from(companies).where(and(
      eq(companies.id, tenant.companyId),
      isNull(companies.deletedAt),
    )).limit(1).for("update");
    if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
    if (company.version !== input.expectedVersion) {
      conflict("Company branding changed since it was loaded. Refresh and try again.");
    }
    const name = input.name.trim();
    if (name === company.name) return { name, version: company.version };
    await tx.update(companies).set({
      name,
      version: sql`${companies.version} + 1`,
    }).where(and(eq(companies.id, company.id), eq(companies.version, input.expectedVersion)));
    await createAuditEntry({
      userId: actor.userId,
      entityType: "company_branding",
      entityId: company.publicId,
      action: "update_name",
      actionCategory: "security",
      farmId: null,
      ipAddress: actor.ipAddress,
      oldValues: { name: company.name, version: company.version },
      newValues: { name, version: company.version + 1 },
    }, tx);
    return { name, version: company.version + 1 };
  });
}

export async function uploadTenantCompanyLogo(input: {
  bytes: Buffer;
  contentType: string;
  extension: string;
  expectedVersion: number;
}, actor: BrandingActor) {
  const tenant = requireTenantUserContext();
  const uploaded = await storagePutCompanyAsset(`logo.${input.extension}`, input.bytes, input.contentType);
  try {
    const db = await requireDb();
    return await db.transaction(async tx => {
      const [company] = await tx.select().from(companies).where(and(
        eq(companies.id, tenant.companyId),
        isNull(companies.deletedAt),
      )).limit(1).for("update");
      if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
      if (company.version !== input.expectedVersion) {
        conflict("Company branding changed since it was loaded. Refresh and try again.");
      }
      const [file] = await tx.select({ id: tenantFiles.id, publicId: tenantFiles.publicId })
        .from(tenantFiles).where(and(
          eq(tenantFiles.companyId, tenant.companyId),
          eq(tenantFiles.storageKey, uploaded.key),
          isNull(tenantFiles.farmId),
          eq(tenantFiles.status, "clean"),
          isNull(tenantFiles.deletedAt),
        )).limit(1).for("update");
      if (!file) throw new TRPCError({ code: "BAD_REQUEST", message: "Logo upload is unavailable" });
      const [current] = await tx.select().from(companyBranding)
        .where(eq(companyBranding.companyId, tenant.companyId)).limit(1).for("update");
      if (current) {
        await tx.update(companyBranding).set({
          logoTenantFileId: file.id,
          version: sql`${companyBranding.version} + 1`,
          updatedByMembershipId: tenant.membershipId,
        }).where(eq(companyBranding.companyId, tenant.companyId));
      } else {
        await tx.insert(companyBranding).values({
          companyId: tenant.companyId,
          logoTenantFileId: file.id,
          updatedByMembershipId: tenant.membershipId,
        });
      }
      await tx.update(companies).set({ version: sql`${companies.version} + 1` })
        .where(and(eq(companies.id, company.id), eq(companies.version, input.expectedVersion)));
      if (current?.logoTenantFileId) {
        await tx.update(tenantFiles).set({
          status: "deleted",
          deletedAt: new Date(),
          version: sql`${tenantFiles.version} + 1`,
        }).where(and(
          eq(tenantFiles.companyId, tenant.companyId),
          eq(tenantFiles.id, current.logoTenantFileId),
          isNull(tenantFiles.deletedAt),
        ));
      }
      await createAuditEntry({
        userId: actor.userId,
        entityType: "company_branding",
        entityId: company.publicId,
        action: "upload_logo",
        actionCategory: "security",
        farmId: null,
        ipAddress: actor.ipAddress,
        oldValues: { logoConfigured: Boolean(current?.logoTenantFileId), version: company.version },
        newValues: { logoFilePublicId: file.publicId, version: company.version + 1 },
      }, tx);
      return { name: company.name, version: company.version + 1, logoUrl: uploaded.url };
    });
  } catch (error) {
    await retireCompanyAsset(uploaded.key).catch(() => undefined);
    throw error;
  }
}

export async function removeTenantCompanyLogo(input: {
  expectedVersion: number;
}, actor: BrandingActor) {
  const tenant = requireTenantUserContext();
  const db = await requireDb();
  return db.transaction(async tx => {
    const [company] = await tx.select().from(companies).where(and(
      eq(companies.id, tenant.companyId),
      isNull(companies.deletedAt),
    )).limit(1).for("update");
    if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
    if (company.version !== input.expectedVersion) {
      conflict("Company branding changed since it was loaded. Refresh and try again.");
    }
    const [current] = await tx.select().from(companyBranding)
      .where(eq(companyBranding.companyId, tenant.companyId)).limit(1).for("update");
    if (!current?.logoTenantFileId) return { version: company.version, logoUrl: null };
    await tx.update(companyBranding).set({
      logoTenantFileId: null,
      version: sql`${companyBranding.version} + 1`,
      updatedByMembershipId: tenant.membershipId,
    }).where(eq(companyBranding.companyId, tenant.companyId));
    await tx.update(companies).set({ version: sql`${companies.version} + 1` })
      .where(and(eq(companies.id, company.id), eq(companies.version, input.expectedVersion)));
    await tx.update(tenantFiles).set({
      status: "deleted",
      deletedAt: new Date(),
      version: sql`${tenantFiles.version} + 1`,
    }).where(and(
      eq(tenantFiles.companyId, tenant.companyId),
      eq(tenantFiles.id, current.logoTenantFileId),
      isNull(tenantFiles.deletedAt),
    ));
    await createAuditEntry({
      userId: actor.userId,
      entityType: "company_branding",
      entityId: company.publicId,
      action: "remove_logo",
      actionCategory: "security",
      farmId: null,
      ipAddress: actor.ipAddress,
      oldValues: { logoConfigured: true, version: company.version },
      newValues: { logoConfigured: false, version: company.version + 1 },
    }, tx);
    return { version: company.version + 1, logoUrl: null };
  });
}

export async function uploadTenantCompanyFavicon(input: {
  bytes: Buffer;
  contentType: string;
  extension: string;
  expectedVersion: number;
}, actor: BrandingActor) {
  const tenant = requireTenantUserContext();
  const uploaded = await storagePutCompanyAsset(`favicon.${input.extension}`, input.bytes, input.contentType);
  try {
    const db = await requireDb();
    return await db.transaction(async tx => {
      const [company] = await tx.select().from(companies).where(and(
        eq(companies.id, tenant.companyId),
        isNull(companies.deletedAt),
      )).limit(1).for("update");
      if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
      if (company.version !== input.expectedVersion) {
        conflict("Company branding changed since it was loaded. Refresh and try again.");
      }
      const [file] = await tx.select({ id: tenantFiles.id, publicId: tenantFiles.publicId })
        .from(tenantFiles).where(and(
          eq(tenantFiles.companyId, tenant.companyId),
          eq(tenantFiles.storageKey, uploaded.key),
          isNull(tenantFiles.farmId),
          eq(tenantFiles.status, "clean"),
          isNull(tenantFiles.deletedAt),
        )).limit(1).for("update");
      if (!file) throw new TRPCError({ code: "BAD_REQUEST", message: "Favicon upload is unavailable" });
      const [current] = await tx.select().from(companyBranding)
        .where(eq(companyBranding.companyId, tenant.companyId)).limit(1).for("update");
      if (current) {
        await tx.update(companyBranding).set({
          faviconTenantFileId: file.id,
          version: sql`${companyBranding.version} + 1`,
          updatedByMembershipId: tenant.membershipId,
        }).where(eq(companyBranding.companyId, tenant.companyId));
      } else {
        await tx.insert(companyBranding).values({
          companyId: tenant.companyId,
          faviconTenantFileId: file.id,
          updatedByMembershipId: tenant.membershipId,
        });
      }
      await tx.update(companies).set({ version: sql`${companies.version} + 1` })
        .where(and(eq(companies.id, company.id), eq(companies.version, input.expectedVersion)));
      if (current?.faviconTenantFileId) {
        await tx.update(tenantFiles).set({
          status: "deleted",
          deletedAt: new Date(),
          version: sql`${tenantFiles.version} + 1`,
        }).where(and(
          eq(tenantFiles.companyId, tenant.companyId),
          eq(tenantFiles.id, current.faviconTenantFileId),
          isNull(tenantFiles.deletedAt),
        ));
      }
      await createAuditEntry({
        userId: actor.userId,
        entityType: "company_branding",
        entityId: company.publicId,
        action: "upload_favicon",
        actionCategory: "security",
        farmId: null,
        ipAddress: actor.ipAddress,
        oldValues: { faviconConfigured: Boolean(current?.faviconTenantFileId), version: company.version },
        newValues: { faviconFilePublicId: file.publicId, version: company.version + 1 },
      }, tx);
      return { version: company.version + 1, faviconUrl: uploaded.url };
    });
  } catch (error) {
    await retireCompanyAsset(uploaded.key).catch(() => undefined);
    throw error;
  }
}

export async function removeTenantCompanyFavicon(input: {
  expectedVersion: number;
}, actor: BrandingActor) {
  const tenant = requireTenantUserContext();
  const db = await requireDb();
  return db.transaction(async tx => {
    const [company] = await tx.select().from(companies).where(and(
      eq(companies.id, tenant.companyId),
      isNull(companies.deletedAt),
    )).limit(1).for("update");
    if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
    if (company.version !== input.expectedVersion) {
      conflict("Company branding changed since it was loaded. Refresh and try again.");
    }
    const [current] = await tx.select().from(companyBranding)
      .where(eq(companyBranding.companyId, tenant.companyId)).limit(1).for("update");
    if (!current?.faviconTenantFileId) return { version: company.version };
    await tx.update(companyBranding).set({
      faviconTenantFileId: null,
      version: sql`${companyBranding.version} + 1`,
      updatedByMembershipId: tenant.membershipId,
    }).where(eq(companyBranding.companyId, tenant.companyId));
    await tx.update(companies).set({ version: sql`${companies.version} + 1` })
      .where(and(eq(companies.id, company.id), eq(companies.version, input.expectedVersion)));
    await tx.update(tenantFiles).set({
      status: "deleted",
      deletedAt: new Date(),
      version: sql`${tenantFiles.version} + 1`,
    }).where(and(
      eq(tenantFiles.companyId, tenant.companyId),
      eq(tenantFiles.id, current.faviconTenantFileId),
      isNull(tenantFiles.deletedAt),
    ));
    await createAuditEntry({
      userId: actor.userId,
      entityType: "company_branding",
      entityId: company.publicId,
      action: "remove_favicon",
      actionCategory: "security",
      farmId: null,
      ipAddress: actor.ipAddress,
      oldValues: { faviconConfigured: true, version: company.version },
      newValues: { faviconConfigured: false, version: company.version + 1 },
    }, tx);
    return { version: company.version + 1 };
  });
}
