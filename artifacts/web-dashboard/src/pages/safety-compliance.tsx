import { useState } from "react";
import { useSearch } from "wouter";
import { ClipboardList, ShieldAlert, BadgeCheck, Bot } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import { useCompanyFeatures, FeatureGuard } from "@/components/FeatureGuard";
import InspectionsPage from "@/pages/inspections";
import SafetyPage from "@/pages/safety";
import CorCompliancePage from "@/pages/cor-compliance";
import AIComplianceMonitorPage from "@/pages/ai-compliance-monitor";

type Tab = "ai-compliance" | "inspections" | "safety" | "cor";

export default function SafetyCompliancePage() {
  const { data: me } = useGetMe();
  const companyId = me?.activeCompanyId as number | null | undefined;
  const { data: featureData } = useCompanyFeatures(companyId);
  const search = useSearch();

  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";
  const hasPerm = (key: string): boolean => {
    if (!me?.permissions) return true;
    return (me.permissions as Record<string, boolean>)[key] !== false;
  };
  const canViewAiCompliance =
    isOwnerOrForeman &&
    (me?.systemRole === "super_admin" || (featureData?.features?.includes("AI_COMPLIANCE") ?? false));
  const canViewInspections = hasPerm("viewInspectTab");
  const canViewCor =
    me?.systemRole === "super_admin" || (featureData?.features?.includes("COR_MODULE") ?? false);

  const requestedTab = new URLSearchParams(search).get("tab");
  const [tab, setTab] = useState<Tab>(() => {
    if (requestedTab === "ai-compliance" && canViewAiCompliance) return "ai-compliance";
    if (requestedTab === "inspections" && canViewInspections) return "inspections";
    if (requestedTab === "safety") return "safety";
    if (requestedTab === "cor" && canViewCor) return "cor";
    return canViewAiCompliance ? "ai-compliance" : canViewInspections ? "inspections" : "safety";
  });

  return (
    <div className="flex flex-col min-h-full">
      {/* Underline tab bar */}
      <div className="border-b border-[#D4AF37]/20 bg-white shrink-0 px-6">
        <div className="flex gap-0 -mb-px">
          {canViewAiCompliance && (
            <button
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === "ai-compliance"
                  ? "border-[#D4AF37] text-[#D4AF37]"
                  : "border-transparent text-[#121212]/60 hover:text-[#121212] hover:border-[#D4AF37]/30"
              }`}
              onClick={() => setTab("ai-compliance")}
            >
              <Bot className="h-4 w-4" />
              AI Compliance
            </button>
          )}
          {canViewInspections && (
            <button
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === "inspections"
                  ? "border-[#D4AF37] text-[#D4AF37]"
                  : "border-transparent text-[#121212]/60 hover:text-[#121212] hover:border-[#D4AF37]/30"
              }`}
              onClick={() => setTab("inspections")}
            >
              <ClipboardList className="h-4 w-4" />
              Inspections
            </button>
          )}
          <button
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === "safety"
                ? "border-[#D4AF37] text-[#D4AF37]"
                : "border-transparent text-[#121212]/60 hover:text-[#121212] hover:border-[#D4AF37]/30"
            }`}
            onClick={() => setTab("safety")}
          >
            <ShieldAlert className="h-4 w-4" />
            Safety & Forms
          </button>
          {canViewCor && (
            <button
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === "cor"
                  ? "border-[#D4AF37] text-[#D4AF37]"
                  : "border-transparent text-[#121212]/60 hover:text-[#121212] hover:border-[#D4AF37]/30"
              }`}
              onClick={() => setTab("cor")}
            >
              <BadgeCheck className="h-4 w-4" />
              COR Compliance
            </button>
          )}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1">
        {tab === "ai-compliance" && canViewAiCompliance && (
          <div className="p-6">
            <AIComplianceMonitorPage />
          </div>
        )}
        {tab === "inspections" && canViewInspections && (
          <div className="p-6">
            <InspectionsPage />
          </div>
        )}
        {tab === "safety" && <SafetyPage />}
        {tab === "cor" && canViewCor && (
          <FeatureGuard feature="COR_MODULE">
            <CorCompliancePage />
          </FeatureGuard>
        )}
      </div>
    </div>
  );
}
