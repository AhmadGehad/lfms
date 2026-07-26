import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { VitePWA } from "vite-plugin-pwa";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map(entry => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", chunk => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

/**
 * Emits the generated PWA icons.
 *
 * They cannot live in client/public: `publicDir` is disabled for production
 * builds (that directory holds dev-only Manus tooling), so a static file there
 * would never reach dist. Emitting them keeps one source of truth and serves
 * the identical bytes from the dev server.
 */
function vitePluginPwaIcons(): Plugin {
  return {
    name: "lfms-pwa-icons",

    async buildStart() {
      // Nothing to do: icons are produced in generateBundle so a watch rebuild
      // always re-emits them.
    },

    async generateBundle() {
      const { buildPwaIcons } = await import("./scripts/pwaIcons.mjs");
      for (const icon of buildPwaIcons()) {
        this.emitFile({
          type: "asset",
          fileName: icon.fileName,
          source: icon.contents,
        });
      }
    },

    async configureServer(server: ViteDevServer) {
      const { buildPwaIcons } = await import("./scripts/pwaIcons.mjs");
      const icons = new Map(
        buildPwaIcons().map(icon => [`/${icon.fileName}`, icon.contents]),
      );
      server.middlewares.use((req, res, next) => {
        const contents = req.url ? icons.get(req.url.split("?")[0]) : undefined;
        if (!contents) return next();
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "no-cache");
        res.end(contents);
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const isDevelopmentServer = command === "serve";

  return {
    plugins: [
      react(),
      tailwindcss(),
      vitePluginPwaIcons(),
      VitePWA({
        // Hand-written service worker: the caching rules depend on how the edge
        // serves this app (see client/src/sw.ts).
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        // main.tsx registers the worker itself so it can prompt before
        // activating a new version.
        injectRegister: null,
        manifestFilename: "manifest.webmanifest",
        devOptions: { enabled: false },
        injectManifest: {
          globDirectory: path.resolve(import.meta.dirname, "dist/public"),
          globPatterns: ["index.html", "assets/**/*.{js,css,woff2}"],
          // The shell is built as index.html but served at "/" — the edge
          // renames it to tenant.html and has no /index.html route. Precaching
          // the built name would 404 on install in production.
          manifestTransforms: [
            manifest => ({
              manifest: manifest.map(entry =>
                entry.url === "index.html" ? { ...entry, url: "/" } : entry,
              ),
              warnings: [],
            }),
          ],
        },
        manifest: {
          name: "LFMS — Livestock Farm Management",
          short_name: "LFMS",
          description:
            "Record weights, vaccinations, feed and new animals in the field, even with no network.",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "portrait",
          background_color: "#F7F5EE",
          theme_color: "#182619",
          icons: [
            { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
            { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "/pwa-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
      ...(isDevelopmentServer
        ? [vitePluginManusRuntime(), vitePluginManusDebugCollector()]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    // Busts the persisted React Query cache when a new bundle ships, so a
    // deploy that changes a response shape cannot hydrate stale structures.
    // A `define` rather than an env var because envPrefix is disabled for
    // production builds (config is served at runtime instead).
    define: {
      "import.meta.env.LFMS_BUILD_ID": JSON.stringify(
        isDevelopmentServer ? "dev" : String(Date.now())
      ),
    },
    envDir: isDevelopmentServer ? path.resolve(import.meta.dirname) : false,
    envPrefix: isDevelopmentServer ? "VITE_" : "LFMS_BUILD_DISABLED_",
    root: path.resolve(import.meta.dirname, "client"),
    publicDir: isDevelopmentServer
      ? path.resolve(import.meta.dirname, "client", "public")
      : false,
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      host: true,
      allowedHosts: [
        ".manuspre.computer",
        ".manus.computer",
        ".manus-asia.computer",
        ".manuscomputer.ai",
        ".manusvm.computer",
        "localhost",
        "127.0.0.1",
      ],
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
