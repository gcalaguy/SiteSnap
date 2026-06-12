// @vitest-environment jsdom
/**
 * Tests for AuthGuard redirect-loop prevention.
 *
 * Covers:
 *  1. Unit: ONBOARDING_EXEMPT_ROUTES / isExemptRoute — imports the REAL exports
 *     from auth-guard.tsx so any change to the actual list is caught here.
 *  2. Component: AuthGuard redirect behaviour — verifies that a company-less user
 *     on /onboarding is NOT redirected, and that other routes ARE redirected.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";

// ── Import the REAL constant and helper from auth-guard ───────────────────────
import {
  ONBOARDING_EXEMPT_ROUTES,
  isExemptRoute,
  AuthGuard,
} from "../src/components/auth-guard";

// ── Mock external dependencies ───────────────────────────────────────────────

vi.mock("@clerk/react", () => ({
  useUser: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetMe: vi.fn(),
  useSyncUser: vi.fn(),
  getGetMeQueryKey: vi.fn(() => ["me"]),
}));

vi.mock("wouter", () => ({
  useLocation: vi.fn(),
}));

vi.mock("@/components/TermsModal", () => ({
  TermsModal: () => null,
}));

import { useUser } from "@clerk/react";
import { useGetMe, useSyncUser } from "@workspace/api-client-react";
import { useLocation } from "wouter";

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const mockClerkUser = {
  id: "clerk_test",
  primaryEmailAddress: { emailAddress: "test@example.com" },
  firstName: "Test",
  lastName: "User",
};

const mockSyncUser = {
  mutate: vi.fn(),
  isPending: false,
  isError: false,
};

function setupMocks({
  location,
  dbUser,
}: {
  location: string;
  dbUser: object | null;
}) {
  const setLocation = vi.fn();

  (useUser as ReturnType<typeof vi.fn>).mockReturnValue({
    user: mockClerkUser,
    isLoaded: true,
    isSignedIn: true,
  });

  (useGetMe as ReturnType<typeof vi.fn>).mockReturnValue({
    data: dbUser,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });

  (useSyncUser as ReturnType<typeof vi.fn>).mockReturnValue(mockSyncUser);

  (useLocation as ReturnType<typeof vi.fn>).mockReturnValue([
    location,
    setLocation,
  ]);

  return { setLocation };
}

/* ── Unit: ONBOARDING_EXEMPT_ROUTES ─────────────────────────────────────── */

describe("ONBOARDING_EXEMPT_ROUTES (real export from auth-guard.tsx)", () => {
  it("contains /onboarding", () => {
    expect(ONBOARDING_EXEMPT_ROUTES).toContain("/onboarding");
  });

  it("contains /sign-in", () => {
    expect(ONBOARDING_EXEMPT_ROUTES).toContain("/sign-in");
  });

  it("contains /sign-up", () => {
    expect(ONBOARDING_EXEMPT_ROUTES).toContain("/sign-up");
  });
});

describe("isExemptRoute (real export from auth-guard.tsx)", () => {
  it("exempts /onboarding exactly", () => {
    expect(isExemptRoute("/onboarding")).toBe(true);
  });

  it("exempts /sign-in/sso-callback (Clerk sub-path)", () => {
    expect(isExemptRoute("/sign-in/sso-callback")).toBe(true);
  });

  it("exempts /sign-in/factor-one (Clerk MFA sub-path)", () => {
    expect(isExemptRoute("/sign-in/factor-one")).toBe(true);
  });

  it("exempts /sign-up/continue (Clerk sub-path)", () => {
    expect(isExemptRoute("/sign-up/continue")).toBe(true);
  });

  it("exempts /sign-up/verify-email-address (Clerk sub-path)", () => {
    expect(isExemptRoute("/sign-up/verify-email-address")).toBe(true);
  });

  it("does NOT exempt /dashboard", () => {
    expect(isExemptRoute("/dashboard")).toBe(false);
  });

  it("does NOT exempt /projects", () => {
    expect(isExemptRoute("/projects")).toBe(false);
  });

  it("does NOT exempt near-miss /sign-in-impostor (boundary check)", () => {
    expect(isExemptRoute("/sign-in-impostor")).toBe(false);
  });

  it("does NOT exempt near-miss /sign-up-extra (boundary check)", () => {
    expect(isExemptRoute("/sign-up-extra")).toBe(false);
  });
});

/* ── Component: AuthGuard redirect behaviour ────────────────────────────── */

describe("AuthGuard — redirect behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does NOT redirect a company-less user who is on /onboarding", async () => {
    const { setLocation } = setupMocks({
      location: "/onboarding",
      dbUser: { id: 1, activeCompanyId: null, termsAcceptedAt: new Date() },
    });

    await act(async () => {
      render(<AuthGuard>children</AuthGuard>);
    });

    expect(setLocation).not.toHaveBeenCalledWith("/onboarding");
    expect(setLocation).not.toHaveBeenCalled();
  });

  it("redirects a company-less user on /dashboard to /onboarding", async () => {
    const { setLocation } = setupMocks({
      location: "/dashboard",
      dbUser: { id: 1, activeCompanyId: null, termsAcceptedAt: new Date() },
    });

    await act(async () => {
      render(<AuthGuard>children</AuthGuard>);
    });

    expect(setLocation).toHaveBeenCalledWith("/onboarding");
  });

  it("does NOT redirect a company-less user on /sign-in/sso-callback", async () => {
    const { setLocation } = setupMocks({
      location: "/sign-in/sso-callback",
      dbUser: { id: 1, activeCompanyId: null, termsAcceptedAt: new Date() },
    });

    await act(async () => {
      render(<AuthGuard>children</AuthGuard>);
    });

    expect(setLocation).not.toHaveBeenCalled();
  });

  it("does NOT redirect a company-less user on /sign-up/continue", async () => {
    const { setLocation } = setupMocks({
      location: "/sign-up/continue",
      dbUser: { id: 1, activeCompanyId: null, termsAcceptedAt: new Date() },
    });

    await act(async () => {
      render(<AuthGuard>children</AuthGuard>);
    });

    expect(setLocation).not.toHaveBeenCalled();
  });

  it("redirects a user with company from /onboarding to /dashboard", async () => {
    const { setLocation } = setupMocks({
      location: "/onboarding",
      dbUser: { id: 1, activeCompanyId: 42, termsAcceptedAt: new Date() },
    });

    await act(async () => {
      render(<AuthGuard>children</AuthGuard>);
    });

    expect(setLocation).toHaveBeenCalledWith("/dashboard");
  });

  it("does NOT redirect a user with company who is on /dashboard", async () => {
    const { setLocation } = setupMocks({
      location: "/dashboard",
      dbUser: { id: 1, activeCompanyId: 42, termsAcceptedAt: new Date() },
    });

    await act(async () => {
      render(<AuthGuard>children</AuthGuard>);
    });

    expect(setLocation).not.toHaveBeenCalled();
  });

  it("does NOT redirect a brand-new user (no DB record yet) who arrives on /onboarding via invite link", async () => {
    /*
     * This is the exact first-visit invite scenario: Clerk session exists but
     * the DB user record hasn't been created yet.  useGetMe returns undefined.
     * The redirect useEffect guards with `if (!dbUser) return` so no redirect
     * should fire — preventing a loop where the guard bounces the user away
     * from the very /onboarding page needed to complete their sign-up.
     */
    const setLocation = vi.fn();

    (useUser as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockClerkUser,
      isLoaded: true,
      isSignedIn: true,
    });

    (useGetMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    (useSyncUser as ReturnType<typeof vi.fn>).mockReturnValue(mockSyncUser);

    (useLocation as ReturnType<typeof vi.fn>).mockReturnValue([
      "/onboarding",
      setLocation,
    ]);

    await act(async () => {
      render(<AuthGuard>children</AuthGuard>);
    });

    expect(setLocation).not.toHaveBeenCalled();
  });
});
