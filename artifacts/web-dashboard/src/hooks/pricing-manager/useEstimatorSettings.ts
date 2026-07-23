import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, getListCostCatalogQueryKey, getGetCompanyQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export interface EstimatorTierMultipliers {
  basic: number;
  standard: number;
  premium: number;
  luxury: number;
}

export interface EstimatorSettings {
  overheadPercent: number;
  contingencyPercent: number;
  tierMultipliers: EstimatorTierMultipliers;
}

export const DEFAULT_ESTIMATOR_SETTINGS: EstimatorSettings = {
  overheadPercent: 10,
  contingencyPercent: 10,
  tierMultipliers: { basic: 1.0, standard: 1.2, premium: 1.5, luxury: 2.0 },
};

/** Updates the company's global overhead/contingency/tier-multiplier defaults via
 *  a company config PATCH — same estimator_config JSON blob as project type labels. */
export function useUpdateEstimatorSettings(companyId: number) {
  const { toast } = useToast();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Partial<EstimatorSettings>) =>
      customFetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatorConfig: settings }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getListCostCatalogQueryKey() });
      void qc.invalidateQueries({ queryKey: getGetCompanyQueryKey(companyId) });
      toast({ title: "Settings saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });
}
