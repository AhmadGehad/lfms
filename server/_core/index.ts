import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerPasswordAuthRoutes } from "./passwordAuth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV } from "./env";
import {
  getOAuthStateSecret,
  hasPlatformOidcConfiguration,
  validateProductionAuthConfiguration,
} from "./auth/runtime";
import { csrfProtectionMiddleware } from "./security/csrf";
import {
  exactCorsMiddleware,
  hostValidationMiddleware,
  parseAllowedOrigins,
  requestIdMiddleware,
  requireSurface,
  securityHeadersMiddleware,
} from "./security/httpSecurity";
import { registerPlatformApi } from "../platform/http";
import { registerPlatformManusAuthRoutes } from "../platform/manusAuth";
import { registerPlatformOidcRoutes } from "../platform/oidc";
import { registerPlatformPasswordAuthRoutes } from "../platform/passwordAuth";
import { registerObservabilityRoutes, requestObservabilityMiddleware } from "../observability/http";
import { logger } from "../observability/logger";
import { validateLocalDevAuthConfiguration } from "./devAuth";
import { closeDatabasePool } from "../db";
import { closeStorageBackend } from "../storageBackend";
import { registerPublicRuntimeConfig } from "./publicRuntimeConfig";
import { registerPublicCompanyLogoRoute } from "../tenancy/branding";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  validateLocalDevAuthConfiguration();
  validateProductionAuthConfiguration();
  if (!ENV.ownerOpenId) {
    logger.warn("auth.owner_recovery_disabled");
  } else {
    logger.info("auth.owner_recovery_enabled");
  }
  const app = express();
  const trustedProxy = ENV.enableLocalDevAuth
    ? false
    : ENV.isCloudflareContainer
      ? 1
      : ENV.trustedProxyCidrs.length > 0
      ? ENV.trustedProxyCidrs
      : ENV.isProduction ? false : ["loopback"];
  app.set("trust proxy", trustedProxy);
  app.disable("x-powered-by");
  const configuredDevelopmentOrigins = parseAllowedOrigins([
    ...ENV.allowedTenantOrigins,
    ENV.adminOrigin,
  ]);
  const allowedOrigins = ENV.isProduction
    ? new Set<string>()
    : configuredDevelopmentOrigins;
  app.use(requestIdMiddleware({ trustEdgeHeader: ENV.isCloudflareContainer }));
  app.use(securityHeadersMiddleware({
    isProduction: ENV.isProduction,
    analyticsEndpoint: process.env.VITE_ANALYTICS_ENDPOINT,
    scriptOrigins: ENV.cspScriptOrigins,
    connectOrigins: [
      ...ENV.cspConnectOrigins,
      ENV.objectStorageEndpoint,
    ],
    imageOrigins: [
      ...ENV.cspImageOrigins,
      ENV.objectStorageEndpoint,
    ],
    mediaOrigins: [ENV.objectStorageEndpoint],
  }));
  // Derive additional tenant hostnames from ALLOWED_TENANT_ORIGINS (strip protocol)
  // This allows the Manus internal domain (e.g. livestockms-boywmbm5.manus.space)
  // and any other explicitly allowed origins to be treated as tenant surface
  // even when BASE_DOMAIN is a custom domain like l-fms.com.
  const additionalTenantHostnames = ENV.allowedTenantOrigins
    .map(origin => { try { return new URL(origin).hostname; } catch { return origin; } })
    .filter(Boolean);
  app.use(hostValidationMiddleware({
    baseDomain: ENV.baseDomain,
    // The bare domain serves the marketing landing page in every environment;
    // API tenant resolution still requires a company subdomain.
    allowLegacyBareDomain: true,
    allowDevelopmentPorts: !ENV.isProduction,
    additionalTenantHostnames,
  }));
  app.use(requestObservabilityMiddleware());
  app.use(exactCorsMiddleware(allowedOrigins));
  registerPublicRuntimeConfig(app);
  registerPublicCompanyLogoRoute(app);
  const server = createServer(app);
  registerObservabilityRoutes(app);
  app.use(express.json({ limit: "12mb", strict: true }));
  app.use(express.urlencoded({ limit: "1mb", extended: true, parameterLimit: 1_000 }));
  app.use("/manus-storage", requireSurface("tenant"));
  registerStorageProxy(app);
  app.use("/api/dev", requireSurface("tenant"));
  app.use("/api/oauth", requireSurface("tenant"));
  registerOAuthRoutes(app);
  app.use("/api/auth", requireSurface("tenant"));
  registerPasswordAuthRoutes(app);
  app.use("/api/platform/auth", requireSurface("platform"));
  if (hasPlatformOidcConfiguration()) registerPlatformOidcRoutes(app);
  else registerPlatformManusAuthRoutes(app);
  registerPlatformPasswordAuthRoutes(app);
  app.use(
    "/api/platform/trpc",
    requireSurface("platform"),
    csrfProtectionMiddleware({
      audience: "platform",
      secret: getOAuthStateSecret(),
      allowedOrigins,
    }),
  );
  registerPlatformApi(app);
  // tRPC API
  app.use(
    "/api/trpc",
    requireSurface("tenant"),
    csrfProtectionMiddleware({
      audience: "tenant",
      secret: getOAuthStateSecret(),
      allowedOrigins,
    }),
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files.
  // vite is a devDependency pruned in production, so its module MUST be
  // loaded via dynamic import to avoid ERR_MODULE_NOT_FOUND at startup.
  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    const { serveStatic } = await import("./staticServe");
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  if (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  const port = ENV.isProduction
    ? preferredPort
    : await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    logger.warn("server.preferred_port_unavailable", { preferredPort, port });
  }

  const listenHost = ENV.enableLocalDevAuth ? "127.0.0.1" : undefined;
  server.listen(port, listenHost, () => {
    logger.info("server.started", { port, host: listenHost ?? "all" });
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("server.shutdown_started", { signal });

    const forceTimer = setTimeout(() => {
      logger.error("server.shutdown_forced", { signal });
      server.closeAllConnections();
      process.exit(1);
    }, Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 30_000));
    forceTimer.unref();

    server.close(async error => {
      try {
        closeStorageBackend();
        await closeDatabasePool();
      } catch (closeError) {
        logger.error("server.database_shutdown_failed", {
          signal,
          errorName: closeError instanceof Error ? closeError.name : "NonErrorThrown",
        });
        process.exitCode = 1;
      } finally {
        clearTimeout(forceTimer);
      }
      if (error) {
        logger.error("server.shutdown_failed", {
          signal,
          errorName: error.name,
        });
        process.exitCode = 1;
        return;
      }
      logger.info("server.shutdown_complete", { signal });
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

startServer().catch(error => {
  logger.error("server.start_failed", { error });
  process.exitCode = 1;
});
