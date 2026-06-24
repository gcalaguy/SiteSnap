import {
  checkWorkerDeploymentEligibility,
  isEnterprisePlanWithCorModule,
  type EligibilityResult,
} from "../../repositories/cor";

// Always required for any worker on any site
const ALWAYS_REQUIRED = ["working_at_heights", "whmis"] as const;

// Required only when the company has COR_MODULE enabled AND is on the Enterprise plan
const ENTERPRISE_REQUIRED = ["cor_training"] as const;

export type { EligibilityResult };

export async function checkWorkerEligibility(
  companyId: number,
  userId: number,
): Promise<EligibilityResult> {
  const required: string[] = [...ALWAYS_REQUIRED];

  // Add COR Training requirement when BOTH conditions are met:
  // 1. Company subscription plan slug === "enterprise"
  // 2. companies.activeFeatures includes "COR_MODULE"
  const enterpriseCor = await isEnterprisePlanWithCorModule(companyId);
  if (enterpriseCor) {
    required.push(...ENTERPRISE_REQUIRED);
  }

  return checkWorkerDeploymentEligibility(companyId, userId, required);
}
