import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { CheckoutRow } from "@/components/inventory/shared";

export function useToolCheckouts() {
  return useQuery<CheckoutRow[]>({
    queryKey: ["/inventory/tool-checkouts"],
    queryFn: () => customFetch("/api/inventory/tool-checkouts?status=checked_out"),
    staleTime: 15_000,
  });
}

export function useReturnTool(onDone?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch(`/api/inventory/tool-checkouts/${id}/return`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/inventory/tool-checkouts"] });
      queryClient.invalidateQueries({ queryKey: ["/inventory/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/inventory/summary"] });
      toast({ title: "Tool returned to yard" });
      onDone?.();
    },
  });
}

export interface CheckoutToolBody {
  assetId: number;
  notes: string | undefined;
  projectId: number | undefined;
  expectedReturnDate: string | undefined;
  checkedOutToUserId?: number;
  checkedOutToName?: string;
}

export function useCheckoutTool(toolName: string, onDone?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CheckoutToolBody) =>
      customFetch("/api/inventory/tool-checkouts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/inventory/tool-checkouts"] });
      queryClient.invalidateQueries({ queryKey: ["/inventory/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/inventory/summary"] });
      toast({ title: `${toolName} checked out` });
      onDone?.();
    },
    onError: () => toast({ title: "Failed to check out", variant: "destructive" }),
  });
}
