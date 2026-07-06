import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { AssetScheduleRow } from "@/components/inventory/shared";

export function useAssetSchedules(startISO: string, endISO: string) {
  return useQuery<AssetScheduleRow[]>({
    queryKey: ["/inventory/schedules", startISO, endISO],
    queryFn: () => customFetch(`/api/inventory/schedules?startDate=${startISO}&endDate=${endISO}`),
    staleTime: 15_000,
  });
}

export function useDeleteSchedule(onDone?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch(`/api/inventory/schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/inventory/schedules"] });
      toast({ title: "Schedule removed" });
      onDone?.();
    },
  });
}

export interface SaveScheduleBody {
  assetId: number;
  projectId: number | undefined;
  assignedToUserId: number | undefined;
  startDate: string;
  endDate: string;
  notes: string | undefined;
  color: string;
}

export function useSaveAssetSchedule(existingId: number | undefined, onDone?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveScheduleBody) =>
      existingId
        ? customFetch(`/api/inventory/schedules/${existingId}`, { method: "PATCH", body: JSON.stringify(body) })
        : customFetch("/api/inventory/schedules", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: existingId ? "Schedule updated" : "Asset scheduled" });
      queryClient.invalidateQueries({ queryKey: ["/inventory/schedules"] });
      onDone?.();
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });
}
