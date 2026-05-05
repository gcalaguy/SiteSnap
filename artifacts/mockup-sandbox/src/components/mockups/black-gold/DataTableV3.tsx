import {
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  Plus,
  MapPin,
  Calendar,
  User,
} from "lucide-react";

const GOLD = "#D4AF37";
const BLACK = "#0A0A0A";
const SURFACE = "#111111";
const SURFACE2 = "#181818";
const BORDER = "#242424";
const WHITE = "#FFFFFF";
const MUTED = "#888888";

const metrics = [
  { label: "Revenue",  value: "$284,500", change: "+12.4%", up: true,  icon: DollarSign },
  { label: "Active",   value: "14",       change: "+3",     up: true,  icon: TrendingUp },
  { label: "Invoices", value: "$62,100",  change: "-8.2%",  up: false, icon: Clock },
  { label: "Done",     value: "38",       change: "+5",     up: true,  icon: CheckCircle2 },
];

const rows = [
  { id: "PRJ-001", project: "Maple Ridge Townhomes",    client: "Barrett Developments", value: "$1,240,000", status: "active",   progress: 68,  due: "Jun 30, 2025",  pm: "S. Kowalski" },
  { id: "PRJ-002", project: "Westfield Office Reno",    client: "Arcane Properties",    value: "$387,500",   status: "review",   progress: 92,  due: "May 15, 2025",  pm: "T. Nguyen" },
  { id: "PRJ-003", project: "Harbour View Condos",      client: "Coastal Living Corp",  value: "$3,100,000", status: "active",   progress: 34,  due: "Dec 1, 2025",   pm: "L. Ferreira" },
  { id: "PRJ-004", project: "Elk Valley Warehouse",     client: "Northern Logistics",   value: "$720,000",   status: "overdue",  progress: 47,  due: "Apr 1, 2025",   pm: "J. Riley" },
  { id: "PRJ-005", project: "Sunrise Elementary Ext.",  client: "City of Surrey",       value: "$560,000",   status: "complete", progress: 100, due: "Mar 20, 2025",  pm: "A. Patel" },
  { id: "PRJ-006", project: "Pine Creek Bridge",        client: "BC Transportation",    value: "$2,450,000", status: "active",   progress: 21,  due: "Mar 15, 2026",  pm: "R. Okafor" },
];

const statusConfig: Record<string, { label: string; color: string; bg: string; bar: string }> = {
  active:   { label: "Active",    color: GOLD,      bg: `${GOLD}18`,  bar: GOLD },
  review:   { label: "In Review", color: "#60A5FA", bg: "#1e3a5f33",  bar: "#60A5FA" },
  overdue:  { label: "Overdue",   color: "#F87171", bg: "#3b0f0f33",  bar: "#F87171" },
  complete: { label: "Complete",  color: "#4ADE80", bg: "#0f3b1e33",  bar: "#4ADE80" },
};

export function DataTableV3() {
  return (
    <div className="min-h-screen p-5" style={{ background: BLACK, fontFamily: "'Inter', sans-serif" }}>

      {/* Compact metrics strip */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold tracking-tight" style={{ color: WHITE }}>Project Overview</h1>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>British Columbia · Q2 2025</p>
        </div>

        {/* Metrics inline */}
        <div className="flex items-center gap-1" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "6px 4px" }}>
          {metrics.map(({ label, value, change, up, icon: Icon }, i) => (
            <div key={label} className="flex items-center gap-2 px-4"
              style={{ borderRight: i < metrics.length - 1 ? `1px solid ${BORDER}` : "none" }}>
              <div className="rounded-md flex items-center justify-center"
                style={{ width: 24, height: 24, background: `${GOLD}14`, border: `1px solid ${GOLD}20` }}>
                <Icon size={11} style={{ color: GOLD }} />
              </div>
              <div>
                <p className="text-xs font-bold leading-none" style={{ color: WHITE }}>{value}</p>
                <p className="text-xs leading-none mt-0.5" style={{ color: MUTED, fontSize: 10 }}>{label}</p>
              </div>
              <span className="text-xs font-semibold flex items-center gap-0.5 ml-1" style={{ color: up ? "#4ADE80" : "#F87171", fontSize: 10 }}>
                {up ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}{change}
              </span>
            </div>
          ))}
        </div>

        <button className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg"
          style={{ background: GOLD, color: BLACK }}>
          <Plus size={13} /> New Project
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ background: SURFACE, border: `1px solid ${BORDER}`, flex: 1, maxWidth: 300 }}>
          <Search size={13} style={{ color: "#555" }} />
          <span className="text-xs" style={{ color: "#555" }}>Search projects…</span>
        </div>
        <div className="flex items-center gap-1">
          {["All", "Active", "In Review", "Overdue", "Complete"].map((f) => (
            <button key={f} className="text-xs px-2.5 py-1.5 rounded-full font-medium"
              style={{
                background: f === "All" ? `${GOLD}18` : "transparent",
                color: f === "All" ? GOLD : "#555",
                border: f === "All" ? `1px solid ${GOLD}33` : `1px solid ${BORDER}`,
              }}>
              {f}
            </button>
          ))}
        </div>
        <span className="text-xs ml-auto" style={{ color: "#555" }}>6 projects</span>
      </div>

      {/* Card grid — 2 columns */}
      <div className="grid grid-cols-2 gap-3">
        {rows.map((row) => {
          const st = statusConfig[row.status];
          return (
            <div key={row.id}
              className="rounded-xl overflow-hidden relative"
              style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
            >
              {/* Left status accent bar */}
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: st.bar, borderRadius: "4px 0 0 4px" }} />

              <div className="pl-5 pr-4 pt-4 pb-3">
                {/* Top row: name + value */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <p className="font-bold truncate" style={{ color: WHITE, fontSize: 13 }}>{row.project}</p>
                    <p style={{ color: "#555", fontSize: 10 }}>{row.id}</p>
                  </div>
                  <span className="font-bold flex-shrink-0" style={{ color: GOLD, fontSize: 13 }}>{row.value}</span>
                </div>

                {/* Status badge */}
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold mb-3"
                  style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}33`, fontSize: 10 }}>
                  {row.status === "overdue" && <AlertCircle size={9} />}
                  {row.status === "complete" && <CheckCircle2 size={9} />}
                  {st.label}
                </span>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span style={{ color: "#555", fontSize: 10 }}>Progress</span>
                    <span style={{ color: MUTED, fontSize: 10 }}>{row.progress}%</span>
                  </div>
                  <div className="rounded-full overflow-hidden" style={{ height: 5, background: "#1a1a1a" }}>
                    <div style={{
                      width: `${row.progress}%`, height: "100%", borderRadius: 999,
                      background: st.bar, transition: "width 0.3s",
                    }} />
                  </div>
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-4" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                  <div className="flex items-center gap-1.5">
                    <MapPin size={10} style={{ color: "#555" }} />
                    <span style={{ color: MUTED, fontSize: 10 }}>{row.client}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar size={10} style={{ color: "#555" }} />
                    <span style={{ color: row.status === "overdue" ? "#F87171" : MUTED, fontSize: 10 }}>{row.due}</span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <User size={10} style={{ color: "#555" }} />
                    <span style={{ color: MUTED, fontSize: 10 }}>{row.pm}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 px-1">
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
  );
}
