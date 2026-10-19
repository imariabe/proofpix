import path from "path";
import { defineConfig } from "vitest/config";

// Standalone config so tests never load vite.config.ts (no dev plugins, no
// HMR concerns) — the forensics engine is pure logic and runs in Node.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
