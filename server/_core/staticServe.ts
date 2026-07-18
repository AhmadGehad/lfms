import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { getResolvedRequestHost } from "./security/httpSecurity";
import { setHtmlDocumentHeaders } from "./htmlResponse";

// Production static serving. This module must stay free of vite imports:
// vite is a devDependency pruned from production installs, and any module in
// the production import graph that touches it crashes startup.
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

  const staticOptions: NonNullable<Parameters<typeof express.static>[1]> = {
    fallthrough: true,
    setHeaders(response, filePath) {
      if (path.extname(filePath).toLowerCase() === ".html") {
        setHtmlDocumentHeaders(response);
      }
    },
  };
  const tenantStatic = express.static(tenantDistPath, staticOptions);
  const adminStatic = express.static(adminDistPath, staticOptions);
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
    setHtmlDocumentHeaders(res);
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
