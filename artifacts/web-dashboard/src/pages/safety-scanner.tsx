import { useState } from "react";
import { Camera, History } from "lucide-react";
import SafetyScanNewPage from "@/pages/safety-scan-new";
import { ScanHistoryTab } from "@/components/safety-scanner/ScanHistoryTab";

type SubTab = "new" | "history";

/** AI Safety Scanner shell — New Scan capture + Scan History (audit log), mounted as a tab in safety-compliance.tsx. */
export default function SafetyScannerPage() {
  const [sub, setSub] = useState<SubTab>("new");

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex gap-1 px-6 pt-4">
        <button
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            sub === "new" ? "text-[#111111]" : "text-zinc-500 hover:text-zinc-300"
          }`}
          style={{ background: sub === "new" ? "#C9A84C" : "#1a1a1a" }}
          onClick={() => setSub("new")}
        >
          <Camera className="h-3.5 w-3.5" />New Scan
        </button>
        <button
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            sub === "history" ? "text-[#111111]" : "text-zinc-500 hover:text-zinc-300"
          }`}
          style={{ background: sub === "history" ? "#C9A84C" : "#1a1a1a" }}
          onClick={() => setSub("history")}
        >
          <History className="h-3.5 w-3.5" />Scan History
        </button>
      </div>

      <div className="flex-1">
        {sub === "new" ? <SafetyScanNewPage /> : (
          <div className="p-6"><ScanHistoryTab /></div>
        )}
      </div>
    </div>
  );
}
