import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ENV } from "./env";
import {
  getOAuthStateSecret,
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
import { registerPlatformOidcRoutes } from "../platform/oidc";
import { registerObservabilityRoutes, requestObservabilityMiddleware } from "../observability/http";
import { logger } from "../observability/logger";
import { validateLocalDevAuthConfiguration } from "./devAuth";

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
    : ENV.trustedProxyCidrs.length > 0
      ? ENV.trustedProxyCidrs
      : ENV.isProduction ? false : ["loopback"];
  app.set("trust proxy", trustedProxy);
  app.disable("x-powered-by");
  const configuredDevelopmentOrigins = parseAllowedOrigins([
    ...ENV.allowedTenantOrigins,
    ENV.adminOrigin,
    ENV.authOrigin,
  ]);
  const allowedOrigins = ENV.isProduction
    ? new Set<string>()
    : configuredDevelopmentOrigins;
  app.use(requestIdMiddleware());
  app.use(securityHeadersMiddleware({
    isProduction: ENV.isProduction,
    analyticsEndpoint: process.env.VITE_ANALYTICS_ENDPOINT,
    scriptOrigins: ENV.cspScriptOrigins,
    connectOrigins: ENV.cspConnectOrigins,
    imageOrigins: ENV.cspImageOrigins,
  }));
  app.use(hostValidationMiddleware({
    baseDomain: ENV.baseDomain,
    allowLegacyBareDomain: !ENV.isProduction,
    allowDevelopmentPorts: !ENV.isProduction,
  }));
  app.use(requestObservabilityMiddleware());
  app.use(exactCorsMiddleware(allowedOrigins));
  const server = createServer(app);
  registerObservabilityRoutes(app);
  app.use(express.json({ limit: "12mb", strict: true }));
  app.use(express.urlencoded({ limit: "1mb", extended: true, parameterLimit: 1_000 }));
  app.use("/manus-storage", requireSurface("tenant"));
  registerStorageProxy(app);
  app.use("/api/dev", requireSurface("tenant"));
  app.use("/api/oauth", requireSurface("tenant"));
  registerOAuthRoutes(app);
  app.use("/api/platform/auth", requireSurface("platform"));
  registerPlatformOidcRoutes(app);
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
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
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
      process.exitCode = 1;
    }, Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 30_000));
    forceTimer.unref();

    server.close(error => {
      clearTimeout(forceTimer);
      if (error) {
        logger.error("server.shutdown_failed", { signal, error });
        process.exitCode = 1;
      } else {
        logger.info("server.shutdown_complete", { signal });
      }
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

startServer().catch(error => {
  logger.error("server.start_failed", { error });
  process.exitCode = 1;
});
