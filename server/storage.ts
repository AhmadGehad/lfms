// Preconfigured storage helpers for Manus WebDev templates
// Uploads via Forge Server presigned URL to S3 (PUT direct).
// Downloads return /manus-storage/{key} paths served via 307 redirect.

import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { tenantFiles } from "../drizzle/schema";
import { getDb } from "./db";
import { farms } from "../drizzle/schema";
import { generatePublicId } from "./tenancy/publicIds";
import { requireTenantUserContext } from "./tenancy/runtime";
import { tenantScope } from "./tenancy/scope";
import { assertWithinLimit, getEffectiveLimit, lockCompanyQuota } from "./entitlements/limits";
import { getPrivateObjectUrl, putPrivateObject } from "./storageBackend";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_STORAGE_IMAGE_BYTES = 10 * 1024 * 1024;

function normalizeKey(relKey: string): string {
  const key = relKey.replace(/^\/+/, "");
  if (
    !key ||
    key.length > 500 ||
    key.includes("..") ||
    key.includes("\\") ||
    !/^[A-Za-z0-9/_.,@+=-]+$/.test(key)
  ) {
    throw new Error("Invalid storage key");
  }
  return key;
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function normalizeImageType(value: string) {
  return value.toLowerCase() === "image/jpg" ? "image/jpeg" : value.toLowerCase();
}

function hasExpectedImageSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  return bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

async function putTenantImage(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
  farmId: number | null,
): Promise<{ key: string; url: string }> {
  const tenant = requireTenantUserContext();
  const normalizedType = normalizeImageType(contentType);
  if (!ALLOWED_IMAGE_TYPES.has(normalizedType)) throw new Error("Unsupported file type");
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
  if (bytes.length === 0 || bytes.length > MAX_STORAGE_IMAGE_BYTES) {
    throw new Error("Invalid file size");
  }
  if (!hasExpectedImageSignature(bytes, normalizedType)) {
    throw new Error("File content does not match its declared type");
  }
  const relativeKey = appendHashSuffix(normalizeKey(relKey));
  const db = await requireDb();
  let keyPrefix: string;
  if (farmId === null) {
    keyPrefix = `tenants/${tenant.companyPublicId}/branding`;
  } else {
    const [farm] = await db.select({ publicId: farms.publicId }).from(farms).where(and(
      eq(farms.companyId, tenant.companyId),
      eq(farms.id, farmId),
      eq(farms.status, "active"),
    )).limit(1);
    if (!farm) throw new Error("Farm not found");
    keyPrefix = `tenants/${tenant.companyPublicId}/farms/${farm.publicId}`;
  }
  const key = `${keyPrefix}/${relativeKey}`;
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  const metadataId = await db.transaction(async tx => {
    await lockCompanyQuota(tx, tenant.companyId);
    const [usage] = await tx.select({ bytes: sql<number>`COALESCE(SUM(${tenantFiles.sizeBytes}), 0)` })
      .from(tenantFiles)
      .where(and(
        eq(tenantFiles.companyId, tenant.companyId),
        inArray(tenantFiles.status, ["reserved", "uploading", "quarantine", "clean"]),
      ));
    const limit = await getEffectiveLimit(tx, tenant.companyId, "storage_limit");
    assertWithinLimit(Number(usage?.bytes ?? 0), bytes.length, limit, "storage_bytes");
    const [metadataResult] = await tx.insert(tenantFiles).values({
      publicId: generatePublicId(),
      companyId: tenant.companyId,
      farmId,
      storageKey: key,
      originalName: relativeKey.split("/").pop()?.slice(0, 255) || "image",
      contentType: normalizedType,
      sizeBytes: bytes.length,
      checksumSha256,
      status: "uploading",
      uploadedByMembershipId: tenant.membershipId,
    });
    return Number((metadataResult as { insertId?: number }).insertId);
  });

  try {
    await putPrivateObject({
      key,
      bytes,
      contentType: normalizedType,
      checksumSha256,
    });
    await db.update(tenantFiles).set({ status: "clean", verifiedAt: new Date() }).where(and(
      eq(tenantFiles.companyId, tenant.companyId),
      eq(tenantFiles.id, metadataId),
      eq(tenantFiles.status, "uploading"),
    ));

    return { key, url: `/manus-storage/${key}` };
  } catch (error) {
    await db.update(tenantFiles).set({
      status: "rejected",
      scanResult: { reason: "upload_failed" },
    }).where(and(
      eq(tenantFiles.companyId, tenant.companyId),
      eq(tenantFiles.id, metadataId),
    ));
    throw error;
  }
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const tenant = requireTenantUserContext();
  if (tenant.selectedFarmId === null) throw new Error("FARM_SELECTION_REQUIRED");
  return putTenantImage(relKey, data, contentType, tenant.selectedFarmId);
}

/** Store a company-owned image. It is never attributed to a selected farm. */
export async function storagePutCompanyAsset(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  return putTenantImage(relKey, data, contentType, null);
}

/** Retire an unreferenced branding upload after a failed optimistic update. */
export async function retireCompanyAsset(storageKey: string): Promise<void> {
  const tenant = requireTenantUserContext();
  const db = await requireDb();
  await db.update(tenantFiles).set({
    status: "deleted",
    deletedAt: new Date(),
    version: sql`${tenantFiles.version} + 1`,
  }).where(and(
    eq(tenantFiles.companyId, tenant.companyId),
    eq(tenantFiles.storageKey, normalizeKey(storageKey)),
    isNull(tenantFiles.farmId),
    isNull(tenantFiles.deletedAt),
    inArray(tenantFiles.status, ["reserved", "uploading", "quarantine", "clean", "rejected"]),
  ));
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  const tenant = requireTenantUserContext();
  const db = await requireDb();
  const [file] = await db.select({ id: tenantFiles.id })
    .from(tenantFiles)
    .where(and(
      tenantScope(tenant, tenantFiles),
      eq(tenantFiles.storageKey, key),
      eq(tenantFiles.status, "clean"),
    ))
    .limit(1);
  if (!file) throw new Error("File not found");

  return getPrivateObjectUrl(key);
}
