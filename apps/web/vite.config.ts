import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  envDir: resolve(currentDir, "../.."),
  plugins: [react()],
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
