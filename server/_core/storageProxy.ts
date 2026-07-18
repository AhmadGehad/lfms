import type { Express } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { tenantFiles } from "../../drizzle/schema";
import { canAccessFarm } from "../../shared/tenancy";
import { getDb } from "../db";
import { resolveTenantContext } from "../tenancy/resolveTenantContext";
import { SqlTenantContextStore } from "../tenancy/sqlTenantContextStore";
import { authenticateTenantRequest } from "./auth/runtime";
import { getRequestId, getResolvedRequestHost } from "./security/httpSecurity";
import { logger } from "../observability/logger";
import { getPrivateObjectUrl } from "../storageBackend";

type ProxyFile = Pick<
  typeof tenantFiles.$inferSelect,
  "farmId" | "status" | "generatedByBackgroundJobId" | "deletedAt"
>;

export function canProxyTenantFile(
  tenant: Parameters<typeof canAccessFarm>[0],
  file: ProxyFile,
) {
  return file.status === "clean" &&
    file.generatedByBackgroundJobId === null &&
    file.deletedAt === null &&
    (file.farmId === null || canAccessFarm(tenant, file.farmId));
}

function isValidStorageKey(key: string) {
  return key.length <= 500 &&
    !key.includes("..") &&
    !key.includes("\\") &&
    /^[A-Za-z0-9/_.,@+=-]+$/.test(key);
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key || !isValidStorageKey(key)) {
      res.status(400).send("Invalid storage key");
      return;
    }

    const authentication = await authenticateTenantRequest(req).catch(() => null);
    if (!authentication) {
      res.status(401).send("Authentication required");
      return;
    }

    const host = getResolvedRequestHost(res);
    const requestedFarmHeader = req.get("x-lfms-farm");
    const requestedFarmPublicId = requestedFarmHeader === undefined
      ? null
      : /^[0-9A-HJKMNP-TV-Z]{26}$/.test(requestedFarmHeader)
        ? requestedFarmHeader
        : "invalid";
    const tenant = await resolveTenantContext({
      companySlug: host?.surface === "tenant" ? host.companySlug : null,
      principal: {
        sessionId: authentication.principal.sessionId,
        userId: authentication.user.id,
        authLevel: authentication.principal.authLevel,
      },
      requestedFarmPublicId,
      requestId: getRequestId(res),
      store: new SqlTenantContextStore(),
    }).catch(() => null);
    if (!tenant) {
      res.status(404).send("File not found");
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(503).send("Storage unavailable");
      return;
    }
    const [file] = await db.select({
      farmId: tenantFiles.farmId,
      status: tenantFiles.status,
      generatedByBackgroundJobId: tenantFiles.generatedByBackgroundJobId,
      deletedAt: tenantFiles.deletedAt,
    })
      .from(tenantFiles)
      .where(and(
        eq(tenantFiles.companyId, tenant.companyId),
        eq(tenantFiles.storageKey, key),
        eq(tenantFiles.status, "clean"),
        isNull(tenantFiles.generatedByBackgroundJobId),
        isNull(tenantFiles.deletedAt),
      ))
      .limit(1);
    if (!file || !canProxyTenantFile(tenant, file)) {
      res.status(404).send("File not found");
      return;
    }

    try {
      const url = await getPrivateObjectUrl(key);

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      logger.error("storage.proxy_failed", { error: err });
      res.status(502).send("Storage proxy error");
    }
  });
}
