import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { InventoryAsset } from "@/components/inventory/shared";

export type AssetCategory = "fleet" | "heavy_equipment" | "small_tool";

/** Assets in a given category (fleet, heavy equipment, or small tools), optionally text-filtered. */
export function useAssetsByCategory(category: AssetCategory, search?: string) {
  const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
  return useQuery<{ data: InventoryAsset[] }>({
    queryKey: ["/inventory/assets", category, search ?? ""],
    queryFn: () => customFetch(`/api/inventory/assets?category=${category}&limit=200${searchParam}`),
    staleTime: 20_000,
  });
}

export interface CreateAssetBody {
  name: string;
  assetType: string;
  make: string;
  model: string;
  year: string;
  serialNumber: string;
  notes: string;
  category: AssetCategory;
  status: "available";
}

export function useCreateAsset(onDone?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAssetBody) =>
      customFetch("/api/inventory/assets", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Asset added" });
      queryClient.invalidateQueries({ queryKey: ["/inventory/assets"] });
      onDone?.();
    },
    onError: () => toast({ title: "Failed to save asset", variant: "destructive" }),
  });
}
