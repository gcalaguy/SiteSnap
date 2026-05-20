import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "artifacts/mobile/src/utils/**/*.test.ts",
      "artifacts/api-server/tests/**/*.test.ts",
    ],
    environment: "node",
  },
});
