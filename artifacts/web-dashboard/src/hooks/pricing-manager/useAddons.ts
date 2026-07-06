import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, getListCostModelsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Force-deletes an add-on that's in use by existing estimates, bypassing the
 * server's 409 usage guard. Used as the fallback action after the regular
 * delete mutation reports a conflict.
 */
export function useForceDeleteAddon(onDone?: () => void) {
  const { toast } = useToast();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/estimator/addons/${id}?force=true`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
      toast({ title: "Add-on deleted" });
      onDone?.();
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });
}
