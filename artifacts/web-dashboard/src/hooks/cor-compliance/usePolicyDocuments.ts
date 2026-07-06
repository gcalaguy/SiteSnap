import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { DocType, PolicyDocument } from "@/components/cor-compliance/shared";

export interface SignoffWorkerEntry {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  signedAt: string | null;
  isValid: boolean | null;
}

export interface SignoffMatrixEntry {
  document: PolicyDocument;
  signoffs: SignoffWorkerEntry[];
  signedCount: number;
  totalWorkers: number;
  compliancePercent: number;
}

export interface PolicySignoff {
  id: number;
  policyDocumentId: number;
  workerUserId: number;
  signedAt: string;
  isValid: boolean;
}

export interface MySignoffEntry {
  signoff: PolicySignoff;
  document: PolicyDocument;
}

export function usePolicyDocumentsList() {
  return useQuery<{ documents: PolicyDocument[] }>({
    queryKey: ["cor-policy-documents"],
    queryFn: () => customFetch("/api/cor/policy-documents"),
    retry: 1,
  });
}

export function useSignoffMatrix(enabled: boolean) {
  return useQuery<{ matrix: SignoffMatrixEntry[] }>({
    queryKey: ["cor-signoff-matrix"],
    queryFn: () => customFetch("/api/cor/policy-signoffs"),
    enabled,
    retry: 1,
  });
}

export function useMySignoffs(userId: number | undefined, enabled: boolean) {
  return useQuery<{ signoffs: MySignoffEntry[] }>({
    queryKey: ["cor-my-signoffs", userId],
    queryFn: () => customFetch("/api/cor/policy-signoffs"),
    enabled,
    retry: 1,
  });
}

export function usePendingSignoffs(userId: number | undefined) {
  return useQuery<{ pending: PolicyDocument[] }>({
    queryKey: ["cor-pending-signoffs", userId],
    queryFn: () => customFetch("/api/cor/policy-signoffs/pending"),
    enabled: !!userId,
    retry: 1,
  });
}

export function useCreatePolicyDocument() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      documentType: DocType;
      title: string;
      description: string;
      fileUrl: string;
      contentText: string;
      ihsaElement: string;
      requiresAnnualRenewal: boolean;
    }) => customFetch("/api/cor/policy-documents", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Document created", description: "Workers can now be asked to sign this document." });
      queryClient.invalidateQueries({ queryKey: ["cor-policy-documents"] });
      queryClient.invalidateQueries({ queryKey: ["cor-signoff-matrix"] });
    },
    onError: () => toast({ title: "Create failed", variant: "destructive" }),
  });
}

export function useArchivePolicyDocument() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch(`/api/cor/policy-documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Document archived" });
      queryClient.invalidateQueries({ queryKey: ["cor-policy-documents"] });
      queryClient.invalidateQueries({ queryKey: ["cor-signoff-matrix"] });
    },
    onError: () => toast({ title: "Archive failed", variant: "destructive" }),
  });
}
