import { QueryClient, QueryCache, MutationCache, keepPreviousData } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";

// B2 fix: auto sign-out on any 401 response so expired sessions never silently
// linger on the web dashboard. Both query and mutation errors are intercepted
// at the cache level — no per-call handling needed in individual components.
//
// NOTE: requireAuth now returns 404 (not 401) when the Clerk session is valid but
// the user hasn't been synced to the DB yet. This means 401 here truly means "no
// valid Clerk session" — redirecting to /sign-in is always the right move.
// The pathname guard is a belt-and-suspenders check: if we're already on /sign-in
// or /sign-up, don't redirect again (prevents a loop in edge cases).
function handle401(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    const pathname = window.location.pathname;
    if (
      pathname.startsWith("/sign-in") ||
      pathname.startsWith("/sign-up") ||
      pathname.startsWith("/onboarding")
    ) return;
    window.location.href = "/sign-in";
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
