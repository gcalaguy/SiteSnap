/**
 * E2E Playwright tests for the invite-link onboarding flow.
 *
 * These tests verify that the auth-bounce fix works correctly end-to-end:
 *   1. When a user visits /onboarding?token=X the Join tab is active and the
 *      token input is pre-filled — the token is also persisted to localStorage
 *      synchronously so it survives an SSO redirect.
 *   2. After an SSO bounce the token is no longer in the URL but IS in
 *      localStorage.  The page must still activate the Join tab and pre-fill
 *      the token input from localStorage.
 *
 * No Clerk sign-in is required because /onboarding is an auth-exempt route
 * (see ONBOARDING_EXEMPT_ROUTES in auth-guard.tsx).  The token pre-fill and
 * tab-selection logic runs purely on the client before any auth check.
 *
 * Run:
 *   pnpm --filter @workspace/web-dashboard run test:e2e
 */

import { test, expect } from "@playwright/test";

const INVITE_TOKEN_KEY = "sitesnap_pending_invite_token";

test.describe("Invite link — auth-bounce fix", () => {
  test.describe("Scenario 1: token arrives via URL query param", () => {
    test("activates Join tab and pre-fills token input from URL", async ({ page }) => {
      const token = "TESTTOKEN_URL_" + Date.now();

      await page.goto(`/onboarding?token=${token}`);

      // Wait for React to hydrate — the tab label must be visible.
      const joinTab = page.getByRole("tab", { name: "Join Existing" });
      await expect(joinTab).toBeVisible({ timeout: 8_000 });

      // The Join tab must be selected (aria-selected="true").
      await expect(joinTab).toHaveAttribute("data-state", "active");

      // The token input must be pre-filled with the URL token.
      const tokenInput = page.locator("#token");
      await expect(tokenInput).toBeVisible();
      await expect(tokenInput).toHaveValue(token);

      // The token must also have been persisted to localStorage so it
      // survives a Clerk SSO redirect (the core of the auth-bounce fix).
      const stored = await page.evaluate(
        (key) => window.localStorage.getItem(key),
        INVITE_TOKEN_KEY,
      );
      expect(stored).toBe(token);
    });
  });

  test.describe("Scenario 2: post-SSO bounce — token only in localStorage", () => {
    test("activates Join tab and pre-fills token input from localStorage after SSO bounce", async ({ page }) => {
      const token = "TESTTOKEN_LS_" + Date.now();

      // Simulate what happens after a Clerk SSO redirect:
      // 1. The token was written to localStorage on the first visit (scenario 1).
      // 2. Clerk opened an SSO popup / redirect that navigated away.
      // 3. The user lands back on /onboarding — but WITHOUT the token query param.
      //
      // We replicate step 1 & 3 by pre-seeding localStorage and then navigating
      // to the bare /onboarding path.
      await page.goto("/onboarding");

      // Seed localStorage to simulate what the first visit would have written.
      await page.evaluate(
        ([key, value]) => window.localStorage.setItem(key, value),
        [INVITE_TOKEN_KEY, token] as [string, string],
      );

      // Reload without the query param — the page should read from localStorage.
      await page.reload();

      // Wait for React to hydrate.
      const joinTab = page.getByRole("tab", { name: "Join Existing" });
      await expect(joinTab).toBeVisible({ timeout: 8_000 });

      // The Join tab must be selected.
      await expect(joinTab).toHaveAttribute("data-state", "active");

      // The token input must show the value recovered from localStorage.
      const tokenInput = page.locator("#token");
      await expect(tokenInput).toBeVisible();
      await expect(tokenInput).toHaveValue(token);
    });
  });
});
