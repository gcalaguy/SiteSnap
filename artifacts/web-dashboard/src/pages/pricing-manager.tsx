import { Input } from "@/components/ui/input";
import { AlertCircle, Search, X } from "lucide-react";
import { PricingSkeletons } from "@/components/pricing-manager/shared";
import { CostModelsSection } from "@/components/pricing-manager/CostModelsSection";
import { AddonsSection } from "@/components/pricing-manager/AddonsSection";
import { ProjectTypesSection } from "@/components/pricing-manager/ProjectTypesSection";
import { LivePreviewCard } from "@/components/pricing-manager/LivePreviewCard";
import { usePricingManagerData } from "@/hooks/pricing-manager/usePricingManagerData";
import { usePricingPreviewState } from "@/hooks/pricing-manager/usePricingPreviewState";

// ── Main Export ───────────────────────────────────────────────────────────────

export function PricingSettingsBody() {
  const { data, models, addons, projectTypes, companyId, isLoading, isError } = usePricingManagerData();

  const {
    selectedType, setSelectedType,
    previewFinish, setPreviewFinish,
    previewSqft, setPreviewSqft,
    searchInput, setSearchInput, search,
    syncFlash,
  } = usePricingPreviewState(data, models, addons, projectTypes);

  if (isLoading) return <PricingSkeletons />;

  if (isError) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-red-500">
        <AlertCircle className="h-5 w-5" />
        <span className="text-sm">Failed to load pricing data. Please refresh.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-2.5">
        <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-800">
          These rates are specific to your company. The AI only identifies project parameters — it does not change these rates.
          Editing a rate will affect all new estimates immediately.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search cost models, add-ons, project types…"
          className="pl-9 pr-9 text-sm h-9"
          aria-label="Search Pricing Manager"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Split-screen layout: config on left, live preview sticky on right */}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px] items-start">
        {/* ── Left: scrollable configuration panel ── */}
        <div className="space-y-3 min-w-0">
          <CostModelsSection
            models={models}
            projectTypes={projectTypes}
            selectedType={selectedType}
            search={search}
            onTypeChange={setSelectedType}
            previewFinish={previewFinish}
            onFinishChange={setPreviewFinish}
          />

          <AddonsSection
            addons={addons}
            projectTypes={projectTypes}
            search={search}
          />

          <ProjectTypesSection
            projectTypes={projectTypes}
            companyId={companyId}
            search={search}
          />
        </div>

        {/* ── Right: sticky live preview ── */}
        <div className="hidden xl:block">
          <div className="sticky top-4">
            <LivePreviewCard
              models={models}
              addons={addons}
              projectTypes={projectTypes}
              selectedType={selectedType}
              previewFinish={previewFinish}
              onFinishChange={setPreviewFinish}
              previewSqft={previewSqft}
              onSqftChange={setPreviewSqft}
              syncFlash={syncFlash}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
