import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface InventorySummary {
  totalAssets: number;
  materialAlerts: number;
  activeCheckouts: number;
}

export function useInventorySummary() {
  return useQuery<InventorySummary>({
    queryKey: ["/inventory/summary"],
    queryFn: () => customFetch("/api/inventory/summary"),
    staleTime: 60_000,
  });
}

/** Invalidates every inventory-scoped query (assets, materials, schedules, checkouts, summary). */
export function useRefreshInventory() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/inventory"),
    });
  };
}
