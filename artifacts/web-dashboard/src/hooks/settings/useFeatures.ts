import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export type AvailableFeature = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  active: boolean;
};

export function useFeatures(companyId: number, enabled: boolean) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [toggling, setToggling] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ features: AvailableFeature[] }>({
    queryKey: ["company-features-available", companyId],
    queryFn: () => customFetch(`/api/companies/${companyId}/features/available`),
    enabled: enabled && !!companyId,
    staleTime: 30_000,
  });

  async function handleToggle(featureKey: string, nextEnabled: boolean) {
    setToggling(featureKey);
    try {
      await customFetch(`/api/companies/${companyId}/features/toggle`, {
        method: "PATCH",
        body: JSON.stringify({ featureKey, enabled: nextEnabled }),
      });
      // Invalidate all feature caches so sidebar + guards update immediately
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["company-features-available", companyId] }),
        qc.invalidateQueries({ queryKey: ["company-features", companyId] }),
        qc.invalidateQueries({ queryKey: ["me-features"] }),
      ]);
      toast({ title: nextEnabled ? `${featureKey} enabled` : `${featureKey} disabled` });
    } catch {
      toast({ title: "Failed to update feature", variant: "destructive" });
    } finally {
      setToggling(null);
    }
  }

  const features = data?.features ?? [];
  const activeCount = features.filter((f) => f.active).length;

  return { features, isLoading, toggling, handleToggle, activeCount };
}
