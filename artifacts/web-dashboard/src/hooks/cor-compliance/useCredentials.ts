import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { WorkerCredential } from "@/components/cor-compliance/shared";

export function useMyCredentials(userId: number | undefined, enabled: boolean) {
  return useQuery<WorkerCredential[]>({
    queryKey: ["cor-credentials-self", userId],
    queryFn: () => customFetch(`/api/cor/credentials/${userId}`),
    enabled: enabled && !!userId,
    retry: 1,
  });
}

interface CredentialMatrixWorker {
  user: { id: number; firstName: string; lastName: string; email: string };
  credentials: WorkerCredential[];
}

export function useCredentialMatrix(enabled: boolean) {
  return useQuery<{ workers: CredentialMatrixWorker[] }>({
    queryKey: ["cor-credential-matrix"],
    queryFn: () => customFetch("/api/cor/credentials"),
    enabled,
    retry: 1,
  });
}

export function useUpsertCredential(userId: number | undefined, onDone?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ uid, credType, body }: { uid: number; credType: string; body: Record<string, string> }) =>
      customFetch(`/api/cor/credentials/${uid}/${credType}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Credential saved" });
      queryClient.invalidateQueries({ queryKey: ["cor-credential-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["cor-credentials-self", userId] });
      onDone?.();
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });
}

export interface EligibilityBlock {
  credentialType: string;
  reason: "missing" | "expired";
  expiresAt?: string | null;
}

export interface EligibilityWarning {
  credentialType: string;
  expiresAt: string;
  daysUntilExpiry: number;
}

export interface EligibilityResult {
  eligible: boolean;
  blocks: EligibilityBlock[];
  warnings: EligibilityWarning[];
}

export function useCredentialEligibility() {
  const { toast } = useToast();
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);

  const checkMutation = useMutation({
    mutationFn: (uid: number) =>
      customFetch<EligibilityResult>("/api/cor/credentials/check", {
        method: "POST",
        body: JSON.stringify({ userId: uid }),
      }),
    onSuccess: (data) => setEligibility(data),
    onError: () => toast({ title: "Eligibility check failed", variant: "destructive" }),
  });

  return { eligibility, setEligibility, checkMutation };
}
