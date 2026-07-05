import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sharedRoot = fileURLToPath(new URL("../../packages/shared/src", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@amono/shared/accounting", replacement: resolve(sharedRoot, "accounting/index.ts") },
      { find: "@amono/shared/game", replacement: resolve(sharedRoot, "game/index.ts") },
      { find: "@amono/shared", replacement: resolve(sharedRoot, "index.ts") },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000",
      "/socket.io": { target: "http://localhost:5000", ws: true },
    },
  },
  build: {
    outDir: "dist",
  },
});
