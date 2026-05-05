import {
  LayoutDashboard, Building2, FileText, Receipt, Bot, ShieldAlert,
  Users, Settings, Bell, DollarSign, TrendingUp, Clock, CheckCircle2,
  AlertCircle, ArrowUpRight, ArrowDownRight, ChevronRight, Hammer,
  MoreHorizontal,
} from "lucide-react";

const GOLD = "#D4AF37";
const BLACK = "#0A0A0A";
const WHITE = "#FFFFFF";
const SURFACE = "#F8F8F8";
const BORDER = "#E5E5E5";
const BORDER_DARK = "#D0D0D0";
const TEXT = "#111111";
const MUTED = "#888888";
const SIDEBAR_BG = "#0A0A0A";
const SIDEBAR_BORDER = "#1E1E1E";

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
  active:   { label: "Active",    color: "#16A34A", bg: "#DCFCE7" },
  review:   { label: "In Review", color: "#2563EB", bg: "#DBEAFE" },
  overdue:  { label: "Overdue",   color: "#DC2626", bg: "#FEE2E2" },
  complete: { label: "Complete",  color: "#16A34A", bg: "#DCFCE7" },
};

export function ThemeA() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: "'Inter', sans-serif", background: WHITE }}>

      {/* BLACK SIDEBAR */}
      <div className="flex flex-col h-full flex-shrink-0" style={{ width: 240, background: SIDEBAR_BG, borderRight: `1px solid ${SIDEBAR_BORDER}` }}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: `1px solid ${SIDEBAR_BORDER}` }}>
          <div className="flex items-center justify-center rounded-lg"
            style={{ width: 34, height: 34, background: `${GOLD}22`, border: `1px solid ${GOLD}44` }}>
            <Hammer size={17} style={{ color: GOLD }} />
          </div>
          <span className="font-bold text-sm tracking-tight">
            <span style={{ color: WHITE }}>Site</span>
            <span style={{ color: GOLD }}>Snap</span>
          </span>
          <span className="ml-auto text-xs font-semibold px-1.5 py-0.5 rounded"
            style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}33`, fontSize: 9 }}>
            PRO
          </span>
        </div>

        {/* Company */}
        <div className="px-3 py-3">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: "#141414", border: `1px solid #222` }}>
            <div className="rounded flex items-center justify-center text-xs font-bold"
              style={{ width: 26, height: 26, background: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}33` }}>
              RC
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: WHITE }}>Riley Construction</p>
              <p className="text-xs" style={{ color: "#555" }}>Owner</p>
            </div>
            <ChevronRight size={12} style={{ color: "#444" }} />
          </div>
        </div>

        <p className="px-5 pb-2 text-xs font-semibold tracking-widest uppercase" style={{ color: "#333" }}>Menu</p>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ icon: Icon, label, active, badge }) => (
            <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-lg relative cursor-pointer"
              style={{
                background: active ? `${GOLD}18` : "transparent",
                border: active ? `1px solid ${GOLD}33` : "1px solid transparent",
              }}>
              {active && <div style={{ position: "absolute", left: 0, top: "20%", height: "60%", width: 3, background: GOLD, borderRadius: "0 2px 2px 0" }} />}
              <Icon size={16} style={{ color: active ? GOLD : "#555", flexShrink: 0 }} />
              <span className="flex-1 text-sm font-medium" style={{ color: active ? WHITE : "#777" }}>{label}</span>
              {badge && (
                <span className="text-xs font-bold rounded-full px-1.5 py-0.5"
                  style={{ background: active ? `${GOLD}33` : "#1E1E1E", color: active ? GOLD : "#555", fontSize: 10, minWidth: 18, textAlign: "center" }}>
                  {badge}
                </span>
              )}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="mx-3 mb-4 rounded-xl p-3 flex items-center gap-3"
          style={{ background: "#111", border: `1px solid ${GOLD}1A` }}>
          <div className="rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ width: 32, height: 32, background: `${GOLD}33`, border: `1.5px solid ${GOLD}55`, color: GOLD }}>
            JR
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: WHITE }}>Jake Riley</p>
            <p className="text-xs" style={{ color: GOLD, opacity: 0.6 }}>jake@riley.build</p>
          </div>
          <Bell size={13} style={{ color: "#444" }} />
        </div>
      </div>

      {/* WHITE MAIN CONTENT */}
      <div className="flex-1 overflow-y-auto" style={{ background: SURFACE }}>
        <div className="p-6">

          {/* Page header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold" style={{ color: TEXT }}>Good morning, Jake</h1>
              <p className="text-sm mt-0.5" style={{ color: MUTED }}>Here's what's happening on your sites today.</p>
            </div>
            <button className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ background: GOLD, color: BLACK }}>
              + New Project
            </button>
          </div>

          {/* Stat cards — WHITE with black text and GOLD icons */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {stats.map(({ label, value, change, up, icon: Icon, sub }) => (
              <div key={label} className="rounded-xl p-4"
                style={{ background: WHITE, border: `1px solid ${BORDER}`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium" style={{ color: MUTED }}>{label}</span>
                  <div className="rounded-lg flex items-center justify-center"
                    style={{ width: 30, height: 30, background: `${GOLD}18`, border: `1px solid ${GOLD}33` }}>
                    <Icon size={14} style={{ color: GOLD }} />
                  </div>
                </div>
                <p className="text-2xl font-bold mb-1" style={{ color: TEXT }}>{value}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold flex items-center gap-0.5" style={{ color: up ? "#16A34A" : "#DC2626" }}>
                    {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{change}
                  </span>
                  <span className="text-xs" style={{ color: MUTED }}>{sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Project table */}
          <div className="rounded-xl overflow-hidden" style={{ background: WHITE, border: `1px solid ${BORDER}`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <h2 className="text-sm font-bold" style={{ color: TEXT }}>Active Projects</h2>
              <span className="text-xs" style={{ color: MUTED }}>5 projects</span>
            </div>
            <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}`, background: SURFACE }}>
                  {["Project", "Client", "Value", "Status", "Progress"].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 font-semibold tracking-wider"
                      style={{ color: GOLD, fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                  ))}
                  <th style={{ background: SURFACE }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const st = statusConfig[row.status];
                  return (
                    <tr key={row.id} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                      <td className="px-5 py-3">
                        <p className="font-semibold" style={{ color: TEXT, fontSize: 12 }}>{row.project}</p>
                        <p style={{ color: MUTED, fontSize: 10 }}>{row.id}</p>
                      </td>
                      <td className="px-5 py-3" style={{ color: MUTED, fontSize: 12 }}>{row.client}</td>
                      <td className="px-5 py-3">
                        <span className="font-bold" style={{ color: GOLD, fontSize: 12 }}>{row.value}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                          style={{ background: st.bg, color: st.color, fontSize: 10 }}>
                          {row.status === "overdue" && <AlertCircle size={9} />}
                          {row.status === "complete" && <CheckCircle2 size={9} />}
                          {st.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2" style={{ width: 110 }}>
                          <div className="flex-1 rounded-full overflow-hidden" style={{ height: 5, background: BORDER }}>
                            <div style={{
                              width: `${row.progress}%`, height: "100%", borderRadius: 999,
                              background: row.progress === 100 ? "#16A34A" : row.status === "overdue" ? "#DC2626" : GOLD,
                            }} />
                          </div>
                          <span style={{ color: MUTED, fontSize: 10, width: 28, textAlign: "right" }}>{row.progress}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <button style={{ background: "none", border: "none", cursor: "pointer" }}>
                          <MoreHorizontal size={14} style={{ color: BORDER_DARK }} />
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
