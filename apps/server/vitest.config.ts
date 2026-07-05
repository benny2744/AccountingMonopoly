import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@amono/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
});
