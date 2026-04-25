import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const currentDir = dirname(fileURLToPath(import.meta.url));

const summaryRouteRewritePlugin: Plugin = {
  name: "summary-route-rewrite",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === "/summary" || req.url?.startsWith("/summary?")) {
        req.url = req.url.replace(/^\/summary(?=\?|$)/, "/summary/");
      }

      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === "/summary" || req.url?.startsWith("/summary?")) {
        req.url = req.url.replace(/^\/summary(?=\?|$)/, "/summary/");
      }

      next();
    });
  }
};

export default defineConfig({
  envDir: resolve(currentDir, "../.."),
  plugins: [react(), summaryRouteRewritePlugin],
  resolve: {
    alias: {
      "@guaita/shared": resolve(currentDir, "../../packages/shared/src/index.ts")
    }
  },
  server: {
    host: "0.0.0.0",
    port: 5173
  }
});
