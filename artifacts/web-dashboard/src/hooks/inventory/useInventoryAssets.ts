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
    queryFn: () =>
      customFetch(
        `/api/inventory/assets?category=${category}&limit=200${searchParam}`,
      ),
    staleTime: 20_000,
  });
}

export interface SaveAssetBody {
  name: string;
  assetType: string;
  make: string;
  model: string;
  year: string;
  serialNumber: string;
  notes: string;
  category: AssetCategory;
}

/** Creates a new asset, or updates one in place when `existingId` is given. */
export function useSaveAsset(existingId: number | undefined, onDone?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveAssetBody) =>
      existingId
        ? customFetch(`/api/inventory/assets/${existingId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : customFetch("/api/inventory/assets", {
            method: "POST",
            body: JSON.stringify({ ...body, status: "available" }),
          }),
    onSuccess: () => {
      toast({ title: existingId ? "Asset updated" : "Asset added" });
      queryClient.invalidateQueries({
        queryKey: ["/inventory/assets"],
        exact: false,
      });
      queryClient.invalidateQueries({ queryKey: ["/inventory/summary"] });
      onDone?.();
    },
    onError: () =>
      toast({ title: "Failed to save asset", variant: "destructive" }),
  });
}

export function useDeleteAsset(onDone?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/inventory/assets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Asset removed" });
      queryClient.invalidateQueries({
        queryKey: ["/inventory/assets"],
        exact: false,
      });
      queryClient.invalidateQueries({ queryKey: ["/inventory/summary"] });
      onDone?.();
    },
    onError: () =>
      toast({ title: "Failed to delete asset", variant: "destructive" }),
  });
}
