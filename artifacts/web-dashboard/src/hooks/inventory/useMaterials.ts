import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { MaterialRow } from "@/components/inventory/shared";

export function useMaterialsList(category: string, search: string) {
  const categoryParam = category === "all" ? "" : `&category=${category}`;
  const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
  return useQuery<{ data: MaterialRow[]; total: number }>({
    queryKey: ["/inventory/materials", category, search],
    queryFn: () => customFetch(`/api/inventory/materials?limit=200${categoryParam}${searchParam}`),
    staleTime: 20_000,
  });
}

export function useDeleteMaterial(onDone?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch(`/api/inventory/materials/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/inventory/materials"] });
      toast({ title: "Material removed" });
      onDone?.();
    },
  });
}

export interface SaveMaterialBody {
  name: string;
  category: string;
  unit: string;
  quantityOnHand: number;
  reorderThreshold: number | undefined;
  reorderQty: number | undefined;
  unitCost: number | undefined;
  location: string | undefined;
  notes: string | undefined;
}

export function useSaveMaterial(existingId: number | undefined, onDone?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveMaterialBody) =>
      existingId
        ? customFetch(`/api/inventory/materials/${existingId}`, { method: "PATCH", body: JSON.stringify(body) })
        : customFetch("/api/inventory/materials", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: existingId ? "Material updated" : "Material added" });
      queryClient.invalidateQueries({ queryKey: ["/inventory/materials"] });
      queryClient.invalidateQueries({ queryKey: ["/inventory/summary"] });
      onDone?.();
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });
}
