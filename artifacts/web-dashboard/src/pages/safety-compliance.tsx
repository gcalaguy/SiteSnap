import { useState } from "react";
import { ClipboardList, ShieldAlert } from "lucide-react";
import InspectionsPage from "@/pages/inspections";
import SafetyPage from "@/pages/safety";

export default function SafetyCompliancePage() {
  const [tab, setTab] = useState<"inspections" | "safety">("inspections");

  return (
    <div className="flex flex-col min-h-full">
      {/* Underline tab bar */}
      <div className="border-b border-border bg-background shrink-0 px-6">
        <div className="flex gap-0 -mb-px">
          <button
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === "inspections"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
            onClick={() => setTab("inspections")}
          >
            <ClipboardList className="h-4 w-4" />
            Inspections
          </button>
          <button
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === "safety"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
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
