import { useEffect, useRef } from "react";
import { useUser } from "@clerk/react";
import { useGetMe, useSyncUser, getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { TermsModal } from "@/components/TermsModal";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user: clerkUser, isLoaded: clerkLoaded, isSignedIn } = useUser();
  const [location, setLocation] = useLocation();
  const syncedRef = useRef(false);

  const syncUserMutation = useSyncUser();

  // Retry on 401 — Clerk token may not be ready on the very first render
  const { data: dbUser, isLoading: dbUserLoading, isError, refetch } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      enabled: isSignedIn && !!clerkUser && clerkLoaded,
      retry: (failureCount, error: any) => {
        // Stop retrying after 3 attempts or on non-auth errors
        if (failureCount >= 3) return false;
        const status = error?.status ?? error?.response?.status;
        return status === 401 || status === undefined;
      },
      retryDelay: (attempt) => Math.min(500 * (attempt + 1), 2000),
    },
  });

  // Sync to DB on first sign-in (or when retries exhaust and user isn't in DB yet)
  useEffect(() => {
    if (!isSignedIn || !clerkUser || !clerkLoaded) return;
    if (syncedRef.current || syncUserMutation.isPending) return;

    // Always sync once per session mount to keep email/name fresh,
    // and to create the user if they somehow don't exist yet
    if (!dbUser || isError) {
      syncedRef.current = true;
      syncUserMutation.mutate(
        {
          data: {
            clerkUserId: clerkUser.id,
            email: clerkUser.primaryEmailAddress?.emailAddress || "",
            firstName: clerkUser.firstName || "",
            lastName: clerkUser.lastName || "",
          },
        },
        { onSuccess: () => refetch() },
      );
    }
  }, [isSignedIn, clerkUser, clerkLoaded, dbUser, isError, syncUserMutation.isPending, refetch]);

  // Eliminate 401 race: if Clerk session is valid but dbUser is still missing,
  // force a background sync before any protected layout attempts to pull data.
  useEffect(() => {
    if (!isSignedIn || !clerkUser || !clerkLoaded) return;
    if (syncUserMutation.isPending) return;
    if (dbUser === undefined && !syncedRef.current) {
      syncedRef.current = true;
      syncUserMutation.mutate(
        {
          data: {
            clerkUserId: clerkUser.id,
            email: clerkUser.primaryEmailAddress?.emailAddress || "",
            firstName: clerkUser.firstName || "",
            lastName: clerkUser.lastName || "",
          },
        },
        { onSuccess: () => refetch() },
      );
    }
  }, [isSignedIn, clerkUser, clerkLoaded, dbUser, syncUserMutation, refetch]);

  // Company-based redirect — must be in useEffect, not during render
  // Phase 2: use activeCompanyId as the source of truth; fall back to legacy companyId
  useEffect(() => {
    if (!dbUser) return;
    const hasCompany = !!dbUser.activeCompanyId;
    if (!hasCompany && location !== "/onboarding") {
      setLocation("/onboarding");
    } else if (hasCompany && location === "/onboarding") {
      setLocation("/dashboard");
    }
  }, [dbUser, location, setLocation]);

  const isAuthenticating =
    !clerkLoaded ||
    (isSignedIn &&
      (dbUserLoading ||
        syncUserMutation.isPending ||
        (isError && !dbUser && !syncUserMutation.isError)));

  if (isAuthenticating) {
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
