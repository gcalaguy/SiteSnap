import { useGetMe, useListCostModels } from "@workspace/api-client-react";
import type { CostModelRecord, AddonRecord } from "@workspace/api-client-react";
import { DEFAULT_PROJECT_TYPE_LABELS } from "@/components/pricing-manager/shared";

/**
 * Single-query data source for the Pricing Manager: cost models, add-ons, and
 * project type labels all come from one `useListCostModels` call, plus the
 * active company id from `useGetMe`.
 */
export function usePricingManagerData() {
  const { data, isLoading, isError } = useListCostModels();
  const { data: me } = useGetMe();

  const models: CostModelRecord[] = data?.models ?? [];
  const addons: AddonRecord[] = data?.addons ?? [];
  const projectTypes: Record<string, string> = data?.projectTypes ?? DEFAULT_PROJECT_TYPE_LABELS;
  const companyId = me?.activeCompanyId ?? 0;

  return { data, models, addons, projectTypes, companyId, isLoading, isError };
}
