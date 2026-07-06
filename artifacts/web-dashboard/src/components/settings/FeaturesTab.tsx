import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ChevronDown, ChevronRight, Loader2, ToggleRight,
  Package, ShieldCheck, Users, Layers, DollarSign, Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useFeatures, type AvailableFeature } from "@/hooks/settings/useFeatures";

// ── Feature metadata displayed in the picker ──────────────────────────────────

const FEATURE_META: Record<string, { icon: LucideIcon; description: string; category: string }> = {
  INVENTORY: {
    icon: Package,
    description: "Fleet dispatch board, materials stoplight tracking, and tool rental counter.",
    category: "Operations",
  },
  PERMITS: {
    icon: ShieldCheck,
    description: "Track, request, and manage municipal and environmental project permits.",
    category: "Compliance",
  },
  CONTACTS: {
    icon: Users,
    description: "Client, worker, and subcontractor CRM with COI compliance tracking.",
    category: "CRM",
  },
  SCHEDULING: {
    icon: Layers,
    description: "Crew and equipment scheduling, Gantt views, and worker hour tracking.",
    category: "Operations",
  },
  SAFETY_FORMS: {
    icon: ShieldCheck,
    description: "Dynamic safety forms, inspection checklists, and compliance sign-offs.",
    category: "Compliance",
  },
  FINANCIALS: {
    icon: DollarSign,
    description: "P&L reports, cost tracking, and financial dashboards.",
    category: "Finance",
  },
  AI_CHAT: {
    icon: Layers,
    description: "AI construction assistant for estimating, RFIs, and field queries.",
    category: "AI",
  },
  TRADEHUB: {
    icon: Globe,
    description: "Marketplace for finding and hiring local trades and subcontractors.",
    category: "Marketplace",
  },
};

export function FeaturesTab({ companyId }: { companyId: number }) {
  const [collapsed, setCollapsed] = useState(true);
  const { features, isLoading, toggling, handleToggle, activeCount } = useFeatures(companyId, !collapsed);

  return (
    <Card>
      <button onClick={() => setCollapsed((c) => !c)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ToggleRight className="h-5 w-5" style={{ color: "#D4AF37" }} />
              Features
            </CardTitle>
            <CardDescription>
              Enable or disable platform modules for your company.
              {!collapsed && activeCount > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 border border-green-200">
                  {activeCount} active
                </span>
              )}
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>

      {!collapsed && (
        <CardContent className="space-y-2 pt-0">
          {isLoading ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="h-9 w-9 rounded-lg bg-gray-100" />
                  <div className="flex-1">
                    <div className="h-3.5 w-32 bg-gray-100 rounded mb-1.5" />
                    <div className="h-3 w-48 bg-gray-100 rounded" />
                  </div>
                  <div className="h-6 w-11 rounded-full bg-gray-100" />
                </div>
              ))}
            </div>
          ) : features.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No features found. Contact your administrator.
            </p>
          ) : (
            <>
              {/* Group by category */}
              {Object.entries(
                features.reduce<Record<string, AvailableFeature[]>>((acc, f) => {
                  const cat = FEATURE_META[f.key]?.category ?? "Other";
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(f);
                  return acc;
                }, {}),
              ).map(([category, items]) => (
                <div key={category}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-4 mb-2 px-1">
                    {category}
                  </p>
                  <div className="space-y-1">
                    {items.map((feature) => {
                      const meta = FEATURE_META[feature.key];
                      const Icon = meta?.icon ?? Package;
                      const isToggling = toggling === feature.key;

                      return (
                        <div
                          key={feature.key}
                          className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/40"
                        >
                          <div
                            className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{
                              background: feature.active ? "#D4AF3718" : "#f3f4f6",
                              border: `1px solid ${feature.active ? "#D4AF3740" : "#e5e7eb"}`,
                            }}
                          >
                            <Icon
                              className="h-4 w-4"
                              style={{ color: feature.active ? "#D4AF37" : "#9ca3af" }}
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">{feature.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {meta?.description ?? feature.description ?? "—"}
                            </p>
                          </div>

                          {/* Toggle pill */}
                          <button
                            disabled={isToggling}
                            onClick={() => handleToggle(feature.key, !feature.active)}
                            className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none disabled:opacity-50"
                            style={{
                              background: feature.active ? "#D4AF37" : "#e5e7eb",
                            }}
                            aria-checked={feature.active}
                            role="switch"
                          >
                            {isToggling ? (
                              <Loader2
                                className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin"
                                style={{ color: feature.active ? "#fff" : "#6b7280" }}
                              />
                            ) : (
                              <span
                                className="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform"
                                style={{
                                  transform: feature.active ? "translateX(22px)" : "translateX(2px)",
                                }}
                              />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <p className="text-xs text-muted-foreground pt-4 pb-1">
                Feature availability is determined by your subscription plan. Contact support to unlock additional modules.
              </p>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
