import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Layers, Wrench, AlertTriangle, ArrowRightLeft, RefreshCw, Warehouse, Boxes } from "lucide-react";
import { GOLD, SURFACE2, BORDER, TEXT, MUTED, StatTile } from "@/components/inventory/shared";
import { DispatchTab } from "@/components/inventory/DispatchTab";
import { MaterialsTab } from "@/components/inventory/MaterialsTab";
import { ToolsTab } from "@/components/inventory/ToolsTab";
import { useInventorySummary, useRefreshInventory } from "@/hooks/inventory/useInventorySummary";

const TABS = [
  { key: "dispatch", label: "Fleet Dispatch Board", icon: Calendar },
  { key: "materials", label: "Materials Board", icon: Layers },
  { key: "tools", label: "Tool Rental Counter", icon: Wrench },
] as const;

export default function InventoryPage() {
  const { data: summary, dataUpdatedAt } = useInventorySummary();
  const refreshAll = useRefreshInventory();

  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string>("");
  useEffect(() => {
    function computeLabel() {
      if (!dataUpdatedAt) return "";
      const secs = Math.floor((Date.now() - dataUpdatedAt) / 1000);
      if (secs < 5) return "just now";
      if (secs < 60) return `${secs}s ago`;
      const mins = Math.floor(secs / 60);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ago`;
    }
    setLastUpdatedLabel(computeLabel());
    const id = setInterval(() => setLastUpdatedLabel(computeLabel()), 10_000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);

  return (
    <div className="min-h-screen" style={{ background: SURFACE2, fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 space-y-5">
        {/* Page Header */}
        <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2" style={{ color: TEXT }}>
              <Warehouse className="h-6 w-6" style={{ color: GOLD }} />
              Inventory &amp; Assets
            </h1>
            <p className="text-sm mt-0.5 font-medium" style={{ color: MUTED }}>Fleet · Equipment · Materials · Tools</p>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdatedLabel && (
              <span className="text-xs hidden sm:block" style={{ color: `${MUTED}99` }}>
                Updated {lastUpdatedLabel}
              </span>
            )}
            <button
              onClick={refreshAll}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border"
              style={{ borderColor: `${GOLD}40`, color: MUTED }}
            >
              <RefreshCw size={12} style={{ color: GOLD }} /> Refresh
            </button>
          </div>
        </div>

        {/* KPI Stat Cards */}
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Total Assets" value={summary?.totalAssets ?? "—"} icon={Boxes} />
          <StatTile
            label="Material Alerts"
            value={summary?.materialAlerts ?? "—"}
            icon={AlertTriangle}
            color={(summary?.materialAlerts ?? 0) > 0 ? "#dc2626" : "#16a34a"}
          />
          <StatTile label="Checked Out" value={summary?.activeCheckouts ?? "—"} icon={ArrowRightLeft} color="#d97706" />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="dispatch">
          <TabsList
            className="h-auto rounded-lg p-1 gap-1 w-fit"
            style={{ background: SURFACE2, border: `1px solid ${BORDER}` }}
          >
            {TABS.map(({ key, label, icon: Icon }) => (
              <TabsTrigger
                key={key}
                value={key}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold text-[#888888] data-[state=active]:bg-[#FFFFFF] data-[state=active]:text-[#D4AF37] data-[state=active]:shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
              >
                <Icon size={14} />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dispatch" className="mt-5">
            <DispatchTab />
          </TabsContent>
          <TabsContent value="materials" className="mt-5">
            <MaterialsTab />
          </TabsContent>
          <TabsContent value="tools" className="mt-5">
            <ToolsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
