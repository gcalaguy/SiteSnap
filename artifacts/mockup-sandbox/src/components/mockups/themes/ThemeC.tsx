import {
  LayoutDashboard, Building2, FileText, Receipt, Bot, ShieldAlert,
  Users, Settings, DollarSign, TrendingUp, Clock, CheckCircle2,
  AlertCircle, ArrowUpRight, ArrowDownRight, Hammer,
  MoreHorizontal, Bell, ChevronRight,
} from "lucide-react";

// Editorial — pure white, hard black borders, vivid bold gold accent
const GOLD = "#D4AF37";
const BLACK = "#000000";
const WHITE = "#FFFFFF";
const SURFACE = "#FAFAFA";
const BORDER = "#000000";
const BORDER_LIGHT = "#E0E0E0";
const TEXT = "#000000";
const MUTED = "#767676";
const SIDEBAR_BG = "#0A0A0A";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: true,  badge: null },
  { icon: Building2,       label: "Projects",  active: false, badge: "4" },
  { icon: FileText,        label: "Quotes",    active: false, badge: "2" },
  { icon: Receipt,         label: "Invoices",  active: false, badge: null },
  { icon: Bot,             label: "AI Chat",   active: false, badge: null },
  { icon: ShieldAlert,     label: "Safety",    active: false, badge: "1" },
  { icon: Users,           label: "Team",      active: false, badge: null },
  { icon: Settings,        label: "Settings",  active: false, badge: null },
];

const stats = [
  { label: "Total Revenue",   value: "$284,500", change: "+12.4%", up: true,  icon: DollarSign,   sub: "vs last month" },
  { label: "Active Projects", value: "14",       change: "+3",     up: true,  icon: TrendingUp,   sub: "2 closing soon" },
  { label: "Pending",         value: "$62,100",  change: "-8.2%",  up: false, icon: Clock,        sub: "6 outstanding" },
  { label: "Completed",       value: "38",       change: "+5",     up: true,  icon: CheckCircle2, sub: "this quarter" },
];

const rows = [
  { id: "PRJ-001", project: "Maple Ridge Townhomes",   client: "Barrett Developments", value: "$1,240,000", status: "active",   progress: 68 },
  { id: "PRJ-002", project: "Westfield Office Reno",   client: "Arcane Properties",    value: "$387,500",   status: "review",   progress: 92 },
  { id: "PRJ-003", project: "Harbour View Condos",     client: "Coastal Living Corp",  value: "$3,100,000", status: "active",   progress: 34 },
  { id: "PRJ-004", project: "Elk Valley Warehouse",    client: "Northern Logistics",   value: "$720,000",   status: "overdue",  progress: 47 },
  { id: "PRJ-005", project: "Sunrise Elementary Ext.", client: "City of Surrey",       value: "$560,000",   status: "complete", progress: 100 },
];

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  active:   { label: "Active",    color: BLACK, bg: `${GOLD}33` },
  review:   { label: "In Review", color: BLACK, bg: "#E8EEFF" },
  overdue:  { label: "Overdue",   color: WHITE, bg: BLACK },
  complete: { label: "Complete",  color: BLACK, bg: `${GOLD}22` },
};

export function ThemeC() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: "'Inter', sans-serif", background: WHITE }}>

      {/* BLACK SIDEBAR — editorial, gold underline on active */}
      <div className="flex flex-col h-full flex-shrink-0"
        style={{ width: 240, background: SIDEBAR_BG, borderRight: `2px solid ${GOLD}` }}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: `1px solid #1A1A1A` }}>
          <div className="flex items-center justify-center rounded"
            style={{ width: 34, height: 34, background: GOLD }}>
            <Hammer size={18} style={{ color: BLACK }} />
          </div>
          <span className="font-black text-sm tracking-tight">
            <span style={{ color: WHITE }}>SITE</span>
            <span style={{ color: GOLD }}>SNAP</span>
          </span>
          <span className="ml-auto text-xs font-black px-1.5 py-0.5"
            style={{ background: GOLD, color: BLACK, fontSize: 9 }}>PRO</span>
        </div>

        {/* Company */}
        <div className="px-3 py-3">
          <div className="flex items-center gap-2 px-3 py-2" style={{ border: `1px solid #1E1E1E` }}>
            <div className="flex items-center justify-center text-xs font-black"
              style={{ width: 26, height: 26, background: GOLD, color: BLACK }}>
              RC
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate" style={{ color: WHITE }}>Riley Construction</p>
              <p className="text-xs" style={{ color: "#555" }}>Owner</p>
            </div>
            <ChevronRight size={12} style={{ color: "#444" }} />
          </div>
        </div>

        <p className="px-5 pb-2 text-xs font-black tracking-widest uppercase" style={{ color: GOLD }}>Menu</p>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ icon: Icon, label, active, badge }) => (
            <div key={label}
              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer relative"
              style={{
                background: active ? GOLD : "transparent",
                borderLeft: active ? "none" : "1px solid transparent",
              }}>
              <Icon size={16} style={{ color: active ? BLACK : "#555", flexShrink: 0 }} />
              <span className="flex-1 text-sm font-semibold"
                style={{ color: active ? BLACK : "#666" }}>
                {label}
              </span>
              {badge && (
                <span className="text-xs font-black px-1.5"
                  style={{ background: active ? BLACK : GOLD, color: active ? GOLD : BLACK, fontSize: 10, minWidth: 18, textAlign: "center" }}>
                  {badge}
                </span>
              )}
            </div>
          ))}
        </nav>

        <div className="mx-3 mb-4 p-3 flex items-center gap-3"
          style={{ border: `1px solid ${GOLD}33` }}>
          <div className="flex items-center justify-center text-xs font-black flex-shrink-0"
            style={{ width: 32, height: 32, background: GOLD, color: BLACK }}>
            JR
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold" style={{ color: WHITE }}>Jake Riley</p>
            <p className="text-xs" style={{ color: GOLD, opacity: 0.7 }}>jake@riley.build</p>
          </div>
          <Bell size={13} style={{ color: "#444" }} />
        </div>
      </div>

      {/* WHITE EDITORIAL MAIN */}
      <div className="flex-1 overflow-y-auto" style={{ background: SURFACE }}>
        <div className="p-6">

          {/* Page header — bold gold underline rule */}
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-black tracking-tight" style={{ color: TEXT }}>Dashboard</h1>
            <button className="flex items-center gap-2 text-sm font-black px-4 py-2"
              style={{ background: GOLD, color: BLACK, border: `2px solid ${GOLD}` }}>
              + NEW PROJECT
            </button>
          </div>
          {/* Gold rule */}
          <div style={{ height: 3, background: GOLD, marginBottom: 24, width: 80 }} />

          {/* Stat cards — white with thick black border, gold icon blocks */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {stats.map(({ label, value, change, up, icon: Icon, sub }, i) => (
              <div key={label} className="p-4"
                style={{
                  background: WHITE,
                  border: `2px solid ${BLACK}`,
                  borderTop: i === 0 ? `4px solid ${GOLD}` : `2px solid ${BLACK}`,
                }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>{label}</span>
                  <div className="flex items-center justify-center"
                    style={{ width: 30, height: 30, background: GOLD }}>
                    <Icon size={14} style={{ color: BLACK }} />
                  </div>
                </div>
                <p className="text-2xl font-black mb-1" style={{ color: TEXT }}>{value}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold flex items-center gap-0.5"
                    style={{ color: up ? "#166534" : "#991B1B" }}>
                    {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{change}
                  </span>
                  <span className="text-xs" style={{ color: MUTED }}>{sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Table — hard black borders, gold header text */}
          <div style={{ border: `2px solid ${BLACK}`, background: WHITE }}>
            <div className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: `2px solid ${BLACK}`, background: BLACK }}>
              <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: GOLD }}>Active Projects</h2>
              <span className="text-xs font-bold" style={{ color: "#555" }}>5 projects</span>
            </div>
            <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER_LIGHT}`, background: "#F5F5F5" }}>
                  {["Project", "Client", "Value", "Status", "Progress"].map(h => (
                    <th key={h} className="text-left px-5 py-3 font-black tracking-widest uppercase"
                      style={{ color: GOLD, fontSize: 10 }}>{h}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const st = statusConfig[row.status];
                  return (
                    <tr key={row.id} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${BORDER_LIGHT}` : "none" }}>
                      <td className="px-5 py-3.5">
                        <p className="font-bold" style={{ color: TEXT, fontSize: 12 }}>{row.project}</p>
                        <p style={{ color: MUTED, fontSize: 10 }}>{row.id}</p>
                      </td>
                      <td className="px-5 py-3.5" style={{ color: MUTED, fontSize: 12 }}>{row.client}</td>
                      <td className="px-5 py-3.5">
                        <span className="font-black" style={{ color: GOLD, fontSize: 13 }}>{row.value}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 font-bold"
                          style={{ background: st.bg, color: st.color, border: `1px solid ${st.color === WHITE ? "#333" : "transparent"}`, fontSize: 10 }}>
                          {row.status === "overdue" && <AlertCircle size={9} />}
                          {row.status === "complete" && <CheckCircle2 size={9} />}
                          {st.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2" style={{ width: 110 }}>
                          <div className="flex-1 overflow-hidden" style={{ height: 6, background: "#E0E0E0", border: `1px solid #CCC` }}>
                            <div style={{
                              width: `${row.progress}%`, height: "100%",
                              background: row.progress === 100 ? "#166534" : row.status === "overdue" ? BLACK : GOLD,
                            }} />
                          </div>
                          <span className="font-bold" style={{ color: TEXT, fontSize: 10, width: 28, textAlign: "right" }}>{row.progress}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <button style={{ background: "none", border: "none", cursor: "pointer" }}>
                          <MoreHorizontal size={14} style={{ color: "#CCC" }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
