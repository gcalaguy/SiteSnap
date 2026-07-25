/**
 * E2E Playwright tests for the AuthGuard component.
 *
 * These tests exercise the full sign-in → workspace loading flow in a real
 * browser against the running dev server, catching regressions that component
 * tests with mocked hooks cannot detect (e.g. a broken Clerk token relay,
 * a mis-configured API route, or a broken retry on the /api/users/me call).
 *
 * Prerequisites:
 *   1. The dev server must be running (handled by the workflow).
 *   2. Set E2E_CLERK_TEST_EMAIL to the email of a Clerk user in your dev
 *      instance. The address must end with +clerk_test@<domain> so Clerk
 *      recognises it as a test email and skips the real OTP flow.
 *   3. CLERK_SECRET_KEY must be set so @clerk/testing can mint sign-in tokens.
 *
 * Run:
 *   pnpm --filter @workspace/web-dashboard run test:e2e
 */

import { test, expect } from "@playwright/test";
import { clerkSetup, setupClerkTestingToken, clerk } from "@clerk/testing/playwright";

const TEST_EMAIL = process.env.E2E_CLERK_TEST_EMAIL ?? "";

test.beforeAll(async () => {
  await clerkSetup();
});

test.describe("AuthGuard — login and workspace loading", () => {
  test.skip(
    !TEST_EMAIL,
    "E2E_CLERK_TEST_EMAIL is not set — skipping Clerk E2E tests"
  );

  test("signs in and loads the dashboard within 10 seconds", async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto("/");

    await clerk.signIn({
      page,
      signInParams: {
        strategy: "email_code",
        identifier: TEST_EMAIL,
      },
    });

    // The AuthGuard should resolve and redirect to /dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    // The loading spinner must no longer be visible
    await expect(
      page.getByText("Loading your workspace...")
    ).not.toBeVisible();

    // The "Could not connect" error card must not appear
    await expect(
      page.getByText("Could not connect to your workspace")
    ).not.toBeVisible();
  });
});
