import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import adminViteConfig from "../../vite.admin.config";
import { getResolvedRequestHost } from "./security/httpSecurity";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  // The Admin portal is a separate SPA. Serve it on the platform surface
  // (admin.<BASE_DOMAIN>) so the dev server matches production routing;
  // a distinct HMR websocket path keeps the two Vite instances apart.
  const adminVite = await createViteServer({
    ...adminViteConfig,
    configFile: false,
    // Own dependency-optimizer cache: sharing node_modules/.vite with the
    // tenant instance causes "504 Outdated Optimize Dep" module failures.
    cacheDir: path.resolve(import.meta.dirname, "../..", "node_modules", ".vite-admin"),
    server: {
      middlewareMode: true,
      hmr: { server, path: "/__admin_hmr" },
      allowedHosts: true as const,
    },
    appType: "custom",
  });

  app.use((req, res, next) => {
    const surface = getResolvedRequestHost(res)?.surface;
    if (surface === "platform") return adminVite.middlewares(req, res, next);
    return vite.middlewares(req, res, next);
  });
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    const isPlatform = getResolvedRequestHost(res)?.surface === "platform";

    try {
      if (isPlatform) {
        const adminTemplate = path.resolve(
          import.meta.dirname,
          "../..",
          "admin",
          "index.html"
        );
        const template = await fs.promises.readFile(adminTemplate, "utf-8");
        const page = await adminVite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(page);
        return;
      }
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const tenantDistPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  const adminDistPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "admin")
      : path.resolve(import.meta.dirname, "admin");
  if (!fs.existsSync(tenantDistPath) || !fs.existsSync(adminDistPath)) {
    throw new Error("Tenant/admin build directories are missing; run the full production build");
  }

  const tenantStatic = express.static(tenantDistPath, { fallthrough: true });
  const adminStatic = express.static(adminDistPath, { fallthrough: true });
  app.use((req, res, next) => {
    const host = getResolvedRequestHost(res);
    return host?.surface === "platform"
      ? adminStatic(req, res, next)
      : tenantStatic(req, res, next);
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    const host = getResolvedRequestHost(res);
    const distPath = host?.surface === "platform" ? adminDistPath : tenantDistPath;
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
