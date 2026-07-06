import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export interface AuditorToken {
  id: number;
  token: string;
  label: string;
  expiresAt: string;
  accessCount: number;
  lastAccessedAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export function useAuditorTokens() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const tokensQuery = useQuery<AuditorToken[]>({
    queryKey: ["cor-auditor-tokens"],
    queryFn: () => customFetch("/api/cor/auditor-tokens"),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (opts: { label: string; expiryDays: number }) =>
      customFetch("/api/cor/auditor-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cor-auditor-tokens"] });
      toast({ title: "Auditor link created", description: "Copy the link below to share with the external auditor." });
    },
    onError: () => toast({ title: "Failed to create link", variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/cor/auditor-tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cor-auditor-tokens"] });
      toast({ title: "Auditor link revoked" });
    },
    onError: () => toast({ title: "Failed to revoke link", variant: "destructive" }),
  });

  return { tokensQuery, createMutation, revokeMutation };
}
