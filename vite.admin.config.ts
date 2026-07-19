import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
  const isDevelopmentServer = command === "serve";
  return {
    plugins: [react(), tailwindcss()],
    root: path.resolve(import.meta.dirname, "admin"),
    envDir: isDevelopmentServer ? import.meta.dirname : false,
    envPrefix: isDevelopmentServer ? "VITE_" : "LFMS_BUILD_DISABLED_",
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@admin": path.resolve(import.meta.dirname, "admin", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
      },
    },
    build: {
      outDir: path.resolve(import.meta.dirname, "dist", "admin"),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (
              id.includes("@trpc") ||
              id.includes("@tanstack") ||
              id.includes("superjson")
            )
              return "data-client";
            if (id.includes("@radix-ui") || id.includes("sonner"))
              return "ui-primitives";
            if (id.includes("lucide-react")) return "icons";
            return undefined;
          },
        },
      },
    },
    server: {
      host: true,
      port: 3010,
      strictPort: true,
      proxy: {
        "/api/platform": {
          target: "http://localhost:3000",
          changeOrigin: false,
        },
      },
      fs: {
        strict: true,
        allow: [import.meta.dirname],
        deny: ["**/.*"],
      },
    },
  };
});
