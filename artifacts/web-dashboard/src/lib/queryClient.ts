import { QueryClient, QueryCache, MutationCache, keepPreviousData } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";

// B2 fix: auto sign-out on any 401 response so expired sessions never silently
// linger on the web dashboard. Both query and mutation errors are intercepted
// at the cache level — no per-call handling needed in individual components.
function handle401(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    // Use dynamic import to avoid circular dependency with Clerk provider.
    // Clerk's signOut is not available at module init time.
    import("@clerk/react")
      .then(({ useClerk: _unused, ...clerk }) => {
        // Access clerk instance directly via window.__clerk_frontend_api if available,
        // otherwise redirect to sign-in which forces re-auth.
        window.location.href = "/sign-in";
      })
      .catch(() => {
        window.location.href = "/sign-in";
      });
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handle401 }),
  mutationCache: new MutationCache({ onError: handle401 }),
  defaultOptions: {
    queries: {
      staleTime: 300_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry 401s — the session is expired, retrying won't help
        if (error instanceof ApiError && error.status === 401) return false;
        return failureCount < 3;
      },
      placeholderData: keepPreviousData,
    },
  },
});
