import { getCompanyFeatureKeys, invalidateFeatureCache } from "../../lib/featureGate";
import { notifyFeatureCacheInvalidate } from "../../lib/pgListener";
import {
  listEnabledFeatures,
  getFeatureByKey,
  updateCompanyActiveFeatures,
} from "../../repositories/companies";

export async function getAvailableFeatures(companyId: number) {
  const [allFeatures, activeKeys] = await Promise.all([
    listEnabledFeatures(),
    getCompanyFeatureKeys(companyId),
  ]);

  return allFeatures.map((f) => ({
    ...f,
    active: activeKeys.some((k) => k.toUpperCase() === f.key.toUpperCase()),
  }));
}

export async function toggleFeature(
  companyId: number,
  featureKey: string,
  enabled: boolean,
): Promise<{ normalizedKey: string; activeFeatures: string[] } | null> {
  const normalizedKey = featureKey.toUpperCase();

  // Verify the feature actually exists and is enabled in the system
  const feature = await getFeatureByKey(normalizedKey);
  if (!feature || !feature.isEnabled) return null;

  // Snapshot the current effective feature set then apply the toggle
  const currentKeys = await getCompanyFeatureKeys(companyId);
  let nextKeys: string[];
  if (enabled) {
    nextKeys = currentKeys.includes(normalizedKey)
      ? currentKeys
      : [...currentKeys, normalizedKey];
  } else {
    nextKeys = currentKeys.filter((k) => k.toUpperCase() !== normalizedKey);
  }

  await updateCompanyActiveFeatures(companyId, nextKeys);

  invalidateFeatureCache(companyId);
  // Broadcast to all API instances via Postgres NOTIFY so every pod invalidates
  // its local in-memory cache immediately rather than waiting for the 5 s TTL.
  await notifyFeatureCacheInvalidate(companyId);

  return { normalizedKey, activeFeatures: nextKeys };
}
