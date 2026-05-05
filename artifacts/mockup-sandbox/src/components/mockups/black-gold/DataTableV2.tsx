import {
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  MoreHorizontal,
  Search,
  ChevronUp,
  ChevronDown,
  Plus,
} from "lucide-react";

const GOLD = "#D4AF37";
const BLACK = "#0A0A0A";
const SURFACE = "#111111";
const SURFACE2 = "#181818";
const BORDER = "#242424";
const WHITE = "#FFFFFF";
const MUTED = "#888888";

const stats = [
  { label: "Total Revenue",    value: "$284,500", change: "+12.4%", up: true,  icon: DollarSign,   sub: "vs last month" },
  { label: "Active Projects",  value: "14",       change: "+3",     up: true,  icon: TrendingUp,   sub: "2 closing soon" },
  { label: "Pending Invoices", value: "$62,100",  change: "-8.2%",  up: false, icon: Clock,        sub: "6 outstanding" },
  { label: "Completed",        value: "38",       change: "+5",     up: true,  icon: CheckCircle2, sub: "this quarter" },
];

const rows = [
  { id: "PRJ-001", project: "Maple Ridge Townhomes",    client: "Barrett Developments", value: "$1,240,000", status: "active",   progress: 68, due: "Jun 30, 2025",  pm: "S. Kowalski" },
  { id: "PRJ-002", project: "Westfield Office Reno",    client: "Arcane Properties",    value: "$387,500",   status: "review",   progress: 92, due: "May 15, 2025",  pm: "T. Nguyen" },
  { id: "PRJ-003", project: "Harbour View Condos",      client: "Coastal Living Corp",  value: "$3,100,000", status: "active",   progress: 34, due: "Dec 1, 2025",   pm: "L. Ferreira" },
  { id: "PRJ-004", project: "Elk Valley Warehouse",     client: "Northern Logistics",   value: "$720,000",   status: "overdue",  progress: 47, due: "Apr 1, 2025",   pm: "J. Riley" },
  { id: "PRJ-005", project: "Sunrise Elementary Ext.",  client: "City of Surrey",       value: "$560,000",   status: "complete", progress: 100, due: "Mar 20, 2025", pm: "A. Patel" },
  { id: "PRJ-006", project: "Pine Creek Bridge",        client: "BC Transportation",    value: "$2,450,000", status: "active",   progress: 21, due: "Mar 15, 2026",  pm: "R. Okafor" },
];

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  active:   { label: "Active",    color: GOLD,      bg: `${GOLD}18`,  border: `${GOLD}33` },
  review:   { label: "In Review", color: "#60A5FA", bg: "#1e3a5f33",  border: "#1e3a5f66" },
  overdue:  { label: "Overdue",   color: "#F87171", bg: "#3b0f0f33",  border: "#5a1a1a66" },
  complete: { label: "Complete",  color: "#4ADE80", bg: "#0f3b1e33",  border: "#1a5a2e66" },
};

export function DataTableV2() {
  return (
    <div className="min-h-screen flex" style={{ background: BLACK, fontFamily: "'Inter', sans-serif" }}>

      {/* LEFT — Vertical stat column */}
      <div
        className="flex flex-col gap-0 flex-shrink-0"
        style={{ width: 220, borderRight: `1px solid ${BORDER}`, background: SURFACE, paddingTop: 24 }}
      >
        {/* Header label */}
        <div className="px-5 pb-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#444" }}>Overview</p>
          <p className="text-base font-bold mt-1" style={{ color: WHITE }}>Q2 2025</p>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>British Columbia</p>
        </div>

        {/* Stat cells — stacked vertically */}
        {stats.map(({ label, value, change, up, icon: Icon, sub }) => (
          <div
            key={label}
            className="px-5 py-5 relative overflow-hidden"
            style={{ borderBottom: `1px solid ${BORDER}` }}
          >
            <div style={{
              position: "absolute", bottom: -16, right: -16, width: 64, height: 64,
              background: `radial-gradient(circle, ${GOLD}0A 0%, transparent 70%)`,
            }} />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: MUTED }}>{label}</span>
              <div className="rounded-md flex items-center justify-center"
                style={{ width: 22, height: 22, background: `${GOLD}14`, border: `1px solid ${GOLD}2A` }}>
                <Icon size={11} style={{ color: GOLD }} />
              </div>
            </div>
            <p className="text-xl font-bold" style={{ color: WHITE }}>{value}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs font-semibold flex items-center gap-0.5" style={{ color: up ? "#4ADE80" : "#F87171" }}>
                {up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}{change}
              </span>
              <span className="text-xs" style={{ color: "#555" }}>{sub}</span>
            </div>
          </div>
        ))}

        {/* New project button at bottom */}
        <div className="px-4 mt-auto pb-6 pt-4">
          <button
            className="w-full flex items-center justify-center gap-2 text-xs font-semibold py-2.5 rounded-lg"
            style={{ background: GOLD, color: BLACK }}
          >
            <Plus size={13} /> New Project
          </button>
        </div>
      </div>

      {/* RIGHT — Table panel */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <div>
            <h1 className="text-lg font-bold tracking-tight" style={{ color: WHITE }}>Project Overview</h1>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>All active job sites</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg px-3 py-1.5"
              style={{ background: SURFACE2, border: `1px solid ${BORDER}`, width: 200 }}>
              <Search size={12} style={{ color: "#555" }} />
              <span className="text-xs" style={{ color: "#555" }}>Search projects…</span>
            </div>
            <div className="flex items-center gap-1">
              {["All", "Active", "Complete"].map((f) => (
                <button key={f} className="text-xs px-2.5 py-1 rounded-md font-medium"
                  style={{
                    background: f === "All" ? `${GOLD}18` : "transparent",
                    color: f === "All" ? GOLD : MUTED,
                    border: f === "All" ? `1px solid ${GOLD}33` : "1px solid transparent",
                  }}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr style={{ borderBottom: `1px solid ${BORDER}`, background: SURFACE2 }}>
                {[
                  { label: "Project",  sortable: true },
                  { label: "Client",   sortable: false },
                  { label: "Value",    sortable: true },
                  { label: "Status",   sortable: false },
                  { label: "Progress", sortable: true },
                  { label: "Due Date", sortable: true },
                  { label: "PM",       sortable: false },
                  { label: "",         sortable: false },
                ].map(({ label, sortable }) => (
                  <th key={label || "actions"} className="text-left px-4 py-3 font-semibold tracking-wider"
                    style={{ color: GOLD, fontSize: 10, textTransform: "uppercase" }}>
                    <div className="flex items-center gap-1">
                      {label}
                      {sortable && (
                        <div className="flex flex-col" style={{ opacity: 0.4 }}>
                          <ChevronUp size={8} style={{ marginBottom: -2 }} />
                          <ChevronDown size={8} />
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const st = statusConfig[row.status];
                return (
                  <tr key={row.id}
                    style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 0 ? "#0f0f0f" : SURFACE2 }}>
                    <td className="px-4 py-3">
                      <p className="font-semibold" style={{ color: WHITE, fontSize: 12 }}>{row.project}</p>
                      <p style={{ color: "#555", fontSize: 10 }}>{row.id}</p>
                    </td>
                    <td className="px-4 py-3" style={{ color: MUTED, fontSize: 12 }}>{row.client}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold" style={{ color: GOLD, fontSize: 12 }}>{row.value}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                        style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontSize: 10 }}>
                        {row.status === "overdue" && <AlertCircle size={9} />}
                        {row.status === "complete" && <CheckCircle2 size={9} />}
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2" style={{ width: 100 }}>
                        <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, background: "#222" }}>
                          <div style={{
                            width: `${row.progress}%`, height: "100%", borderRadius: 999,
                            background: row.progress === 100 ? "#4ADE80" : row.status === "overdue" ? "#F87171" : GOLD,
                          }} />
                        </div>
                        <span style={{ color: MUTED, fontSize: 10, width: 26, textAlign: "right" }}>{row.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: row.status === "overdue" ? "#F87171" : MUTED, fontSize: 11 }}>
                      {row.due}
                    </td>
                    <td className="px-4 py-3" style={{ color: MUTED, fontSize: 11 }}>{row.pm}</td>
                    <td className="px-4 py-3">
                      <button style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                        <MoreHorizontal size={14} style={{ color: "#555" }} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3"
          style={{ borderTop: `1px solid ${BORDER}`, background: SURFACE2 }}>
          <span className="text-xs" style={{ color: "#555" }}>Showing 1–6 of 38 projects</span>
          <div className="flex items-center gap-1">
            {["‹", "1", "2", "3", "›"].map((p, i) => (
              <button key={i} className="text-xs font-medium rounded-md"
                style={{
                  width: 26, height: 26,
                  background: p === "1" ? `${GOLD}18` : "transparent",
                  color: p === "1" ? GOLD : "#555",
                  border: p === "1" ? `1px solid ${GOLD}33` : "1px solid transparent",
                  cursor: "pointer",
                }}>{p}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
