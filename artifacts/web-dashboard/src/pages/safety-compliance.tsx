import { useState } from "react";
import { useSearch } from "wouter";
import { ClipboardList, ShieldAlert, BadgeCheck, Bot, ScanEye, Headphones } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import { useCompanyFeatures, FeatureGuard } from "@/components/FeatureGuard";
import InspectionsPage from "@/pages/inspections";
import SafetyPage from "@/pages/safety";
import CorCompliancePage from "@/pages/cor-compliance";
import AIComplianceMonitorPage from "@/pages/ai-compliance-monitor";
import SafetyScannerPage from "@/pages/safety-scanner";
import VoiceInspectionPage from "@/pages/voice-inspection";

type Tab = "ai-compliance" | "safety-forms" | "cor" | "ai-scanners";
type SafetyFormsSubTab = "inspections" | "forms";
type ScannerSubTab = "scanner" | "voice";

// Legacy tab query values are kept working by mapping them onto the consolidated tabs below.
function resolveTab(
  requestedTab: string | null,
  perms: { canViewAiCompliance: boolean; canViewCor: boolean; canViewScanners: boolean },
): Tab {
  if (requestedTab === "ai-compliance" && perms.canViewAiCompliance) return "ai-compliance";
  if ((requestedTab === "inspections" || requestedTab === "safety")) return "safety-forms";
  if (requestedTab === "cor" && perms.canViewCor) return "cor";
  if ((requestedTab === "scanner" || requestedTab === "voice-inspection") && perms.canViewScanners) return "ai-scanners";
  return perms.canViewAiCompliance ? "ai-compliance" : "safety-forms";
}

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
  const canViewScanner =
    hasPerm("viewSafetyTab") &&
    (me?.systemRole === "super_admin" || (featureData?.features?.includes("SAFETY_SCANNER") ?? false));
  const canViewVoiceInspection =
    isOwnerOrForeman &&
    hasPerm("viewSafetyTab") &&
    (me?.systemRole === "super_admin" || (featureData?.features?.includes("VOICE_INSPECTION") ?? false));
  const canViewScanners = canViewScanner || canViewVoiceInspection;

  const params = new URLSearchParams(search);
  const requestedTab = params.get("tab");
  const requestedSub = params.get("sub");

  const [tab, setTab] = useState<Tab>(() =>
    resolveTab(requestedTab, { canViewAiCompliance, canViewCor, canViewScanners }),
  );

  const [safetyFormsSub, setSafetyFormsSub] = useState<SafetyFormsSubTab>(() => {
    if (requestedTab === "inspections" && canViewInspections) return "inspections";
    if (requestedTab === "safety") return "forms";
    if (requestedSub === "inspections" && canViewInspections) return "inspections";
    if (requestedSub === "forms") return "forms";
    return canViewInspections ? "inspections" : "forms";
  });

  const [scannerSub, setScannerSub] = useState<ScannerSubTab>(() => {
    if (requestedTab === "voice-inspection" && canViewVoiceInspection) return "voice";
    if (requestedTab === "scanner" && canViewScanner) return "scanner";
    if (requestedSub === "voice" && canViewVoiceInspection) return "voice";
    if (requestedSub === "scanner" && canViewScanner) return "scanner";
    return canViewScanner ? "scanner" : "voice";
  });

  return (
    <div className="flex flex-col min-h-full">
      {/* Top-level tab bar */}
      <div className="border-b border-[#D4AF37]/20 bg-white shrink-0 px-6 overflow-x-auto">
        <div className="flex gap-0 -mb-px flex-nowrap">
          {canViewAiCompliance && (
            <button
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                tab === "ai-compliance"
                  ? "border-[#D4AF37] text-[#D4AF37] font-bold"
                  : "border-transparent text-[#000000] hover:border-[#D4AF37]/30"
              }`}
              onClick={() => setTab("ai-compliance")}
            >
              <Bot className="h-4 w-4" />
              AI Compliance
            </button>
          )}
          <button
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
              tab === "safety-forms"
                ? "border-[#D4AF37] text-[#D4AF37] font-bold"
                : "border-transparent text-[#000000] hover:border-[#D4AF37]/30"
            }`}
            onClick={() => setTab("safety-forms")}
          >
            <ShieldAlert className="h-4 w-4" />
            Safety & Forms
          </button>
          {canViewCor && (
            <button
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                tab === "cor"
                  ? "border-[#D4AF37] text-[#D4AF37] font-bold"
                  : "border-transparent text-[#000000] hover:border-[#D4AF37]/30"
              }`}
              onClick={() => setTab("cor")}
            >
              <BadgeCheck className="h-4 w-4" />
              COR Compliance
            </button>
          )}
          {canViewScanners && (
            <button
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                tab === "ai-scanners"
                  ? "border-[#D4AF37] text-[#D4AF37] font-bold"
                  : "border-transparent text-[#000000] hover:border-[#D4AF37]/30"
              }`}
              onClick={() => setTab("ai-scanners")}
            >
              <ScanEye className="h-4 w-4" />
              AI & Voice Scanners
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

        {tab === "safety-forms" && (
          <div className="flex flex-col min-h-full">
            {canViewInspections && (
              <div className="flex gap-1 px-6 pt-4">
                <button
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    safetyFormsSub === "inspections"
                      ? "text-[#111111]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={{ background: safetyFormsSub === "inspections" ? "#D4AF37" : "transparent" }}
                  onClick={() => setSafetyFormsSub("inspections")}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Inspections
                </button>
                <button
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    safetyFormsSub === "forms"
                      ? "text-[#111111]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={{ background: safetyFormsSub === "forms" ? "#D4AF37" : "transparent" }}
                  onClick={() => setSafetyFormsSub("forms")}
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Forms, Hazards & Checklists
                </button>
              </div>
            )}
            <div className="flex-1">
              {safetyFormsSub === "inspections" && canViewInspections ? (
                <div className="p-6">
                  <InspectionsPage />
                </div>
              ) : (
                <SafetyPage />
              )}
            </div>
          </div>
        )}

        {tab === "cor" && canViewCor && (
          <FeatureGuard feature="COR_MODULE">
            <CorCompliancePage />
          </FeatureGuard>
        )}

        {tab === "ai-scanners" && canViewScanners && (
          <div className="flex flex-col min-h-full">
            {canViewScanner && canViewVoiceInspection && (
              <div className="flex gap-1 px-6 pt-4">
                <button
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    scannerSub === "scanner"
                      ? "text-[#111111]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={{ background: scannerSub === "scanner" ? "#D4AF37" : "transparent" }}
                  onClick={() => setScannerSub("scanner")}
                >
                  <ScanEye className="h-3.5 w-3.5" />
                  AI Safety Scanner
                </button>
                <button
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    scannerSub === "voice"
                      ? "text-[#111111]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={{ background: scannerSub === "voice" ? "#D4AF37" : "transparent" }}
                  onClick={() => setScannerSub("voice")}
                >
                  <Headphones className="h-3.5 w-3.5" />
                  Voice Notes & Inspections
                </button>
              </div>
            )}
            <div className="flex-1">
              {scannerSub === "scanner" && canViewScanner && (
                <FeatureGuard feature="SAFETY_SCANNER">
                  <SafetyScannerPage />
                </FeatureGuard>
              )}
              {scannerSub === "voice" && canViewVoiceInspection && (
                <FeatureGuard feature="VOICE_INSPECTION">
                  <VoiceInspectionPage />
                </FeatureGuard>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
