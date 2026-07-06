import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { ExpiringCredential } from "@/components/cor-compliance/shared";

interface RunExpiryAlertsResponse {
  alerted: number;
  skipped: number;
  errors: number;
}

export function useExpiryAlerts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery<{ expiring: ExpiringCredential[] }>({
    queryKey: ["cor-expiring-soon"],
    queryFn: () => customFetch("/api/cor/credentials/expiring-soon"),
    retry: 1,
    staleTime: 120000,
  });

  const triggerMutation = useMutation({
    mutationFn: () => customFetch<RunExpiryAlertsResponse>("/api/cor/credentials/run-expiry-alerts", { method: "POST" }),
    onSuccess: (data) => {
      toast({ title: "Alert scan complete", description: `Sent: ${data.alerted}, Skipped: ${data.skipped}, Errors: ${data.errors}` });
      queryClient.invalidateQueries({ queryKey: ["cor-expiring-soon"] });
    },
    onError: () => toast({ title: "Scan failed", variant: "destructive" }),
  });

  return { query, triggerMutation };
}
