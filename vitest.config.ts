import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react() as any],
  test: {
    include: [
      "artifacts/mobile/src/utils/**/*.test.ts",
      "artifacts/api-server/tests/**/*.test.ts",
      "artifacts/web-dashboard/tests/**/*.test.tsx",
      "artifacts/web-dashboard/tests/**/*.test.ts",
    ],
    environment: "node",
    setupFiles: ["./artifacts/web-dashboard/tests/setup.ts"],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "artifacts/web-dashboard/src"),
    },
  },
});
