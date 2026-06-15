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
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

const GOLD = "#D4AF37";
const BLACK = "#0A0A0A";
const SURFACE = "#111111";
const SURFACE2 = "#181818";
const SURFACE3 = "#1E1E1E";
const BORDER = "#242424";
const WHITE = "#FFFFFF";
const MUTED = "#888888";

const stats = [
  {
    label: "Total Revenue",
    value: "$284,500",
    change: "+12.4%",
    up: true,
    icon: DollarSign,
    sub: "vs last month",
  },
  {
    label: "Active Projects",
    value: "14",
    change: "+3",
    up: true,
    icon: TrendingUp,
    sub: "2 closing soon",
  },
  {
    label: "Pending Invoices",
    value: "$62,100",
    change: "-8.2%",
    up: false,
    icon: Clock,
    sub: "6 outstanding",
  },
  {
    label: "Completed",
    value: "38",
    change: "+5",
    up: true,
    icon: CheckCircle2,
    sub: "this quarter",
  },
];

const rows = [
  {
    id: "PRJ-001",
    project: "Maple Ridge Townhomes",
    client: "Barrett Developments",
    value: "$1,240,000",
    status: "active",
    progress: 68,
    due: "Jun 30, 2025",
    pm: "S. Kowalski",
  },
  {
    id: "PRJ-002",
    project: "Westfield Office Reno",
    client: "Arcane Properties",
    value: "$387,500",
    status: "review",
    progress: 92,
    due: "May 15, 2025",
    pm: "T. Nguyen",
  },
  {
    id: "PRJ-003",
    project: "Harbour View Condos",
    client: "Coastal Living Corp",
    value: "$3,100,000",
    status: "active",
    progress: 34,
    due: "Dec 1, 2025",
    pm: "L. Ferreira",
  },
  {
    id: "PRJ-004",
    project: "Elk Valley Warehouse",
    client: "Northern Logistics",
    value: "$720,000",
    status: "overdue",
    progress: 47,
    due: "Apr 1, 2025",
    pm: "J. Riley",
  },
  {
    id: "PRJ-005",
    project: "Sunrise Elementary Ext.",
    client: "City of Surrey",
    value: "$560,000",
    status: "complete",
    progress: 100,
    due: "Mar 20, 2025",
    pm: "A. Patel",
  },
  {
    id: "PRJ-006",
    project: "Pine Creek Bridge",
    client: "BC Transportation",
    value: "$2,450,000",
    status: "active",
    progress: 21,
    due: "Mar 15, 2026",
    pm: "R. Okafor",
  },
];

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  active: { label: "Active", color: GOLD, bg: `${GOLD}18`, border: `${GOLD}33` },
  review: { label: "In Review", color: "#60A5FA", bg: "#1e3a5f33", border: "#1e3a5f66" },
  overdue: { label: "Overdue", color: "#F87171", bg: "#3b0f0f33", border: "#5a1a1a66" },
  complete: { label: "Complete", color: "#4ADE80", bg: "#0f3b1e33", border: "#1a5a2e66" },
};

export function DataTable() {
  return (
    <div
      className="min-h-screen p-6"
      style={{ background: BLACK, fontFamily: "'Inter', sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: WHITE }}
          >
            Project Overview
          </h1>
          <p className="text-sm mt-0.5" style={{ color: MUTED }}>
            British Columbia · Q2 2025
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg"
            style={{
              background: SURFACE2,
              color: MUTED,
              border: `1px solid ${BORDER}`,
            }}
          >
            <SlidersHorizontal size={13} />
            Filter
          </button>
          <button
            className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg"
            style={{
              background: GOLD,
              color: BLACK,
            }}
          >
            + New Project
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {stats.map(({ label, value, change, up, icon: Icon, sub }) => (
          <div
            key={label}
            className="rounded-xl p-4 relative overflow-hidden"
            style={{
              background: SURFACE,
              border: `1px solid ${BORDER}`,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -20,
                right: -20,
                width: 80,
                height: 80,
                background: `radial-gradient(circle, ${GOLD}0A 0%, transparent 70%)`,
              }}
            />
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium" style={{ color: MUTED }}>
                {label}
              </span>
              <div
                className="rounded-lg flex items-center justify-center"
                style={{
                  width: 28,
                  height: 28,
                  background: `${GOLD}14`,
                  border: `1px solid ${GOLD}2A`,
                }}
              >
                <Icon size={13} style={{ color: GOLD }} />
              </div>
            </div>
            <p className="text-xl font-bold mb-1" style={{ color: WHITE }}>
              {value}
            </p>
            <div className="flex items-center gap-1.5">
              <div
                className="flex items-center gap-0.5 text-xs font-semibold"
                style={{ color: up ? "#4ADE80" : "#F87171" }}
              >
                {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {change}
              </div>
              <span className="text-xs" style={{ color: "#555" }}>
                {sub}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: `1px solid ${BORDER}`, background: SURFACE }}
      >
        {/* Table toolbar */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-1.5"
            style={{
              background: SURFACE2,
              border: `1px solid ${BORDER}`,
              width: 220,
            }}
          >
            <Search size={13} style={{ color: "#555" }} />
            <span className="text-xs" style={{ color: "#555" }}>
              Search projects…
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: MUTED }}>
              {rows.length} projects
            </span>
            <div
              className="h-4 w-px"
              style={{ background: BORDER }}
            />
            <div className="flex items-center gap-1">
              {["All", "Active", "Complete"].map((f) => (
                <button
                  key={f}
                  className="text-xs px-2.5 py-1 rounded-md font-medium"
                  style={{
                    background: f === "All" ? `${GOLD}18` : "transparent",
                    color: f === "All" ? GOLD : MUTED,
                    border: f === "All" ? `1px solid ${GOLD}33` : "1px solid transparent",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table head */}
        <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              {[
                { label: "Project", sortable: true },
                { label: "Client", sortable: false },
                { label: "Value", sortable: true },
                { label: "Status", sortable: false },
                { label: "Progress", sortable: true },
                { label: "Due Date", sortable: true },
                { label: "PM", sortable: false },
                { label: "", sortable: false },
              ].map(({ label, sortable }) => (
                <th
                  key={label}
                  className="text-left px-4 py-3 font-semibold tracking-wider"
                  style={{ color: GOLD, fontSize: 10, textTransform: "uppercase", background: SURFACE2 }}
                >
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
                <tr
                  key={row.id}
                  style={{
                    borderBottom: `1px solid ${BORDER}`,
                    background: i % 2 === 0 ? SURFACE : SURFACE2,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = SURFACE3;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      i % 2 === 0 ? SURFACE : SURFACE2;
                  }}
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold" style={{ color: WHITE, fontSize: 12 }}>
                        {row.project}
                      </p>
                      <p className="text-xs" style={{ color: "#555", fontSize: 10 }}>
                        {row.id}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ color: MUTED, fontSize: 12 }}>
                    {row.client}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold" style={{ color: GOLD, fontSize: 12 }}>
                      {row.value}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{
                        background: st.bg,
                        color: st.color,
                        border: `1px solid ${st.border}`,
                        fontSize: 10,
                      }}
                    >
                      {row.status === "overdue" && <AlertCircle size={9} />}
                      {row.status === "complete" && <CheckCircle2 size={9} />}
                      {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2" style={{ width: 100 }}>
                      <div
                        className="flex-1 rounded-full overflow-hidden"
                        style={{ height: 4, background: "#222" }}
                      >
                        <div
                          style={{
                            width: `${row.progress}%`,
                            height: "100%",
                            background:
                              row.progress === 100
                                ? "#4ADE80"
                                : row.status === "overdue"
                                ? "#F87171"
                                : GOLD,
                            borderRadius: 999,
                            transition: "width 0.3s",
                          }}
                        />
                      </div>
                      <span
                        className="text-xs font-medium flex-shrink-0"
                        style={{ color: MUTED, fontSize: 10, width: 26, textAlign: "right" }}
                      >
                        {row.progress}%
                      </span>
                    </div>
                  </td>
                  <td
                    className="px-4 py-3 text-xs"
                    style={{
                      color: row.status === "overdue" ? "#F87171" : MUTED,
                      fontSize: 11,
                    }}
                  >
                    {row.due}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: MUTED, fontSize: 11 }}>
                    {row.pm}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className="rounded-md p-1"
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      <MoreHorizontal size={14} style={{ color: "#555" }} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderTop: `1px solid ${BORDER}`, background: SURFACE2 }}
        >
          <span className="text-xs" style={{ color: "#555" }}>
            Showing 1–6 of 38 projects
          </span>
          <div className="flex items-center gap-1">
            {["‹", "1", "2", "3", "›"].map((p, i) => (
              <button
                key={i}
                className="text-xs font-medium rounded-md"
                style={{
                  width: 26,
                  height: 26,
                  background: p === "1" ? `${GOLD}18` : "transparent",
                  color: p === "1" ? GOLD : "#555",
                  border: p === "1" ? `1px solid ${GOLD}33` : "1px solid transparent",
                  cursor: "pointer",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
