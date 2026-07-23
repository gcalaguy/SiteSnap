import { useGetMe, useListCostModels, useListCostCatalog } from "@workspace/api-client-react";
import type { CostModelRecord, AddonRecord, CostCatalogItem } from "@workspace/api-client-react";
import { DEFAULT_PROJECT_TYPE_LABELS } from "@/components/pricing-manager/shared";
import { DEFAULT_ESTIMATOR_SETTINGS, type EstimatorSettings } from "@/hooks/pricing-manager/useEstimatorSettings";

/**
 * Single-query data source for the Pricing Manager: cost models, add-ons, and
 * project type labels all come from one `useListCostModels` call, the multi-trade
 * cost catalog + global multiplier settings come from `useListCostCatalog`, plus
 * the active company id from `useGetMe`.
 */
export function usePricingManagerData() {
  const { data, isLoading, isError } = useListCostModels();
  const { data: catalogData, isLoading: isCatalogLoading, isError: isCatalogError } = useListCostCatalog();
  const { data: me } = useGetMe();

  const models: CostModelRecord[] = data?.models ?? [];
  const addons: AddonRecord[] = data?.addons ?? [];
  const projectTypes: Record<string, string> = data?.projectTypes ?? DEFAULT_PROJECT_TYPE_LABELS;
  const catalogItems: CostCatalogItem[] = catalogData?.items ?? [];
  const estimatorSettings: EstimatorSettings = {
    ...DEFAULT_ESTIMATOR_SETTINGS,
    ...(catalogData?.settings as Partial<EstimatorSettings> | undefined),
    tierMultipliers: {
      ...DEFAULT_ESTIMATOR_SETTINGS.tierMultipliers,
      ...(catalogData?.settings?.tierMultipliers as Partial<EstimatorSettings["tierMultipliers"]> | undefined),
    },
  };
  const companyId = me?.activeCompanyId ?? 0;

  return {
    data, models, addons, projectTypes,
    catalogItems, estimatorSettings,
    companyId,
    isLoading: isLoading || isCatalogLoading,
    isError: isError || isCatalogError,
  };
}
