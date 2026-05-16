import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["artifacts/mobile/app/utils/**/*.test.ts"],
    environment: "node",
  },
});
