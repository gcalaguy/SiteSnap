import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { Subcontractor, SubcontractorDoc, SubSummary } from "@/components/cor-compliance/shared";

export type { SubSummary };

export function useFlaggedSubcontractors(enabled: boolean) {
  return useQuery<{ flagged: Subcontractor[] }>({
    queryKey: ["cor-subcontractors-flagged"],
    queryFn: () => customFetch("/api/cor/subcontractors/flagged"),
    enabled,
    retry: 1,
  });
}

function invalidateSubcontractorQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["cor-subcontractors"] });
  queryClient.invalidateQueries({ queryKey: ["cor-subcontractors-summary"] });
  queryClient.invalidateQueries({ queryKey: ["cor-subcontractors-flagged"] });
}

export function useSubcontractors(enabled: boolean) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const subsQuery = useQuery<{ subcontractors: Subcontractor[] }>({
    queryKey: ["cor-subcontractors"],
    queryFn: () => customFetch("/api/cor/subcontractors"),
    enabled,
    retry: 1,
  });

  const summaryQuery = useQuery<SubSummary>({
    queryKey: ["cor-subcontractors-summary"],
    queryFn: () => customFetch("/api/cor/subcontractors/summary"),
    enabled,
    retry: 1,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, string>) =>
      customFetch("/api/cor/subcontractors", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Subcontractor added" }); invalidateSubcontractorQueries(queryClient); },
    onError: () => toast({ title: "Create failed", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, string> }) =>
      customFetch(`/api/cor/subcontractors/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Subcontractor updated" }); invalidateSubcontractorQueries(queryClient); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => customFetch(`/api/cor/subcontractors/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Subcontractor removed" }); invalidateSubcontractorQueries(queryClient); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const upsertDocMut = useMutation({
    mutationFn: ({ subId, body }: { subId: number; body: Record<string, string> }) =>
      customFetch(`/api/cor/subcontractors/${subId}/docs`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Document saved" }); invalidateSubcontractorQueries(queryClient); },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const deleteDocMut = useMutation({
    mutationFn: ({ subId, docId }: { subId: number; docId: number }) =>
      customFetch(`/api/cor/subcontractors/${subId}/docs/${docId}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Document removed" }); invalidateSubcontractorQueries(queryClient); },
    onError: () => toast({ title: "Remove failed", variant: "destructive" }),
  });

  const inviteMut = useMutation({
    mutationFn: (subId: number) => customFetch(`/api/cor/subcontractors/${subId}/invite`, { method: "POST" }),
    onSuccess: (_data, subId) => {
      const subs = subsQuery.data?.subcontractors ?? [];
      const sub = subs.find((s) => s.id === subId);
      toast({
        title: "Invite recorded",
        description: sub?.contactEmail
          ? `Marked ${sub.companyName} as invited (${sub.contactEmail}). Follow up via email to request their compliance documents.`
          : `${sub?.companyName ?? "Subcontractor"} marked as invited. Add a contact email to track follow-up.`,
      });
      invalidateSubcontractorQueries(queryClient);
    },
    onError: () => toast({ title: "Invite failed", variant: "destructive" }),
  });

  return { subsQuery, summaryQuery, createMut, updateMut, deleteMut, upsertDocMut, deleteDocMut, inviteMut };
}

export type { Subcontractor, SubcontractorDoc };
