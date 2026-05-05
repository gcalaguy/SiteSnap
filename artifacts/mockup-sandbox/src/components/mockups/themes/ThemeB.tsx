import {
  LayoutDashboard, Building2, FileText, Receipt, Bot, ShieldAlert,
  Users, Settings, DollarSign, TrendingUp, Clock, CheckCircle2,
  AlertCircle, ArrowUpRight, ArrowDownRight, ChevronRight, Hammer,
  MoreHorizontal, Bell,
} from "lucide-react";

// Ivory Premium — warm cream surfaces, deep charcoal sidebar, rich gold
const GOLD = "#D4AF37";
const GOLD_RICH = "#C9A227";
const CHARCOAL = "#1A1714";
const CHARCOAL2 = "#252118";
const CREAM = "#FAF8F3";
const CARD = "#F5F1E8";
const BORDER = "#E8E2D5";
const BORDER_SOFT = "#EDE8DC";
const TEXT = "#1A1714";
const TEXT2 = "#4A4035";
const MUTED = "#9A8F82";
const WHITE = "#FFFFFF";

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

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  active:   { label: "Active",    color: "#5C7A3E", bg: "#EBF4E0", border: "#C8E0AA" },
  review:   { label: "In Review", color: "#4A6FA5", bg: "#E0EAFF", border: "#B0C8F0" },
  overdue:  { label: "Overdue",   color: "#A04040", bg: "#FDEAEA", border: "#F0BBBB" },
  complete: { label: "Complete",  color: "#5C7A3E", bg: "#EBF4E0", border: "#C8E0AA" },
};

export function ThemeB() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: "'Georgia', 'Inter', serif", background: CREAM }}>

      {/* CHARCOAL SIDEBAR with warm gold */}
      <div className="flex flex-col h-full flex-shrink-0"
        style={{ width: 244, background: CHARCOAL, borderRight: `1px solid ${CHARCOAL2}` }}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5"
          style={{ borderBottom: `1px solid #2E2820` }}>
          <div className="flex items-center justify-center rounded-lg"
            style={{ width: 34, height: 34, background: `${GOLD}1E`, border: `1px solid ${GOLD}40` }}>
            <Hammer size={17} style={{ color: GOLD }} />
          </div>
          <span className="font-bold text-sm tracking-tight" style={{ fontFamily: "'Inter', sans-serif" }}>
            <span style={{ color: "#F5F0E8" }}>Site</span>
            <span style={{ color: GOLD }}>Snap</span>
          </span>
          <span className="ml-auto text-xs font-semibold px-1.5 py-0.5 rounded"
            style={{ background: `${GOLD}18`, color: GOLD_RICH, border: `1px solid ${GOLD}33`, fontSize: 9 }}>PRO</span>
        </div>

        {/* Company */}
        <div className="px-3 py-3">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: "#211D17", border: `1px solid #2E2820` }}>
            <div className="rounded flex items-center justify-center text-xs font-bold"
              style={{ width: 26, height: 26, background: `${GOLD}20`, color: GOLD_RICH, border: `1px solid ${GOLD}33`, fontFamily: "'Inter', sans-serif" }}>
              RC
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: "#F5F0E8", fontFamily: "'Inter', sans-serif" }}>Riley Construction</p>
              <p className="text-xs" style={{ color: "#6A6055", fontFamily: "'Inter', sans-serif" }}>Owner</p>
            </div>
            <ChevronRight size={12} style={{ color: "#4A4035" }} />
          </div>
        </div>

        <p className="px-5 pb-2 text-xs font-semibold tracking-widest uppercase"
          style={{ color: "#3A342C", fontFamily: "'Inter', sans-serif" }}>Menu</p>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ icon: Icon, label, active, badge }) => (
            <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-lg relative cursor-pointer"
              style={{
                background: active ? `${GOLD}14` : "transparent",
                border: active ? `1px solid ${GOLD}28` : "1px solid transparent",
              }}>
              {active && (
                <div style={{ position: "absolute", left: 0, top: "20%", height: "60%", width: 3, background: GOLD, borderRadius: "0 2px 2px 0" }} />
              )}
              <Icon size={16} style={{ color: active ? GOLD : "#4A4035", flexShrink: 0 }} />
              <span className="flex-1 text-sm font-medium"
                style={{ color: active ? "#F5F0E8" : "#6A6055", fontFamily: "'Inter', sans-serif" }}>
                {label}
              </span>
              {badge && (
                <span className="text-xs font-bold rounded-full px-1.5"
                  style={{ background: active ? `${GOLD}28` : "#2A2420", color: active ? GOLD : "#5A5045",
                    fontSize: 10, minWidth: 18, textAlign: "center", fontFamily: "'Inter', sans-serif" }}>
                  {badge}
                </span>
              )}
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="mx-3 mb-4 rounded-xl p-3 flex items-center gap-3"
          style={{ background: "#211D17", border: `1px solid ${GOLD}18` }}>
          <div className="rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ width: 32, height: 32, background: `${GOLD}30`, border: `1.5px solid ${GOLD}50`, color: GOLD_RICH, fontFamily: "'Inter', sans-serif" }}>
            JR
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: "#F5F0E8", fontFamily: "'Inter', sans-serif" }}>Jake Riley</p>
            <p className="text-xs" style={{ color: GOLD, opacity: 0.5, fontFamily: "'Inter', sans-serif" }}>jake@riley.build</p>
          </div>
          <Bell size={13} style={{ color: "#3A342C" }} />
        </div>
      </div>

      {/* WARM CREAM MAIN */}
      <div className="flex-1 overflow-y-auto" style={{ background: CREAM }}>
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold" style={{ color: TEXT, fontFamily: "'Inter', sans-serif" }}>Good morning, Jake</h1>
              <p className="text-sm mt-0.5" style={{ color: MUTED, fontFamily: "'Inter', sans-serif" }}>Here's what's happening on your sites today.</p>
            </div>
            <button className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ background: GOLD, color: CHARCOAL, fontFamily: "'Inter', sans-serif" }}>
              + New Project
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {stats.map(({ label, value, change, up, icon: Icon, sub }) => (
              <div key={label} className="rounded-xl p-4"
                style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: "0 1px 4px rgba(26,23,20,0.06)" }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium" style={{ color: MUTED, fontFamily: "'Inter', sans-serif" }}>{label}</span>
                  <div className="rounded-lg flex items-center justify-center"
                    style={{ width: 30, height: 30, background: `${GOLD}1A`, border: `1px solid ${GOLD}30` }}>
                    <Icon size={14} style={{ color: GOLD_RICH }} />
                  </div>
                </div>
                <p className="text-2xl font-bold mb-1" style={{ color: TEXT, fontFamily: "'Inter', sans-serif" }}>{value}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold flex items-center gap-0.5"
                    style={{ color: up ? "#5C7A3E" : "#A04040", fontFamily: "'Inter', sans-serif" }}>
                    {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{change}
                  </span>
                  <span className="text-xs" style={{ color: MUTED, fontFamily: "'Inter', sans-serif" }}>{sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-xl overflow-hidden"
            style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: "0 1px 4px rgba(26,23,20,0.06)" }}>
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <h2 className="text-sm font-bold" style={{ color: TEXT, fontFamily: "'Inter', sans-serif" }}>Active Projects</h2>
              <span className="text-xs" style={{ color: MUTED, fontFamily: "'Inter', sans-serif" }}>5 projects</span>
            </div>
            <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
                  {["Project", "Client", "Value", "Status", "Progress"].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 font-semibold tracking-wider"
                      style={{ color: GOLD_RICH, fontSize: 10, textTransform: "uppercase", fontFamily: "'Inter', sans-serif" }}>{h}</th>
                  ))}
                  <th style={{ background: CREAM }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const st = statusConfig[row.status];
                  return (
                    <tr key={row.id} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${BORDER_SOFT}` : "none" }}>
                      <td className="px-5 py-3">
                        <p className="font-semibold" style={{ color: TEXT, fontSize: 12, fontFamily: "'Inter', sans-serif" }}>{row.project}</p>
                        <p style={{ color: MUTED, fontSize: 10, fontFamily: "'Inter', sans-serif" }}>{row.id}</p>
                      </td>
                      <td className="px-5 py-3" style={{ color: TEXT2, fontSize: 12, fontFamily: "'Inter', sans-serif" }}>{row.client}</td>
                      <td className="px-5 py-3">
                        <span className="font-bold" style={{ color: GOLD_RICH, fontSize: 12, fontFamily: "'Inter', sans-serif" }}>{row.value}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                          style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontSize: 10, fontFamily: "'Inter', sans-serif" }}>
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
                              background: row.progress === 100 ? "#5C7A3E" : row.status === "overdue" ? "#A04040" : GOLD_RICH,
                            }} />
                          </div>
                          <span style={{ color: MUTED, fontSize: 10, width: 28, textAlign: "right", fontFamily: "'Inter', sans-serif" }}>{row.progress}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <button style={{ background: "none", border: "none", cursor: "pointer" }}>
                          <MoreHorizontal size={14} style={{ color: BORDER }} />
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
