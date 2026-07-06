import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, ApiError } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { ScheduleEvent, ScheduleConflictGroup } from "@/components/schedule/shared";

export function useScheduleEventsQuery(from: string, to: string, enabled: boolean) {
  return useQuery<ScheduleEvent[]>({
    queryKey: ["schedule-events", from],
    queryFn: () => customFetch(`/api/schedule/events?from=${from}T00:00:00&to=${to}T23:59:59`),
    enabled,
  });
}

export function useDeleteScheduleEvent() {
  const { toast } = useToast();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => customFetch(`/api/schedule/events/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-events"] });
      toast({ title: "Event removed" });
    },
    onError: (err: ApiError) => toast({ title: err?.message ?? "Failed", variant: "destructive" }),
  });
}

// `ApiError` (thrown by `customFetch`) has no `.json()` method — the parsed
// body already lives on `.data`. Kept as an optional method here (always
// absent at runtime) to preserve the existing no-op conflict lookup exactly.
type ConflictErrorBody = { conflicts?: ScheduleConflictGroup[] };
type ConflictApiError = ApiError & { json?: () => Promise<ConflictErrorBody | undefined> };

export function useScheduleEventMutations(
  setEvtConflicts: (conflicts: ScheduleConflictGroup[]) => void,
  onSaveSuccess?: () => void,
) {
  const { toast } = useToast();
  const qc = useQueryClient();

  async function handleConflictOrError(err: ConflictApiError) {
    if (err?.status === 409) {
      const data = (await err.json?.()) ?? {};
      setEvtConflicts(data.conflicts ?? []);
      toast({ title: "Conflict detected — review below", variant: "destructive" });
    } else {
      toast({ title: err?.message ?? "Failed", variant: "destructive" });
    }
  }

  const createEventMut = useMutation({
    mutationFn: (body: object) => customFetch("/api/schedule/events", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-events"] });
      onSaveSuccess?.();
      toast({ title: "Event created" });
    },
    onError: handleConflictOrError,
  });

  const updateEventMut = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & object) =>
      customFetch(`/api/schedule/events/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-events"] });
      onSaveSuccess?.();
      toast({ title: "Event updated" });
    },
    onError: handleConflictOrError,
  });

  return { createEventMut, updateEventMut };
}
