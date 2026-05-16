import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["artifacts/mobile/src/utils/**/*.test.ts"],
    environment: "node",
  },
});
