import { defineConfig, devices } from "@playwright/test";

/**
 * E2E Playwright configuration for the web-dashboard auth-guard tests.
 *
 * Required environment variables:
 *   CLERK_PUBLISHABLE_KEY  — Clerk frontend key (already required for the app)
 *   CLERK_SECRET_KEY       — Clerk backend key (used by @clerk/testing to create tokens)
 *   E2E_CLERK_TEST_EMAIL   — Email of a Clerk test user in the dev instance.
 *                            Must be a "test email" — i.e. the address ends with
 *                            +clerk_test@<domain> so Clerk allows code bypass.
 *
 * Run:
 *   pnpm --filter @workspace/web-dashboard run test:e2e
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:80",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
