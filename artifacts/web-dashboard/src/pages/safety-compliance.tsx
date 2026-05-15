import { useState } from "react";
import { ClipboardList, ShieldAlert } from "lucide-react";
import InspectionsPage from "@/pages/inspections";
import SafetyPage from "@/pages/safety";

export default function SafetyCompliancePage() {
  const [tab, setTab] = useState<"inspections" | "safety">("inspections");

  return (
    <div className="flex flex-col min-h-full">
      {/* Underline tab bar */}
      <div className="border-b border-[#D4AF37]/20 bg-white shrink-0 px-6">
        <div className="flex gap-0 -mb-px">
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
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1">
        {tab === "inspections" && (
          <div className="p-6">
            <InspectionsPage />
          </div>
        )}
        {tab === "safety" && <SafetyPage />}
      </div>
    </div>
  );
}
