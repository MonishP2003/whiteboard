import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Konva's Node entry needs the native `canvas` package. The browser build imports
      // fine in Node; tests inject text measurement instead of using it.
      konva: path.resolve(import.meta.dirname, "node_modules/konva/lib/index.js"),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
