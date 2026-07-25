/**
 * E2E Playwright tests for the onboarding flow.
 *
 * Three critical paths are covered:
 *   1. A signed-in user with no company is always redirected to /onboarding
 *      (never silently dropped on a blank page or stuck on a spinner).
 *   2. A brand-new user can complete the company-creation form and reach /dashboard.
 *   3. A user with a valid invite token can accept it and reach their workspace.
 *
 * Prerequisites (same as auth-guard.spec.ts):
 *   1. The dev server must be running (handled by the workflow).
 *   2. Set E2E_CLERK_TEST_EMAIL to a +clerk_test@ address in your Clerk dev
 *      instance so Clerk skips the real OTP flow.
 *   3. CLERK_SECRET_KEY must be set so @clerk/testing can mint sign-in tokens.
 *
 * Route mocking via page.route() simulates new-user and company-less states
 * without requiring a disposable DB fixture or a second test Clerk account.
 * All mocks are scoped to the test's page instance and do not affect other tests.
 *
 * Run:
 *   pnpm --filter @workspace/web-dashboard run test:e2e
 */

import { test, expect, type Page } from "@playwright/test";
import {
  clerkSetup,
  setupClerkTestingToken,
  clerk,
} from "@clerk/testing/playwright";

const TEST_EMAIL = process.env.E2E_CLERK_TEST_EMAIL ?? "";

test.beforeAll(async () => {
  await clerkSetup();
});

// ── Shared fixtures ───────────────────────────────────────────────────────────

/**
 * Minimal /api/users/me response with no company.
 * Simulates the state of a brand-new user who has signed up but not yet
 * created or joined a company.
 */
function companyLessUser() {
  return {
    id: 1,
    clerkUserId: "user_test",
    email: TEST_EMAIL || "test@example.com",
    firstName: "Test",
    lastName: "User",
    activeCompanyId: null,
    role: "owner",
    termsAcceptedAt: new Date().toISOString(),
  };
}

/**
 * Same user shape, but with an activeCompanyId — returned after the user
 * successfully creates a company or accepts an invitation.
 */
function userWithCompany() {
  return { ...companyLessUser(), activeCompanyId: 99 };
}

/**
 * Performs a Clerk test sign-in, re-using the same pattern as auth-guard.spec.ts.
 * Mocks registered with page.route() before this call stay active throughout
 * the subsequent Clerk flow.
 */
async function signInWithClerk(page: Page) {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({
    page,
    signInParams: { strategy: "email_code", identifier: TEST_EMAIL },
  });
}

// ── Suite 1: Redirect protection — company-less user ─────────────────────────

test.describe("Onboarding — redirect protection", () => {
  test.skip(
    !TEST_EMAIL,
    "E2E_CLERK_TEST_EMAIL is not set — skipping Clerk E2E tests"
  );

  test(
    "redirects a signed-in user with no company from the root to /onboarding",
    async ({ page }) => {
      // Register the mock BEFORE the first page.goto() so every /api/users/me
      // call in this session returns a company-less user.
      await page.route("**/api/users/me", (route) =>
        route.fulfill({ status: 200, json: companyLessUser() })
      );

      await signInWithClerk(page);

      // AuthGuard resolves the mock, sees activeCompanyId === null, and must
      // redirect the user to /onboarding.
      await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });

      // The loading spinner must not be stuck — the redirect happened cleanly.
      await expect(
        page.getByText("Loading your workspace...")
      ).not.toBeVisible();

      // The 15-second error card must not appear.
      await expect(
        page.getByText("Could not connect to your workspace")
      ).not.toBeVisible();
    }
  );

  test(
    "a company-less user already on /onboarding is never redirected away (no infinite loop)",
    async ({ page }) => {
      await page.route("**/api/users/me", (route) =>
        route.fulfill({ status: 200, json: companyLessUser() })
      );

      await signInWithClerk(page);

      // Wait for the initial redirect to land on /onboarding
      await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });

      // Allow any async redirect effects to settle
      await page.waitForTimeout(1_500);

      // Still on /onboarding — no redirect loop back to /sign-in or elsewhere
      await expect(page).toHaveURL(/\/onboarding/);

      // The page must have rendered correctly with the tabs visible
      await expect(
        page.getByRole("tab", { name: "Create Company" })
      ).toBeVisible({ timeout: 5_000 });
    }
  );
});

// ── Suite 2: Company creation onboarding form ────────────────────────────────

test.describe("Onboarding — company creation", () => {
  test.skip(
    !TEST_EMAIL,
    "E2E_CLERK_TEST_EMAIL is not set — skipping Clerk E2E tests"
  );

  test(
    "new user fills the create-company form, submits, and reaches /dashboard",
    async ({ page }) => {
      // Mutable flag: flips to true once POST /api/companies fires.
      // The /api/users/me mock checks this flag to simulate the query
      // invalidation that follows a successful company creation.
      let companyCreated = false;

      await page.route("**/api/users/me", (route) =>
        companyCreated
          ? route.fulfill({ status: 200, json: userWithCompany() })
          : route.fulfill({ status: 200, json: companyLessUser() })
      );

      // Sync upsert called by the onboarding page before company creation
      await page.route("**/api/users/sync", (route) =>
        route.fulfill({ status: 200, json: companyLessUser() })
      );

      // Company creation endpoint — flips the flag so subsequent /me calls
      // return the user with a company, mirroring the real query invalidation.
      await page.route("**/api/companies", async (route) => {
        if (route.request().method() === "POST") {
          companyCreated = true;
          return route.fulfill({
            status: 201,
            json: { id: 99, name: "Test Construction Co." },
          });
        }
        return route.continue();
      });

      await signInWithClerk(page);

      // AuthGuard detects no company and redirects to /onboarding
      await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });

      // Activate the Create Company tab
      const createTab = page.getByRole("tab", { name: "Create Company" });
      await expect(createTab).toBeVisible({ timeout: 8_000 });
      await createTab.click();
      await expect(createTab).toHaveAttribute("data-state", "active");

      // Fill in the company creation form
      // Province is a plain text input (two-letter abbreviation like "ON").
      await page.getByLabel("Company Name").fill("Test Construction Co.");
      await page.getByLabel("City").fill("Toronto");
      await page.getByLabel("Province").fill("ON");

      // The submit button shows "Create Company" when the user is signed in.
      // Use .first() to target the tab form's button, not any button in the header.
      const submitBtn = page
        .getByRole("button", { name: "Create Company" })
        .first();
      await expect(submitBtn).toBeEnabled();
      await submitBtn.click();

      // After successful creation the app calls setLocation("/dashboard").
      // AuthGuard re-fetches /api/users/me, gets userWithCompany(), and lets
      // the user through.
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

      // Confirm the POST was actually made (not a silent no-op)
      expect(companyCreated).toBe(true);
    }
  );
});

// ── Suite 3: Invite token acceptance ─────────────────────────────────────────

test.describe("Onboarding — invite token acceptance", () => {
  test.skip(
    !TEST_EMAIL,
    "E2E_CLERK_TEST_EMAIL is not set — skipping Clerk E2E tests"
  );

  /**
   * A deterministic token string that is safe to use in URLs.
   * Must not be a real token so it does not pollute the dev DB even if the
   * mock somehow fails to intercept the request.
   */
  const INVITE_TOKEN = "E2E_PLAYWRIGHT_INVITE_TOKEN";
  const INVITE_TOKEN_KEY = "sitesnap_pending_invite_token";

  test(
    "join form is pre-filled with the invite token and the Join Company button is visible",
    async ({ page }) => {
      // Preflight validation — the page issues GET /api/invitations/:token on
      // mount to check whether the token is still valid before submit.
      await page.route(`**/api/invitations/${INVITE_TOKEN}`, (route) =>
        route.fulfill({
          status: 200,
          json: {
            status: "pending",
            email: TEST_EMAIL,
            companyName: "Acme Construction",
          },
        })
      );

      await page.route("**/api/users/me", (route) =>
        route.fulfill({ status: 200, json: companyLessUser() })
      );

      await signInWithClerk(page);

      // Navigate to /onboarding with the invite token in the URL
      await page.goto(`/onboarding?token=${INVITE_TOKEN}`);

      // The Join Existing tab must activate automatically when a token is present
      const joinTab = page.getByRole("tab", { name: "Join Existing" });
      await expect(joinTab).toBeVisible({ timeout: 8_000 });
      await expect(joinTab).toHaveAttribute("data-state", "active");

      // The token input (#token) must be pre-filled from the URL parameter
      const tokenInput = page.locator("#token");
      await expect(tokenInput).toBeVisible();
      await expect(tokenInput).toHaveValue(INVITE_TOKEN);

      // The token must also be persisted to localStorage so it survives a
      // Clerk SSO redirect (this is the core of the auth-bounce fix).
      const stored = await page.evaluate(
        (key) => window.localStorage.getItem(key),
        INVITE_TOKEN_KEY
      );
      expect(stored).toBe(INVITE_TOKEN);

      // The Join Company button must be visible and enabled — the preflight
      // validation returned "pending" so no error banner should block it.
      const joinBtn = page.getByRole("button", { name: "Join Company" });
      await expect(joinBtn).toBeVisible();
      await expect(joinBtn).toBeEnabled();
    }
  );

  test(
    "accepting a valid invite token redirects the user to /dashboard",
    async ({ page }) => {
      let tokenAccepted = false;

      // Preflight validation
      await page.route(`**/api/invitations/${INVITE_TOKEN}`, (route) =>
        route.fulfill({
          status: 200,
          json: {
            status: "pending",
            email: TEST_EMAIL,
            companyName: "Acme Construction",
          },
        })
      );

      // Invite acceptance — POST /api/invitations/:token/accept
      await page.route(`**/api/invitations/${INVITE_TOKEN}/accept`, (route) => {
        tokenAccepted = true;
        return route.fulfill({
          status: 200,
          json: { success: true, companyId: 99, companyName: "Acme Construction" },
        });
      });

      // Sync upsert — called by onJoin before doAccept()
      await page.route("**/api/users/sync", (route) =>
        route.fulfill({ status: 200, json: companyLessUser() })
      );

      // /api/users/me transitions from company-less → has-company after the
      // invite is accepted, mirroring the real query invalidation.
      await page.route("**/api/users/me", (route) =>
        tokenAccepted
          ? route.fulfill({ status: 200, json: userWithCompany() })
          : route.fulfill({ status: 200, json: companyLessUser() })
      );

      await signInWithClerk(page);

      // Navigate to /onboarding with the invite token
      await page.goto(`/onboarding?token=${INVITE_TOKEN}`);

      // Wait for the Join tab to be active and preflight to finish
      const joinTab = page.getByRole("tab", { name: "Join Existing" });
      await expect(joinTab).toHaveAttribute("data-state", "active", {
        timeout: 8_000,
      });

      // The Join Company button must be enabled once preflight validation passes
      const joinBtn = page.getByRole("button", { name: "Join Company" });
      await expect(joinBtn).toBeEnabled({ timeout: 8_000 });

      // Submit the join form
      await joinBtn.click();

      // After successful acceptance, the app calls setLocation("/dashboard").
      // AuthGuard re-fetches /api/users/me, sees activeCompanyId: 99, and lets
      // the user through.
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

      // Confirm the acceptance request was made — not a silent no-op.
      expect(tokenAccepted).toBe(true);
    }
  );
});
