import {
  ArrowUpRight,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  MoreHorizontal,
  Plus,
  ChevronDown,
} from "lucide-react";

const GOLD = "#D4AF37";
const BLACK = "#0A0A0A";
const SURFACE = "#111111";
const SURFACE2 = "#181818";
const BORDER = "#242424";
const WHITE = "#FFFFFF";
const MUTED = "#888888";

const groups = [
  {
    status: "active",
    label: "Active",
    color: GOLD,
    bg: `${GOLD}0F`,
    headerBg: `${GOLD}12`,
    border: `${GOLD}28`,
    rows: [
      { id: "PRJ-001", project: "Maple Ridge Townhomes",  client: "Barrett Developments", value: "$1,240,000", progress: 68,  due: "Jun 30, 2025", pm: "S. Kowalski" },
      { id: "PRJ-003", project: "Harbour View Condos",    client: "Coastal Living Corp",  value: "$3,100,000", progress: 34,  due: "Dec 1, 2025",  pm: "L. Ferreira" },
      { id: "PRJ-006", project: "Pine Creek Bridge",      client: "BC Transportation",    value: "$2,450,000", progress: 21,  due: "Mar 15, 2026", pm: "R. Okafor" },
    ],
  },
  {
    status: "review",
    label: "In Review",
    color: "#60A5FA",
    bg: "#1e3a5f0F",
    headerBg: "#1e3a5f18",
    border: "#1e3a5f44",
    rows: [
      { id: "PRJ-002", project: "Westfield Office Reno", client: "Arcane Properties", value: "$387,500", progress: 92, due: "May 15, 2025", pm: "T. Nguyen" },
    ],
  },
  {
    status: "overdue",
    label: "Overdue",
    color: "#F87171",
    bg: "#3b0f0f0F",
    headerBg: "#3b0f0f18",
    border: "#5a1a1a44",
    rows: [
      { id: "PRJ-004", project: "Elk Valley Warehouse", client: "Northern Logistics", value: "$720,000", progress: 47, due: "Apr 1, 2025", pm: "J. Riley" },
    ],
  },
  {
    status: "complete",
    label: "Complete",
    color: "#4ADE80",
    bg: "#0f3b1e0F",
    headerBg: "#0f3b1e18",
    border: "#1a5a2e44",
    rows: [
      { id: "PRJ-005", project: "Sunrise Elementary Ext.", client: "City of Surrey", value: "$560,000", progress: 100, due: "Mar 20, 2025", pm: "A. Patel" },
    ],
  },
];

const totals = [
  { label: "Portfolio Value", value: "$8.46M", icon: DollarSign },
  { label: "Active",          value: "3",      icon: TrendingUp },
  { label: "Outstanding",     value: "$62,100", icon: Clock },
  { label: "Completed",       value: "38",      icon: CheckCircle2 },
];

export function DataTableV4() {
  return (
    <div className="min-h-screen p-6" style={{ background: BLACK, fontFamily: "'Inter', sans-serif" }}>

      {/* Header + actions row */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: WHITE }}>Project Overview</h1>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>British Columbia · Q2 2025</p>
        </div>
        <button className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg"
          style={{ background: GOLD, color: BLACK }}>
          <Plus size={13} /> New Project
        </button>
      </div>

      {/* Totals bar — single horizontal strip */}
      <div className="flex items-stretch rounded-xl overflow-hidden mb-6"
        style={{ border: `1px solid ${BORDER}`, background: SURFACE }}>
        {totals.map(({ label, value, icon: Icon }, i) => (
          <div key={label} className="flex-1 flex items-center gap-3 px-5 py-4 relative"
            style={{ borderRight: i < totals.length - 1 ? `1px solid ${BORDER}` : "none" }}>
            <div className="rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ width: 32, height: 32, background: `${GOLD}14`, border: `1px solid ${GOLD}2A` }}>
              <Icon size={14} style={{ color: GOLD }} />
            </div>
            <div>
              <p className="text-base font-bold leading-none" style={{ color: WHITE }}>{value}</p>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>{label}</p>
            </div>
            <div className="ml-auto flex items-center gap-0.5 text-xs font-semibold" style={{ color: "#4ADE80" }}>
              <ArrowUpRight size={12} /><span style={{ fontSize: 10 }}>+5%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Groups */}
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.status} className="rounded-xl overflow-hidden"
            style={{ border: `1px solid ${group.border}` }}>

            {/* Group header */}
            <div className="flex items-center justify-between px-4 py-2.5"
              style={{ background: group.headerBg, borderBottom: `1px solid ${group.border}` }}>
              <div className="flex items-center gap-2.5">
                <div className="rounded-full" style={{ width: 7, height: 7, background: group.color }} />
                <span className="text-xs font-bold tracking-wide uppercase" style={{ color: group.color }}>
                  {group.label}
                </span>
                <span className="text-xs font-semibold rounded-full px-2 py-0.5"
                  style={{ background: `${group.color}18`, color: group.color, border: `1px solid ${group.color}33` }}>
                  {group.rows.length}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {/* Total value for group */}
                <span className="text-xs font-semibold" style={{ color: group.color }}>
                  ${group.rows.reduce((s, r) => s + parseFloat(r.value.replace(/[$,]/g, "")), 0).toLocaleString()}
                </span>
                <ChevronDown size={13} style={{ color: "#555" }} />
              </div>
            </div>

            {/* Rows within group */}
            <div style={{ background: SURFACE }}>
              {group.rows.map((row, i) => (
                <div key={row.id}
                  className="flex items-center px-4 py-3 gap-4"
                  style={{ borderBottom: i < group.rows.length - 1 ? `1px solid ${BORDER}` : "none" }}
                >
                  {/* Project name */}
                  <div style={{ flex: "0 0 220px", minWidth: 0 }}>
                    <p className="font-semibold truncate" style={{ color: WHITE, fontSize: 12 }}>{row.project}</p>
                    <p style={{ color: "#555", fontSize: 10 }}>{row.id}</p>
                  </div>

                  {/* Client */}
                  <div style={{ flex: "0 0 160px" }}>
                    <p className="text-xs truncate" style={{ color: MUTED }}>{row.client}</p>
                  </div>

                  {/* Progress bar — given generous width in this layout */}
                  <div className="flex items-center gap-2" style={{ flex: 1 }}>
                    <div className="flex-1 rounded-full overflow-hidden" style={{ height: 5, background: "#1a1a1a" }}>
                      <div style={{
                        width: `${row.progress}%`, height: "100%", borderRadius: 999,
                        background: group.color, transition: "width 0.3s",
                      }} />
                    </div>
                    <span style={{ color: MUTED, fontSize: 10, width: 28, textAlign: "right", flexShrink: 0 }}>
                      {row.progress}%
                    </span>
                  </div>

                  {/* Value */}
                  <div style={{ flex: "0 0 110px", textAlign: "right" }}>
                    <span className="font-semibold" style={{ color: GOLD, fontSize: 12 }}>{row.value}</span>
                  </div>

                  {/* Due date */}
                  <div style={{ flex: "0 0 110px" }}>
                    <div className="flex items-center gap-1.5">
                      {group.status === "overdue" && <AlertCircle size={9} style={{ color: "#F87171" }} />}
                      {group.status === "complete" && <CheckCircle2 size={9} style={{ color: "#4ADE80" }} />}
                      <span style={{ color: group.status === "overdue" ? "#F87171" : MUTED, fontSize: 11 }}>
                        {row.due}
                      </span>
                    </div>
                  </div>

                  {/* PM */}
                  <div style={{ flex: "0 0 90px" }}>
                    <span style={{ color: MUTED, fontSize: 11 }}>{row.pm}</span>
                  </div>

                  {/* Actions */}
                  <button style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                    <MoreHorizontal size={13} style={{ color: "#555" }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 px-1">
        <span className="text-xs" style={{ color: "#555" }}>6 projects across 4 status groups</span>
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
  );
}
