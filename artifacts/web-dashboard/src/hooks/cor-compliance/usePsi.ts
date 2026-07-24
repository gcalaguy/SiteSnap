import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { PsiChecklist, PsiChecklistDetail, PsiHazards, PsiListRow, PsiTaskRow } from "@/components/cor-compliance/psiConstants";

function invalidatePsiQueries(queryClient: ReturnType<typeof useQueryClient>, id?: number) {
  queryClient.invalidateQueries({ queryKey: ["psi-checklists"] });
  if (id != null) queryClient.invalidateQueries({ queryKey: ["psi-checklist", id] });
}

export function usePsiList(projectId?: number) {
  const params = projectId ? `?projectId=${projectId}` : "";
  return useQuery<PsiListRow[]>({
    queryKey: ["psi-checklists", projectId ?? null],
    queryFn: () => customFetch(`/api/psi${params}`),
    retry: 1,
  });
}

export function usePsiDetail(id: number | undefined) {
  return useQuery<PsiChecklistDetail>({
    queryKey: ["psi-checklist", id],
    queryFn: () => customFetch(`/api/psi/${id}`),
    enabled: id != null,
    retry: 1,
  });
}

export interface SavePsiPayload {
  projectId: number;
  date: string;
  weatherTemp?: string | null;
  tradeDescription?: string | null;
  location?: string | null;
  hazards: PsiHazards;
  taskRows: PsiTaskRow[];
}

export function useCreatePsi(onDone?: (psi: PsiChecklist) => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ submit, ...body }: SavePsiPayload & { submit: boolean }) =>
      customFetch<PsiChecklist>("/api/psi", { method: "POST", body: JSON.stringify({ ...body, submit }) }),
    onSuccess: (psi) => {
      toast({ title: psi.status === "submitted" ? "PSI checklist submitted" : "Draft saved" });
      invalidatePsiQueries(queryClient);
      onDone?.(psi);
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });
}

export function useUpdatePsi(onDone?: (psi: PsiChecklist) => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<SavePsiPayload> }) =>
      customFetch<PsiChecklist>(`/api/psi/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (psi) => {
      toast({ title: "Draft saved" });
      invalidatePsiQueries(queryClient, psi.id);
      onDone?.(psi);
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });
}

export function useSubmitPsi(onDone?: (psi: PsiChecklist) => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch<PsiChecklist>(`/api/psi/${id}/submit`, { method: "POST" }),
    onSuccess: (psi) => {
      toast({ title: "PSI checklist submitted" });
      invalidatePsiQueries(queryClient, psi.id);
      onDone?.(psi);
    },
    onError: () => toast({ title: "Submit failed", variant: "destructive" }),
  });
}

export function useAddPsiSignature(id: number) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (signatureUrl: string) =>
      customFetch(`/api/psi/${id}/signature`, { method: "POST", body: JSON.stringify({ signatureUrl }) }),
    onSuccess: () => {
      toast({ title: "Signature added" });
      invalidatePsiQueries(queryClient, id);
    },
    onError: () => toast({ title: "Failed to add signature", variant: "destructive" }),
  });
}

export function useDeletePsiVoiceNote(id: number) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      customFetch(`/api/psi/${id}/voice-notes/${noteId}`, { method: "DELETE" }),
    onSuccess: () => invalidatePsiQueries(queryClient, id),
    onError: () => toast({ title: "Failed to delete voice note", variant: "destructive" }),
  });
}

export function useApprovePsi(id: number) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (signatureUrl?: string) =>
      customFetch(`/api/psi/${id}/approvals`, {
        method: "POST",
        body: JSON.stringify({ signatureUrl }),
      }),
    onSuccess: () => {
      toast({ title: "Approved" });
      invalidatePsiQueries(queryClient, id);
    },
    onError: () => toast({ title: "Approval failed", variant: "destructive" }),
  });
}
