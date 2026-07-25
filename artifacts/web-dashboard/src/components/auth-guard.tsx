import { useEffect, useRef, useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import { useGetMe, useSyncUser, getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Loader2, AlertTriangle } from "lucide-react";
import { TermsModal } from "@/components/TermsModal";
import { Button } from "@/components/ui/button";

// Routes that must never trigger the "no company → onboarding" redirect.
// Without this exemption the guard would re-redirect users who are already
// mid-onboarding (or mid-auth), causing a redirect loop.
//
// Matching rule: a route is exempt if `location === route` OR
// `location.startsWith(route + "/")`.  This means:
//   • "/sign-in"  covers Clerk sub-paths: /sign-in/factor-one, /sign-in/sso-callback, …
//   • "/sign-up"  covers Clerk sub-paths: /sign-up/continue, /sign-up/verify-email-address, …
//   • "/onboarding" covers the invite-accept flow (/onboarding?token=…) because
//     wouter's useLocation() strips the query string from `location`.
//
// If you add a new dedicated sign-up or invite route (e.g. "/invite/:token"),
// add its prefix here to prevent a redirect loop for companyless users.
//
// Exported so automated tests can import the real list and catch regressions
// without maintaining a separate copy.
export const ONBOARDING_EXEMPT_ROUTES = ["/onboarding", "/sign-in", "/sign-up"];

/** Returns true when the AuthGuard should NOT redirect a company-less user. */
export function isExemptRoute(location: string): boolean {
  return ONBOARDING_EXEMPT_ROUTES.some(
    (route) => location === route || location.startsWith(`${route}/`),
  );
}

const TIMEOUT_MS = 15_000;

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user: clerkUser, isLoaded: clerkLoaded, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const [location, setLocation] = useLocation();
  const syncedRef = useRef(false);
  const [timedOut, setTimedOut] = useState(false);

  const syncUserMutation = useSyncUser();

  // Retry on transient errors — Clerk token may not be ready on the first render,
  // the DB user may not exist yet for a brand-new account, and transient server /
  // DB errors (500, 503) should recover within a few seconds.
  const { data: dbUser, isLoading: dbUserLoading, isError, refetch } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      enabled: isSignedIn && !!clerkUser && clerkLoaded,
      retry: (failureCount, error) => {
        if (failureCount >= 3) return false;
        const status = (error as { status?: number; response?: { status?: number } })?.status
          ?? (error as { status?: number; response?: { status?: number } })?.response?.status;
        // 401 — Clerk token not propagated yet
        // 404 — user not yet synced to DB (sync effect runs in parallel)
        // 500/503 — transient DB connection timeout (pool recovering)
        // undefined — network error before a response arrived
        return (
          status === 401 ||
          status === 404 ||
          status === 500 ||
          status === 503 ||
          status === undefined
        );
      },
      retryDelay: (attempt) => Math.min(500 * (attempt + 1), 2000),
    },
  });

  // Single sync effect: ensure the user exists in the DB for this session.
  // Fires when:
  //   a) dbUser is missing (not loaded yet or 404) — creates the DB record
  //   b) dbUser errored — may be a transient 500; sync also acts as a DB user check
  // Guards:
  //   • syncedRef prevents multiple concurrent mutate() calls per session mount
  //   • syncUserMutation.isPending prevents a second call if one is already in flight
  useEffect(() => {
    if (!isSignedIn || !clerkUser || !clerkLoaded) return;
    if (syncedRef.current || syncUserMutation.isPending) return;
    if (!dbUser || isError) {
      syncedRef.current = true;
      syncUserMutation.mutate(
        {
          data: {
            clerkUserId: clerkUser.id,
            email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
            firstName: clerkUser.firstName ?? "",
            lastName: clerkUser.lastName ?? "",
          },
        },
        { onSuccess: () => refetch() },
      );
    }
  }, [isSignedIn, clerkUser, clerkLoaded, dbUser, isError, syncUserMutation.isPending, refetch]);

  // Company-based redirect — must be in useEffect, not during render
  useEffect(() => {
    if (!dbUser) return;
    const hasCompany = !!dbUser.activeCompanyId;
    if (!hasCompany && !isExemptRoute(location)) {
      setLocation("/onboarding");
    } else if (hasCompany && location.startsWith("/onboarding")) {
      setLocation("/dashboard");
    }
  }, [dbUser, location, setLocation]);

  const isAuthenticating =
    !clerkLoaded ||
    (isSignedIn &&
      (dbUserLoading ||
        syncUserMutation.isPending ||
        (isError && !dbUser && !syncUserMutation.isError)));

  // 15-second safety net: if auth is still in progress after TIMEOUT_MS, surface
  // an error card so the user is never permanently stuck on the loading screen.
  useEffect(() => {
    if (!isAuthenticating) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isAuthenticating]);

  if (isAuthenticating) {
    if (timedOut) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-muted/10">
          <div className="flex flex-col items-center gap-6 max-w-sm text-center px-4">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">Could not connect to your workspace</p>
              <p className="text-sm text-muted-foreground">
                The server took too long to respond. Check your connection and try again.
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => window.location.reload()}>Try again</Button>
              <Button variant="outline" onClick={() => signOut()}>Sign out</Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/10">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-medium">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  const needsTerms = !!dbUser && !dbUser.termsAcceptedAt;

  return (
    <>
      <TermsModal open={needsTerms} />
      {children}
    </>
  );
}
