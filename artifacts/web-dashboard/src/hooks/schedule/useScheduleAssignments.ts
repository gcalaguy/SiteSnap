import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, ApiError } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { GanttData, WeekData } from "@/components/schedule/shared";

export function useGanttQuery(range: { start: Date; end: Date }, enabled: boolean) {
  return useQuery<GanttData>({
    queryKey: ["schedule-gantt", format(range.start, "yyyy-MM-dd"), format(range.end, "yyyy-MM-dd")],
    queryFn: () => customFetch(`/api/schedule/gantt?from=${format(range.start, "yyyy-MM-dd")}&to=${format(range.end, "yyyy-MM-dd")}`),
    enabled,
  });
}

export function useTeamWeekQuery(weekOf: string, enabled: boolean) {
  return useQuery<WeekData>({
    queryKey: ["schedule", weekOf],
    queryFn: () => customFetch(`/api/schedule?weekOf=${weekOf}`),
    enabled,
  });
}

function invalidateAssignmentQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["schedule-gantt"] });
  queryClient.invalidateQueries({ queryKey: ["schedule"] });
}

export function useAssignmentMutations(onCreateSuccess?: () => void) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: (body: object) => customFetch("/api/schedule", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidateAssignmentQueries(qc);
      onCreateSuccess?.();
      toast({ title: "Worker assigned" });
    },
    onError: (err: ApiError) => toast({ title: err?.message ?? "Failed", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => customFetch(`/api/schedule/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateAssignmentQueries(qc),
    onError: (err: ApiError) => toast({ title: err?.message ?? "Failed to remove", variant: "destructive" }),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, startDate, endDate }: { id: number; startDate: string; endDate: string }) =>
      customFetch(`/api/schedule/${id}`, { method: "PATCH", body: JSON.stringify({ startDate, endDate }) }),
    onSuccess: () => {
      invalidateAssignmentQueries(qc);
      toast({ title: "Assignment updated" });
    },
    onError: (err: ApiError) => toast({ title: err?.message ?? "Failed to update", variant: "destructive" }),
  });

  return { createMut, deleteMut, patchMut };
}
