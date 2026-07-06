import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, ApiError } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { Equipment } from "@/components/schedule/shared";

export function useEquipmentQuery(enabled: boolean) {
  return useQuery<Equipment[]>({
    queryKey: ["equipment"],
    queryFn: () => customFetch("/api/equipment"),
    enabled,
  });
}

export function useEquipmentMutations(onSaveSuccess?: () => void) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const createEquipMut = useMutation({
    mutationFn: (body: object) => customFetch("/api/equipment", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment"] });
      onSaveSuccess?.();
      toast({ title: "Equipment added" });
    },
    onError: (err: ApiError) => toast({ title: err?.message ?? "Failed", variant: "destructive" }),
  });

  const updateEquipMut = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & object) => customFetch(`/api/equipment/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment"] });
      onSaveSuccess?.();
      toast({ title: "Equipment updated" });
    },
    onError: (err: ApiError) => toast({ title: err?.message ?? "Failed", variant: "destructive" }),
  });

  const deleteEquipMut = useMutation({
    mutationFn: (id: number) => customFetch(`/api/equipment/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment"] });
      toast({ title: "Equipment removed" });
    },
    onError: (err: ApiError) => toast({ title: err?.message ?? "Failed", variant: "destructive" }),
  });

  return { createEquipMut, updateEquipMut, deleteEquipMut };
}
