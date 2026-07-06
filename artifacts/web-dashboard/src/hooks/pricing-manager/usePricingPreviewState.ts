import { useEffect, useMemo, useRef, useState } from "react";
import type { CostModelRecord, AddonRecord } from "@workspace/api-client-react";
import type { FinishLevel } from "@/components/pricing-manager/shared";
import type { usePricingManagerData } from "@/hooks/pricing-manager/usePricingManagerData";

/**
 * Owns the shared preview/search state for the Pricing Manager: which project
 * type + finish level + sqft the live preview reflects, the cross-section
 * search query, and the "sync flash" indicator shown when server data changes
 * underneath the user (e.g. another tab saved a change).
 */
export function usePricingPreviewState(
  data: ReturnType<typeof usePricingManagerData>["data"],
  models: CostModelRecord[],
  addons: AddonRecord[],
  projectTypes: Record<string, string>,
) {
  const firstTypeWithModels = useMemo(() => {
    const typesWithModels = [...new Set(models.map(m => m.projectType))];
    return typesWithModels[0] ?? Object.keys(projectTypes)[0] ?? "residential_new_build";
  }, [models, projectTypes]);

  const [selectedType, setSelectedType]   = useState<string>(firstTypeWithModels);
  const [previewFinish, setPreviewFinish] = useState<FinishLevel>("standard");
  const [previewSqft, setPreviewSqft]     = useState(1500);

  // Sync selectedType after initial data load
  useEffect(() => {
    setSelectedType(prev => {
      // Only update if the current selection has no models at all
      const hasAnyModel = models.some(m => m.projectType === prev);
      return hasAnyModel ? prev : firstTypeWithModels;
    });
  }, [firstTypeWithModels, models]);

  // ── Search across cost models, add-ons, and project type labels ─────────────
  const [searchInput, setSearchInput] = useState("");
  const search = searchInput.trim().toLowerCase();

  // When the search starts matching a different project type, jump the cost-model
  // panel to the first match so results are visible without manually re-selecting.
  useEffect(() => {
    if (!search) return;
    const matchingKeys = Object.keys(projectTypes).filter(
      k => (projectTypes[k] ?? k).toLowerCase().includes(search) || k.toLowerCase().includes(search),
    );
    if (matchingKeys.length > 0 && !matchingKeys.includes(selectedType)) {
      setSelectedType(matchingKeys[0]!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ── Sync flash ───────────────────────────────────────────────────────────
  // Shows a brief visual indicator on the preview card when the server data updates.
  const [syncFlash, setSyncFlash] = useState(false);
  const prevDataSignature = useRef<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!data) return;
    const sig = `${models.length}:${models.map(m => m.updatedAt).join(",")}:${addons.length}`;
    if (prevDataSignature.current !== null && prevDataSignature.current !== sig) {
      setSyncFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSyncFlash(false), 1500);
    }
    prevDataSignature.current = sig;
    return () => { if (flashTimer.current) clearTimeout(flashTimer.current); };
  }, [data, models, addons]);

  return {
    selectedType, setSelectedType,
    previewFinish, setPreviewFinish,
    previewSqft, setPreviewSqft,
    searchInput, setSearchInput, search,
    syncFlash,
  };
}
