import { QueryClient, keepPreviousData } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 300_000,
      refetchOnWindowFocus: false,
      retry: 3,
      placeholderData: keepPreviousData,
    },
  },
});
