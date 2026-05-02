import { useEffect } from "react";
import { useUser } from "@clerk/react";
import { useGetMe, useSyncUser } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user: clerkUser, isLoaded: clerkLoaded, isSignedIn } = useUser();
  const [, setLocation] = useLocation();

  const syncUserMutation = useSyncUser();
  const { data: dbUser, isLoading: dbUserLoading, isError, refetch } = useGetMe({
    query: {
      enabled: isSignedIn && !!clerkUser,
      retry: false,
    },
  });

  useEffect(() => {
    if (isSignedIn && clerkUser && isError && !syncUserMutation.isPending && !dbUser) {
      // Need to sync
      syncUserMutation.mutate(
        {
          data: {
            clerkUserId: clerkUser.id,
            email: clerkUser.primaryEmailAddress?.emailAddress || "",
            firstName: clerkUser.firstName || "",
            lastName: clerkUser.lastName || "",
          },
        },
        {
          onSuccess: () => {
            refetch();
          },
        }
      );
    }
  }, [isSignedIn, clerkUser, isError, syncUserMutation.isPending, dbUser, refetch]);

  if (!clerkLoaded || (isSignedIn && (dbUserLoading || syncUserMutation.isPending || (isError && !dbUser)))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/10">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-medium">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  // If user is loaded and synced, check company
  if (dbUser) {
    if (!dbUser.companyId && window.location.pathname !== "/onboarding") {
      setLocation("/onboarding");
      return null;
    }
    if (dbUser.companyId && window.location.pathname === "/onboarding") {
      setLocation("/dashboard");
      return null;
    }
  }

  return <>{children}</>;
}
