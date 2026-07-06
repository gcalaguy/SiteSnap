import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { ActionRequiredCapa, CapaListResponse, CapaSummary, CapaTicket } from "@/components/cor-compliance/shared";

function invalidateCapaQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["cor-action-required"] });
  queryClient.invalidateQueries({ queryKey: ["cor-capa"] });
  queryClient.invalidateQueries({ queryKey: ["cor-capa-summary"] });
}

export function useActionRequiredCapas() {
  return useQuery<{ items: ActionRequiredCapa[] }>({
    queryKey: ["cor-action-required"],
    queryFn: () => customFetch("/api/cor/capa/action-required"),
    retry: 1,
  });
}

export function useCapaList(statusFilter: string) {
  const params = new URLSearchParams({ status: statusFilter, limit: "50" });
  return useQuery<CapaListResponse>({
    queryKey: ["cor-capa", statusFilter],
    queryFn: () => customFetch(`/api/cor/capa?${params}`),
    retry: 1,
  });
}

export function useCapaSummary() {
  return useQuery<CapaSummary>({
    queryKey: ["cor-capa-summary"],
    queryFn: () => customFetch("/api/cor/capa/summary"),
    retry: 1,
  });
}

// `onDone` runs after the toast+invalidation, mirroring how the original inline
// mutations closed over component-local state (e.g. clearing a dialog) only on success.
export function useCreateCapa(onDone?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: object) => customFetch("/api/cor/capa", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "CAPA ticket created" });
      invalidateCapaQueries(queryClient);
      onDone?.();
    },
    onError: () => toast({ title: "Create failed", variant: "destructive" }),
  });
}

// Shared by OverviewTab's action-required "Assign" flow and the CAPA tab's edit dialog —
// same endpoint, same invalidation, different success toast copy per call site.
export function useUpdateCapa(successTitle = "CAPA ticket updated", onDone?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      customFetch(`/api/cor/capa/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: successTitle });
      invalidateCapaQueries(queryClient);
      onDone?.();
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });
}

export function useCloseCapa(opts?: { title?: string; description?: string; onDone?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      customFetch(`/api/cor/capa/${id}/close`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: opts?.title ?? "CAPA closed", description: opts?.description });
      invalidateCapaQueries(queryClient);
      opts?.onDone?.();
    },
    onError: () => toast({ title: "Close failed", variant: "destructive" }),
  });
}

export function useVoidCapa() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch(`/api/cor/capa/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "CAPA voided" });
      invalidateCapaQueries(queryClient);
    },
    onError: () => toast({ title: "Void failed", variant: "destructive" }),
  });
}

export type { CapaTicket };
